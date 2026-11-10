import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { mergeRaidCollections } from '../lib/raid-merge.ts';
const compile = source => ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const source=(await readFile(new URL('../lib/raid-collectors.ts',import.meta.url),'utf8'))
 .replace('import { collectPublicRaidMaps } from "./raid-map-sources";','const collectPublicRaidMaps=async()=>{throw new Error("inject collector")};')
 .replace('import { collectNearbyRaids } from "./nearby-raid-source";','const collectNearbyRaids=async()=>{throw new Error("inject collector")};')
 .replace('import { mergeRaidCollections } from "./raid-merge";',`const mergeRaidCollections=${mergeRaidCollections.toString()}; const row=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};`)
 .replace('import { CITIES } from "./cities";','const CITIES=[{id:"seoul",name:"서울",lat:37.5665,lon:126.978},{id:"tokyo",name:"도쿄",lat:35.6762,lon:139.6503}];');
const {createWorldRaidCollector}=await import(`data:text/javascript;base64,${Buffer.from(compile(source)).toString('base64')}`);
const now=new Date('2026-11-10T04:00:00Z');
const data=id=>({sources:[{id,cityId:id,name:id,url:'https://example.com/',status:'ready',fetchedAt:now.toISOString(),checkedAt:now.toISOString(),count:1,message:''}],feed:{sourceName:'published',fetchedAt:now.toISOString(),raids:[{id,observedAt:now.toISOString()}]}});
test('a rejected regional collector cannot erase healthy nearby cities',async()=>{
 const collect=createWorldRaidCollector({regionalCollector:async()=>{throw new Error('failed')},nearbyCollector:async()=>data('seoul'),now:()=>now});
 const value=await collect();
 assert.equal(value.feed.raids.length,1);assert.equal(value.feed.raids[0].id,'seoul');
 assert.equal(value.sources.filter(s=>s.status==='error').length,5);
});
test('an abandoned shared promise is bounded independently for each caller and preserves the other collector',async()=>{
 const hanging=new Promise(()=>{});
 const collect=createWorldRaidCollector({regionalCollector:async()=>data('sydney'),nearbyCollector:()=>hanging,now:()=>now,deadlineMs:20});
 const started=performance.now();
 const results=await Promise.all([collect(),collect()]);
 assert.ok(performance.now()-started<500);
 for(const value of results){assert.equal(value.feed.raids[0].id,'sydney');assert.equal(value.sources.filter(s=>s.status==='error').length,2);assert.equal(value.sources.find(s=>s.cityId==='seoul').message.includes('지연'),true);}
});
