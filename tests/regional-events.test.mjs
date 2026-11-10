import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64');
const {REGIONAL_EVENTS}=await import(moduleUrl(await readFile(new URL('../lib/regional-events-data.ts',import.meta.url),'utf8')));
const {regionalEventStatus,formatRegionalDates,validateRegionalEvents}=await import(moduleUrl(await readFile(new URL('../lib/regional-events.ts',import.meta.url),'utf8')));
const find=id=>REGIONAL_EVENTS.find(event=>event.id===id);
const NOW=new Date('2026-11-10T12:00:00Z');
test('regional entries have sourced public points, localized rewards and exact original costume art',()=>{
 assert.deepEqual(validateRegionalEvents(REGIONAL_EVENTS),[]);
 assert.equal(REGIONAL_EVENTS.length,14);
 for(const event of REGIONAL_EVENTS){
  assert.equal(event.location.coordinateKind,'reference');
  assert.ok(event.sources.some(source=>['pokemongo.com','ph.portal-pokemon.com'].includes(new URL(source).hostname)));
  assert.equal(event.schedule.hours,undefined,'do not invent daily hours from event dates');
  for(const reward of event.rewards){assert.ok(reward.spriteUrl);assert.ok(reward.background?.imageUrl||reward.background?.localPresetId);if(reward.costume)assert.ok(reward.spriteUrl.startsWith('/regional-assets/'),'no ordinary sprite for a costume');}
 }
 const apac=REGIONAL_EVENTS.filter(e=>e.group==='apac-stamps');
 assert.equal(new Set(apac.map(e=>e.rewards[0].spriteUrl)).size,4);
 assert.equal(new Set(apac.map(e=>e.rewards[0].background.imageUrl)).size,4);
 assert.equal(REGIONAL_EVENTS.filter(e=>e.group==='esa-museums').length,6);
 assert.ok(find('esa-nuremberg').location.latitude>49&&find('esa-nuremberg').location.latitude<50,'Nuremberg branch, not Munich');
 assert.ok(REGIONAL_EVENTS.every(e=>e.city!=='Bangkok'),'unannounced coordinates are not fabricated');
});
test('Night Out uses official dates rather than a forum post date, with original coordinate precision',()=>{
 assert.equal(regionalEventStatus(find('night-out-london-2026'),NOW),'ongoing');
 assert.equal(regionalEventStatus(find('night-out-la-2026'),NOW),'ended');
 assert.equal(`${find('night-out-london-2026').location.latitude},${find('night-out-london-2026').location.longitude}`,'51.50299,0.00307');
 assert.equal(`${find('night-out-la-2026').location.latitude},${find('night-out-la-2026').location.longitude}`,'33.94446,-118.34337');
 assert.notEqual(find('night-out-london-2026').rewards[0].background.imageUrl,find('night-out-la-2026').rewards[0].background.imageUrl);
});
test('periods respect venue calendars, inclusive end dates and permanent-release instant across date lines',()=>{
 const sg=find('pokexciting-singapore');
 assert.equal(regionalEventStatus(sg,new Date('2029-09-11T15:59:59Z')),'ongoing');
 assert.equal(regionalEventStatus(sg,new Date('2029-09-11T16:00:00Z')),'ended');
 for(const id of ['sendai-lapras-stamp','mexico-hawlucha-stamp']){
  const event=find(id);assert.equal(regionalEventStatus(event,new Date('2026-11-02T23:59:59Z')),'upcoming');
  assert.equal(regionalEventStatus(event,new Date('2026-11-03T00:00:00Z')),'ongoing');
  assert.equal(event.schedule.endDate,null);
 }
 assert.match(formatRegionalDates(find('sendai-lapras-stamp'),'en'),/no announced end/);
 assert.equal(find('mexico-hawlucha-stamp').schedule.startDate,'2026-11-02');
 assert.equal(regionalEventStatus(find('esa-toulouse'),new Date('2026-10-03T22:00:00Z')),'ongoing');
});
test('unpublished ESA background probability stays unknown and ordinary costumes are not invented',()=>{
 for(const event of REGIONAL_EVENTS.filter(e=>e.group==='esa-museums'))assert.equal(event.rewards[0].backgroundChance,'unknown');
 for(const event of REGIONAL_EVENTS.filter(e=>e.group==='night-out'))for(const reward of event.rewards){assert.equal(reward.costume,null);assert.equal(reward.backgroundChance,'guaranteed');}
});
test('bundled regional backgrounds and GO sprites preserve their original hashes and dimensions',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../lib/regional-assets.json',import.meta.url),'utf8'));
 assert.equal(manifest.length,21);
 for(const asset of manifest){const bytes=await readFile(new URL('../public/regional-assets/'+asset.file,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),asset.width);assert.equal(bytes.readUInt32BE(20),asset.height);}
});

test('all regional Pokémon previews use actual GO sprite assets including ordinary rewards',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../lib/regional-assets.json',import.meta.url),'utf8'));
 for(const reward of REGIONAL_EVENTS.flatMap(event=>event.rewards)){
  const asset=manifest.find(item=>'/regional-assets/'+item.file===reward.spriteUrl);
  assert.ok(asset,`${reward.speciesId}: bundled GO sprite provenance`);
  assert.match(asset.sourceUrl,/githubusercontent\.com\/PokeMiners\/pogo_assets\/[0-9a-f]{40}\/Images\/Pokemon%20-%20256x256\//);
  assert.equal(asset.width,256);assert.equal(asset.height,256);
 }
});
