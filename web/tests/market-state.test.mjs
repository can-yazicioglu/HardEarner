import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mergeMarket,failedMarket,performanceMarket} from '../client/market-state.mjs';
test('partial outages retain labelled last-known prices without manufacturing current daily performance',()=>{
 const old={fx:{USD:1,TRY:49},fxDate:'2026-10-02',fxFetched:'2026-10-02T12:00:00Z',crypto:{BTC:{usd:80000}},metals:{XAU:{usd:3600}},status:{crypto:{ok:true,at:'2026-10-02T12:00:00Z'},fx:{ok:true},XAU:{ok:true}}};
 const next=mergeMarket(old,{fx:{USD:1},crypto:{},metals:{XAU:{usd:3700}},status:{fx:{ok:false},crypto:{ok:false},XAU:{ok:true}}});
 assert.equal(next.fx.TRY,49);assert.equal(next.crypto.BTC.usd,80000);assert.equal(next.metals.XAU.usd,3700);assert.equal(next.status.crypto.ok,false);assert.equal(next.status.crypto.at,old.status.crypto.at);
 const observation=performanceMarket(next);assert.deepEqual(observation.crypto,{});assert.deepEqual(observation.fx,{USD:1});assert.equal(next.fx.TRY,49);
 const failed=failedMarket(next,'Offline');assert(Object.values(failed.status).every(v=>!v.ok));assert.equal(failed.metals.XAU.usd,3700);assert.deepEqual(performanceMarket(failed).metals,{});
});
