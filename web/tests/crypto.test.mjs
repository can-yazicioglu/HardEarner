import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newSalt,deriveKey,seal,open} from '../client/crypto.mjs';
import {validateEnvelope} from '../shared/envelope.mjs';
const id='a'.repeat(64),password='Only a synthetic test password';
test('vault encrypts credentials and round-trips on another device',async()=>{
 const salt=newSalt(),key=await deriveKey(password,salt),data={holdings:[{asset:'BTC',cost:20000}],apiSecret:'never plaintext in cloud storage'};
 const e=await seal(data,key,salt,id);assert(!JSON.stringify(e).includes(data.apiSecret));
 assert.deepEqual(await open(e,await deriveKey(password,salt),id),data);
 const second=await seal(data,key,salt,id);assert.notEqual(e.iv,second.iv);assert.notEqual(e.ciphertext,second.ciphertext);
 await assert.rejects(open(e,await deriveKey('Different test password',salt),id));
 await assert.rejects(open(e,key,'b'.repeat(64)));
 const altered={...e,ciphertext:(e.ciphertext[0]==='A'?'B':'A')+e.ciphertext.slice(1)};await assert.rejects(open(altered,key,id));
 assert.throws(()=>validateEnvelope({...e,apiSecret:data.apiSecret}));
});
