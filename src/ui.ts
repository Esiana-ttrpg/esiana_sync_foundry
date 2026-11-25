import { EsianaClient } from './api.js';
import { getConfig, getToken, MODULE_ID, setConfig } from './settings.js';
import type { SyncEngine } from './syncEngine.js';

export function dialog(config: any): Promise<any> {
  const DialogV2 = foundry.applications.api.DialogV2;
  return DialogV2.wait({
    ...config,
    buttons: config.buttons.map((button: any) => ({
      ...button,
      callback: button.callback
        ? (event: Event, element: HTMLButtonElement, instance: any) => button.callback(event, element.form ?? instance.element)
        : undefined,
    })),
  });
}
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Kept for the public module API and status dialog. The native Campaign setting
// is the normal configuration path; no Esiana plugin is required for wiki access.
export async function openSetup(_engine: SyncEngine): Promise<void> {
  if (!game.user?.isGM) return;
  const current = getConfig();
  const token = getToken();
  if (!token) throw new Error('Enter and save a personal access token in Esiana settings first.');
  const discovery = new EsianaClient(current.instanceUrl, token);
  const { campaigns } = await discovery.listCampaigns();
  if (!Array.isArray(campaigns) || !campaigns.length) throw new Error('No accessible Esiana campaigns were found.');
  const campaignHtml = campaigns.map((campaign) => `<option value="${escapeHtml(campaign.handle)}" ${campaign.handle === current.campaignHandle ? 'selected' : ''}>${escapeHtml(campaign.name)}</option>`).join('');
  const selected = await dialog({
    window: { title: 'Choose campaign' },
    content: `<form class="esiana-sync-form"><label>Campaign<select name="campaign">${campaignHtml}</select></label></form>`,
    buttons: [
      { action: 'save', label: 'Use campaign', default: true, callback: (_event: Event, element: HTMLElement) => (element.querySelector('select') as HTMLSelectElement).value },
      { action: 'cancel', label: 'Cancel' },
    ],
  });
  if (!selected || selected === 'cancel') return;
  const campaign = campaigns.find((candidate) => candidate.handle === selected);
  if (!campaign) throw new Error('The selected campaign is no longer available.');
  const result = await new EsianaClient(current.instanceUrl, token, campaign.handle).wikiTree();
  if (!Array.isArray(result?.tree)) throw new Error('Esiana returned an invalid campaign wiki response.');
  const changed = current.campaignHandle !== campaign.handle;
  await setConfig({ ...current, campaignId: campaign.id, campaignHandle: campaign.handle, ...(changed ? { collections: {}, folderIds: {} } : {}) });
  ui.notifications.info(`Connected to ${campaign.name}. Use Import Esiana in the Journal sidebar.`);
}
export async function openStatus(engine: SyncEngine): Promise<void> {
  const config = getConfig(); const last = game.settings.get(MODULE_ID, 'lastSync'); const conflicts = game.settings.get(MODULE_ID, 'conflicts') ?? [];
  const conflictRows = conflicts.map((c: any, index: number) => `<label>${c.collection}: ${c.resourceId}<select name="conflict-${index}"><option value="esiana">Use Esiana</option><option value="foundry">Use Foundry</option><option value="duplicate">Duplicate Foundry copy, then use Esiana</option></select></label>`).join('');
  const action = await dialog({ window: { title: 'Esiana Sync' }, content: `<form class="esiana-sync-status"><p><strong>${config.campaignHandle || 'Not configured'}</strong></p><p>Last sync: ${last?.at ? new Date(last.at).toLocaleString() : 'never'} · ${last?.ok === false ? last.error : 'healthy'}</p><p>Conflicts: ${conflicts.length}</p>${conflictRows}</form>`, buttons: [{ action: 'sync', label: 'Sync now', default: true }, ...(conflicts.length ? [{ action: 'resolve', label: 'Resolve conflicts', callback: (_e: any, el: HTMLElement) => [...el.querySelectorAll('select[name^="conflict-"]')].map((node: any) => node.value) }] : []), { action: 'setup', label: 'Reconfigure' }, { action: 'close', label: 'Close' }] });
  if (action === 'sync') await engine.sync(); else if (action === 'setup') await openSetup(engine); else if (Array.isArray(action)) { for (let index = action.length - 1; index >= 0; index--) await engine.resolveConflict(index, action[index]); }
}
