import { registerAdapter } from './adapters.js';
import { registerSettings } from './settings.js';
import { SyncEngine } from './syncEngine.js';
import { openSetup, openStatus } from './ui.js';
const engine = new SyncEngine();

Hooks.once('init', () => { registerSettings(); game.modules.get('esiana-sync').api = { sync: () => engine.sync(), openSetup: () => openSetup(engine), openStatus: () => openStatus(engine), registerAdapter }; });
Hooks.once('ready', () => { if (game.user?.isGM) engine.schedule(); });
Hooks.on('getSceneControlButtons', (controls: any[]) => { if (!game.user?.isGM) return; const notes = controls.find((c) => c.name === 'notes'); if (notes) notes.tools.push({ name: 'esiana-sync', title: 'Esiana Sync', icon: 'fas fa-book-open', button: true, onClick: () => void openStatus(engine) }); });
for (const hook of ['createJournalEntry', 'createActor']) Hooks.on(hook, (doc: any, options: any) => void engine.handleCreate(doc, options).catch((e) => engine.report(e)));
for (const hook of ['updateJournalEntry', 'updateJournalEntryPage', 'updateActor']) Hooks.on(hook, (doc: any, _change: any, options: any) => { if (!game.user?.isGM || engine.isRemoteWrite(doc.parent ?? doc, options)) return; engine.scheduleSoon(); });
for (const hook of ['deleteJournalEntry', 'deleteActor']) Hooks.on(hook, (doc: any) => { if (doc.getFlag?.('esiana-sync', 'sync')) ui.notifications.info('Esiana record was unlinked; remote content was not deleted.'); });
