import test from 'node:test';
import assert from 'node:assert/strict';
import { HUNTING_MAX_BYTES, HUNTING_MAX_SOURCE_POINTS, HUNTING_MAX_OUTPUT_POINTS, parseHuntingGpx, parseHuntingCoordinates, buildHuntingRoute, buildHuntingGpx, huntingCoordinates, huntingDistanceKm, huntingDecimal, speedKmhFrom, speedToUnit } from '../lib/hunting-route.ts';
const p=(lat,lon=0)=>({lat,lon});
const options=(extra={})=>({speedKmh:3.6,laps:1,mode:'original',reverse:false,includeTimes:false,startAt:new Date('2026-11-10T00:00:00Z'),...extra});
const near=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} vs ${expected}`);
const xmlDoc=({tracks=[],legacyTracks=[],routes=[],waypoints=[],bad=false,root='gpx'}={})=>({documentElement:{localName:root},getElementsByTagNameNS(_ns,name){
 const point=x=>({getAttribute:key=>x[key]===undefined?null:String(x[key])});
 if(name==='parsererror')return bad?[{}]:[];
 if(name==='wpt')return [...waypoints,...legacyTracks.flat()].map(point);
 if(name==='trkseg')return [...tracks.map(points=>({getElementsByTagNameNS(_ns,tag){return tag==='trkpt'?points.map(point):[]}})),...legacyTracks.map(points=>({getElementsByTagNameNS(_ns,tag){return tag==='wpt'?points.map(point):[]}}))];
 if(name==='rte')return routes.map(points=>({getElementsByTagNameNS(_ns,tag){return tag==='rtept'?points.map(point):[]}}));
 return [];
}});

test('ordered coordinate input preserves full precision and nonconsecutive revisits',()=>{
 const text='37.1234567890123,127.9876543210987\n37.1234567890123,127.9876543210987\n38,128\n37.1234567890123,127.9876543210987';
 const points=parseHuntingCoordinates(text);assert.deepEqual(points,[p(37.1234567890123,127.9876543210987),p(38,128),p(37.1234567890123,127.9876543210987)]);
 const before=JSON.stringify(points),plan=buildHuntingRoute(points,options());assert.deepEqual(plan.points,points);assert.equal(plan.sourcePointCount,3);assert.equal(JSON.stringify(points),before);
});
test('coordinate parsing rejects empty, malformed, nonfinite, hex, exponent and illegal ranges',()=>{
 for(const text of ['', 'NaN,1\n2,3','Infinity,0\n2,3','0x10,1\n2,3','1e-7,1\n2,3','91,0\n0,0','0,-181\n0,0','1,2,3\n2,3','1,2\n1,2'])assert.throws(()=>parseHuntingCoordinates(text));
});
test('raw UTF8 byte and source point bounds are enforced before expensive parsing',()=>{
 let parsed=false;assert.throws(()=>parseHuntingGpx(' '.repeat(HUNTING_MAX_BYTES)+'<gpx/>',()=>{parsed=true;return xmlDoc()}));assert.equal(parsed,false);
 assert.throws(()=>parseHuntingCoordinates('가'.repeat(800000)));assert.throws(()=>parseHuntingCoordinates('1,2\n'.repeat(HUNTING_MAX_SOURCE_POINTS+1)));
 assert.throws(()=>buildHuntingRoute(Array.from({length:HUNTING_MAX_SOURCE_POINTS+1},(_,i)=>p(i/1000)),options()));
});
test('GPX DTD and entities are rejected before an injectable DOM parser runs',()=>{
 let called=false;for(const text of ['<!DOCTYPE gpx SYSTEM "https://example.com/x"><gpx/>','<!ENTITY x "payload"><gpx/>'])assert.throws(()=>parseHuntingGpx(text,()=>{called=true;return xmlDoc()}));assert.equal(called,false);
});
test('GPX trims BOM/leading whitespace for real-world archives without bypassing raw byte bound',()=>{
 let received='';const source='\ufeff\n  <?xml version="1.0"?><gpx/>';
 assert.deepEqual(parseHuntingGpx(source,text=>{received=text;return xmlDoc({tracks:[[p(1,2),p(3,4)]]})}),[p(1,2),p(3,4)]);assert.ok(received.startsWith('<?xml'));
});
test('GPX prefers one continuous track over duplicate rte/wpt representations',()=>{
 const points=[p(1,2),p(2,3)];const unused=Array.from({length:21000},()=>p(9,9));
 assert.deepEqual(parseHuntingGpx('<gpx/>',()=>xmlDoc({tracks:[points],routes:[unused],waypoints:unused})),points);
 assert.deepEqual(parseHuntingGpx('<gpx/>',()=>xmlDoc({routes:[points],waypoints:[p(7),p(8)]})),points);
 assert.deepEqual(parseHuntingGpx('<gpx/>',()=>xmlDoc({waypoints:points})),points);
});
test('GPX never flattens disconnected segments, malformed XML, missing attrs or oversized selected paths',()=>{
 for(const doc of [xmlDoc({tracks:[[p(1),p(2)],[p(3),p(4)]]}),xmlDoc({routes:[[p(1),p(2)],[p(3),p(4)]]}),xmlDoc({bad:true}),xmlDoc({root:'html'}),xmlDoc({tracks:[[{lat:1},p(2)]]}),xmlDoc({tracks:[[p(1),p(91)]]}),xmlDoc({tracks:[Array.from({length:20001},(_,i)=>p(i/1000))]})])assert.throws(()=>parseHuntingGpx('<gpx/>',()=>doc));
});
test('an open original path cannot silently jump to repeat its start',()=>{
 const points=[p(0),p(.01)];assert.throws(()=>buildHuntingRoute(points,options({laps:2})),/왕복|출발점/);assert.deepEqual(buildHuntingRoute(points,options()).points,points);
});
test('near-closed originals include each real lap seam in distance and explicit points',()=>{
 const points=[p(0),p(.001),p(.00005)],plan=buildHuntingRoute(points,options({laps:2}));
 assert.equal(plan.points.length,6);const one=huntingDistanceKm(points[0],points[1])+huntingDistanceKm(points[1],points[2]);near(plan.distanceKm,one*2+huntingDistanceKm(points[2],points[0]));
});
test('explicit loop adds the first point and repeats without duplicate boundary points',()=>{
 const a=p(0),b=p(.01),plan=buildHuntingRoute([a,b],options({mode:'loop',laps:2}));assert.deepEqual(plan.points,[a,b,a,b,a]);near(plan.distanceKm,huntingDistanceKm(a,b)*4);assert.equal(plan.sourcePointCount,2);
});
test('out-and-back reverses only the return portion and explicit reverse preserves source geometry',()=>{
 const points=[p(0),p(.01),p(.02)],before=JSON.stringify(points);
 assert.deepEqual(buildHuntingRoute(points,options({mode:'out-and-back'})).points,[points[0],points[1],points[2],points[1],points[0]]);
 assert.deepEqual(buildHuntingRoute(points,options({reverse:true})).points,[points[2],points[1],points[0]]);assert.equal(JSON.stringify(points),before);
});
test('closed originals repeat naturally and retain every non-boundary point',()=>{
 const a=p(0),b=p(.01),plan=buildHuntingRoute([a,b,a],options({laps:3}));assert.deepEqual(plan.points,[a,b,a,b,a,b,a]);near(plan.distanceKm,huntingDistanceKm(a,b)*6);
});
test('speed, lap, mode and total-point bounds reject unsupported inputs before expansion',()=>{
 for(const patch of [{speedKmh:0},{speedKmh:120.1},{speedKmh:NaN},{laps:0},{laps:21},{laps:1.5},{mode:'teleport'},{reverse:'yes'},{includeTimes:1}])assert.throws(()=>buildHuntingRoute([p(0),p(1)],options(patch)));
 const points=Array.from({length:2500},(_,i)=>p(i/10000));assert.throws(()=>buildHuntingRoute(points,options({mode:'loop',laps:20})),/50,000/);
 const accepted=buildHuntingRoute(points.slice(0,2499),options({mode:'loop',laps:20}));assert.ok(accepted.points.length<=HUNTING_MAX_OUTPUT_POINTS);
});
test('great-circle distance handles dateline, poles and antipodes without NaN',()=>{
 near(huntingDistanceKm(p(0,179.9),p(0,-179.9)),22.2390160467,1e-6);near(huntingDistanceKm(p(0),p(0)),0);assert.ok(Number.isFinite(huntingDistanceKm(p(90),p(-90))));assert.ok(huntingDistanceKm(p(0),p(0,180))>20000);
});
test('km/h and m/s convert exactly by3.6 without inventing an app-specific speed range',()=>{
 assert.equal(speedKmhFrom(1,'mps'),3.6);assert.equal(speedToUnit(3.6,'mps'),1);assert.equal(speedKmhFrom(8,'kmh'),8);near(speedKmhFrom(speedToUnit(10,'mps'),'mps'),10);assert.throws(()=>speedKmhFrom(NaN,'mps'));assert.throws(()=>speedToUnit(4,'mph'));
});
test('ETA and planned point times use travelled distance/speed and remain absent by default',()=>{
 const points=[p(0),p(.001),p(.002)],plain=buildHuntingRoute(points,options()),timed=buildHuntingRoute(points,options({includeTimes:true}));
 assert.equal('times' in plain,false);near(plain.durationMinutes,plain.distanceKm/3.6*60);assert.equal(timed.times.length,3);assert.equal(timed.times[0],'2026-11-10T00:00:00.000Z');near(Date.parse(timed.times[2])-Date.parse(timed.times[0]),timed.distanceKm/3.6*3600000,.51);assert.ok(Date.parse(timed.times[1])<Date.parse(timed.times[2]));
 assert.throws(()=>buildHuntingRoute(points,options({includeTimes:true,startAt:new Date('bad')})));assert.throws(()=>buildHuntingRoute(points,options({includeTimes:true,startAt:new Date('+010000-01-01T00:00:00Z')})));
});
test('GPX contains only the selected geometry type and marks speed/times as planned, not recorded',()=>{
 const plan=buildHuntingRoute([p(1e-7,180),p(2e-7,179.99)],options({includeTimes:true}));const trk=buildHuntingGpx(plan,'A & <B>\u0001 😀');
 assert.ok(trk.includes('xmlns="http://www.topografix.com/GPX/1/1"'));assert.equal((trk.match(/<trk>/g)||[]).length,1);assert.equal(trk.includes('<rte>'),false);assert.equal((trk.match(/<time>/g)||[]).length,plan.points.length);assert.ok(trk.includes('Planned route, not a recorded GPS activity'));assert.ok(trk.includes('Speed: 3.6 km/h'));assert.ok(trk.includes('A &amp; &lt;B&gt;'));assert.equal(trk.includes('\u0001'),false);assert.ok(trk.includes('😀'));assert.ok(trk.includes('lat="0.0000001" lon="-180"'));
 const rte=buildHuntingGpx(plan,'route','rte');assert.equal((rte.match(/<rte>/g)||[]).length,1);assert.equal(rte.includes('<trk>'),false);assert.equal((rte.match(/<rtept /g)||[]).length,plan.points.length);
 const untimed=buildHuntingGpx(buildHuntingRoute([p(1),p(2)],options()),'plain');assert.equal(untimed.includes('<time>'),false);assert.ok(untimed.includes('No timestamps were generated.'));
});
test('coordinate export is decimal-only, precision-preserving and parseable again',()=>{
 const plan=buildHuntingRoute([p(-1e-7,180),p(37.1234567890123,127.9876543210987)],options());const text=huntingCoordinates(plan);assert.ok(text.startsWith('-0.0000001,180'));assert.deepEqual(parseHuntingCoordinates(text),plan.points);assert.equal(huntingDecimal(-0),'0');assert.equal(huntingDecimal(5e-324),'0.'+'0'.repeat(323)+'5');assert.throws(()=>huntingDecimal(Infinity));
});


test('legacy wpt inside one continuous trkseg remains ordered and multiple such segments are rejected',()=>{
 const points=[p(35.7,139.7),p(35.8,139.8),p(35.9,139.9)];assert.deepEqual(parseHuntingGpx('<gpx/>',()=>xmlDoc({legacyTracks:[points]})),points);
 assert.throws(()=>parseHuntingGpx('<gpx/>',()=>xmlDoc({legacyTracks:[points,[p(1),p(2)]]})),/여러 트랙/);
 assert.throws(()=>parseHuntingGpx('<gpx/>',()=>xmlDoc({tracks:[[p(1),p(2)]],legacyTracks:[points]})),/여러 트랙/);
});
test('optional source attribution is HTTPS/XML-safe and uses valid GPX metadata element order',()=>{
 const plan=buildHuntingRoute([p(1),p(2)],options());const xml=buildHuntingGpx(plan,'name','trk',{url:'https://example.com/path?a=1&b=2',title:'A & <B>',author:'Creator & team'});
 assert.ok(xml.includes('<link href="https://example.com/path?a=1&amp;b=2"><text>A &amp; &lt;B&gt;</text></link>'));assert.ok(xml.indexOf('<desc>')<xml.indexOf('<author>'));assert.ok(xml.indexOf('<author>')<xml.indexOf('<link href='));assert.ok(xml.indexOf('<link href=')<xml.indexOf('</metadata>'));
 assert.throws(()=>buildHuntingGpx(plan,'name','trk',{url:'javascript:alert(1)'}));assert.throws(()=>buildHuntingGpx(plan,'name','trk',{url:'https://user:pass@example.com'}));
});
