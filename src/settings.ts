import type { ModuleConfig } from './types.js';
export const MODULE_ID = 'esiana-sync';
export const DEFAULT_CONFIG: ModuleConfig = { instanceUrl: '', campaignId: '', campaignHandle: '', collections: {}, folderIds: {}, intervalMinutes: 5 };

export function registerSettings(): void {
  game.settings.register(MODULE_ID, 'config', { scope: 'world', config: false, type: Object, default: DEFAULT_CONFIG });
  game.settings.register(MODULE_ID, 'apiToken', { scope: 'client', config: false, restricted: true, type: String, default: '' });
  game.settings.register(MODULE_ID, 'lastSync', { scope: 'world', config: false, type: Object, default: null });
  game.settings.register(MODULE_ID, 'conflicts', { scope: 'world', config: false, type: Array, default: [] });
}
export const getConfig = (): ModuleConfig => ({ ...DEFAULT_CONFIG, ...(game.settings.get(MODULE_ID, 'config') ?? {}) });
export const setConfig = (value: ModuleConfig) => game.settings.set(MODULE_ID, 'config', value);
export const getToken = (): string => String(game.settings.get(MODULE_ID, 'apiToken') ?? '');
export const setToken = (value: string) => game.settings.set(MODULE_ID, 'apiToken', value);
