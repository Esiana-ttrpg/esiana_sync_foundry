import { lstat, mkdir, readlink, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';

const dataPath = process.argv[2];
if (!dataPath) throw new Error('Usage: pnpm run dev:link -- <Foundry Data directory>');

const source = resolve('dist');
const modules = resolve(dataPath, 'modules');
const target = resolve(modules, 'esiana-sync');
await mkdir(modules, { recursive: true });

try {
  const stat = await lstat(target);
  if (!stat.isSymbolicLink()) throw new Error(`${target} already exists and is not a development link.`);
  const existing = resolve(modules, await readlink(target));
  if (existing !== source) throw new Error(`${target} already links to ${existing}.`);
  console.log(`Development link already exists: ${target} -> ${source}`);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
  await symlink(source, target, process.platform === 'win32' ? 'junction' : 'dir');
  console.log(`Created development link: ${target} -> ${source}`);
}
