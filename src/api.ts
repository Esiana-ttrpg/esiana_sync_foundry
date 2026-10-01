import type { CampaignSummary, CollectionDescriptor, SyncResource } from './types.js';

export class EsianaApiError extends Error {
  status: number;
  payload?: any;
  constructor(status: number, message: string, payload?: any) { super(message); this.status = status; this.payload = payload; }
}
export class EsianaClient {
  private baseUrl: string;
  private token: string;
  private campaignHandle: string;
  constructor(baseUrl: string, token: string, campaignHandle = '') { this.baseUrl = baseUrl; this.token = token; this.campaignHandle = campaignHandle; }
  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, { ...init, headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new EsianaApiError(response.status, payload?.error ?? `Esiana request failed (${response.status})`, payload);
    return payload as T;
  }
  listCampaigns(): Promise<{ campaigns: CampaignSummary[] }> { return this.request('/api/campaigns'); }
  private syncPath(path: string): string { return `/api/plugin-runtime/foundry-vtt-sync/content-sync${path}?campaignHandle=${encodeURIComponent(this.campaignHandle)}`; }
  collections(): Promise<{ collections: CollectionDescriptor[] }> { return this.request(this.syncPath('/collections')); }
  async resources(collection: string): Promise<SyncResource[]> {
    const all: SyncResource[] = []; let cursor: string | null = null;
    do {
      const separator: string = cursor ? '&' : '';
      const result: { resources: SyncResource[]; nextCursor: string | null } = await this.request(`${this.syncPath(`/collections/${encodeURIComponent(collection)}/resources`)}${separator}${cursor ? `cursor=${encodeURIComponent(cursor)}` : ''}`);
      all.push(...result.resources); cursor = result.nextCursor;
    } while (cursor);
    return all;
  }
  resource(collection: string, id: string): Promise<{ resource: SyncResource }> { return this.request(this.syncPath(`/collections/${encodeURIComponent(collection)}/resources/${encodeURIComponent(id)}`)); }
  create(collection: string, fields: Record<string, unknown>, clientMutationId: string): Promise<{ resource: SyncResource }> { return this.request(this.syncPath(`/collections/${encodeURIComponent(collection)}/resources`), { method: 'POST', body: JSON.stringify({ fields, clientMutationId }) }); }
  update(resource: SyncResource, fields: Record<string, unknown>, clientMutationId: string): Promise<{ resource: SyncResource }> { return this.request(this.syncPath(`/collections/${encodeURIComponent(resource.collection)}/resources/${encodeURIComponent(resource.id)}`), { method: 'PATCH', body: JSON.stringify({ baseRevision: resource.revision, fields, clientMutationId }) }); }
}
