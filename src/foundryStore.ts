import { MODULE_ID } from './settings.js';
import type { CollectionDescriptor, ModuleConfig, SyncFlags, SyncResource } from './types.js';
import { adapterFor } from './adapters.js';
import { hashFields } from './reconcile.js';

export async function ensureFolders(config: ModuleConfig, collections: CollectionDescriptor[]): Promise<Record<string, string>> {
  const ids = { ...config.folderIds };
  let root = ids.root && game.folders.get(ids.root);
  if (!root) root = await Folder.create({ name: 'Esiana', type: 'JournalEntry', color: '#6f5aa8' });
  ids.root = root.id;
  for (const collection of collections.filter((c) => config.collections[c.key]?.enabled)) {
    const type = config.collections[collection.key]?.representation === 'actor' ? 'Actor' : 'JournalEntry';
    let folder = ids[collection.key] && game.folders.get(ids[collection.key]);
    if (!folder || folder.type !== type) folder = await Folder.create({ name: collection.label, type, folder: root.id });
    ids[collection.key] = folder.id;
  }
  return ids;
}
export function linkedDocuments(collection: string): any[] { return [...game.journal.contents, ...game.actors.contents].filter((doc: any) => doc.getFlag(MODULE_ID, 'sync')?.collection === collection); }
export function findLinked(collection: string, esianaId: string): any | null { return linkedDocuments(collection).find((doc) => doc.getFlag(MODULE_ID, 'sync')?.esianaId === esianaId) ?? null; }
export function foundryRevision(document: any): string { return String(document._stats?.modifiedTime ?? document._source?._stats?.modifiedTime ?? 0); }
export async function createLinked(resource: SyncResource, config: ModuleConfig): Promise<any> {
  const choice = config.collections[resource.collection]; const adapter = adapterFor(choice); const selected = Object.fromEntries(choice.fields.map((k) => [k, resource.fields[k]]));
  const flags: SyncFlags = { schemaVersion: 1, collection: resource.collection, esianaId: resource.id, documentId: '', selectedFields: choice.fields, esianaRevision: resource.revision, foundryRevision: '0', baseHash: hashFields(selected), baseFields: selected, source: 'esiana', lastMutationId: crypto.randomUUID() };
  const cls = adapter.kind === 'Actor' ? Actor : JournalEntry; const doc = await cls.create(adapter.createData(resource, choice, config.folderIds[resource.collection], flags), { esianaSyncMutationId: flags.lastMutationId }); flags.documentId = doc.id; flags.foundryRevision = foundryRevision(doc); await doc.setFlag(MODULE_ID, 'sync', flags); return doc;
}
