import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
for (const dir of ['styles', 'lang', 'assets']) await cp(dir, `dist/${dir}`, { recursive: true });
const manifest = JSON.parse(await readFile('module.json', 'utf8'));
if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(manifest.version)) throw new Error('Invalid module version');
// A versioned directory also versions relative imports, which otherwise keep
// their old URL and can stay cached after Foundry installs a module update.
const scriptDir = `scripts/v${manifest.version}`;
await mkdir(`dist/${scriptDir}`, { recursive: true });
for (const entry of await readdir('dist/scripts', { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.js')) await cp(`dist/scripts/${entry.name}`, `dist/${scriptDir}/${entry.name}`);
}
const styleDir = `styles/v${manifest.version}`;
await mkdir(`dist/${styleDir}`, { recursive: true });
for (const path of manifest.styles ?? []) {
  if (path.startsWith('styles/')) await cp(`dist/${path}`, `dist/${styleDir}/${path.slice('styles/'.length)}`);
}
manifest.styles = (manifest.styles ?? []).map((path) => path.startsWith('styles/') ? `${styleDir}/${path.slice('styles/'.length)}` : path);
manifest.esmodules = (manifest.esmodules ?? []).map((path) => path.startsWith('scripts/') ? `${scriptDir}/${path.slice('scripts/'.length)}` : path);
await writeFile('dist/module.json', `${JSON.stringify(manifest, null, 2)}\n`);
