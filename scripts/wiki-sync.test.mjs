import assert from 'node:assert/strict';
import test from 'node:test';
import { EsianaApiError } from '../dist/scripts/api.js';
import { prepareWikiImport, createWikiJournal, syncWikiJournals, splitEditableHtml } from '../dist/scripts/wikiSync.js';
import { hashFields } from '../dist/scripts/reconcile.js';
import { markdownToHtml } from '../dist/scripts/conversion.js';
const page = (markdown) => ({ id: 'p1', title: 'The Archive', updatedAt: '2026-01-01', blocks: [{ type: 'text-tiptap', content: { markdown } }] });
function setup(audience = 'all', permissions = 'initial') {
  const settings = { config: { campaignHandle: 'campaign', collections: {} }, instanceUrl: 'https://esiana.example.test', campaignHandle: 'campaign', apiToken: 'secret', importContent: audience, permissions };
  globalThis.game = { user: { isGM: true }, users: { contents: [{ id: 'player', isGM: false }, { id: 'gm', isGM: true }] }, settings: { get: (_module, key) => settings[key] }, journal: { contents: [] } };
}
const source = { id: 'p1', instance: 'https://esiana.example.test', campaign: 'campaign', linked: true };
async function create(prepared) { let created; globalThis.JournalEntry = { create: async (data) => { created = data; return data; } }; await createWikiJournal(prepared, null, source); return created; }
test('all content imports one restricted page when Party projection omits content', async () => {
  setup(); const prepared = await prepareWikiImport({ wikiPage: async (_id, party) => page(party ? 'Public' : 'Public\n\nSecret') }, 'p1');
  const doc = await create(prepared);
  assert.equal(doc.pages.length, 1); assert.match(doc.pages[0].text.content, /Secret/); assert.equal(doc.ownership.default, 0);
});
test('Party-only imports one shareable projected page without requesting full content', async () => {
  setup('party'); const calls = [];
  const prepared = await prepareWikiImport({ wikiPage: async (_id, party) => { calls.push(party); return page('Public'); } }, 'p1', 'party');
  const doc = await create(prepared);
  assert.deepEqual(calls, [true]); assert.equal(doc.pages.length, 1); assert.equal(doc.ownership.default, 2);
});
test('matching Party projection may be shared, Never grants no access', async () => {
  setup('all', 'never'); const prepared = await prepareWikiImport({ wikiPage: async () => page('Public') }, 'p1');
  assert.equal(prepared.partyVisible, true); assert.equal((await create(prepared)).ownership.default, 0);
});
test('unverified projection never grants access and Party import is rejected', async () => {
  setup(); const client = { wikiPage: async () => page('Text') };
  assert.equal((await prepareWikiImport(client, 'p1', 'all', false)).partyVisible, false);
  await assert.rejects(prepareWikiImport(client, 'p1', 'party', false), /did not confirm/);
});
test('a hidden Party projection keeps all-content import restricted', async () => {
  setup(); const client = { wikiPage: async (_id, party) => { if (party) throw new EsianaApiError(404, 'not found'); return page('Secret'); } };
  assert.equal((await create(await prepareWikiImport(client, 'p1'))).ownership.default, 0);
});
test('unsupported blocks produce an escaped readable fallback', async () => {
  setup(); const client = { wikiPage: async () => ({ ...page('text'), blocks: [{ type: 'custom-widget', content: { clue: '<hidden>' } }] }) };
  const html = (await prepareWikiImport(client, 'p1')).html;
  assert.match(html, /Additional content is available in Esiana/);
  assert.doesNotMatch(html, /custom-widget|hidden/);
});
test('failed refresh leaves access restricted', async () => {
  setup(); const updates = []; game.journal.contents.push({ name: 'Archive', ownership: { default: 2 }, getFlag: () => source, update: async (data) => updates.push(data) });
  const previous = globalThis.fetch; globalThis.fetch = async () => { throw new Error('offline'); };
  try { await assert.rejects(syncWikiJournals(), /could not sync/); } finally { globalThis.fetch = previous; }
  assert.equal(updates[0].ownership.default, 0); assert.equal(updates[0].ownership.player, 0);
});
test('escapes markup and renders basic rich text', () => assert.equal(markdownToHtml('# Title\n\n**bold** <script>'), '<h1>Title</h1><p><strong>bold</strong> &lt;script&gt;</p>'));

