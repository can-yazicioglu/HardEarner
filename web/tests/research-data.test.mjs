import test from 'node:test';
import assert from 'node:assert/strict';
import {researchData} from '../server/research-data.mjs';
test('Research relay rejects arbitrary routes, URLs, credential types and unbounded addresses',async()=>{
 for(const v of [{kind:'https://attacker.invalid',selection:{}},{kind:'funding',selection:{asset:'../private'}},{kind:'positions',selection:{addresses:Array(6).fill(0).map((_,i)=>'0x'+String(i).repeat(40))}},{kind:'etf',selection:{},keys:{unknown:'private-test-key'}},{kind:'funding',selection:{},keys:['private-test-key']}])await assert.rejects(researchData(v));
});
test('Research relay reports missing paid entitlement without creating a fake series',async()=>{
 for(const kind of ['etf','mvrv','nupl','sopr','transfers','exchangeFlows','heatmap']){const r=await researchData({kind,selection:{asset:'BTC',period:'7d'}});assert.equal(r.state,'configuration');assert.equal(r.data,null);assert(!('value'in r));}
});
