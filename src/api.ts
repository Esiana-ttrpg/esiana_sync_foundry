import type { CampaignSummary, CollectionDescriptor, SyncResource, WikiNode, WikiPage } from './types.js';

export const DEFAULT_INSTANCE_URL = 'https://esiana.psl.coffee';

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
    const endpoint = `${(this.baseUrl.trim() || DEFAULT_INSTANCE_URL).replace(/\/$/, '')}${path}`;
    const safeEndpoint = endpoint.replaceAll(this.token, '[redacted]').replaceAll(encodeURIComponent(this.token), '[redacted]').replace(/(https?:\/\/)[^/@]+@/, '$1[redacted]@').replace(/\?.*$/, '?[redacted]');
    let response: Response;
    try {
      response = await fetch(endpoint, { ...init, headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    } catch (error) {
      console.error('Esiana request failed', { endpoint: safeEndpoint, status: 'network error', detail: 'Browser blocked the request or the instance is unreachable.' });
      throw new Error('Unable to reach the Esiana instance. Check the URL, network connection, and allowed origins (CORS).');
    }
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      // Do not print arbitrary server responses: they may contain credentials or user data.
      console.error('Esiana request failed', { endpoint: safeEndpoint, status: response.status, detail: 'Response omitted to protect sensitive data.' });
      const message = response.status === 401 ? 'Personal access token is invalid or expired.' : response.status === 403 ? 'Token is missing the required permissions, or this account lacks access.' : response.status === 404 ? (path.startsWith('/api/plugin-runtime/') ? 'The optional Esiana sync plugin endpoint is unavailable. Check that the plugin is installed and enabled.' : path === '/api/campaigns' ? 'Could not locate the Esiana API at this address.' : 'The requested Esiana campaign or page was not found, or is not accessible.') : response.status >= 500 ? 'Esiana returned an unexpected server error.' : `Esiana request failed (${response.status}).`;
      throw new EsianaApiError(response.status, message);
    }
    if (payload === null) throw new EsianaApiError(response.status, 'Could not locate a valid Esiana API response at this address.');
    return payload as T;
  }
  async asset(url: string): Promise<Blob> {
    const base = new URL(this.baseUrl.trim() || DEFAULT_INSTANCE_URL);
    const target = new URL(url, base);
    if (target.origin !== base.origin || !['http:', 'https:'].includes(target.protocol)) throw new Error('Image must be hosted by the configured Esiana instance.');
    let response: Response;
    try { response = await fetch(target.toString(), { headers: { Authorization: `Bearer ${this.token}` }, redirect: 'error' }); }
    catch { throw new Error('Unable to download an Esiana image. Check the connection and allowed origins.'); }
    if (!response.ok) throw new EsianaApiError(response.status, `Unable to download an Esiana image (HTTP ${response.status}).`);
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('Esiana returned a non-image response for an image.');
    return blob;
  }
  listCampaigns(): Promise<{ campaigns: CampaignSummary[] }> { return this.request('/api/campaigns'); }
  createWikiPage(title: string, blocks: Record<string, unknown>[]): Promise<{ page: WikiPage }> { return this.request(`/api/campaigns/${encodeURIComponent(this.campaignHandle)}/wiki`, { method: 'POST', body: JSON.stringify({ title, visibility: 'DM_Only', blocks }) }); }
  async updateWikiLayout(id: string, expectedUpdatedAt: string, blocks: unknown[]): Promise<{ updatedAt: string }> { try { return await this.request(`/api/campaigns/${encodeURIComponent(this.campaignHandle)}/wiki/${encodeURIComponent(id)}/layout/revisioned`, { method: 'PATCH', body: JSON.stringify({ expectedUpdatedAt, blocks }) }); } catch (error) { if (error instanceof EsianaApiError && error.status === 404) throw new Error('This Esiana instance does not expose the revision-protected wiki update API, or the page is unavailable.'); throw error; } }
  wikiTree(): Promise<{ tree: WikiNode[] }> { return this.request(`/api/campaigns/${encodeURIComponent(this.campaignHandle)}/wiki/tree`); }
  wikiTreeParty(): Promise<{ tree: WikiNode[]; campaign?: { isMember?: boolean } }> { return this.request(`/api/campaigns/${encodeURIComponent(this.campaignHandle)}/wiki/tree?previewAsPlayer=true`); }
  wikiPage(id: string, party = false): Promise<WikiPage> { return this.request(`/api/campaigns/${encodeURIComponent(this.campaignHandle)}/wiki/${encodeURIComponent(id)}${party ? '?previewAsPlayer=true' : ''}`); }
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
