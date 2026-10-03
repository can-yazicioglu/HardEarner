import {test} from 'node:test';import assert from 'node:assert/strict';
import {sqlStorage} from './sql-storage.mjs';
import {createVaultRepository} from '../server/vault-repository.mjs';
const envelope=n=>({format:'hardearner-private-v1',iterations:600000,salt:'A'.repeat(43)+'=',iv:'B'.repeat(16),ciphertext:btoa('encrypted-fixture-data-'+n)});
test('concurrent devices cannot overwrite each other and accounts are isolated',()=>{
 const s=sqlStorage(),a=createVaultRepository(s),b=createVaultRepository(sqlStorage());
 assert.equal(a.read().revision,0);const input={revision:0,envelope:envelope(1),requestId:crypto.randomUUID()};
 assert.equal(a.write(input).revision,1);assert.equal(a.write(input).duplicate,true);
 assert.throws(()=>a.write({...input,envelope:envelope('different')}),/different data/);
 assert.equal(a.write({...input,requestId:crypto.randomUUID()}).conflict,true);
 assert.equal(b.read().envelope,null);assert.deepEqual(a.read().envelope,input.envelope);
 for(let i=1;i<5;i++)a.write({revision:i,envelope:envelope(i+1),requestId:crypto.randomUUID()});
 assert.equal(a.read().revision,5);assert.equal(s.sql.exec('SELECT * FROM vault_versions').toArray().length,3);
});
test('oversized or plaintext snapshots never replace an existing vault',()=>{
 const a=createVaultRepository(sqlStorage());a.write({revision:0,envelope:envelope(1),requestId:crypto.randomUUID()});
 assert.throws(()=>a.write({revision:1,envelope:{portfolio:{apiSecret:'plaintext'}},requestId:crypto.randomUUID()}));assert.equal(a.read().revision,1);
});
