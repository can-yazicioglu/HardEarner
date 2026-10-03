import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {sqlStorage} from './sql-storage.mjs';
import {createProviderBackoff,providerFor} from '../server/provider-backoff.mjs';
const require=createRequire(import.meta.url),domain=require('../../desktop/electron/domain.cjs');

test('failed first Kraken connection keeps its cooldown across service restarts without retaining credentials',async t=>{
 const {UserVault}=await import('../build/test-worker.mjs');const storage=sqlStorage();let now=Date.now(),calls=0;
 t.mock.method(Date,'now',()=>now);t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({error:['EGeneral:Temporary lockout']})});
 const input={op:'connectExchange',args:['kraken',{apiKey:'synthetic-private-key',apiSecret:Buffer.from('synthetic secret only').toString('base64')}],revision:0,portfolio:domain.DEFAULT,connections:{connections:[]}};
 let vault=new UserVault({storage},{}),result=await vault.account(input);assert.equal(result.status,429);assert.equal(result.retryAt,now+20*60000);assert.equal(calls,1);
 assert.equal(vault.read().envelope,null);assert(!JSON.stringify(storage.sql.exec('SELECT * FROM provider_backoff').toArray()).includes('synthetic'));
 vault=new UserVault({storage},{});now+=19*60000;assert.equal((await vault.account(input)).status,429);assert.equal(calls,1);
 now+=2*60000;await vault.account(input);assert.equal(calls,2);
});
test('authentication failures stop automatic requests even after a short cooldown; deliberate retry remains possible',()=>{
 const store=sqlStorage(),guard=createProviderBackoff(store),now=Date.now();
 guard.failure('kraken',{code:'EAPI:Invalid nonce'},now);
 assert(guard.blocked('kraken',false,now+1000));assert(guard.blocked('kraken',true,now+2*60000));assert.equal(guard.blocked('kraken',false,now+2*60000),null);
 assert.equal(guard.blocked('binance',true,now),null);guard.clear('kraken');assert.equal(guard.blocked('kraken',true,now),null);
 assert.equal(providerFor({op:'disconnectAccount',args:['x'],connections:{connections:[{id:'x',kind:'kraken'}]}}),null);
});
test('incident pause makes zero provider calls and does not change the saved vault',async t=>{
 const {UserVault}=await import('../build/test-worker.mjs');const storage=sqlStorage();let calls=0;t.mock.method(globalThis,'fetch',()=>{calls++;throw Error('Must not call a provider');});
 const vault=new UserVault({storage},{KRAKEN_PAUSE_UNTIL:new Date(Date.now()+20*60000).toISOString()});
 const result=await vault.account({op:'connectExchange',args:['kraken',{}],revision:0,portfolio:domain.DEFAULT,connections:{connections:[]}});
 assert.equal(result.status,429);assert.equal(calls,0);assert.equal(vault.read().envelope,null);
});
