import { readFile } from 'node:fs/promises';

const tag = process.env.RELEASE_TAG;
if (!tag) throw new Error('RELEASE_TAG is required.');

const manifest = JSON.parse(await readFile('module.json', 'utf8'));
const packageMetadata = JSON.parse(await readFile('package.json', 'utf8'));
const expectedTag = `v${manifest.version}`;

if (packageMetadata.version !== manifest.version) {
  throw new Error(`package.json version ${packageMetadata.version} does not match module.json version ${manifest.version}.`);
}
if (tag !== expectedTag) {
  throw new Error(`Release tag ${tag} does not match manifest version; expected ${expectedTag}.`);
}

console.log(`Release tag ${tag} matches package and manifest version ${manifest.version}.`);
