import { publishJournal } from './wikiSync.js';
import { openImportBrowser } from './importBrowser.js';
import { EsianaClient } from './api.js';
import { getConfig, getToken } from './settings.js';
import { registerAdapter } from './adapters.js';
import { registerSettings } from './settings.js';
import { SyncEngine } from './syncEngine.js';
import { openSetup, openStatus } from './ui.js';
const engine = new SyncEngine();

Hooks.once('init', () => {
  const setup = () => void openSetup(engine).catch((error) => engine.report(error));
  const status = () => void openStatus(engine).catch((error) => engine.report(error));
  const test = () => void (async () => {
    const url = (document.querySelector('input[name="esiana-sync.instanceUrl"]') as HTMLInputElement | null)?.value ?? getConfig().instanceUrl;
    const token = (document.querySelector('input[name="esiana-sync.apiToken"]') as HTMLInputElement | null)?.value ?? getToken();
    if (!token) throw new Error('Enter a personal access token.');
    const result = await new EsianaClient(url, token).listCampaigns();
    if (!Array.isArray(result?.campaigns)) throw new Error('Could not locate a valid Esiana API response at this address.');
    const campaigns = result.campaigns;
    const choices = Object.fromEntries(campaigns.map((campaign) => [campaign.handle, campaign.name]));
    await game.settings.set('esiana-sync', 'campaignChoices', choices);
    const setting = game.settings.settings.get('esiana-sync.campaignHandle');
    if (setting) setting.choices = { '': 'Select campaign', ...choices };
    const select = document.querySelector('select[name="esiana-sync.campaignHandle"]') as HTMLSelectElement | null;
    if (select) { const previous = select.value; select.replaceChildren(new Option('Select campaign', ''), ...campaigns.map((campaign) => new Option(campaign.name, campaign.handle))); select.value = previous; }
    const count = campaigns.length;
    ui.notifications.info(count ? `Connected. Found ${count} accessible campaigns.` : 'Connected successfully, but no accessible campaigns were found.');
  })().catch((error) => engine.report(error));
  registerSettings({ setup, status, test });
  game.modules.get('esiana-sync').api = { sync: () => engine.sync(), openSetup: setup, openStatus: status, registerAdapter };
});
// Synchronization is manual until background safety and conflict handling are complete.
for (const hook of ['createJournalEntry', 'createActor']) Hooks.on(hook, (doc: any, options: any) => void engine.handleCreate(doc, options).catch((e) => engine.report(e)));

for (const hook of ['deleteJournalEntry', 'deleteActor']) Hooks.on(hook, (doc: any) => { if (doc.getFlag?.('esiana-sync', 'sync')) ui.notifications.info('Esiana record was unlinked; remote content was not deleted.'); });

// Foundry's string setting uses a plain text input by default.
Hooks.on('renderSettingsConfig', (_app: any, html: any) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const token = root?.querySelector('input[name="esiana-sync.apiToken"]') as HTMLInputElement | null;
  if (token) token.type = 'password';
});

Hooks.on('renderJournalDirectory', (_app: any, html: any) => {
  if (!game.user?.isGM) return;
  const root: HTMLElement | undefined = html instanceof HTMLElement ? html : html?.[0];
  if (!root || root.querySelector('.esiana-sidebar-actions')) return;
  const controls = document.createElement('div');
  controls.className = 'esiana-sidebar-actions';
  const configure = document.createElement('button'); configure.type = 'button'; configure.textContent = 'Import Esiana';
  configure.addEventListener('click', () => void openImportBrowser().catch((error) => engine.report(error)));
  const sync = document.createElement('button'); sync.type = 'button'; sync.textContent = 'Sync Esiana';
  sync.addEventListener('click', () => void engine.sync().catch((error) => engine.report(error)));
  controls.append(configure, sync); root.append(controls);
});

Hooks.on('getJournalDirectoryEntryContext', (_app: any, options: any[]) => {
  const entry = (element: any) => game.journal.get((element instanceof HTMLElement ? element : element?.[0])?.dataset?.documentId);
  for (const [name, enabled] of [['Pause Esiana sync', false], ['Resume Esiana sync', true]] as const) options.push({
    name, icon: enabled ? '<i class="fa-solid fa-play"></i>' : '<i class="fa-solid fa-pause"></i>',
    condition: (element: any) => { const source = entry(element)?.getFlag('esiana-sync', 'wikiSource'); return Boolean(game.user?.isGM && source && source.linked !== enabled); },
    callback: (element: any) => { const doc = entry(element); const source = doc?.getFlag('esiana-sync', 'wikiSource'); if (source) void doc.setFlag('esiana-sync', 'wikiSource', { ...source, linked: enabled }).catch((error: unknown) => engine.report(error)); },
  });
  options.push({
    name: 'Unlink from Esiana', icon: '<i class="fa-solid fa-link-slash"></i>',
    condition: (element: any) => Boolean(game.user?.isGM && entry(element)?.getFlag('esiana-sync', 'wikiSource')),
    callback: (element: any) => { const doc = entry(element); if (doc) void doc.unsetFlag('esiana-sync', 'wikiSource').catch((error: unknown) => engine.report(error)); },
  });
  options.push({
    name: 'Publish to Esiana', icon: '<i class="fa-solid fa-upload"></i>',
    condition: (element: any) => {
      const id = (element instanceof HTMLElement ? element : element?.[0])?.dataset?.documentId;
      const doc = game.journal.get(id);
      return Boolean(game.user?.isGM && doc && !doc.getFlag('esiana-sync', 'wikiSource') && !doc.getFlag('esiana-sync', 'sync') && !doc.getFlag('esiana-sync', 'published'));
    },
    callback: (element: any) => {
      const id = (element instanceof HTMLElement ? element : element?.[0])?.dataset?.documentId;
      const doc = game.journal.get(id);
      if (doc) void publishJournal(doc).catch((error) => engine.report(error));
    },
  });
});
