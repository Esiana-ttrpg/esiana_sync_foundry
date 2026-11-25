import type { WikiNode } from './types.js';

// Esiana's seeded utility pages are navigation surfaces, not campaign entries.
// Some older campaigns have no metadata for these roots, so use their exact
// seeded titles only at the tree root. Session note documents remain eligible.
const SYSTEM_ROOTS = new Set(['world', 'game', 'player session notes', 'tags', 'relations', 'recent changes', 'settings', 'quick access', 'bookmarks']);
export function isSystemPage(node: WikiNode, depth: number, ancestors: WikiNode[] = []): boolean {
  const metadata = node.metadata ?? {};
  if (metadata.workshopDraftsRoot === true || (metadata.isDraft === true && metadata.draftOrigin === 'workshop')) return true;
  if (typeof metadata.systemCategoryKey === 'string' && metadata.systemCategoryKey.trim()) return true;
  const title = node.title.trim().toLowerCase();
  if (depth === 1 && ancestors[0]?.title.trim().toLowerCase() === 'game' && ['calendars', 'timelines', 'events'].includes(title)) return true;
  return depth === 0 && SYSTEM_ROOTS.has(title);
}
export interface WikiRow { node: WikiNode; ancestors: WikiNode[] }
export function importableRows(nodes: WikiNode[], ancestors: WikiNode[] = [], depth = 0): WikiRow[] {
  return nodes.flatMap((node) => [
    ...(isSystemPage(node, depth, ancestors) ? [] : [{ node, ancestors }]),
    ...importableRows(node.children ?? [], [...ancestors, node], depth + 1),
  ]);
}
