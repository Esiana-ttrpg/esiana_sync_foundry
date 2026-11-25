import { groupForRow, importableRows } from './wikiTree.js';
import { prepareWikiImport, createWikiJournal } from './wikiSync.js';
import { EsianaClient, normalizeInstanceUrl } from './api.js';
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
  const instance = normalizeInstanceUrl(config.instanceUrl);
  const groups = new Map<string, { title: string; items: string[] }>();
  for (const row of rows) {
    const { node, ancestors } = row;
    const group = groupForRow(row);
    const path = ancestors.filter((item) => !['world', 'game'].includes(item.title.trim().toLowerCase())).map((item) => item.title).join(' / ');
    const existing = imported(node.id, config.campaignHandle, instance);
    const item = `<li class="esiana-import-row" data-search="${escapeHtml(`${node.title} ${path}`.toLowerCase())}" data-category="${escapeHtml(group.id)}"><label><input type="checkbox" name="page" value="${escapeHtml(node.id)}" ${existing ? 'disabled' : ''}><span class="esiana-import-title">${escapeHtml(node.title)}<small>${escapeHtml(node.visibility === 'DM_Only' ? 'GM' : node.visibility)}${existing ? ' ? Imported' : ''}</small></span></label><button type="button" data-preview="${escapeHtml(node.id)}">Preview</button></li>`;
    if (!groups.has(group.id)) groups.set(group.id, { title: group.title, items: [] });
    groups.get(group.id)!.items.push(item);
  }
  const items = [...groups].map(([id, group]) => `<details class="esiana-import-group" data-group="${escapeHtml(id)}" open><summary>${escapeHtml(group.title)} <span>${group.items.length} ${group.items.length === 1 ? 'page' : 'pages'}</span></summary><ul class="esiana-import-list">${group.items.join('')}</ul></details>`).join('');
  const categories = [...groups].map(([id, group]) => `<option value="${escapeHtml(id)}">${escapeHtml(group.title)}</option>`).join('');
  const content = `<div class="esiana-import"><div class="esiana-import-filters"><input name="search" type="search" placeholder="Search pages" aria-label="Search pages"><select name="category" aria-label="Filter by category"><option value="">All categories</option>${categories}</select></div><div class="esiana-import-toolbar"><button type="button" data-select-visible>Select visible</button><span data-selection-count aria-live="polite">0 selected</span></div><div class="esiana-import-groups">${items || '<p class="esiana-import-empty">No pages found.</p>'}</div><div class="esiana-import-footer"><label>Import behavior <select name="mode"><option value="independent">Independent copies</option><option value="fromEsiana">Sync from Esiana</option></select></label><p class="esiana-import-hint" data-mode-hint>Independent copies do not synchronize.</p><aside data-preview-output aria-live="polite">Select Preview to inspect a page.</aside></div></div>`;
  const onInteraction = async (event: Event) => {
    const target = event.target as HTMLElement;
    const form = target.closest('.esiana-import') as HTMLElement | null;
    if (!form) return;
    const update = () => {
      const search = (form.querySelector('[name=search]') as HTMLInputElement).value.toLowerCase();
      const category = (form.querySelector('[name=category]') as HTMLSelectElement).value;
      form.querySelectorAll<HTMLLIElement>('li[data-search]').forEach((item) => { item.hidden = !item.dataset.search?.includes(search) || Boolean(category && item.dataset.category !== category); });
      form.querySelectorAll<HTMLElement>('[data-group]').forEach((group) => { group.hidden = !group.querySelector('li[data-search]:not([hidden])'); });
      const mode = (form.querySelector('[name=mode]') as HTMLSelectElement).value;
      const hint = form.querySelector('[data-mode-hint]'); if (hint) hint.textContent = mode === 'independent' ? 'Independent copies do not synchronize.' : 'Linked pages can synchronize using the selected direction in settings.';
      const count = form.querySelectorAll('input[name=page]:checked').length;
      const status = form.querySelector('[data-selection-count]'); if (status) status.textContent = `${count} selected`;
    };
    if (event.type === 'input' || event.type === 'change') { update(); return; }
    const button = target.closest('button') as HTMLButtonElement | null;
    if (!button) return;
    if (button.hasAttribute('data-select-visible')) { form.querySelectorAll<HTMLInputElement>('li:not([hidden]) input[name="page"]:not(:disabled)').forEach((input) => { if (input.closest('details')?.open) input.checked = true; }); update(); }
    if (button.dataset.preview) {
      const output = form.querySelector('[data-preview-output]')!; output.textContent = 'Loading preview…';
      try { const prepared = await prepareWikiImport(client, button.dataset.preview, audience, projectionVerified); const sections = prepared.presentation ? prepared.presentation.map((part) => `<section><h3>${escapeHtml(part.title)}</h3>${part.html}</section>`).join('') : prepared.html; output.innerHTML = `<h3>${escapeHtml(prepared.page.title)}</h3>${sections}`; }
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
