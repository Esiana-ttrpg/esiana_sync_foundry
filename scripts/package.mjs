import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { zipSync } from 'fflate';

const dist = resolve('dist');
const outputDir = resolve('release');
const files = {};
const manifest = JSON.parse(await readFile(resolve(dist, 'module.json'), 'utf8'));
const scriptPrefix = `scripts/v${manifest.version}/`;

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else {
      const name = relative(dist, path).split(sep).join('/');
      if (name.startsWith('scripts/') && !name.startsWith(scriptPrefix)) continue;
      files[name] = new Uint8Array(await readFile(path));
    }
  }
}

await collect(dist);
await mkdir(outputDir, { recursive: true });
const output = resolve(outputDir, 'esiana-sync.zip');
await writeFile(output, zipSync(files, { level: 9 }));
console.log(`Created ${output} with ${Object.keys(files).length} files.`);
