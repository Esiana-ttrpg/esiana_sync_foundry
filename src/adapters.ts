import { htmlToMarkdown, markdownToHtml, selectFields } from './conversion.js';
import type { CollectionChoice, SyncFlags, SyncResource } from './types.js';
export interface FoundryAdapter { kind: 'JournalEntry' | 'Actor'; createData(resource: SyncResource, choice: CollectionChoice, folderId: string, flags: SyncFlags): any; readFields(document: any, selected: string[]): Record<string, unknown>; updateData(resource: SyncResource, flags: SyncFlags): any }
const journal: FoundryAdapter = {
  kind: 'JournalEntry',
  createData(resource, _choice, folderId, flags) { return { name: resource.displayName, folder: folderId, pages: [{ name: resource.displayName, type: 'text', text: { content: markdownToHtml(String(resource.fields.body ?? '')), format: 1 } }], flags: { 'esiana-sync': { sync: flags } } }; },
  readFields(document, selected) { const page = document.pages?.contents?.[0] ?? document.pages?.[0]; return selectFields({ name: document.name, body: htmlToMarkdown(page?.text?.content ?? ''), ...(document.getFlag?.('esiana-sync', 'sync')?.baseFields ?? {}) }, selected); },
  updateData(resource, flags) { return { name: resource.displayName, 'flags.esiana-sync.sync': flags }; },
};
const actor: FoundryAdapter = {
  kind: 'Actor',
  createData(resource, choice, folderId, flags) { return { name: resource.displayName, type: choice.actorType, folder: folderId, img: resource.fields.image || undefined, flags: { 'esiana-sync': { sync: flags } } }; },
  readFields(document, selected) { return selectFields({ name: document.name, image: document.img, body: document.getFlag?.('esiana-sync', 'biography') ?? '', ...(document.getFlag?.('esiana-sync', 'sync')?.baseFields ?? {}) }, selected); },
  updateData(resource, flags) { return { name: resource.displayName, ...(resource.fields.image ? { img: resource.fields.image } : {}), 'flags.esiana-sync.biography': resource.fields.body ?? '', 'flags.esiana-sync.sync': flags }; },
};
const registry = new Map<string, FoundryAdapter>([['journal', journal], ['actor', actor]]);
export function registerAdapter(id: string, adapter: FoundryAdapter) { registry.set(id, adapter); }
export function adapterFor(choice: CollectionChoice): FoundryAdapter { return registry.get(choice.representation) ?? journal; }
