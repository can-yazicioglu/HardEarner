const crypto = require('node:crypto');
const MESSAGES = {
 'EAPI:Invalid key': 'Kraken rejected this API key. Check that it still exists, its expiry and IP restrictions, then retry the saved key.',
 'EAPI:Invalid signature': 'Kraken could not verify the API secret. Check the saved key and secret.',
 'EAPI:Invalid nonce': 'Kraken rejected the request order. Use a separate API key for each app, then retry.',
 'EGeneral:Permission denied': 'Kraken denied access. Check Query Funds and read-only permissions.',
 'EAPI:Rate limit exceeded': 'Kraken rate limit reached. Sync will retry after the cooldown.',
 'EGeneral:Temporary lockout': 'Kraken temporarily locked API access after failed requests. HardEarner will wait 20 minutes before retrying.'
};
const AUTH = new Set(['EAPI:Invalid key','EAPI:Invalid signature','EAPI:Invalid nonce','EGeneral:Permission denied']);
function sign(path, nonce, body, secret) {
 const digest=crypto.createHash('sha256').update(nonce+body).digest();
 return crypto.createHmac('sha512',Buffer.from(secret,'base64')).update(Buffer.concat([Buffer.from(path),digest])).digest('base64');
}
function responseError(errors) {
 const code=Array.isArray(errors)?errors.find(e=>Object.hasOwn(MESSAGES,e)):null;
 if(!code)return null;
 return Object.assign(Error(MESSAGES[code]),{code});
}
function recordFailure(c,error,now=Date.now()) {
 if(c.kind!=='kraken'||!Object.hasOwn(MESSAGES,error?.code))return false;
 c.retry={code:error.code,paused:AUTH.has(error.code),notBefore:now+(error.code==='EGeneral:Temporary lockout'?20*60000:error.code==='EAPI:Rate limit exceeded'?5*60000:60000)};
 return true;
}
function blocked(c,automatic=false,now=Date.now()) {
 if(c.kind!=='kraken')return false;
 // Old releases did not retain error codes. Require one deliberate retry rather
 // than repeating an unknown authentication failure at every launch.
 return c.retry?.notBefore>now || automatic&&(c.retry?.paused||c.error&&!c.retry);
}
module.exports={sign,responseError,recordFailure,blocked};
