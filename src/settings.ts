import type { ModuleConfig } from './types.js';
export const MODULE_ID = 'esiana-sync';
export const DEFAULT_CONFIG: ModuleConfig = { instanceUrl: '', campaignId: '', campaignHandle: '', collections: {}, folderIds: {}, intervalMinutes: 5 };

function settingsMenu(open: () => void): any {
  const FormApplication = foundry.appv1.api.FormApplication;
  return class EsianaSettingsMenu extends FormApplication {
    render(): this {
      queueMicrotask(open);
      return this;
    }
  };
}

export function registerSettings(actions: { setup: () => void; status: () => void }): void {
  game.settings.register(MODULE_ID, 'config', { scope: 'world', config: false, type: Object, default: DEFAULT_CONFIG });
  game.settings.register(MODULE_ID, 'apiToken', { scope: 'client', config: false, restricted: true, type: String, default: '' });
  game.settings.register(MODULE_ID, 'lastSync', { scope: 'world', config: false, type: Object, default: null });
  game.settings.register(MODULE_ID, 'conflicts', { scope: 'world', config: false, type: Array, default: [] });
  game.settings.registerMenu(MODULE_ID, 'configure', {
    name: 'ESIANA_SYNC.SettingsName',
    label: 'ESIANA_SYNC.SettingsLabel',
    hint: 'ESIANA_SYNC.SettingsHint',
    icon: 'fa-solid fa-link',
    type: settingsMenu(actions.setup),
    restricted: true,
  });
  game.settings.registerMenu(MODULE_ID, 'status', {
    name: 'ESIANA_SYNC.StatusName',
    label: 'ESIANA_SYNC.StatusLabel',
    hint: 'ESIANA_SYNC.StatusHint',
    icon: 'fa-solid fa-arrows-rotate',
    type: settingsMenu(actions.status),
    restricted: true,
  });
}
export const getConfig = (): ModuleConfig => ({ ...DEFAULT_CONFIG, ...(game.settings.get(MODULE_ID, 'config') ?? {}) });
export const setConfig = (value: ModuleConfig) => game.settings.set(MODULE_ID, 'config', value);
export const getToken = (): string => String(game.settings.get(MODULE_ID, 'apiToken') ?? '');
export const setToken = (value: string) => game.settings.set(MODULE_ID, 'apiToken', value);
