import { EsianaApiError, EsianaClient, DEFAULT_INSTANCE_URL } from './api.js';
import { htmlToMarkdown, markdownToHtml } from './conversion.js';
import { hashFields, stableStringify } from './reconcile.js';
import { getConfig, getToken, MODULE_ID } from './settings.js';
import type { WikiPage } from './types.js';

export type ImportContent = 'all' | 'party';
interface Source { id: string; campaign: string; instance: string; linked: boolean; contentHash?: string; remoteHash?: string; title?: string; revision?: string; audience?: ImportContent; gmHash?: string; partyHash?: string }
interface Prepared { page: WikiPage; html: string; partyVisible: boolean }
const digest = (content: string) => hashFields({ content });
const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export function renderWikiPage(page: WikiPage): string {
  return (page.blocks ?? []).map((block) => {
    const content = block.content ?? {};
    if (['text-tiptap', 'text-biography', 'text'].includes(block.type) && typeof content.markdown === 'string') return markdownToHtml(content.markdown);
    if (block.type === 'image-display' && typeof content.imageUrl === 'string' && /^(?:https?:\/\/|\/)/i.test(content.imageUrl)) return `<figure><img src="${escape(content.imageUrl)}" alt="${escape(String(content.caption ?? ''))}"><figcaption>${escape(String(content.caption ?? ''))}</figcaption></figure>`;
    const label = escape(block.type.replace(/[-_]/g, ' '));
    const readable = escape(JSON.stringify(content, null, 2) ?? '');
    return `<section class="esiana-widget"><h3>${label}</h3><pre>${readable}</pre></section>`;
  }).join('');
}
function resolveReferences(html: string): string {
  if (typeof document === 'undefined') return html;
  const root = document.createElement('div'); root.innerHTML = html;
  const config = getConfig();
  const instance = config.instanceUrl.trim().replace(/\/$/, '') || DEFAULT_INSTANCE_URL;
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
export async function prepareWikiImport(client: EsianaClient, id: string, audience: ImportContent = 'all', projectionVerified = true, copyAssets = false): Promise<Prepared> {
  if (audience === 'party' && !projectionVerified) throw new Error('Esiana did not confirm a Party projection for this account.');
  if (audience === 'party') {
    const page = await client.wikiPage(id, true);
    return { page, html: copyAssets ? await copyImages(resolveReferences(renderWikiPage(page)), client) : resolveReferences(renderWikiPage(page)), partyVisible: true };
  }
  const page = await client.wikiPage(id);
  let party: WikiPage | null = null;
  if (projectionVerified) {
    try { party = await client.wikiPage(id, true); }
    catch (error) { if (!(error instanceof EsianaApiError) || error.status !== 404) throw error; }
  }
  // A matching title and complete block array establishes that the representation
  // being imported contains no content removed by the Party projection.
  const partyVisible = Boolean(party && party.title === page.title && stableStringify(party.blocks) === stableStringify(page.blocks));
  return { page, html: partyVisible && copyAssets ? await copyImages(resolveReferences(renderWikiPage(page)), client) : resolveReferences(renderWikiPage(page)), partyVisible };
}
function restrictedOwnership(doc?: any): Record<string, number> {
  const ownership = { ...(doc?.ownership ?? {}), default: 0 };
  for (const user of game.users.contents) if (!user.isGM) ownership[user.id] = 0;
  return ownership;
}
export async function createWikiJournal(prepared: Prepared, folder: string | null, source: Source): Promise<any> {
  const grant = prepared.partyVisible && game.settings.get(MODULE_ID, 'permissions') !== 'never';
  const wikiSource = { ...source, contentHash: digest(prepared.html), remoteHash: digest(prepared.html), title: prepared.page.title, revision: prepared.page.updatedAt, audience: game.settings.get(MODULE_ID, 'importContent') ?? 'all' };
  return JournalEntry.create({ name: prepared.page.title, folder, ownership: { default: grant ? 2 : 0 }, pages: [{ name: prepared.page.title, type: 'text', text: { content: prepared.html, format: 1 } }], flags: { [MODULE_ID]: { wikiSource } } }, { esianaSyncMutationId: crypto.randomUUID() });
}
export async function syncWikiJournals(): Promise<number> {
  const config = getConfig();
  const instance = config.instanceUrl.trim().replace(/\/$/, '') || DEFAULT_INSTANCE_URL;
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
      const legacyGm = pages.find((page: any) => page.getFlag?.(MODULE_ID, 'audience') === 'gm');
      const legacyParty = pages.find((page: any) => page.getFlag?.(MODULE_ID, 'audience') === 'party');
      const current = legacyGm ?? pages[0];
      if (!current) throw new Error('The imported Journal page is missing.');
      const legacy = Boolean(legacyGm);
      if (legacy && (!source.gmHash || (legacyParty && !source.partyHash))) throw new Error('The previous audience representation has no reliable baseline; migrate this Journal manually.');
      if (legacy && ((source.gmHash && digest(legacyGm.text?.content ?? '') !== source.gmHash) || (legacyParty && source.partyHash && digest(legacyParty.text?.content ?? '') !== source.partyHash))) throw new Error('Local Journal edits conflict with the audience migration; no pages were removed.');
      let remoteHash = digest(prepared.html);
      let changed = source.revision !== prepared.page.updatedAt || source.audience !== audience || (source.remoteHash ?? source.contentHash) !== remoteHash;
      const localChanged = !legacy && (digest(current.text?.content ?? '') !== source.contentHash || (source.title !== undefined && doc.name !== source.title));
      const direction = game.settings.get(MODULE_ID, 'syncDirection') ?? 'fromEsiana';
      if (!legacy && localChanged && direction !== 'fromEsiana') {
        if (changed) throw new Error('Both Esiana and Foundry changed; no content was overwritten.');
        if (audience !== 'all') throw new Error('Sending edits requires All accessible content so hidden blocks cannot be overwritten.');
        if (doc.name !== source.title) throw new Error('Publishing Journal title changes is not yet supported safely.');
        const blocks = prepared.page.blocks;
        if (!source.revision || blocks.length !== 1 || !['text-tiptap', 'text-biography'].includes(blocks[0].type) || typeof blocks[0].content?.markdown !== 'string') throw new Error('This structured page cannot be safely edited from Foundry; edit it in Esiana.');
        const next = [{ ...blocks[0], content: { ...blocks[0].content, markdown: htmlToMarkdown(current.text?.content ?? '') } }];
        const result = await client.updateWikiLayout(source.id, source.revision, next);
        if (!result.updatedAt) throw new Error('Esiana did not confirm the revisioned update.');
        prepared = await prepareWikiImport(client, source.id, audience, projectionVerified);
        if (prepared.page.updatedAt !== result.updatedAt) throw new Error('Esiana changed after the update; review the Journal before retrying.');
        remoteHash = digest(prepared.html);
        // Retain the user's formatting locally and use it as the new comparison baseline.
        prepared.html = current.text?.content ?? '';
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
