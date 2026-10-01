export type Representation = 'journal' | 'actor';
export interface FieldDescriptor { key: string; label: string; type: string; writable: boolean; defaultSelected?: boolean; options?: string[] }
export interface CollectionDescriptor { key: string; label: string; resourceKind: string; available: boolean; preferredRepresentation: 'journal' | 'actor-optional'; fields: FieldDescriptor[]; operations: { create: boolean; update: boolean; delete: false }; warning?: string }
export interface SyncResource { collection: string; id: string; displayName: string; fields: Record<string, unknown>; visibility: string; revision: string; modifiedAt: string; deleted: boolean }
export interface CampaignSummary { id: string; handle: string; name: string; role: string }
export interface CollectionChoice { enabled: boolean; fields: string[]; representation: Representation; actorType?: string }
export interface ModuleConfig { instanceUrl: string; campaignId: string; campaignHandle: string; collections: Record<string, CollectionChoice>; folderIds: Record<string, string>; intervalMinutes: number }
export interface SyncFlags { schemaVersion: 1; collection: string; esianaId: string; documentId: string; pageId?: string; selectedFields: string[]; esianaRevision: string; foundryRevision: string; baseHash: string; baseFields: Record<string, unknown>; source: 'esiana' | 'foundry'; lastMutationId: string; orphaned?: boolean }
export interface Conflict { collection: string; resourceId: string; documentId: string; base: Record<string, unknown>; esiana: Record<string, unknown>; foundry: Record<string, unknown> }
