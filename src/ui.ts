import { EsianaClient } from './api.js';
import { getConfig, getToken, MODULE_ID, setConfig, setToken } from './settings.js';
import type { CollectionChoice, Representation } from './types.js';
import type { SyncEngine } from './syncEngine.js';

function dialog(config: any): Promise<any> {
  const DialogV2 = foundry?.applications?.api?.DialogV2;
  if (DialogV2?.wait) {
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
  return new Promise((resolve) => new Dialog({ title: config.window?.title ?? config.title, content: config.content, buttons: Object.fromEntries(config.buttons.map((b: any) => [b.action, { label: b.label, callback: (html: any) => resolve(b.callback ? b.callback(null, html[0] ?? html) : b.action) }])), close: () => resolve(null) }).render(true));
}
export async function openSetup(engine: SyncEngine): Promise<void> {
  if (!game.user?.isGM) return;
  const current = getConfig();
  const connection = await dialog({ window: { title: 'Connect Esiana' }, content: `<form class="esiana-sync-form"><label>Esiana URL<input name="url" type="url" value="${current.instanceUrl}"></label><label>API token<input name="token" type="password" value="${getToken()}"></label></form>`, buttons: [{ action: 'connect', label: 'Connect', default: true, callback: (_e: any, el: HTMLElement) => { const form = el.querySelector('form') as HTMLFormElement; return { url: (form.elements.namedItem('url') as HTMLInputElement).value, token: (form.elements.namedItem('token') as HTMLInputElement).value }; } }, { action: 'cancel', label: 'Cancel' }] });
  if (!connection || connection === 'cancel') return;
  const discovery = new EsianaClient(connection.url, connection.token); const campaigns = (await discovery.listCampaigns()).campaigns.filter((c) => c.role === 'GAMEMASTER');
  if (!campaigns.length) throw new Error('The token does not administer any Esiana campaigns');
  const campaignHtml = campaigns.map((c) => `<option value="${c.id}" data-handle="${c.handle}">${c.name}</option>`).join('');
  const selected = await dialog({ window: { title: 'Choose campaign' }, content: `<form class="esiana-sync-form"><label>Campaign<select name="campaign">${campaignHtml}</select></label></form>`, buttons: [{ action: 'next', label: 'Next', default: true, callback: (_e: any, el: HTMLElement) => { const option = (el.querySelector('select') as HTMLSelectElement).selectedOptions[0]; return { id: option.value, handle: option.dataset.handle }; } }, { action: 'cancel', label: 'Cancel' }] });
  if (!selected || selected === 'cancel') return;
  const client = new EsianaClient(connection.url, connection.token, selected.handle); const collections = (await client.collections()).collections;
  const rows = collections.map((c) => `<fieldset ${c.available ? '' : 'disabled'}><label><input type="checkbox" name="collection" value="${c.key}" ${c.available ? 'checked' : ''}>${c.label}</label>${c.available ? `<div>${c.fields.map((f) => `<label><input type="checkbox" name="${c.key}:field" value="${f.key}" ${f.defaultSelected ? 'checked' : ''}>${f.label}${f.writable ? '' : ' (read-only)'}</label>`).join('')}</div>${c.key === 'characters' ? `<label>Representation<select name="characters:representation"><option value="journal">Journal</option><option value="actor">Actor</option></select></label><label>Actor type<select name="characters:actorType">${Object.keys(CONFIG.Actor.typeLabels ?? {}).map((type) => `<option value="${type}">${type}</option>`).join('')}</select></label>` : ''}` : `<p>${c.warning ?? 'Deferred'}</p>`}</fieldset>`).join('');
  const choices = await dialog({ window: { title: 'Choose collections and fields' }, content: `<form class="esiana-sync-form esiana-sync-collections">${rows}</form>`, buttons: [{ action: 'save', label: 'Save and sync', default: true, callback: (_e: any, el: HTMLElement) => { const form = el.querySelector('form')!; const result: Record<string, CollectionChoice> = {}; for (const c of collections.filter((x) => x.available)) { const enabled = Boolean(form.querySelector(`input[name="collection"][value="${c.key}"]:checked`)); const fields = [...form.querySelectorAll(`input[name="${c.key}:field"]:checked`)].map((x: any) => x.value); const representation = ((form.querySelector(`[name="${c.key}:representation"]`) as HTMLSelectElement)?.value ?? 'journal') as Representation; const actorType = (form.querySelector(`[name="${c.key}:actorType"]`) as HTMLSelectElement)?.value; result[c.key] = { enabled, fields, representation, actorType }; } return result; } }, { action: 'cancel', label: 'Cancel' }] });
  if (!choices || choices === 'cancel') return;
  await setToken(connection.token); await setConfig({ ...current, instanceUrl: connection.url.replace(/\/$/, ''), campaignId: selected.id, campaignHandle: selected.handle, collections: choices }); await engine.sync(); engine.schedule(); ui.notifications.info('Esiana Sync connected.');
}
export async function openStatus(engine: SyncEngine): Promise<void> {
  const config = getConfig(); const last = game.settings.get(MODULE_ID, 'lastSync'); const conflicts = game.settings.get(MODULE_ID, 'conflicts') ?? [];
  const conflictRows = conflicts.map((c: any, index: number) => `<label>${c.collection}: ${c.resourceId}<select name="conflict-${index}"><option value="esiana">Use Esiana</option><option value="foundry">Use Foundry</option><option value="duplicate">Duplicate Foundry copy, then use Esiana</option></select></label>`).join('');
  const action = await dialog({ window: { title: 'Esiana Sync' }, content: `<form class="esiana-sync-status"><p><strong>${config.campaignHandle || 'Not configured'}</strong></p><p>Last sync: ${last?.at ? new Date(last.at).toLocaleString() : 'never'} · ${last?.ok === false ? last.error : 'healthy'}</p><p>Conflicts: ${conflicts.length}</p>${conflictRows}</form>`, buttons: [{ action: 'sync', label: 'Sync now', default: true }, ...(conflicts.length ? [{ action: 'resolve', label: 'Resolve conflicts', callback: (_e: any, el: HTMLElement) => [...el.querySelectorAll('select[name^="conflict-"]')].map((node: any) => node.value) }] : []), { action: 'setup', label: 'Reconfigure' }, { action: 'close', label: 'Close' }] });
  if (action === 'sync') await engine.sync(); else if (action === 'setup') await openSetup(engine); else if (Array.isArray(action)) { for (let index = action.length - 1; index >= 0; index--) await engine.resolveConflict(index, action[index]); }
}
