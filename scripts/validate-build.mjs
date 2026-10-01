import { access, readFile, readdir } from 'node:fs/promises';
import { posix } from 'node:path';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const manifest = JSON.parse(await readFile(new URL('module.json', dist), 'utf8'));
const errors = [];

if (manifest.id !== 'esiana-sync') errors.push('module id must be esiana-sync');
if (Number(manifest.compatibility?.minimum) !== 13) errors.push('minimum Foundry version must be 13');
if (Number(manifest.compatibility?.verified) < 14) errors.push('verified Foundry version must be 14 or newer');

const assetPaths = [
  ...(manifest.esmodules ?? []),
  ...(manifest.styles ?? []),
  ...(manifest.languages ?? []).map(({ path }) => path),
];
for (const path of assetPaths) {
  try { await access(new URL(path, dist)); }
  catch { errors.push(`manifest asset is missing: ${path}`); }
}

const scriptsDir = new URL('scripts/', dist);
for (const entry of await readdir(scriptsDir)) {
  if (!entry.endsWith('.js')) continue;
  const source = await readFile(new URL(entry, scriptsDir), 'utf8');
  for (const match of source.matchAll(/from\s+['"](\.\/.+?)['"]/g)) {
    const imported = posix.normalize(posix.join('scripts', match[1]));
    try { await access(new URL(imported, dist)); }
    catch { errors.push(`scripts/${entry} imports missing ${imported}`); }
  }
}

if (errors.length) throw new Error(`Invalid Foundry build:\n- ${errors.join('\n- ')}`);
console.log(`Validated ${manifest.title} ${manifest.version} for Foundry ${manifest.compatibility.minimum}-${manifest.compatibility.verified}.`);
