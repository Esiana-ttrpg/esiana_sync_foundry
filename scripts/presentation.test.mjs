import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPresentation } from '../dist/scripts/presentation.js';
import { prepareWikiImport, createWikiJournal } from '../dist/scripts/wikiSync.js';
const page = { id:'angel', title:'Angel', visibility:'Party', templateType:'DEFAULT', children:[], updatedAt:'2026-01-01T00:00:00.000Z', metadata:{ entityCategory:'characters', title:'Warden', appearance:{portraitUrl:'/uploads/angel.png', pronouns:'she/her'} }, blocks:[{id:'bio',type:'text-tiptap',content:{markdown:'**Brave** explorer.'}},{id:'hero',type:'entity-hero',content:{}},{id:'infobox',type:'wiki-infobox',content:{fields:[]}}] };
const pages = [{id:'core:overview',key:'overview',title:'Overview',origin:'CORE',renderMode:'CORE',displayOrder:0,hidden:false,coreKey:'overview'}, {id:'page-1',key:'custom:page-1',title:'Traits',origin:'CUSTOM',renderMode:'CANVAS',displayOrder:10,hidden:false,blocks:[{id:'custom-block',type:'text-tiptap',content:{markdown:'Special notes.'}}]}, {id:'page-hidden',key:'custom:page-hidden',title:'Hidden',origin:'CUSTOM',renderMode:'CANVAS',displayOrder:20,hidden:true}];
const field = (id,label,value,pageId,displayOrder,origin='CUSTOM') => ({id,key:id,label,value,pageId,displayOrder,origin,type:'JSON'});
const fields = [field('n','Score',0,'page-1',2),field('b','Active',false,'page-1',1,'API'),field('a','Tags',['A','B'],'page-1',3,'API'),field('h','Secret','hidden','page-hidden',0),field('o','Rank','Captain',null,0)];
test('entity pages include hero, prose and assigned custom fields without layout artifacts', () => {
  const result = buildPresentation(page,pages,fields,'https://esiana.test');
  assert.deepEqual(result.map(p=>p.title),['Overview','Traits']);
  assert.match(result[0].html,/https:\/\/esiana.test\/uploads\/angel.png/);
  assert.match(result[0].html,/<strong>Brave<\/strong>/);
  assert.match(result[0].html,/Captain/);
  assert.doesNotMatch(result[0].html,/entity-hero|wiki-infobox|\{\}/);
  assert.match(result[1].html,/Special notes/);
  assert.ok(result[1].html.indexOf('Active') < result[1].html.indexOf('Score'));
  assert.match(result[1].html,/<dd>No<\/dd>/);
  assert.match(result[1].html,/<dd>0<\/dd>/);
  assert.match(result[1].html,/<li>A<\/li><li>B<\/li>/);
  assert.doesNotMatch(JSON.stringify(result),/Secret/);
  assert.deepEqual(result[1].blockIds,['custom-block']);
  assert.deepEqual(result[1].fieldIds,['n','b','a']);
});
test('party differences in custom fields prevent automatic player access', async () => {
  const settings = {config:{},instanceUrl:'https://esiana.test',campaignHandle:'c',apiToken:'token',permissions:'initial',importContent:'all'};
  globalThis.game = { user:{isGM:true}, settings:{get:(_n,k)=>settings[k]} };
  const client = { wikiPage: async()=>page, entityPages:async()=>({pages}), entityFields:async(_id,party)=>({fields:party ? fields.filter(f=>f.id!=='o') : fields}) };
  const prepared = await prepareWikiImport(client,'angel','all',true);
  assert.equal(prepared.partyVisible,false);
  let created; globalThis.JournalEntry = {create:async(data)=>{created=data;return data;}};
  await createWikiJournal(prepared,null,{id:'angel',instance:'https://esiana.test',campaign:'c',linked:true});
  assert.equal(created.ownership.default,0);
  assert.equal(created.pages.length,2);
  assert.equal(created.pages[1].flags['esiana-sync'].presentation.sourceId,'page-1');
});