test('refresh uses selected Party representation and updates one normal page', async () => {
  setup('party', 'always');
  const oldHtml = '<p>Old</p>'; const updates = [];
  const oldSource = { ...source, contentHash: hashFields({ content: oldHtml }), title: 'The Archive', audience: 'all', revision: 'old' };
  const journalPage = { text: { content: oldHtml }, getFlag: () => undefined, update: async (data) => updates.push({ page: data }) };
  const doc = { name: 'The Archive', ownership: { default: 0 }, pages: { contents: [journalPage] }, getFlag: () => oldSource, update: async (data) => updates.push({ doc: data }) };
  game.journal.contents.push(doc); const previous = globalThis.fetch; const requested = [];
  globalThis.fetch = async (url) => { requested.push(String(url)); if (String(url).includes('/entity-pages')) return { ok: false, status: 404, json: async () => ({ error: 'Managed entity not found' }) }; return { ok: true, status: 200, json: async () => String(url).includes('/tree') ? { tree: [], campaign: { isMember: true } } : page('Party content') }; };
  try { assert.equal(await syncWikiJournals(), 1); } finally { globalThis.fetch = previous; }
  assert.ok(requested.every((url) => url.includes('previewAsPlayer=true')));
  assert.equal(updates.find((item) => item.page).page['text.content'], '<p>Party content</p>');
  assert.equal(updates.at(-1).doc.ownership.default, 2);
});
test('refresh revokes access when full content becomes restricted', async () => {
  setup('all', 'always');
  const oldHtml = '<p>Public</p>'; const updates = [];
  const oldSource = { ...source, contentHash: hashFields({ content: oldHtml }), title: 'The Archive', audience: 'all', revision: 'old' };
  const journalPage = { text: { content: oldHtml }, getFlag: () => undefined, update: async () => {} };
  const doc = { name: 'The Archive', ownership: { default: 2 }, pages: { contents: [journalPage] }, getFlag: () => oldSource, update: async (data) => updates.push(data) };
  game.journal.contents.push(doc); const previous = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes('/entity-pages') ? ({ ok: false, status: 404, json: async () => ({ error: 'Managed entity not found' }) }) : ({ ok: true, status: 200, json: async () => String(url).includes('/tree') ? { tree: [], campaign: { isMember: true } } : page(String(url).includes('previewAsPlayer') ? 'Public' : 'Public and secret') });
  try { assert.equal(await syncWikiJournals(), 1); } finally { globalThis.fetch = previous; }
  assert.equal(updates.at(-1).ownership.default, 0); assert.equal(updates.at(-1).ownership.player, 0);
});

test('revisioned wiki updates use the conditional endpoint and carry the base revision', async () => {
  const { EsianaClient } = await import('../dist/scripts/api.js');
  const previous = globalThis.fetch; let request;
  globalThis.fetch = async (url, init) => { request = { url, init }; return { ok: true, status: 200, json: async () => ({ updatedAt: '2026-01-01T00:00:01.000Z' }) }; };
  try { await new EsianaClient('https://example.test', 'secret', 'campaign').updateWikiLayout('page', '2026-01-01T00:00:00.000Z', [{ id: 'one' }]); }
  finally { globalThis.fetch = previous; }
  assert.match(request.url, /\/wiki\/page\/layout\/revisioned$/);
  assert.equal(JSON.parse(request.init.body).expectedUpdatedAt, '2026-01-01T00:00:00.000Z');
});

test('metadata fields render without leaking a GM-only field to players', async () => {
  setup();
  const client = { wikiPage: async (_id, party) => ({ ...page('Story'), metadata: party ? { profession: 'Sage' } : { profession: 'Sage', secret: 'Hidden truth' } }) };
  const prepared = await prepareWikiImport(client, 'p1');
  assert.match(prepared.html, /Profession/); assert.match(prepared.html, /Sage/); assert.match(prepared.html, /Hidden truth/);
  assert.equal(prepared.partyVisible, false);
  assert.equal((await create(prepared)).ownership.default, 0);
});

test('structured edits only extract text between unchanged widget sections', () => {
  const prefix = '<section>Identity</section>'; const suffix = '<section>Appearance</section>';
  assert.equal(splitEditableHtml(`${prefix}<p>Original</p><p>Update</p>${suffix}`, prefix, suffix), '<p>Original</p><p>Update</p>');
  assert.throws(() => splitEditableHtml('<section>Modified</section><p>Update</p>' + suffix, prefix, suffix), /Non-text fields/);
  assert.throws(() => splitEditableHtml(prefix + '<p>Update</p><section>Modified</section>', prefix, suffix), /Non-text fields/);
});
