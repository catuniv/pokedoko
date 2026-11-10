import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64');
const backgrounds=await readFile(new URL('../lib/trade-backgrounds.ts',import.meta.url),'utf8');
const bURL=url(backgrounds),{TRADE_BACKGROUND_PRESETS}=await import(bURL);
const catalog=(await readFile(new URL('../lib/trade-background-catalog.ts',import.meta.url),'utf8')).replace(/from (["'])\.\/trade-backgrounds\1/g, 'from '+JSON.stringify(bURL));
const cURL=url(catalog);
const manifest=JSON.parse(await readFile(new URL('../lib/trade-background-image-manifest.json',import.meta.url),'utf8'));
const helper=(await readFile(new URL('../lib/trade-background-image.ts',import.meta.url),'utf8'))
 .replace(/from (["'])\.\/trade-backgrounds\1/g,'from '+JSON.stringify(bURL))
 .replace(/from (["'])\.\/trade-background-catalog\1/g,'from '+JSON.stringify(cURL))
 .replace('import manifest from "./trade-background-image-manifest.json";', 'const manifest = '+JSON.stringify(manifest)+';');
const {tradeBackgroundImage}=await import(url(helper));
test('every built-in selectable background has an identified local image with intact source bytes',async()=>{
 assert.equal(manifest.length,TRADE_BACKGROUND_PRESETS.length);
 for(const preset of TRADE_BACKGROUND_PRESETS){
  const image=tradeBackgroundImage({kind:preset.kind,name:preset.name});assert.ok(image,preset.id);
  const record=manifest.find(x=>x.presetId===preset.id); assert.ok(record,preset.id);
  const bytes=await readFile(new URL('../public'+image.src,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),record.sha256,preset.id);
  assert.equal(bytes.length,record.bytes);
  if(record.file.endsWith('.png')){assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),record.width);assert.equal(bytes.readUInt32BE(20),record.height);}
  else{assert.equal(bytes.subarray(0,4).toString(),'RIFF');assert.equal(bytes.subarray(8,12).toString(),'WEBP');}
 }
 const latest=TRADE_BACKGROUND_PRESETS.find(x=>x.id==='wild-area-global-2026');
 assert.equal(tradeBackgroundImage({kind:latest.kind,name:latest.name}).objectPosition,'right center');
});
test('missing, none, any and unrecognized custom names never acquire an invented background',()=>{
 for(const value of [undefined,{kind:'none',name:''},{kind:'any',name:''},{kind:'special',name:'My unlisted background'},{kind:'location',name:'Ultra Wormhole — GO Fest 2024'}])assert.equal(tradeBackgroundImage(value),undefined);
});
test('new public catalog backgrounds use only the validated image origin and exact identity',()=>{
 const entry={id:'community-new2030',kind:'special',name:'New Event 2030',label:'New Event 2030',sourceUrl:'https://github.com/psoren/pogo-bg',imageUrl:'https://raw.githubusercontent.com/psoren/pogo-bg/main/docs/img/bg/new2030.jpg'};
 assert.equal(tradeBackgroundImage({kind:'special',name:'New Event 2030'},[entry]).src,entry.imageUrl);
 assert.equal(tradeBackgroundImage({kind:'special',name:'New Event 2029'},[entry]),undefined);
 for(const imageUrl of ['https://evil.example/background.jpg','https://raw.githubusercontent.com/psoren/pogo-bg/main/docs/img/bg/../private.jpg','javascript:alert(1)'])assert.equal(tradeBackgroundImage({kind:'special',name:entry.name},[{...entry,imageUrl}]),undefined);
});
