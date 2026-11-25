import assert from 'node:assert/strict';
import test from 'node:test';
import { groupForRow, importableRows } from '../dist/scripts/wikiTree.js';
import { markdownToHtml } from '../dist/scripts/conversion.js';

const node = (title, children = [], extra = {}) => ({ id: title, title, parentId: null, visibility: 'Party', templateType: 'DEFAULT', children, ...extra });
test('hides system pages while preserving session notes and campaign descendants', () => {
  const rows = importableRows([
    node('Player Session Notes', [node('Session 2 — Notes', [], { templateType: 'SESSION_NOTE' })]),
    node('World', [node('Characters', [node('Tags')])]),
    node('Game', [node('Adventure', [node('The Betrayal')], { metadata: { systemCategoryKey: 'quests' } }), node('Calendars', [node('Festival')])]),
    node('Tags'), node('Relations'), node('Recent Changes'), node('Settings'),
    node('Rivermoor'),
  ]);
  assert.deepEqual(rows.map(({ node }) => node.title), ['Session 2 — Notes', 'Tags', 'The Betrayal', 'Festival', 'Rivermoor']);
  assert.equal(rows[0].ancestors[0].title, 'Player Session Notes');
});
test('renders existing Markdown entities without allowing injected HTML', () => {
  assert.equal(markdownToHtml('## Campaign Notes &amp; Session Log'), '<h2>Campaign Notes &amp; Session Log</h2>');
  assert.equal(markdownToHtml('Fish & Chips'), '<p>Fish &amp; Chips</p>');
  assert.equal(markdownToHtml('&lt;script&gt;alert(1)&lt;/script&gt;'), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(markdownToHtml('A &#38; B'), '<p>A &amp; B</p>');
});

test('groups entries under the category rather than the World divider', () => {
  const rows = importableRows([node('World', [node('Characters', [node('Angel'), node('Bram')])])]);
  assert.deepEqual(rows.map(groupForRow), [{ id: 'Characters', title: 'Characters' }, { id: 'Characters', title: 'Characters' }]);
});
