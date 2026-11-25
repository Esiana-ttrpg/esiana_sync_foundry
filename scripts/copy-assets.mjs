import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';

await mkdir('dist', { recursive: true });
for (const dir of ['styles', 'lang']) await cp(dir, `dist/${dir}`, { recursive: true });
const manifest = JSON.parse(await readFile('module.json', 'utf8'));
if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(manifest.version)) throw new Error('Invalid module version');
// A versioned directory also versions relative imports, which otherwise keep
// their old URL and can stay cached after Foundry installs a module update.
const scriptDir = `scripts/v${manifest.version}`;
await mkdir(`dist/${scriptDir}`, { recursive: true });
for (const entry of await readdir('dist/scripts', { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.js')) await cp(`dist/scripts/${entry.name}`, `dist/${scriptDir}/${entry.name}`);
}
manifest.esmodules = (manifest.esmodules ?? []).map((path) => path.startsWith('scripts/') ? `${scriptDir}/${path.slice('scripts/'.length)}` : path);
await writeFile('dist/module.json', `${JSON.stringify(manifest, null, 2)}\n`);
