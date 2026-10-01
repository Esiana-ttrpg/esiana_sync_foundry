import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { zipSync } from 'fflate';

const dist = resolve('dist');
const outputDir = resolve('release');
const files = {};

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else files[relative(dist, path).split(sep).join('/')] = new Uint8Array(await readFile(path));
  }
}

await collect(dist);
await mkdir(outputDir, { recursive: true });
const output = resolve(outputDir, 'esiana-sync.zip');
await writeFile(output, zipSync(files, { level: 9 }));
console.log(`Created ${output} with ${Object.keys(files).length} files.`);
