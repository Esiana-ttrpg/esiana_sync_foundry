import type { ModuleConfig } from './types.js';
export const MODULE_ID = 'esiana-sync';
export const DEFAULT_CONFIG: ModuleConfig = { instanceUrl: '', campaignId: '', campaignHandle: '', collections: {}, folderIds: {}, intervalMinutes: 5 };

function settingsMenu(open: () => void): any {
  const ApplicationV2 = foundry.applications.api.ApplicationV2;
  return class EsianaSettingsMenu extends ApplicationV2 {
    async render(): Promise<this> {
      queueMicrotask(open);
      return this;
    }
  };
}

export function registerSettings(actions: { setup: () => void; status: () => void; test: () => void }): void {
  game.settings.register(MODULE_ID, 'config', { scope: 'world', config: false, type: Object, default: DEFAULT_CONFIG });
  game.settings.register(MODULE_ID, 'apiToken', { name: 'Personal Access Token', hint: 'Generate a personal access token from your Esiana account settings.', scope: 'client', config: true, restricted: true, type: String, default: '' });
  game.settings.register(MODULE_ID, 'campaignChoices', { scope: 'client', config: false, type: Object, default: {} });
  game.settings.register(MODULE_ID, 'campaignHandle', { name: 'Campaign', hint: 'Test the connection to discover campaigns.', scope: 'world', config: true, restricted: true, type: String, choices: { '': 'Select campaign', ...(game.settings.get(MODULE_ID, 'campaignChoices') ?? {}) }, default: '' });
  game.settings.register(MODULE_ID, 'instanceUrl', { name: 'Esiana URL', hint: 'The URL of your Esiana instance. Leave empty to use the official hosted instance.', scope: 'world', config: true, restricted: true, type: String, default: '' });
  game.settings.register(MODULE_ID, 'folderTree', { name: 'Create Folder Tree', hint: 'Replicate the Esiana page hierarchy in the Journal sidebar.', scope: 'world', config: true, restricted: true, type: Boolean, default: true });
  game.settings.register(MODULE_ID, 'importContent', { name: 'Import Content', hint: 'Choose which authorized Esiana content to import and synchronize.', scope: 'world', config: true, restricted: true, type: String, choices: { all: 'All accessible content', party: 'Party-visible content only' }, default: 'all' });
  game.settings.register(MODULE_ID, 'importImages', { name: 'Import Images', hint: 'Copy Party-visible images for independent imports to Foundry file storage. Linked imports keep Esiana URLs because Foundry files cannot be revoked when visibility changes.', scope: 'world', config: true, restricted: true, type: Boolean, default: false });
  game.settings.register(MODULE_ID, 'showTemplates', { name: 'Show Template Pages', hint: 'Include campaign templates in the import browser.', scope: 'client', config: true, restricted: true, type: Boolean, default: false });
  game.settings.register(MODULE_ID, 'syncDirection', { name: 'Synchronization Direction', hint: 'Select which side may update linked pages.', scope: 'world', config: true, restricted: true, type: String, choices: { fromEsiana: 'Esiana ? Foundry', toEsiana: 'Foundry ? Esiana', both: 'Bidirectional' }, default: 'fromEsiana' });
  game.settings.register(MODULE_ID, 'permissions', { name: 'Automatically Set Permissions', hint: 'Controls access to Party content; GM content always remains restricted.', scope: 'world', config: true, restricted: true, type: String, choices: { never: 'Never automatically grant permissions', initial: 'Set permissions on initial import', always: 'Set permissions on every update' }, default: 'never' });
  game.settings.register(MODULE_ID, 'lastSync', { scope: 'client', config: false, type: Object, default: null });
  game.settings.register(MODULE_ID, 'conflicts', { scope: 'client', config: false, type: Array, default: [] });
  game.settings.registerMenu(MODULE_ID, 'testConnection', { name: 'Connection Status', label: 'Test Connection', hint: 'Test the connection using the values currently entered above.', icon: 'fa-solid fa-plug', type: settingsMenu(actions.test), restricted: true });
  game.settings.registerMenu(MODULE_ID, 'status', {
    name: 'ESIANA_SYNC.StatusName',
    label: 'ESIANA_SYNC.StatusLabel',
    hint: 'ESIANA_SYNC.StatusHint',
    icon: 'fa-solid fa-arrows-rotate',
    type: settingsMenu(actions.status),
    restricted: true,
  });
}
export const getConfig = (): ModuleConfig => { const stored = game.settings.get(MODULE_ID, 'config') ?? {}; return { ...DEFAULT_CONFIG, ...stored, instanceUrl: game.settings.get(MODULE_ID, 'instanceUrl') ?? '', campaignHandle: game.settings.get(MODULE_ID, 'campaignHandle') ?? '' }; };
export const setConfig = async (value: ModuleConfig) => { await game.settings.set(MODULE_ID, 'instanceUrl', value.instanceUrl); await game.settings.set(MODULE_ID, 'campaignHandle', value.campaignHandle); return game.settings.set(MODULE_ID, 'config', value); };
export const getToken = (): string => game.user?.isGM ? String(game.settings.get(MODULE_ID, 'apiToken') ?? '') : '';
export const setToken = (value: string) => game.settings.set(MODULE_ID, 'apiToken', value);
