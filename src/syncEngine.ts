import { syncWikiJournals } from './wikiSync.js';
import { EsianaClient, EsianaApiError } from './api.js';
import { adapterFor } from './adapters.js';
import { markdownToHtml, selectFields } from './conversion.js';
import { classify, hashFields, stableStringify } from './reconcile.js';
import { createLinked, ensureFolders, findLinked, foundryRevision, linkedDocuments } from './foundryStore.js';
import { getConfig, getToken, MODULE_ID, setConfig } from './settings.js';
import type { Conflict, SyncFlags, SyncResource } from './types.js';
const remoteWrites = new Set<string>();

export class SyncEngine {
  private timer?: number;
  private pending?: number;
  async sync(): Promise<void> {
    if (!game.user?.isGM) return;
    const config = getConfig(); const token = getToken();
    if (!config.campaignHandle || !token) throw new Error('Esiana connection is not configured');
    const wikiCount = await syncWikiJournals();
    if (!Object.values(config.collections).some((choice) => choice.enabled)) { await game.settings.set(MODULE_ID, 'lastSync', { at: new Date().toISOString(), ok: true, counts: { wiki: wikiCount } }); return; }
    if ([...game.journal.contents, ...game.actors.contents].some((doc: any) => doc.getFlag?.(MODULE_ID, 'sync'))) throw new Error('Legacy collection links do not record their campaign and cannot be synchronized safely. Import the pages using the current browser.');
    const client = new EsianaClient(config.instanceUrl, token, config.campaignHandle);
    const { collections } = await client.collections(); config.folderIds = await ensureFolders(config, collections); await setConfig(config);
    const conflicts: Conflict[] = []; const counts: Record<string, number> = {};
    for (const descriptor of collections) {
      const choice = config.collections[descriptor.key]; if (!descriptor.available || !choice?.enabled) continue;
      const remote = await client.resources(descriptor.key); counts[descriptor.key] = remote.length;
      for (const resource of remote) {
        const doc = findLinked(resource.collection, resource.id);
        if (!doc) continue;
        const flags = doc.getFlag(MODULE_ID, 'sync') as SyncFlags; const adapter = adapterFor(choice);
        if (resource.deleted) { await doc.setFlag(MODULE_ID, 'sync', { ...flags, orphaned: true }); continue; }
        const esianaFields = selectFields(resource.fields, flags.selectedFields); const localFields = adapter.readFields(doc, flags.selectedFields); const state = classify(flags.baseFields, esianaFields, localFields);
        if (state === 'conflict') { conflicts.push({ collection: resource.collection, resourceId: resource.id, documentId: doc.id, base: flags.baseFields, esiana: esianaFields, foundry: localFields }); continue; }
        if (state === 'foundry-only') {
          const mutationId = crypto.randomUUID(); const changed = Object.fromEntries(Object.entries(localFields).filter(([key, value]) => stableStringify(value) !== stableStringify(flags.baseFields[key]))); if ('body' in changed && descriptor.resourceKind === 'wiki-page') throw new Error(`Cannot safely send edits to ${resource.displayName}: the sync API would replace its structured wiki blocks. Edit this page in Esiana.`); const result = await client.update(resource, changed, mutationId); const next = this.flags(flags, result.resource, localFields, doc, 'foundry', mutationId); await doc.setFlag(MODULE_ID, 'sync', next); continue;
        }
        if (state === 'esiana-only') {
          const mutationId = crypto.randomUUID(); remoteWrites.add(doc.uuid); const next = this.flags(flags, resource, esianaFields, doc, 'esiana', mutationId);
          await doc.update(adapter.updateData(resource, next), { esianaSyncMutationId: mutationId });
          const page = doc.pages?.contents?.[0]; if (page && typeof resource.fields.body === 'string') await page.update({ 'text.content': markdownToHtml(resource.fields.body) }, { esianaSyncMutationId: mutationId });
          remoteWrites.delete(doc.uuid); continue;
        }
        if (flags.esianaRevision !== resource.revision) await doc.setFlag(MODULE_ID, 'sync', this.flags(flags, resource, esianaFields, doc, 'esiana', flags.lastMutationId));
      }
      for (const doc of linkedDocuments(descriptor.key)) {
        const flags = doc.getFlag(MODULE_ID, 'sync') as SyncFlags;
        if (!remote.some((item) => item.id === flags.esianaId)) await doc.setFlag(MODULE_ID, 'sync', { ...flags, orphaned: true });
      }
    }
    await game.settings.set(MODULE_ID, 'conflicts', conflicts);
    await game.settings.set(MODULE_ID, 'lastSync', { at: new Date().toISOString(), ok: true, counts });
    if (conflicts.length) ui.notifications.warn(`Esiana Sync found ${conflicts.length} conflict(s).`);
  }
  private flags(old: SyncFlags, resource: SyncResource, fields: Record<string, unknown>, doc: any, source: 'esiana' | 'foundry', mutationId: string): SyncFlags { return { ...old, esianaRevision: resource.revision, foundryRevision: foundryRevision(doc), baseFields: fields, baseHash: hashFields(fields), source, lastMutationId: mutationId, orphaned: false }; }
  async handleCreate(_doc: any, _options: any): Promise<void> { /* Publishing is explicit. */ }
  scheduleSoon(): void { if (this.pending) window.clearTimeout(this.pending); this.pending = window.setTimeout(() => void this.sync().catch((e) => this.report(e)), 750); }
  async resolveConflict(index: number, action: 'esiana' | 'foundry' | 'duplicate'): Promise<void> {
    const conflicts = [...(game.settings.get(MODULE_ID, 'conflicts') ?? [])] as Conflict[]; const conflict = conflicts[index]; if (!conflict) return;
    const config = getConfig(); const choice = config.collections[conflict.collection]; const doc = game.journal.get(conflict.documentId) ?? game.actors.get(conflict.documentId); if (!doc || !choice) return;
    const client = new EsianaClient(config.instanceUrl, getToken(), config.campaignHandle); const remote = (await client.resource(conflict.collection, conflict.resourceId)).resource; const adapter = adapterFor(choice);
    if (action === 'foundry') {
      const fields = adapter.readFields(doc, choice.fields); if ('body' in fields && !['journal', 'timeline-events'].includes(conflict.collection)) throw new Error('Cannot safely overwrite structured wiki content from Foundry. Resolve this conflict in Esiana.'); await client.update(remote, fields, crypto.randomUUID());
    } else {
      if (action === 'duplicate') { const copy = await doc.clone({ name: `${doc.name} (conflict copy)`, flags: { [MODULE_ID]: {} } }, { save: true }); await copy.unsetFlag?.(MODULE_ID, 'sync'); }
      const prior = doc.getFlag(MODULE_ID, 'sync') as SyncFlags; const fields = selectFields(remote.fields, choice.fields); const next = this.flags(prior, remote, fields, doc, 'esiana', crypto.randomUUID()); await doc.update(adapter.updateData(remote, next), { esianaSyncMutationId: next.lastMutationId });
    }
    conflicts.splice(index, 1); await game.settings.set(MODULE_ID, 'conflicts', conflicts); await this.sync();
  }
  isRemoteWrite(doc: any, options: any): boolean { return remoteWrites.has(doc.uuid) || Boolean(options?.esianaSyncMutationId); }
  schedule(): void { this.stop(); const minutes = Math.max(1, getConfig().intervalMinutes); this.timer = window.setInterval(() => void this.sync().catch((e) => this.report(e)), minutes * 60_000); }
  stop(): void { if (this.timer) window.clearInterval(this.timer); if (this.pending) window.clearTimeout(this.pending); }
  report(error: unknown): void { const message = error instanceof EsianaApiError ? error.message : error instanceof Error ? error.message : 'Unknown sync error'; void game.settings.set(MODULE_ID, 'lastSync', { at: new Date().toISOString(), ok: false, error: message }); ui.notifications.error(`Esiana Sync: ${message}`); }
}
