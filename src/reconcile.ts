export type ReconcileState = 'unchanged' | 'foundry-only' | 'esiana-only' | 'conflict';
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function hashFields(value: Record<string, unknown>): string {
  let hash = 2166136261; for (const char of stableStringify(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
export function classify(base: Record<string, unknown>, esiana: Record<string, unknown>, foundry: Record<string, unknown>): ReconcileState {
  const b = hashFields(base), e = hashFields(esiana), f = hashFields(foundry);
  if (e === b && f === b) return 'unchanged';
  if (e === b) return 'foundry-only';
  if (f === b) return 'esiana-only';
  return e === f ? 'esiana-only' : 'conflict';
}
