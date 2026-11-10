import test from 'node:test';
import assert from 'node:assert/strict';
import { CELL_ROUTE_MAX_BYTES, CELL_ROUTE_MAX_POINTS, parseCellCoordinateLines, validateCellPoints, validateCellGpxEnvelope, parseCellGpx, cellSourceUrl, cellDistanceKm, cellPathKm, cellLocalDay, restoreCellState, planCellRoutes, cellPlanGpx, cellPlanCoordinates, cellGpxDecimal } from '../lib/cell-routes.ts';
const p=(lat,lon=0)=>({lat,lon});
const route=(id,points,extra={})=>({id,name:id,cityId:'seoul',points,reversible:false,createdAt:'2026-11-10T00:00:00Z',...extra});
const mockXml=(tracks=[],routes=[],parserError=false)=>({documentElement:{localName:'gpx'},getElementsByTagNameNS(_namespace,name){if(name==='parsererror')return parserError?[{}]:[];const groups=name==='trkseg'?tracks:name==='rte'?routes:[];return groups.map(points=>({getElementsByTagNameNS(){return points.map(point=>({getAttribute:name=>point[name]===undefined?null:String(point[name])}))}}));}});

test('coordinate input preserves precision and order, removing only consecutive duplicates',()=>{
 const points=parseCellCoordinateLines('37.1234567890123,127.1234567890123\n37.1234567890123,127.1234567890123\n38,128\n37.1234567890123,127.1234567890123');
 assert.deepEqual(points,[p(37.1234567890123,127.1234567890123),p(38,128),p(37.1234567890123,127.1234567890123)]);
});
test('coordinate input rejects invalid numeric syntax, bounds, oversized input and one-point geometry',()=>{
 for(const input of ['NaN,1\n1,2','91,0\n1,2','1,181\n1,2','1e-7,1\n2,3','only a name','1,2\n1,2'])assert.throws(()=>parseCellCoordinateLines(input));
 assert.throws(()=>parseCellCoordinateLines('0,0\n'.repeat(CELL_ROUTE_MAX_POINTS+1)));
 assert.throws(()=>parseCellCoordinateLines('a'.repeat(CELL_ROUTE_MAX_BYTES+1)));
 assert.throws(()=>validateCellPoints([p(0),p(Infinity)]));
});
test('GPX envelope blocks entities and DTD before invoking any XML parser',()=>{
 let called=false;
 for(const xml of ['<!DOCTYPE gpx SYSTEM "https://example.com/x"><gpx/>','<!ENTITY x "x"><gpx/>'])assert.throws(()=>parseCellGpx(xml,()=>{called=true;return mockXml()}));
 assert.equal(called,false);assert.throws(()=>validateCellGpxEnvelope('한'.repeat(400000)));
});
test('GPX accepts one track, prefers tracks over duplicate rte data and caps chosen representation only',()=>{
 const points=[p(1,2),p(3,4)];
 assert.deepEqual(parseCellGpx('<gpx/>',()=>mockXml([points],[Array.from({length:2200},()=>p(9,9))])),points);
 assert.deepEqual(parseCellGpx('<gpx/>',()=>mockXml([],[points])),points);
});
test('GPX rejects malformed XML, disconnected track segments and missing point attributes',()=>{
 assert.throws(()=>parseCellGpx('<gpx/>',()=>mockXml([],[],true)));
 assert.throws(()=>parseCellGpx('<gpx/>',()=>mockXml([[p(0),p(1)],[p(2),p(3)]])));
 assert.throws(()=>parseCellGpx('<gpx/>',()=>mockXml([[{lat:0},p(1)]])));
 assert.throws(()=>parseCellGpx('<gpx/>',()=>mockXml([[p(0),p(91)]])));
 assert.throws(()=>parseCellGpx('<gpx/>',()=>mockXml([[...Array.from({length:2001},(_,i)=>p(i/100))]])));
});
test('source links are optional HTTPS without embedded credentials',()=>{
 assert.equal(cellSourceUrl(''),undefined);assert.equal(cellSourceUrl('https://example.com/route'),'https://example.com/route');
 for(const url of ['javascript:alert(1)','http://example.com','https://user:pass@example.com'])assert.throws(()=>cellSourceUrl(url));
});
test('great-circle distance handles zero, dateline and route distance sums',()=>{
 assert.equal(cellDistanceKm(p(0),p(0)),0);assert.ok(cellDistanceKm(p(0,179.9),p(0,-179.9))<23);
 assert.ok(Math.abs(cellPathKm([p(0),p(1),p(2)])-222.39)<.1);
});
test('city-local completed day differs from browser zone and crosses date boundaries',()=>{
 const now=new Date('2026-11-10T02:00:00Z');assert.equal(cellLocalDay(now,'Asia/Seoul'),'2026-11-10');assert.equal(cellLocalDay(now,'America/New_York'),'2026-11-09');
});
test('stored state rejects malformed routes/records and deduplicates IDs without mutating input',()=>{
 const entry=route('valid',[p(1),p(2)]),bad=route('bad',[p(100),p(1)]);
 const value={version:1,routes:[entry,entry,bad,{...entry,id:'unknown-city',cityId:'bad'}],completions:[{routeId:'valid',cityId:'seoul',day:'2026-11-10',cells:4,completedAt:entry.createdAt},{routeId:'valid',cityId:'seoul',day:'2026-02-30',cells:1,completedAt:entry.createdAt}]};
 const before=JSON.stringify(value),saved=restoreCellState(value,['seoul']);assert.equal(saved.routes.length,1);assert.equal(saved.completions.length,1);assert.equal(saved.completions[0].cells,4,'manual count is not a hard-coded daily game cap');assert.equal(JSON.stringify(value),before);
 assert.deepEqual(restoreCellState(null,['seoul']),{version:1,routes:[],completions:[]});assert.equal(restoreCellState({version:1,routes:Array(21).fill(entry)},['seoul']).routes.length,0);
});
test('planning preserves one-way geometry, filters city/completed IDs and deduplicates routes',()=>{
 const a=route('a',[p(0),p(.01)]),b=route('b',[p(.01),p(.02)]),other=route('c',[p(.02),p(.03)],{cityId:'tokyo'});
 const before=JSON.stringify([a,b]);const plan=planCellRoutes([a,a,b,other],'seoul',3);
 assert.equal(plan.steps.length,2);assert.deepEqual(plan.steps.map(s=>s.route.id),['a','b']);assert.deepEqual(plan.steps[0].points,a.points);assert.equal(plan.steps.every(s=>!s.reversed),true);assert.equal(JSON.stringify([a,b]),before);
 assert.deepEqual(planCellRoutes([a,b],'seoul',3,new Set(['a'])).steps.map(s=>s.route.id),['b']);assert.throws(()=>planCellRoutes([a],'seoul',4));
});
test('reverse traversal occurs only after explicit permission and keeps exact point sequence',()=>{
 const a=route('a',[p(0),p(.01)]),b=route('b',[p(.02),p(.01)],{reversible:true});
 const plan=planCellRoutes([a,b],'seoul',3);assert.deepEqual(plan.steps.map(s=>s.route.id),['a','b']);assert.equal(plan.steps[1].reversed,true);assert.deepEqual(plan.steps[1].points,[...b.points].reverse());assert.equal(plan.transferKm,0);
 const oneWay=planCellRoutes([a,{...b,reversible:false}],'seoul',3);assert.equal(oneWay.steps.every(s=>!s.reversed),true);
});
test('bounded order heuristic favors short total paths, not only zero transfer on a huge loop',()=>{
 const short=[route('a',[p(0),p(.001)]),route('b',[p(.001),p(.002)]),route('c',[p(.002),p(.003)])];
 const huge=route('huge',[p(.003),p(20),p(.003)]);const plan=planCellRoutes([...short,huge],'seoul',3);assert.equal(plan.steps.some(s=>s.route.id==='huge'),false);assert.ok(plan.totalKm<1);
});
test('GPX export separates source paths, escapes XML/control chars and has no invented transfer points',()=>{
 const a=route('a',[p(1),p(2)],{name:'A & <B>\u0001'}),b=route('b',[p(5),p(6)]);const plan=planCellRoutes([a,b],'seoul',3);
 const xml=cellPlanGpx(plan);assert.equal((xml.match(/<trk>/g)||[]).length,2);assert.equal((xml.match(/<trkpt /g)||[]).length,4);assert.ok(xml.includes('A &amp; &lt;B&gt;'));assert.equal(xml.includes('\u0001'),false);assert.equal(xml.includes('<time>'),false);
 const rte=cellPlanGpx(plan,'rte');assert.equal((rte.match(/<rte>/g)||[]).length,2);assert.equal(rte.includes('<trk>'),false);
 assert.equal(cellPlanGpx(planCellRoutes([],'seoul',3)),'');
});
test('GPX decimal never uses exponent notation and longitude180 becomes equivalent -180',()=>{
 assert.equal(cellGpxDecimal(1e-7),'0.0000001');assert.equal(cellGpxDecimal(-1e-8),'-0.00000001');assert.equal(cellGpxDecimal(-0),'0');assert.throws(()=>cellGpxDecimal(Infinity));
 const plan=planCellRoutes([route('tiny',[p(1e-7,180),p(2e-7,179.999)])],'seoul',3);const xml=cellPlanGpx(plan);assert.ok(xml.includes('lat="0.0000001" lon="-180"'));assert.equal(/lat="[^"]*e[+-]/.test(xml),false);
 const text=cellPlanCoordinates(plan);assert.ok(text.startsWith('0.0000001,180'));assert.deepEqual(parseCellCoordinateLines(text),plan.steps[0].points);
});
