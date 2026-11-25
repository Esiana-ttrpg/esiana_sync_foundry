import assert from 'node:assert/strict';
import test from 'node:test';
import { registerSettings } from '../dist/scripts/settings.js';

test('registers native connection settings and uses V2 for settings menus', async () => {
  const settings = new Map(); const menus = new Map(); let opened = 0;
  class ApplicationV2 {}
  globalThis.foundry = { applications: { api: { ApplicationV2 } } };
  globalThis.game = { settings: {
    register: (namespace, key, config) => settings.set(`${namespace}.${key}`, config),
    get: (namespace, key) => settings.get(`${namespace}.${key}`)?.default,
    registerMenu: (namespace, key, config) => menus.set(`${namespace}.${key}`, config),
  } };
  registerSettings({ setup: () => {}, status: () => {}, test: () => { opened++; } });
  assert.equal(settings.get('esiana-sync.apiToken').config, true);
  assert.equal(settings.get('esiana-sync.instanceUrl').config, true);
  assert.equal(settings.get('esiana-sync.campaignHandle').config, true);
  const Menu = menus.get('esiana-sync.testConnection').type;
  const instance = new Menu();
  assert.ok(instance instanceof ApplicationV2);
  await instance.render(true);
  assert.equal(opened, 1);
});

test('dialogs use DialogV2 and pass their form to callbacks', async () => {
  const { dialog } = await import('../dist/scripts/ui.js');
  const form = { id: 'form' }; let received;
  globalThis.foundry = { applications: { api: { DialogV2: { wait: async (config) => config.buttons[0].callback({}, { form }, { element: {} }) } } } };
  const result = await dialog({ buttons: [{ action: 'ok', callback: (_event, element) => { received = element; return 'ok'; } }] });
  assert.equal(result, 'ok');
  assert.equal(received, form);
});
