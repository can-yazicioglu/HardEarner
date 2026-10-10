import {createHmac,createHash,randomInt,timingSafeEqual} from 'node:crypto';
import {recoveryConfigured,sendRecoveryCode} from './recovery-mail.mjs';
import {validateEnvelope,validateRevision} from '../shared/envelope.mjs';
const fail=(status,error,retryAt)=>({ok:false,status,error,...(retryAt?{retryAt}:{})});
const invalid=()=>fail(400,'The reset code is invalid, expired or already used.');
const UUID=/^[a-f0-9-]{36}$/i;
export function createVaultRecovery({storage,repository,env,now=Date.now,send=sendRecoveryCode}) {
  const sql=storage.sql;
  sql.exec('CREATE TABLE IF NOT EXISTS vault_reset_state (slot INTEGER PRIMARY KEY, body TEXT NOT NULL)');
  const read=()=>JSON.parse(sql.exec('SELECT body FROM vault_reset_state WHERE slot = 1').toArray()[0]?.body || '{}');
  const save=value=>sql.exec('INSERT OR REPLACE INTO vault_reset_state VALUES (1,?)',JSON.stringify(value));
  const digest=(id,identity,code)=>createHmac('sha256',env.RECOVERY_SECRET).update(`hardearner-reset-v1:${id}:${identity}:${code}`).digest('hex');
  const matches=(a,b)=>typeof a==='string'&&/^[a-f0-9]{64}$/.test(a)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
  const configured=()=>recoveryConfigured(env);
  function status(){return {available:configured(),mode:'new-empty-vault',archiveCount:repository.archives().length};}
  async function start(input,identity) {
    if(!configured())return fail(503,'Email reset is not available yet. Your vault has not changed.');
    if(!identity?.email||!/^[a-f0-9]{64}$/.test(identity.id))return fail(403,'Verified account required.');
    validateRevision(input?.revision);
    const code=String(randomInt(0,100000000)).padStart(8,'0'),id=crypto.randomUUID(),time=now();
    const result=storage.transactionSync(()=>{
      const previous=read(),head=repository.read(),requests=(previous.requests||[]).filter(t=>t>time-86400000);
      if(!head.envelope||head.revision!==input.revision)return fail(409,'Your vault changed. Reload before requesting a reset.');
      if(repository.archives().length>=20)return fail(409,'Contact support before starting another vault. Your archived vaults are preserved.');
      const recent=requests.filter(t=>t>time-3600000),last=requests.at(-1)||0;
      const retryAt=requests.length>=10?requests[0]+86400000:recent.length>=5?recent[0]+3600000:last+60000;
      if(time<retryAt)return fail(429,'Please wait before requesting another code.',retryAt);
      save({requests:[...requests,time],challenge:{id,identity:identity.id,revision:head.revision,salt:head.envelope.salt,hash:digest(id,identity.id,code),expiresAt:time+600000,attempts:0,ready:false}});
      return {ok:true,challengeId:id,expiresAt:time+600000,resendAt:time+60000};
    });
    if(!result.ok)return result;
    try{await send(env,identity.email,code);}
    catch{
      storage.transactionSync(()=>{const state=read();if(state.challenge?.id===id){delete state.challenge;save(state);}});
      return fail(503,'The reset email could not be sent. Your vault has not changed. Please contact support if this continues.');
    }
    storage.transactionSync(()=>{const state=read();if(state.challenge?.id===id){state.challenge.ready=true;save(state);}});
    return result;
  }
  function complete(input,identity) {
    if(!configured())return fail(503,'Email reset is not available yet. Your vault has not changed.');
    if(!input||!UUID.test(input.challengeId)||!UUID.test(input.requestId)||input.confirmation!=='start-empty-vault')return invalid();
    validateRevision(input.revision);validateEnvelope(input.envelope);
    const fingerprint=createHash('sha256').update(JSON.stringify([input.requestId,input.revision,input.envelope])).digest('hex');
    return repository.archiveAndWrite(input,head=>{
      const state=read(),c=state.challenge,time=now();
      if(!c||!c.ready||c.id!==input.challengeId||c.identity!==identity.id||time>=c.expiresAt||c.attempts>=5)return invalid();
      const validCode=typeof input.code==='string'&&/^\d{8}$/.test(input.code)&&matches(c.hash,digest(c.id,identity.id,input.code));
      if(!validCode){c.attempts++;save(state);return invalid();}
      // A lost success response may be retried, but the used code cannot authorize different data.
      if(c.used)return c.fingerprint===fingerprint?{ok:true,duplicate:true,revision:c.completedRevision,currentRevision:head.revision,archiveId:input.requestId}:invalid();
      if(head.revision!==c.revision||input.revision!==c.revision||head.envelope?.salt!==c.salt){delete state.challenge;save(state);return fail(409,'Your vault changed. Reload before requesting a reset.');}
      if(input.envelope.salt===c.salt)return fail(400,'A fresh vault encryption salt is required.');
      c.used=true;c.fingerprint=fingerprint;c.completedRevision=head.revision+1;save(state);
      return {ok:true};
    });
  }
  return {status,start,complete};
}
