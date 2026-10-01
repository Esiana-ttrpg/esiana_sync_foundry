import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const dir of ['styles', 'lang']) await cp(dir, `dist/${dir}`, { recursive: true });
await cp('module.json', 'dist/module.json');
