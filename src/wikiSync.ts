import { EsianaApiError, EsianaClient, normalizeInstanceUrl } from './api.js';
import { buildPresentation } from './presentation.js';
import { htmlToMarkdown, markdownToHtml } from './conversion.js';
import { hashFields, stableStringify } from './reconcile.js';
import { getConfig, getToken, MODULE_ID } from './settings.js';
import type { WikiPage, EntityPage, EntityField, JournalPresentationPage } from './types.js';

export type ImportContent = 'all' | 'party';
interface Source { id: string; campaign: string; instance: string; linked: boolean; contentHash?: string; remoteHash?: string; title?: string; revision?: string; audience?: ImportContent; gmHash?: string; partyHash?: string; presentationVersion?: number }
interface Prepared { page: WikiPage; html: string; partyVisible: boolean; presentation?: JournalPresentationPage[] }
const digest = (content: string) => hashFields({ content });
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const NON_CONTENT_FIELDS = new Set(['systemCategoryKey', 'entityCategory', 'categoryKey', 'wikiRouteAliases', 'hidden', 'isDraft', 'draftOrigin', 'draftStatus']);
function humanLabel(key: string): string {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}
function displayFields(value: unknown, depth = 0): string {
  if (!value || typeof value !== 'object' || depth > 5) return '';
  const items = Array.isArray(value) ? value.map((item, index) => [String(index + 1), item] as const) : Object.entries(value as Record<string, unknown>);
  const fields = items.map(([key, item]) => {
    if (NON_CONTENT_FIELDS.has(key) || item === null || item === undefined || item === '') return '';
    let rendered = '';
    if (typeof item === 'string') rendered = escape(item);
    else if (typeof item === 'number' || typeof item === 'boolean') rendered = escape(String(item));
    else if (Array.isArray(item) && item.every((entry) => typeof entry === 'string' || typeof entry === 'number')) rendered = item.map((entry) => escape(String(entry))).join(', ');
    else rendered = displayFields(item, depth + 1);
    if (!rendered) return '';
    return `<dt>${escape(humanLabel(key))}</dt><dd>${rendered}</dd>`;
  }).join('');
  return fields ? `<dl class="esiana-fields">${fields}</dl>` : '';
}
function renderMetadata(page: WikiPage): string {
  const fields = displayFields(page.metadata);
  return fields ? `<section class="esiana-details"><h2>Details</h2>${fields}</section>` : '';
}
function renderBlock(block: WikiPage['blocks'][number]): string {
  const content = block.content ?? {};
  if (['text-tiptap', 'text-biography', 'text'].includes(block.type) && typeof content.markdown === 'string') return markdownToHtml(content.markdown);
  if (block.type === 'image-display' && typeof content.imageUrl === 'string' && /^(?:https?:\/\/|\/)/i.test(content.imageUrl)) return `<figure><img src="${escape(content.imageUrl)}" alt="${escape(String(content.caption ?? ''))}"><figcaption>${escape(String(content.caption ?? ''))}</figcaption></figure>`;
  if (['wiki-infobox', 'stat-block'].includes(block.type)) { const fields = displayFields(content); return fields ? `<section class="esiana-widget">${fields}</section>` : ''; }
  return Object.keys(content).length ? '<p><em>Additional content is available in Esiana.</em></p>' : '';
}
export function renderWikiPage(page: WikiPage): string {
  return renderMetadata(page) + (page.blocks ?? []).map(renderBlock).join('');
}
// Older releases rendered unknown widgets as raw JSON; this is used only to
// recognize an unchanged saved baseline when upgrading a linked Journal.
function legacyBlock(block: WikiPage['blocks'][number]): string {
  const content = block.content ?? {};
  if (['text-tiptap', 'text-biography', 'text'].includes(block.type) && typeof content.markdown === 'string') return markdownToHtml(content.markdown);
  if (block.type === 'image-display' && typeof content.imageUrl === 'string' && /^(?:https?:\/\/|\/)/i.test(content.imageUrl)) return `<figure><img src="${escape(content.imageUrl)}" alt="${escape(String(content.caption ?? ''))}"><figcaption>${escape(String(content.caption ?? ''))}</figcaption></figure>`;
  return `<section class="esiana-widget"><h3>${escape(block.type.replace(/[-_]/g, ' '))}</h3><pre>${escape(JSON.stringify(content, null, 2) ?? '')}</pre></section>`;
}
function normalizeHtml(html: string): string { const root = document.createElement('div'); root.innerHTML = html; return root.innerHTML; }
export function splitEditableHtml(current: string, prefix: string, suffix: string): string {
  if (!current.startsWith(prefix) || !current.endsWith(suffix) || current.length < prefix.length + suffix.length) throw new Error('Non-text fields or widgets were changed in Foundry; edit those fields in Esiana.');
  return current.slice(prefix.length, suffix ? -suffix.length : undefined);
}
export function extractTextBlockEdit(page: WikiPage, currentHtml: string, legacy: boolean): { index: number; markdown: string } {
  const indices = page.blocks.map((block, index) => ['text-tiptap', 'text-biography'].includes(block.type) && typeof block.content?.markdown === 'string' ? index : -1).filter((index) => index >= 0);
  if (indices.length !== 1) throw new Error('This page has multiple or no editable text blocks; edit it in Esiana.');
  const index = indices[0]; const render = legacy ? legacyBlock : renderBlock;
  const prefix = normalizeHtml(resolveReferences((legacy ? '' : renderMetadata(page)) + page.blocks.slice(0, index).map(render).join('')));
  const suffix = normalizeHtml(resolveReferences(page.blocks.slice(index + 1).map(render).join('')));
  const current = normalizeHtml(currentHtml);
  const textHtml = splitEditableHtml(current, prefix, suffix);
  const markdown = htmlToMarkdown(textHtml);
  if (normalizeHtml(markdownToHtml(markdown)) !== normalizeHtml(textHtml)) throw new Error('This edit contains formatting that cannot be safely synchronized; edit it in Esiana.');
  return { index, markdown };
}
function resolveReferences(html: string): string {
  if (typeof document === 'undefined') return html;
  const root = document.createElement('div'); root.innerHTML = html;
  const config = getConfig();
  const instance = normalizeInstanceUrl(config.instanceUrl);
  const base = new URL(instance);
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    let url: URL;
    try { url = new URL(link.getAttribute('href')!, base); } catch { continue; }
    if (url.origin !== base.origin) continue;
    const path = url.pathname.split('/').filter(Boolean);
    let id: string;
    try { id = decodeURIComponent(path.at(-1) ?? ''); } catch { continue; }
    const isCampaignWiki = path.includes('wiki') && path.includes(config.campaignHandle);
    if (!isCampaignWiki) continue;
    const target = game.journal.contents.find((doc: any) => { const source = doc.getFlag?.(MODULE_ID, 'wikiSource'); return source?.id === id && source.campaign === config.campaignHandle && source.instance === instance; });
    if (target) link.replaceWith(document.createTextNode(`@UUID[JournalEntry.${target.id}]{${link.textContent ?? target.name}}`));
  }
  return root.innerHTML;
}
async function copyImages(html: string, client: EsianaClient): Promise<string> {
  if (!game.settings.get(MODULE_ID, 'importImages')) return html;
  const root = document.createElement('div'); root.innerHTML = html;
  const picker = foundry?.applications?.apps?.FilePicker?.implementation ?? FilePicker;
  const directory = `esiana-${getConfig().campaignHandle.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  try { await picker.createDirectory('data', directory, {}); } catch { /* Directory may already exist; upload reports other failures. */ }
  let existing: string[] = [];
  try { existing = (await picker.browse('data', directory)).files ?? []; } catch { /* Upload will report inaccessible storage. */ }
  for (const img of root.querySelectorAll('img[src]')) {
    const original = img.getAttribute('src')!;
    const base = new URL(normalizeInstanceUrl(getConfig().instanceUrl));
    let target: URL; try { target = new URL(original, base); } catch { throw new Error('Invalid image address in Esiana content.'); }
    // External image hosts do not receive the Esiana token.
    if (target.origin !== base.origin) continue;
    const blob = await client.asset(original);
    const type = blob.type.split('/')[1]?.replace(/[^a-zA-Z0-9]/g, '') || 'img';
    const name = `${hashFields({ url: original })}.${type}`;
    const prior = existing.find((path: string) => path.split('/').pop() === name);
    if (prior) { img.setAttribute('src', prior); continue; }
    const file = new File([blob], name, { type: blob.type });
    const uploaded = await picker.upload('data', directory, file, {}, { notify: false });
    if (!uploaded?.path) throw new Error('Foundry did not return a path for the imported image.');
    img.setAttribute('src', uploaded.path);
  }
  return root.innerHTML;
}
async function entityPresentation(client: EsianaClient, page: WikiPage, party: boolean): Promise<JournalPresentationPage[] | undefined> {
  // The endpoint returns 404 for ordinary wiki pages that have no managed entity shell.
  if (typeof client.entityPages !== 'function' || typeof client.entityFields !== 'function') return undefined;
  let pages: EntityPage[];
  try { const result = await client.entityPages(page.id, party); if (!Array.isArray(result.pages)) throw new Error('Invalid entity pages response.'); pages = result.pages; }
  catch (error) { if (error instanceof EsianaApiError && error.status === 404 && !page.metadata?.entityCategory) return undefined; throw error; }
  const result = await client.entityFields(page.id, party);
  if (!Array.isArray(result.fields)) throw new Error('Invalid entity fields response.');
  const instance = normalizeInstanceUrl(getConfig().instanceUrl);
  const types = new Set([...(page.blocks ?? []), ...pages.flatMap((item) => item.blocks ?? [])].map((block) => block.type));
  const extras: { relations?: Array<{ title: string; href?: string | null; detail?: string }>; claims?: string[] } = {};
  if (types.has('entity-relationships') && typeof client.entityGraph === 'function') {
    const graph = await client.entityGraph(page.id, party);
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error('Invalid entity relationship response.');
    extras.relations = graph.edges.flatMap((edge) => {
      const otherId = edge.source?.entityId === page.id ? edge.target?.entityId : edge.target?.entityId === page.id ? edge.source?.entityId : null;
      const other = graph.nodes.find((node) => node.entityId === otherId);
      if (!other || typeof other.title !== 'string') return [];
      const detail = [edge.relationKind?.replace(/[_-]+/g, ' ').toLowerCase(), edge.payload?.role].filter(Boolean).join(' ? ');
      return [{ title: other.title, href: other.href, detail }];
    });
  }
  if (types.has('entity-discovery') && typeof client.partyKnowledge === 'function') {
    const result = await client.partyKnowledge(page.id, party);
    if (!result.knowledge || !Array.isArray(result.knowledge.claims)) throw new Error('Invalid discovery response.');
    extras.claims = result.knowledge.claims.map((claim) => claim.statement).filter((statement): statement is string => typeof statement === 'string' && Boolean(statement.trim()));
  }
  return buildPresentation(page, pages, result.fields as EntityField[], instance, extras);
}
export async function prepareWikiImport(client: EsianaClient, id: string, audience: ImportContent = 'all', projectionVerified = true, copyAssets = false): Promise<Prepared> {
  if (audience === 'party' && !projectionVerified) throw new Error('Esiana did not confirm a Party projection for this account.');
  if (audience === 'party') {
    const page = await client.wikiPage(id, true);
    const presentation = await entityPresentation(client, page, true);
    if (presentation) for (const part of presentation) part.html = copyAssets ? await copyImages(resolveReferences(part.html), client) : resolveReferences(part.html);
    return { page, html: copyAssets ? await copyImages(resolveReferences(renderWikiPage(page)), client) : resolveReferences(renderWikiPage(page)), partyVisible: true, presentation };
  }
  const page = await client.wikiPage(id);
  const presentation = await entityPresentation(client, page, false);
  let party: WikiPage | null = null;
  let partyPresentation: JournalPresentationPage[] | undefined;
  if (projectionVerified) {
    try { party = await client.wikiPage(id, true); partyPresentation = await entityPresentation(client, party, true); }
    catch (error) { if (!(error instanceof EsianaApiError) || error.status !== 404) throw error; party = null; }
  }
  const partyVisible = Boolean(party && party.title === page.title && stableStringify(party.blocks) === stableStringify(page.blocks) && renderMetadata(party) === renderMetadata(page) && stableStringify(partyPresentation ?? []) === stableStringify(presentation ?? []));
  if (presentation) for (const part of presentation) part.html = partyVisible && copyAssets ? await copyImages(resolveReferences(part.html), client) : resolveReferences(part.html);
  return { page, html: partyVisible && copyAssets ? await copyImages(resolveReferences(renderWikiPage(page)), client) : resolveReferences(renderWikiPage(page)), partyVisible, presentation };
}

function restrictedOwnership(doc?: any): Record<string, number> {
  const ownership = { ...(doc?.ownership ?? {}), default: 0 };
  for (const user of game.users.contents) if (!user.isGM) ownership[user.id] = 0;
  return ownership;
}
export async function createWikiJournal(prepared: Prepared, folder: string | null, source: Source): Promise<any> {
  const grant = prepared.partyVisible && game.settings.get(MODULE_ID, 'permissions') !== 'never';
  const wikiSource = { ...source, contentHash: digest(prepared.html), remoteHash: digest(prepared.html), title: prepared.page.title, revision: prepared.page.updatedAt, audience: game.settings.get(MODULE_ID, 'importContent') ?? 'all' };
  if (prepared.presentation) {
    const parts = prepared.presentation;
    const pages = parts.map((part) => ({ name: part.title, type: 'text', text: { content: part.html, format: 1 }, flags: { [MODULE_ID]: { presentation: { sourceId: part.sourceId, hash: digest(part.html), title: part.title, blockIds: part.blockIds ?? [], fieldIds: part.fieldIds ?? [] } } } }));
    return JournalEntry.create({ name: prepared.page.title, folder, ownership: { default: grant ? 2 : 0 }, pages, flags: { [MODULE_ID]: { wikiSource: { ...wikiSource, presentationVersion: 1 } } } }, { esianaSyncMutationId: crypto.randomUUID() });
  }
  return JournalEntry.create({ name: prepared.page.title, folder, ownership: { default: grant ? 2 : 0 }, pages: [{ name: prepared.page.title, type: 'text', text: { content: prepared.html, format: 1 } }], flags: { [MODULE_ID]: { wikiSource } } }, { esianaSyncMutationId: crypto.randomUUID() });
}
export async function syncWikiJournals(): Promise<number> {
  const config = getConfig();
  const instance = normalizeInstanceUrl(config.instanceUrl);
  const client = new EsianaClient(config.instanceUrl, getToken(), config.campaignHandle);
  const docs = game.journal.contents.filter((doc: any) => { const source = doc.getFlag(MODULE_ID, 'wikiSource') as Source | undefined; return source?.linked && source.campaign === config.campaignHandle && source.instance === instance; });
  if (!docs.length) return 0;
  const failures: string[] = [];
  let count = 0;
  const audience: ImportContent = game.settings.get(MODULE_ID, 'importContent') === 'party' ? 'party' : 'all';
  // Party preview is only guaranteed by Esiana for campaign members.
  let projectionVerified = false;
  try { const tree = await client.wikiTreeParty(); projectionVerified = tree.campaign?.isMember === true; } catch { /* fail closed below */ }
  for (const doc of docs) {
    const source = doc.getFlag(MODULE_ID, 'wikiSource') as Source;
    try {
      const previousOwnership = { ...doc.ownership };
      for (const user of game.users.contents) if (!user.isGM && previousOwnership[user.id] === undefined) previousOwnership[user.id] = previousOwnership.default ?? 0;
      const options = { esianaSyncMutationId: crypto.randomUUID() };
      await doc.update({ ownership: restrictedOwnership(doc) }, options);
      let prepared = await prepareWikiImport(client, source.id, audience, projectionVerified);
      const pages = doc.pages.contents;
      if (!source.presentationVersion && prepared.presentation && pages.length === 1 && !pages[0].getFlag?.(MODULE_ID, 'audience')) {
        const original = pages[0];
        if (!source.contentHash || digest(original.text?.content ?? '') !== source.contentHash || (source.title && doc.name !== source.title)) throw new Error('This Journal contains local edits. Preserve them before upgrading its entity presentation.');
        const parts = prepared.presentation;
        const additional = parts.slice(1).map((part) => ({ name: part.title, type: 'text', text: { content: part.html, format: 1 }, flags: { [MODULE_ID]: { presentation: { sourceId: part.sourceId, hash: digest(part.html), title: part.title, blockIds: part.blockIds ?? [], fieldIds: part.fieldIds ?? [] } } } }));
        if (additional.length) await doc.createEmbeddedDocuments('JournalEntryPage', additional, options);
        const first = parts[0];
        if (first) await original.update({ name: first.title, 'text.content': first.html, [`flags.${MODULE_ID}.presentation`]: { sourceId: first.sourceId, hash: digest(first.html), title: first.title, blockIds: first.blockIds ?? [], fieldIds: first.fieldIds ?? [] } }, options);
        else await original.delete(options);
        if (prepared.partyVisible && doc.folder) await doc.update({ folder: null }, options);
        const ownership = prepared.partyVisible ? { ...previousOwnership } : restrictedOwnership(doc);
        if (prepared.partyVisible && game.settings.get(MODULE_ID, 'permissions') === 'always') { ownership.default = 2; for (const user of game.users.contents) if (!user.isGM) ownership[user.id] = 2; }
        await doc.update({ name: prepared.page.title, ownership, [`flags.${MODULE_ID}.wikiSource`]: { ...source, title: prepared.page.title, revision: prepared.page.updatedAt, audience, contentHash: digest(prepared.html), remoteHash: digest(prepared.html), presentationVersion: 1 } }, options);
        count++;
        continue;
      }
      if (source.presentationVersion) {
        if (!prepared.presentation) throw new Error('The entity page API is unavailable. Existing Journal pages were retained.');
        const managed = pages.filter((entry: any) => entry.getFlag?.(MODULE_ID, 'presentation'));
        const desired = prepared.presentation;
        for (const entry of managed) {
          const stored = entry.getFlag(MODULE_ID, 'presentation');
          if (!stored?.hash || digest(entry.text?.content ?? '') !== stored.hash || (stored.title && stored.title !== entry.name)) {
            throw new Error('A rendered entity page was edited locally. Presentation fields cannot be written back as wiki prose; preserve or resolve the edit before refreshing.');
          }
        }
        let updates = 0;
        for (const part of desired) {
          const entry = managed.find((item: any) => item.getFlag(MODULE_ID, 'presentation')?.sourceId === part.sourceId);
          const flag = { sourceId: part.sourceId, hash: digest(part.html), title: part.title, blockIds: part.blockIds ?? [], fieldIds: part.fieldIds ?? [] };
          if (!entry) { await doc.createEmbeddedDocuments('JournalEntryPage', [{ name: part.title, type: 'text', text: { content: part.html, format: 1 }, flags: { [MODULE_ID]: { presentation: flag } } }], options); updates++; }
          else if (entry.name !== part.title || digest(entry.text?.content ?? '') !== flag.hash || stableStringify(entry.getFlag(MODULE_ID, 'presentation')) !== stableStringify(flag)) { await entry.update({ name: part.title, 'text.content': part.html, [`flags.${MODULE_ID}.presentation`]: flag }, options); updates++; }
        }
        for (const entry of managed) if (!desired.some((part) => part.sourceId === entry.getFlag(MODULE_ID, 'presentation').sourceId)) { await entry.delete(options); updates++; }
        if (prepared.partyVisible && doc.folder) await doc.update({ folder: null }, options);
        const ownership = prepared.partyVisible ? { ...previousOwnership } : restrictedOwnership(doc);
        if (prepared.partyVisible && game.settings.get(MODULE_ID, 'permissions') === 'always') { ownership.default = 2; for (const user of game.users.contents) if (!user.isGM) ownership[user.id] = 2; }
        await doc.update({ name: prepared.page.title, ownership, [`flags.${MODULE_ID}.wikiSource`]: { ...source, title: prepared.page.title, revision: prepared.page.updatedAt, audience, contentHash: digest(prepared.html), remoteHash: digest(prepared.html) } }, options);
        if (updates) count++;
        continue;
      }
      const legacyGm = pages.find((page: any) => page.getFlag?.(MODULE_ID, 'audience') === 'gm');
      const legacyParty = pages.find((page: any) => page.getFlag?.(MODULE_ID, 'audience') === 'party');
      const current = legacyGm ?? pages[0];
      if (!current) throw new Error('The imported Journal page is missing.');
      const legacy = Boolean(legacyGm);
      if (legacy && (!source.gmHash || (legacyParty && !source.partyHash))) throw new Error('The previous audience representation has no reliable baseline; migrate this Journal manually.');
      if (legacy && ((source.gmHash && digest(legacyGm.text?.content ?? '') !== source.gmHash) || (legacyParty && source.partyHash && digest(legacyParty.text?.content ?? '') !== source.partyHash))) throw new Error('Local Journal edits conflict with the audience migration; no pages were removed.');
      let remoteHash = digest(prepared.html);
      const oldBaseline = source.remoteHash ?? source.contentHash;
      const legacyRendering = source.revision === prepared.page.updatedAt && source.audience === audience && oldBaseline !== remoteHash && oldBaseline === digest(resolveReferences(prepared.page.blocks.map(legacyBlock).join('')));
      let changed = source.revision !== prepared.page.updatedAt || source.audience !== audience || (oldBaseline !== remoteHash && !legacyRendering);
      const localChanged = !legacy && (digest(current.text?.content ?? '') !== source.contentHash || (source.title !== undefined && doc.name !== source.title));
      const direction = game.settings.get(MODULE_ID, 'syncDirection') ?? 'fromEsiana';
      if (legacyRendering && localChanged && direction === 'fromEsiana') throw new Error('This Journal has local edits from an older import. Preserve or resolve those edits before refreshing its formatting.');
      if (!legacy && localChanged && direction !== 'fromEsiana') {
        if (changed) throw new Error('Both Esiana and Foundry changed; no content was overwritten.');
        if (audience !== 'all') throw new Error('Sending edits requires All accessible content so hidden blocks cannot be overwritten.');
        if (doc.name !== source.title) throw new Error('Publishing Journal title changes is not yet supported safely.');
        const blocks = prepared.page.blocks;
        if (!source.revision) throw new Error('The linked page has no revision; reimport it before syncing edits.');
        const edit = extractTextBlockEdit(prepared.page, current.text?.content ?? '', legacyRendering);
        const next = blocks.map((block, index) => index === edit.index ? { ...block, content: { ...block.content, markdown: edit.markdown } } : block);
        const result = await client.updateWikiLayout(source.id, source.revision, next);
        if (!result.updatedAt) throw new Error('Esiana did not confirm the revisioned update.');
        prepared = await prepareWikiImport(client, source.id, audience, projectionVerified);
        if (prepared.page.updatedAt !== result.updatedAt) throw new Error('Esiana changed after the update; review the Journal before retrying.');
        remoteHash = digest(prepared.html);
        // Refresh from the saved server representation after the lossless check.
        changed = true;
      } else if (!legacy && legacyRendering && !localChanged && direction !== 'toEsiana') {
        changed = true;
      } else if (!legacy && changed && direction === 'toEsiana') {
        throw new Error('Esiana changed while this Journal is configured for Foundry-to-Esiana synchronization.');
      }

      if (!legacy && changed && localChanged && direction === 'fromEsiana') throw new Error('Local Journal edits conflict with Esiana changes; no content was overwritten.');
      // Existing folder paths can contain ancestor names no longer visible to the Party.
      if (prepared.partyVisible && doc.folder) await doc.update({ folder: null }, options);
      if (changed || legacy) {
        const pageOwnership: Record<string, number> = { default: -1 };
        for (const user of game.users.contents) if (!user.isGM) pageOwnership[user.id] = -1;
        await current.update({ name: prepared.page.title, 'text.content': prepared.html, ownership: pageOwnership, [`flags.${MODULE_ID}.-=audience`]: null }, options);
        if (legacyParty) await legacyParty.delete(options);
      }
      const ownership = prepared.partyVisible ? { ...previousOwnership } : restrictedOwnership(doc);
      if (prepared.partyVisible && game.settings.get(MODULE_ID, 'permissions') === 'always') { ownership.default = 2; for (const user of game.users.contents) if (!user.isGM) ownership[user.id] = 2; }
      await doc.update({ ...(changed || legacy ? { name: prepared.page.title } : {}), ownership, [`flags.${MODULE_ID}.wikiSource`]: { id: source.id, campaign: source.campaign, instance: source.instance, linked: source.linked, contentHash: digest(prepared.html), remoteHash, title: prepared.page.title, revision: prepared.page.updatedAt, audience } }, options);
      if (changed || legacy) count++;
    } catch (error) { failures.push(`${doc.name}: ${error instanceof Error ? error.message : 'Unknown error'}`); }
  }
  if (failures.length) throw new Error(`Some Esiana pages could not sync: ${failures.join('; ')}`);
  return count;
}

// Publishing creates a new private wiki page and never changes an existing page.
export async function publishJournal(doc: any): Promise<void> {
  if (!game.user?.isGM) return;
  const config = getConfig();
  if (!config.campaignHandle || !getToken()) throw new Error('Configure an Esiana campaign and personal access token first.');
  if (doc.getFlag(MODULE_ID, 'wikiSource') || doc.getFlag(MODULE_ID, 'sync') || doc.getFlag(MODULE_ID, 'published')) throw new Error('This Journal is already linked to Esiana.');
  const pages = doc.pages.contents;
  if (!pages.length || pages.some((page: any) => page.type !== 'text')) throw new Error('Publishing currently supports text Journal pages only.');
  const blocks = pages.map((page: any, index: number) => ({ id: crypto.randomUUID(), type: 'text-tiptap', x: 0, y: index * 2, w: 3, h: 2, isPrivate: true, visibility: 'DM_Only', content: { markdown: `${pages.length > 1 ? `## ${page.name}\n\n` : ''}${htmlToMarkdown(page.text?.content ?? '')}` } }));
  const client = new EsianaClient(config.instanceUrl, getToken(), config.campaignHandle);
  const result = await client.createWikiPage(doc.name, blocks);
  if (!result.page?.id) throw new Error('Esiana did not return the created page ID. Check Esiana before retrying to avoid duplicates.');
  await doc.setFlag(MODULE_ID, 'published', { id: result.page.id, campaign: config.campaignHandle });
  ui.notifications.info(`Published ${doc.name} as a private Esiana page.`);
}
