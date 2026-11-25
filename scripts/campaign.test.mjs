import assert from 'node:assert/strict';
import test from 'node:test';
import { openSetup } from '../dist/scripts/ui.js';
import { SyncEngine } from '../dist/scripts/syncEngine.js';

function fixture() {
  const store = new Map(Object.entries({ config: { instanceUrl: '', campaignHandle: '', campaignId: '', collections: {}, folderIds: {}, intervalMinutes: 5 }, campaignHandle: '', instanceUrl: '', apiToken: 'test-token' }));
  globalThis.game = { user: { isGM: true }, journal: { contents: [] }, actors: { contents: [] }, settings: { get: (_ns, key) => store.get(key), set: async (_ns, key, value) => store.set(key, value) } };
  globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
  globalThis.foundry = { applications: { api: { DialogV2: { wait: async (config) => config.buttons[0].callback({}, { form: { querySelector: () => ({ value: 'florence' }) } }, {}) } } } };
  return store;
}

test('campaign selection uses the standard wiki API and saves only after access is checked', async () => {
  const store = fixture(); const requests = []; const original = globalThis.fetch;
  globalThis.fetch = async (url) => { requests.push(String(url)); return { ok: true, status: 200, json: async () => String(url).endsWith('/api/campaigns') ? { campaigns: [{ id: 'campaign-id', handle: 'florence', name: 'Florence' }] } : { tree: [] } }; };
  try { await openSetup({}); } finally { globalThis.fetch = original; }
  assert.equal(store.get('campaignHandle'), 'florence');
  assert.equal(store.get('config').campaignId, 'campaign-id');
  assert.equal(requests.length, 2);
  assert.ok(requests[1].endsWith('/api/campaigns/florence/wiki/tree'));
  assert.ok(requests.every((url) => !url.includes('plugin-runtime')));
});

test('wiki sync does not require the optional plugin when legacy collection settings remain', async () => {
  const store = fixture(); store.set('campaignHandle', 'florence');
  store.set('config', { ...store.get('config'), collections: { characters: { enabled: true } } });
  const original = globalThis.fetch; globalThis.fetch = async () => { throw new Error('Unexpected network request'); };
  try { await new SyncEngine().sync(); } finally { globalThis.fetch = original; }
  assert.equal(store.get('lastSync').ok, true);
});
