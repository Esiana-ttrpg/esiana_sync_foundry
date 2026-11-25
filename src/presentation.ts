import { markdownToHtml } from './conversion.js';
import type { EntityField, EntityPage, JournalPresentationPage, WikiPage } from './types.js';

const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const label = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
const empty = (value: unknown): boolean => value == null || value === '' || (Array.isArray(value) && value.length === 0) || (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0);
const OMIT = new Set(['systemCategoryKey', 'entityCategory', 'categoryKey', 'wikiRouteAliases', 'hidden', 'isDraft', 'draftOrigin', 'draftStatus', 'portraitUrl', 'gallery']);
function valueHtml(value: unknown, depth = 0): string {
  if (empty(value) || depth > 5) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' || typeof value === 'number') return escape(String(value));
  if (Array.isArray(value)) { const items = value.map((item) => valueHtml(item, depth + 1)).filter(Boolean); return items.length ? `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>` : ''; }
  const entries = Object.entries(value as Record<string, unknown>).filter(([key]) => !OMIT.has(key)).map(([key, item]) => { const content = valueHtml(item, depth + 1); return content ? `<dt>${escape(label(key))}</dt><dd>${content}</dd>` : ''; }).join('');
  return entries ? `<dl>${entries}</dl>` : '';
}
function fieldsHtml(fields: EntityField[]): string {
  const rows = [...fields].sort((a, b) => a.displayOrder - b.displayOrder).map((field) => { const content = valueHtml(field.value); return content ? `<dt>${escape(field.label)}</dt><dd>${content}</dd>` : ''; }).join('');
  return rows ? `<section><h2>Fields</h2><dl>${rows}</dl></section>` : '';
}
function blocksHtml(blocks: WikiPage['blocks']): string {
  return blocks.map((block) => {
    const content = block.content ?? {};
    if (['text-tiptap', 'text-biography', 'text'].includes(block.type) && typeof content.markdown === 'string') return markdownToHtml(content.markdown);
    if (block.type === 'image-display' && typeof content.imageUrl === 'string' && /^(?:https?:\/\/|\/)/i.test(content.imageUrl)) return `<figure><img src="${escape(content.imageUrl)}" alt="${escape(String(content.caption ?? ''))}"><figcaption>${escape(String(content.caption ?? ''))}</figcaption></figure>`;
    if (['wiki-infobox', 'stat-block'].includes(block.type) && Array.isArray(content.fields)) {
      const rows = content.fields.map((raw) => { if (!raw || typeof raw !== 'object') return ''; const field = raw as Record<string, unknown>; const name = field.label ?? field.key; const value = valueHtml(field.value); return name && value ? `<dt>${escape(String(name))}</dt><dd>${value}</dd>` : ''; }).join('');
      return rows ? `<dl>${rows}</dl>` : '';
    }
    // Core entity widgets derive their content from entity data, not their layout configuration.
    return '';
  }).join('');
}
function pick(metadata: Record<string, unknown>, keys: string[]): Record<string, unknown> { return Object.fromEntries(keys.filter((key) => !empty(metadata[key])).map((key) => [key, metadata[key]])); }
export function buildPresentation(page: WikiPage, entityPages: EntityPage[], fields: EntityField[], instanceUrl: string, extras: { relations?: Array<{ title: string; href?: string | null; detail?: string }>; claims?: string[] } = {}): JournalPresentationPage[] {
  const metadata = page.metadata ?? {};
  const appearance = metadata.appearance && typeof metadata.appearance === 'object' && !Array.isArray(metadata.appearance) ? metadata.appearance as Record<string, unknown> : {};
  const portrait = typeof appearance.portraitUrl === 'string' ? appearance.portraitUrl : '';
  let portraitHtml = '';
  try { const url = new URL(portrait, instanceUrl); if (portrait && ['http:', 'https:'].includes(url.protocol)) portraitHtml = `<figure><img src="${escape(url.href)}" alt="${escape(page.title)}"></figure>`; } catch { /* invalid portrait URL */ }
  const identity = pick(metadata, ['title', 'subtitle', 'tagline', 'profession', 'ancestry', 'pronouns', 'status', 'knownFor', 'activeArc', 'motivation', 'partyParticipation', 'summary', 'description']);
  if (identity.title === page.title) delete identity.title;
  const overviewFields = fields.filter((field) => !field.pageId || field.pageId === 'core:overview');
  const hero = valueHtml(identity);
  const overview = `${portraitHtml}${hero ? `<section>${hero}</section>` : ''}${blocksHtml(page.blocks ?? [])}${fieldsHtml(overviewFields)}`;
  const output: JournalPresentationPage[] = [];
  if (overview) output.push({ sourceId: 'core:overview', title: 'Overview', html: overview, blockIds: (page.blocks ?? []).map((block) => block.id).filter((id): id is string => Boolean(id)), fieldIds: overviewFields.map((field) => field.id) });
  const descriptors = [...entityPages].filter((entry) => !entry.hidden && entry.id !== 'core:overview' && entry.coreKey !== 'overview').sort((a, b) => a.displayOrder - b.displayOrder);
  for (const descriptor of descriptors) {
    const assigned = fields.filter((field) => field.pageId === descriptor.id);
    let metadataPart = '';
    if (descriptor.coreKey === 'appearance') metadataPart = valueHtml(appearance);
    if (descriptor.coreKey === 'relationships') {
      metadataPart = valueHtml(pick(metadata, ['relationships', 'locationRelations', 'primaryAffiliationId', 'currentLocationId', 'lineage']));
      const relations = extras.relations ?? [];
      if (relations.length) metadataPart += `<ul>${relations.map((relation) => { let href = ''; try { const parsed = new URL(relation.href ?? '', instanceUrl); if (relation.href && ['http:', 'https:'].includes(parsed.protocol)) href = parsed.href; } catch {} return `<li>${href ? `<a href="${escape(href)}">${escape(relation.title)}</a>` : escape(relation.title)}${relation.detail ? ` ? ${escape(relation.detail)}` : ''}</li>`; }).join('')}</ul>`;
    }
    if (descriptor.coreKey === 'timeline') metadataPart = valueHtml(pick(metadata, ['birthDate', 'deathDate', 'successionStart', 'successionEnd', 'eraTrajectories']));
    if (descriptor.coreKey === 'discovery') { metadataPart = valueHtml(pick(metadata, ['discovery', 'discoveryState'])); if (extras.claims?.length) metadataPart += `<ul>${extras.claims.map((claim) => `<li>${escape(claim)}</li>`).join('')}</ul>`; }
    const html = `${metadataPart}${blocksHtml(descriptor.blocks ?? [])}${fieldsHtml(assigned)}`;
    if (html) output.push({ sourceId: descriptor.id, title: descriptor.title, html, blockIds: (descriptor.blocks ?? []).map((block) => block.id).filter((id): id is string => Boolean(id)), fieldIds: assigned.map((field) => field.id) });
  }
  // A field assigned to a page omitted by the API is intentionally not moved to
  // a visible page: the assignment may be hidden by the selected audience.
  return output;
}
