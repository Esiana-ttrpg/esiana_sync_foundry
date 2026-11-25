import type { WikiNode } from './types.js';

// Esiana's seeded utility pages are navigation surfaces, not campaign entries.
// Some older campaigns have no metadata for these roots, so use their exact
// seeded titles only at the tree root. Session note documents remain eligible.
const CATEGORY_CONTAINERS = new Set(['characters', 'bestiary', 'ancestries', 'organizations', 'locations', 'maps', 'objects', 'families', 'rules/resources', 'adventure', 'quests', 'narrative threads', 'threads', 'journals', 'calendars', 'timelines', 'events', 'downtime']);
const SYSTEM_ROOTS = new Set(['world', 'game', 'player session notes', 'tags', 'relations', 'recent changes', 'settings', 'quick access', 'bookmarks']);
export function isSystemPage(node: WikiNode, depth: number, ancestors: WikiNode[] = []): boolean {
  const metadata = node.metadata ?? {};
  if (metadata.workshopDraftsRoot === true || (metadata.isDraft === true && metadata.draftOrigin === 'workshop')) return true;
  if (typeof metadata.systemCategoryKey === 'string' && metadata.systemCategoryKey.trim()) return true;
  const title = node.title.trim().toLowerCase();
  if (depth === 1 && ['world', 'game'].includes(ancestors[0]?.title.trim().toLowerCase() ?? '') && CATEGORY_CONTAINERS.has(title)) return true;
  return depth === 0 && SYSTEM_ROOTS.has(title);
}
export interface WikiRow { node: WikiNode; ancestors: WikiNode[] }
export function importableRows(nodes: WikiNode[], ancestors: WikiNode[] = [], depth = 0): WikiRow[] {
  return nodes.flatMap((node) => [
    ...(isSystemPage(node, depth, ancestors) ? [] : [{ node, ancestors }]),
    ...importableRows(node.children ?? [], [...ancestors, node], depth + 1),
  ]);
}

export function groupForRow(row: WikiRow): { id: string; title: string } {
  const meaningful = row.ancestors.find((ancestor) => !['world', 'game'].includes(ancestor.title.trim().toLowerCase()));
  return meaningful ? { id: meaningful.id, title: meaningful.title } : { id: '__pages', title: 'Other pages' };
}
