import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sqlStorage} from './sql-storage.mjs';
import {createVaultRepository} from '../server/vault-repository.mjs';
import {createVaultRecovery} from '../server/vault-recovery.mjs';
import {deriveKey,newSalt,seal,open} from '../client/crypto.mjs';
import {sendRecoveryCode,sendResetNotice} from '../server/recovery-mail.mjs';
const identity={id:'a'.repeat(64),email:'synthetic@example.invalid'};
async function fixture(){
 const storage=sqlStorage(),repository=createVaultRepository(storage),salt=newSalt(),key=await deriveKey('Original synthetic password',salt),envelope=await seal({records:'preserve-me'},key,salt,identity.id);
 repository.write({revision:0,requestId:crypto.randomUUID(),envelope});
 let time=1800000000000,mail=[],failMail=false;
 const env={RECOVERY_SECRET:'d'.repeat(64),RECOVERY_FROM:'security@example.invalid',RECOVERY_EMAIL:{send:async()=>{}}};
 const recovery=createVaultRecovery({storage,repository,env,now:()=>time,send:async(e,to,code)=>{if(failMail)throw Error('secret-provider-detail');mail.push({to,code})}});
 const nextSalt=newSalt(),nextKey=await deriveKey('Replacement synthetic password',nextSalt),replacement=await seal({records:[]},nextKey,nextSalt,identity.id);
 return {storage,repository,recovery,key,envelope,env,mail,nextKey,setTime:t=>time=t,advance:n=>time+=n,failMail:()=>failMail=true,write:c=>({challengeId:c.challengeId,revision:1,requestId:crypto.randomUUID(),confirmation:'start-empty-vault',code:mail.at(-1).code,envelope:replacement})};
}
test('email reset archives ciphertext, binds verified recipient, rotates salt and rejects reuse',async()=>{
 const f=await fixture(),c=await f.recovery.start({revision:1,email:'attacker@example.invalid'},identity);
 assert(c.ok);assert.equal(f.mail[0].to,identity.email);assert.match(f.mail[0].code,/^\d{8}$/);assert.equal(f.repository.read().revision,1);
 const db=f.storage.sql.exec('SELECT body FROM vault_reset_state').toArray()[0].body;assert(!db.includes(f.mail[0].code));
 const input=f.write(c),result=f.recovery.complete(input,identity);assert(result.ok);assert.equal(result.revision,2);
 assert.deepEqual(await open(f.repository.read().envelope,f.nextKey,identity.id),{records:[]});
 const old=f.repository.archive(result.archiveId);assert.deepEqual(await open(old.envelope,f.key,identity.id),{records:'preserve-me'});
 assert(f.recovery.complete(input,identity).duplicate);assert.equal(f.repository.archives().length,1);
 assert.equal(f.recovery.complete({...input,requestId:crypto.randomUUID()},identity).ok,false);
 for(let i=2;i<8;i++)f.repository.write({revision:i,envelope:input.envelope,requestId:crypto.randomUUID()});
 assert.deepEqual(f.repository.archive(result.archiveId).envelope,f.envelope);
 assert(f.repository.write({revision:1,envelope:f.envelope,requestId:crypto.randomUUID()}).conflict);
});
test('wrong codes commit attempt counts, survive restart, and cannot cross identities',async()=>{
 const f=await fixture(),c=await f.recovery.start({revision:1},identity),input=f.write(c);
 assert.equal(f.recovery.complete(input,{...identity,id:'b'.repeat(64)}).ok,false);
 const wrong=input.code==='00000000'?'99999999':'00000000';
 for(let i=0;i<5;i++)assert.equal(f.recovery.complete({...input,code:wrong},identity).ok,false);
 const restarted=createVaultRecovery({storage:f.storage,repository:f.repository,env:f.env,now:()=>1800000000000});
 assert.equal(restarted.complete(input,identity).ok,false);assert.equal(f.repository.read().revision,1);assert.equal(f.repository.archives().length,0);
});
test('expired, superseded and stale-revision codes cannot reset a vault',async()=>{
 const f=await fixture(),c=await f.recovery.start({revision:1},identity),input=f.write(c);
 f.advance(600000);assert.equal(f.recovery.complete(input,identity).ok,false);
 const newer=await f.recovery.start({revision:1},identity);assert(newer.ok);assert.equal(f.recovery.complete(input,identity).ok,false);
 const write=f.write(newer);f.repository.write({revision:1,envelope:f.envelope,requestId:crypto.randomUUID()});
 assert.equal(f.recovery.complete(write,identity).status,409);assert.equal(f.repository.read().revision,2);assert.equal(f.repository.archives().length,0);
});
test('resend budgets persist, provider failure never changes a vault and disabled mail fails closed',async()=>{
 const f=await fixture();assert((await f.recovery.start({revision:1},identity)).ok);
 assert.equal((await f.recovery.start({revision:1},identity)).status,429);
 for(let i=0;i<4;i++){f.advance(60000);assert((await f.recovery.start({revision:1},identity)).ok)}
 f.advance(60000);assert.equal((await f.recovery.start({revision:1},identity)).status,429);
 f.advance(3600000);f.failMail();const failed=await f.recovery.start({revision:1},identity);assert.equal(failed.status,503);assert(!JSON.stringify(failed).includes('secret-provider-detail'));assert.equal(f.repository.read().revision,1);
 delete f.env.RECOVERY_SECRET;assert.equal(f.recovery.status().available,false);assert.equal((await f.recovery.start({revision:1},identity)).status,503);
});
test('archive and replacement are atomic if a write fails',async()=>{
 const f=await fixture(),c=await f.recovery.start({revision:1},identity),input=f.write(c);
 f.storage.sql.exec("CREATE TRIGGER reject_new_vault BEFORE INSERT ON vault_versions WHEN NEW.revision=2 BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
 assert.throws(()=>f.recovery.complete(input,identity),/synthetic failure/);assert.equal(f.repository.archives().length,0);assert.equal(f.repository.read().revision,1);
 f.storage.sql.exec('DROP TRIGGER reject_new_vault');assert(f.recovery.complete(input,identity).ok);
});
test('email binding receives only the verified recipient and no vault or password',async()=>{
 const sent=[],env={RECOVERY_SECRET:'b'.repeat(64),RECOVERY_FROM:'security@example.invalid',RECOVERY_EMAIL:{send:async value=>{sent.push(value);return{messageId:'synthetic'}}}};
 await sendRecoveryCode(env,identity.email,'00123456');await sendResetNotice(env,identity.email);
 assert.equal(sent.length,2);assert.equal(sent[0].to,identity.email);assert.match(sent[0].text,/00123456/);assert(!sent[1].text.includes('00123456'));assert(!JSON.stringify(sent).includes(env.RECOVERY_SECRET));
 await assert.rejects(()=>sendRecoveryCode(env,'bad\r\nBcc: victim@example.invalid','00123456'));
});
test('reset requires explicit confirmation, a new salt and a bounded archive count',async()=>{
 const f=await fixture(),c=await f.recovery.start({revision:1},identity),input=f.write(c);
 assert.equal(f.recovery.complete({...input,confirmation:false},identity).ok,false);
 assert.equal(f.recovery.complete({...input,envelope:{...input.envelope,salt:f.envelope.salt}},identity).ok,false);
 assert.equal(f.repository.read().revision,1);assert.equal(f.repository.archives().length,0);
 for(let i=0;i<20;i++)f.storage.sql.exec('INSERT INTO vault_archives VALUES (?,?,?)',crypto.randomUUID(),1,'2026-10-10');
 f.advance(60000);assert.equal((await f.recovery.start({revision:1},identity)).status,409);assert.equal(f.repository.archives().length,20);
});
