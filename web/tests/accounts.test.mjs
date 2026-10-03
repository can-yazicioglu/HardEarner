import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {sqlStorage} from './sql-storage.mjs';
const require=createRequire(import.meta.url),domain=require('../../desktop/electron/domain.cjs');
test('concurrent relay users cannot see each other and API keys never enter persistent storage',async()=>{
 const {UserVault}=await import('../build/test-worker.mjs'),aStorage=sqlStorage(),bStorage=sqlStorage(),a=new UserVault({storage:aStorage},{}),b=new UserVault({storage:bStorage},{}),originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{assert.equal(url,'https://api.btcturk.com/api/v1/users/balances');const isA=options.headers['X-PCK']==='fake-user-a-api-key';await new Promise(resolve=>setTimeout(resolve,isA?25:5));return Response.json({success:true,data:[{asset:'BTC',balance:isA?'1':'2',free:isA?'1':'2',locked:'0'}]});};
 const input=user=>({op:'connectExchange',args:['btcturk',{apiKey:'fake-user-'+user+'-api-key',apiSecret:Buffer.from('synthetic secret '+user).toString('base64')}],revision:0,portfolio:structuredClone(domain.DEFAULT),connections:{connections:[]}});
 try{const[one,two]=await Promise.all([a.account(input('a')),b.account(input('b'))]);assert.equal(one.view.connections[0].balances[0].quantity,1);assert.equal(two.view.connections[0].balances[0].quantity,2);assert(!JSON.stringify(one.view).includes('fake-user'));assert(!JSON.stringify(two.view).includes('synthetic'));
 assert.equal(one.connections.connections[0].apiKey,'fake-user-a-api-key');assert.equal(two.connections.connections[0].apiKey,'fake-user-b-api-key');assert.equal(a.read().envelope,null);assert.equal(b.read().envelope,null);
 const remove=await a.account({op:'disconnectAccount',args:[one.view.connections[0].id],revision:0,portfolio:domain.DEFAULT,connections:one.connections});assert.equal(remove.view.connections.length,0);
 const invalid=await a.account({...input('a'),op:'withdraw'});assert.equal(invalid.status,400);
 }finally{globalThis.fetch=originalFetch;}
});