test('entity presentation edits are not sent as wiki prose', async () => {
  const { syncWikiJournals } = await import('../dist/scripts/wikiSync.js');
  const { hashFields } = await import('../dist/scripts/reconcile.js');
  const settings = {config:{},instanceUrl:'https://esiana.test',campaignHandle:'c',apiToken:'token',permissions:'never',importContent:'all',syncDirection:'both'};
  const source = {id:'angel',instance:'https://esiana.test',campaign:'c',linked:true,presentationVersion:1};
  const sourcePage = {name:'Overview',text:{content:'<p>Changed locally</p>'},getFlag:()=>({sourceId:'core:overview',hash:hashFields({content:'<p>Original</p>'}),title:'Overview'})};
  const updates=[]; const doc={name:'Angel',ownership:{default:0},pages:{contents:[sourcePage]},getFlag:()=>source,update:async(data)=>updates.push(data)};
  globalThis.game={user:{isGM:true},users:{contents:[]},journal:{contents:[doc]},settings:{get:(_n,k)=>settings[k]}};
  const oldFetch=globalThis.fetch; const methods=[];
  globalThis.fetch=async(url,init)=>{ methods.push(init?.method ?? 'GET'); const path=String(url); return {ok:true,status:200,json:async()=>path.includes('/tree')?{tree:[],campaign:{isMember:true}}:path.includes('/entity-pages')?{pages}:path.includes('/entity-fields')?{fields}:page}; };
  try { await assert.rejects(syncWikiJournals(),/cannot be written back as wiki prose/); }
  finally { globalThis.fetch=oldFetch; }
  assert.ok(methods.every((method)=>method==='GET'));
  assert.equal(updates[0].ownership.default,0);
});

test('relationship, timeline and discovery pages show human-readable projections', () => {
  const more = [...pages, {id:'core:relationships',key:'relationships',title:'Relationships',origin:'CORE',renderMode:'CORE',displayOrder:30,hidden:false,coreKey:'relationships'}, {id:'core:timeline',key:'timeline',title:'Timeline',origin:'CORE',renderMode:'CORE',displayOrder:40,hidden:false,coreKey:'timeline'}, {id:'core:discovery',key:'discovery',title:'Discovery',origin:'CORE',renderMode:'CORE',displayOrder:50,hidden:false,coreKey:'discovery'}];
  const result = buildPresentation({...page,metadata:{...page.metadata,birthDate:{year:42,month:2,day:3}}},more,fields,'https://esiana.test',{relations:[{title:'Mara',detail:'ally',href:'/c/c/wiki/mara'}],claims:['A secret was revealed.']});
  assert.match(result.find(p=>p.title==='Relationships').html,/Mara.*ally/);
  assert.match(result.find(p=>p.title==='Timeline').html,/Birth Date/);
  assert.match(result.find(p=>p.title==='Discovery').html,/A secret was revealed/);
});

test('entity refresh updates managed pages without flattening or altering unrelated pages', async () => {
  const { syncWikiJournals } = await import('../dist/scripts/wikiSync.js');
  const { hashFields } = await import('../dist/scripts/reconcile.js');
  const settings = {config:{},instanceUrl:'https://esiana.test',campaignHandle:'c',apiToken:'token',permissions:'never',importContent:'all',syncDirection:'fromEsiana'};
  const source = {id:'angel',instance:'https://esiana.test',campaign:'c',linked:true,presentationVersion:1};
  const oldHtml='<p>Old overview</p>'; const pageUpdates=[]; const creations=[];
  const managed={name:'Overview',text:{content:oldHtml},getFlag:()=>({sourceId:'core:overview',hash:hashFields({content:oldHtml}),title:'Overview'}),update:async(data)=>pageUpdates.push(data),delete:async()=>{throw new Error('overview should remain');}};
  const local={name:'Personal notes',text:{content:'<p>Mine</p>'},getFlag:()=>undefined,delete:async()=>{throw new Error('unmanaged page must not be removed');}};
  const doc={name:'Angel',ownership:{default:0},pages:{contents:[managed,local]},getFlag:()=>source,update:async()=>{},createEmbeddedDocuments:async(_type,data)=>creations.push(...data)};
  globalThis.game={user:{isGM:true},users:{contents:[]},journal:{contents:[doc]},settings:{get:(_n,k)=>settings[k]}};
  const oldFetch=globalThis.fetch;
  globalThis.fetch=async(url)=>{const path=String(url);return {ok:true,status:200,json:async()=>path.includes('/tree')?{tree:[],campaign:{isMember:true}}:path.includes('/entity-pages')?{pages}:path.includes('/entity-fields')?{fields}:page};};
  try { assert.equal(await syncWikiJournals(),1); } finally { globalThis.fetch=oldFetch; }
  assert.equal(pageUpdates.length,1); assert.match(pageUpdates[0]['text.content'],/Brave/);
  assert.equal(creations.length,1); assert.equal(creations[0].name,'Traits');
});
