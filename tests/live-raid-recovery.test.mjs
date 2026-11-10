import test from 'node:test';
import assert from 'node:assert/strict';
import { retainLastGoodRaidFeed } from '../lib/live-raid-recovery.ts';
import { hasMinimumRaidTime } from '../lib/live-raid-display.ts';
const now=new Date('2026-11-10T04:00:00Z');
const failure={status:'error',raids:[],fetchedAt:null,checkedAt:now.toISOString(),sourceName:null,message:'failed',discarded:{invalid:0,stale:0,ended:0}};
const previous={...failure,status:'ready',fetchedAt:'2026-11-10T03:59:00Z',checkedAt:'2026-11-10T03:59:10Z',sourceName:'Published source',raids:[{id:'one',endsAt:'2026-11-10T04:05:00Z',expiresAt:'2026-11-10T04:09:00Z',observedAt:'2026-11-10T03:59:00Z'}]};
test('one refresh failure preserves the same last good response without freshening clocks',()=>{
 const result=retainLastGoodRaidFeed(previous,failure,now);
 assert.equal(result,previous);
 assert.equal(result.checkedAt,'2026-11-10T03:59:10Z');
 assert.equal(result.raids[0].observedAt,'2026-11-10T03:59:00Z');
});
test('retained raids still leave the display at the five-minute boundary',()=>{
 const result=retainLastGoodRaidFeed(previous,failure,now);
 assert.equal(hasMinimumRaidTime(result.raids[0],now),true);
 assert.equal(hasMinimumRaidTime(result.raids[0],new Date(now.getTime()+1)),false);
});
test('missing, malformed, future, failed and ten-minute-old snapshots are not presented as live',()=>{
 for(const prior of [null,{...previous,fetchedAt:'invalid'},{...previous,fetchedAt:'2026-11-10T04:01:01Z'},{...previous,fetchedAt:'2026-11-10T03:50:00Z'},{...previous,status:'error'}])assert.equal(retainLastGoodRaidFeed(prior,failure,now),failure);
 assert.equal(retainLastGoodRaidFeed({...previous,status:'empty',raids:[]},failure,now).status,'empty');
});
