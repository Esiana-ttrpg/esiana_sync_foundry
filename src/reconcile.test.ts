import assert from 'node:assert/strict';
import test from 'node:test';
import { classify, hashFields } from './reconcile.ts';
test('classifies one-sided and simultaneous edits', () => { const base = { name: 'Mira', body: 'Old' }; assert.equal(classify(base, base, base), 'unchanged'); assert.equal(classify(base, base, { ...base, body: 'Local' }), 'foundry-only'); assert.equal(classify(base, { ...base, body: 'Remote' }, base), 'esiana-only'); assert.equal(classify(base, { ...base, body: 'Remote' }, { ...base, body: 'Local' }), 'conflict'); });
test('uses stable key ordering', () => assert.equal(hashFields({ a: 1, b: 2 }), hashFields({ b: 2, a: 1 })));
