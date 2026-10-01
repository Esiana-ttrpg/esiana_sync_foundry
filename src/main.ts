import { registerAdapter } from './adapters.js';
import { registerSettings } from './settings.js';
import { SyncEngine } from './syncEngine.js';
import { openSetup, openStatus } from './ui.js';
const engine = new SyncEngine();

Hooks.once('init', () => {
  const setup = () => void openSetup(engine).catch((error) => engine.report(error));
  const status = () => void openStatus(engine).catch((error) => engine.report(error));
  registerSettings({ setup, status });
  game.modules.get('esiana-sync').api = { sync: () => engine.sync(), openSetup: setup, openStatus: status, registerAdapter };
});
Hooks.once('ready', () => { if (game.user?.isGM) engine.schedule(); });
for (const hook of ['createJournalEntry', 'createActor']) Hooks.on(hook, (doc: any, options: any) => void engine.handleCreate(doc, options).catch((e) => engine.report(e)));
for (const hook of ['updateJournalEntry', 'updateJournalEntryPage', 'updateActor']) Hooks.on(hook, (doc: any, _change: any, options: any) => { if (!game.user?.isGM || engine.isRemoteWrite(doc.parent ?? doc, options)) return; engine.scheduleSoon(); });
for (const hook of ['deleteJournalEntry', 'deleteActor']) Hooks.on(hook, (doc: any) => { if (doc.getFlag?.('esiana-sync', 'sync')) ui.notifications.info('Esiana record was unlinked; remote content was not deleted.'); });
