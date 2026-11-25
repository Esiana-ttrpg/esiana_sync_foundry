import { importableRows } from './wikiTree.js';
import { prepareWikiImport, createWikiJournal, renderWikiPage } from './wikiSync.js';
import { EsianaClient } from './api.js';
import { markdownToHtml } from './conversion.js';
import { getConfig, getToken, MODULE_ID } from './settings.js';
import { dialog } from './ui.js';
import type { WikiNode, WikiPage } from './types.js';

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
interface Row { node: WikiNode; ancestors: WikiNode[] }
function flatten(nodes: WikiNode[], ancestors: WikiNode[] = []): Row[] {
  return nodes.flatMap((node) => [{ node, ancestors }, ...flatten(node.children ?? [], [...ancestors, node])]);
}
function imported(id: string, campaign: string, instance: string): any {
  return game.journal.contents.find((doc: any) => {
    const source = doc.getFlag(MODULE_ID, 'wikiSource');
    return source?.id === id && source?.campaign === campaign && source?.instance === instance;
  });
}
async function folderFor(row: Row, cache: Map<string, string>): Promise<string | null> {
  let parent: string | null = null;
  // Foundry permits at most three nested folder levels.
  for (const ancestor of row.ancestors.slice(0, 3)) {
    const key: string = `${parent ?? ''}/${ancestor.id}`;
    if (!cache.has(key)) {
      const folder = await Folder.create({ name: ancestor.title, type: 'JournalEntry', folder: parent, flags: { [MODULE_ID]: { wikiFolder: key } } });
      cache.set(key, folder.id);
    }
    parent = cache.get(key)!;
  }
  return parent;
}
export async function openImportBrowser(): Promise<void> {
  if (!game.user?.isGM) return;
  const config = getConfig();
  if (!config.campaignHandle || !getToken()) throw new Error('Configure an Esiana campaign and personal access token first.');
  const client = new EsianaClient(config.instanceUrl, getToken(), config.campaignHandle);
  const audience = game.settings.get(MODULE_ID, 'importContent') === 'party' ? 'party' : 'all';
  let partyTree: Awaited<ReturnType<EsianaClient['wikiTreeParty']>> | null = null;
  try { partyTree = await client.wikiTreeParty(); } catch (error) { if (audience === 'party') throw error; }
  const projectionVerified = partyTree?.campaign?.isMember === true;
  if (audience === 'party' && !projectionVerified) throw new Error('Esiana did not confirm a Party projection for this account.');
  const result = audience === 'party' ? partyTree! : await client.wikiTree();
  if (!Array.isArray(result.tree)) throw new Error('Esiana returned an invalid wiki tree.');
  const partyRows = projectionVerified ? flatten(partyTree!.tree) : [];
  const partyById = new Map(partyRows.map((row) => [row.node.id, row]));
  const rows = importableRows(result.tree).filter(({ node }) => game.settings.get(MODULE_ID, 'showTemplates') || node.templateType !== 'TEMPLATE');
  const instance = config.instanceUrl.trim().replace(/\/$/, '') || 'https://esiana.psl.coffee';
  const items = rows.map(({ node, ancestors }) => {
    const path = ancestors.map((item) => item.title).join(' / ');
    const existing = imported(node.id, config.campaignHandle, instance);
    return `<li class="esiana-import-row" data-search="${escapeHtml(`${node.title} ${path}`.toLowerCase())}" data-category="${escapeHtml(ancestors[0]?.id ?? node.id)}"><label><input type="checkbox" name="page" value="${escapeHtml(node.id)}" ${existing ? 'disabled' : ''}> <strong>${escapeHtml(node.title)}</strong> <small>${escapeHtml(path)} · ${escapeHtml(node.visibility)}${existing ? ' · Imported' : ''}</small></label><button type="button" data-preview="${escapeHtml(node.id)}">Preview</button></li>`;
  }).join('');
  const categoryNodes = new Map(rows.map(({ node, ancestors }) => { const category = ancestors[0] ?? node; return [category.id, category] as const; }));
  const categories = [...categoryNodes.values()].map((node) => `<option value="${escapeHtml(node.id)}">${escapeHtml(node.title)}</option>`).join('');
  const content = `<div class="esiana-import"><div class="esiana-import-filters"><input name="search" type="search" placeholder="Search pages" aria-label="Search pages"><select name="category" aria-label="Filter by category"><option value="">All categories</option>${categories}</select></div><div class="esiana-import-toolbar"><button type="button" data-select-visible>Select visible</button><span data-selection-count aria-live="polite">0 selected</span></div><ul class="esiana-import-list">${items || '<li class="esiana-import-empty">No pages found.</li>'}</ul><div class="esiana-import-footer"><label>Import behavior <select name="mode"><option value="independent">Independent copies</option><option value="fromEsiana">Sync from Esiana</option></select></label><aside data-preview-output aria-live="polite">Select Preview to inspect a page.</aside></div></div>`;
  const onInteraction = async (event: Event) => {
    const target = event.target as HTMLElement;
    const form = target.closest('.esiana-import') as HTMLElement | null;
    if (!form) return;
    const update = () => {
      const search = (form.querySelector('[name=search]') as HTMLInputElement).value.toLowerCase();
      const category = (form.querySelector('[name=category]') as HTMLSelectElement).value;
      form.querySelectorAll<HTMLLIElement>('li[data-search]').forEach((item) => { item.hidden = !item.dataset.search?.includes(search) || Boolean(category && item.dataset.category !== category); });
      const count = form.querySelectorAll('input[name=page]:checked').length;
      const status = form.querySelector('[data-selection-count]'); if (status) status.textContent = `${count} selected`;
    };
    if (event.type === 'input' || event.type === 'change') { update(); return; }
    const button = target.closest('button') as HTMLButtonElement | null;
    if (!button) return;
    if (button.hasAttribute('data-select-visible')) { form.querySelectorAll<HTMLInputElement>('li:not([hidden]) input[name="page"]:not(:disabled)').forEach((input) => { input.checked = true; }); update(); }
    if (button.dataset.preview) {
      const output = form.querySelector('[data-preview-output]')!; output.textContent = 'Loading preview…';
      try { const page = await client.wikiPage(button.dataset.preview, audience === 'party'); output.innerHTML = `<h3>${escapeHtml(page.title)}</h3>${renderWikiPage(page)}`; }
      catch (error) { output.textContent = error instanceof Error ? error.message : 'Unable to load preview.'; }
    }
  };
  document.addEventListener('click', onInteraction); document.addEventListener('input', onInteraction); document.addEventListener('change', onInteraction);
  let selection: { ids: string[]; mode: string } | null;
  try {
    selection = await dialog({ window: { title: 'Import from Esiana' }, content, buttons: [{ action: 'import', label: 'Import selected', default: true, callback: (_event: Event, element: HTMLElement) => ({ ids: [...element.querySelectorAll<HTMLInputElement>('input[name="page"]:checked')].map((input) => input.value), mode: (element.querySelector('[name="mode"]') as HTMLSelectElement).value }) }, { action: 'cancel', label: 'Cancel' }] });
  } finally { document.removeEventListener('click', onInteraction); document.removeEventListener('input', onInteraction); document.removeEventListener('change', onInteraction); }
  if (!selection || !Array.isArray(selection.ids) || !selection.ids.length) return;
  const chosen = rows.filter(({ node }) => selection!.ids.includes(node.id));
  const pages = await Promise.all(chosen.map(async (row) => ({ row, prepared: await prepareWikiImport(client, row.node.id, audience, projectionVerified, selection!.mode === 'independent') }))); 
  const cache = new Map<string, string>();
  for (const folder of game.folders.contents) { const key = folder.getFlag?.(MODULE_ID, 'wikiFolder'); if (folder.type === 'JournalEntry' && key) cache.set(key, folder.id); }
  let count = 0;
  for (const { row, prepared } of pages) {
    if (imported(prepared.page.id, config.campaignHandle, instance)) continue;
    // Do not expose a GM-only ancestor name through a shared Journal folder.
    const safeRow = prepared.partyVisible ? partyById.get(prepared.page.id) : row;
    if (prepared.partyVisible && !safeRow) throw new Error(`The Party page hierarchy changed while importing ${prepared.page.title}. Reopen the browser and try again.`);
    const folder = game.settings.get(MODULE_ID, 'folderTree') ? await folderFor(safeRow!, cache) : null;
    await createWikiJournal(prepared, folder, { id: prepared.page.id, campaign: config.campaignHandle, instance, linked: selection.mode === 'fromEsiana' });
    count++;
  }
  ui.notifications.info(`Imported ${count} Esiana pages.`);
}
