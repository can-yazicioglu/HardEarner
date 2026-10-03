const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {promisify} = require('node:util');
const scrypt = promisify(crypto.scrypt);
const {readEncrypted} = require('./encrypted-read.cjs');
const {writeEncrypted} = require('./encrypted-file.cjs');
const PUBLIC_CHANNELS = new Set(['auth-status', 'auth-setup', 'auth-unlock']);
const derive = (password, salt) => scrypt(password, salt, 32, {N:32768, r:8, p:1, maxmem:64*1024*1024});
function validPassword(password) {
 if (typeof password !== 'string' || password.length < 10 || password.length > 256) throw Error('Use a password between 10 and 256 characters.');
}
function createAppLock({dir, safeStorage, now=Date.now, changed=()=>{}}) {
 const file = path.join(dir, 'app-lock.encrypted');
 let record=null, unlocked=false, busy=false, error=null, generation=0;
 if(fs.existsSync(file)) try {
  record=JSON.parse(readEncrypted(file,safeStorage).text);
  if(record.version!==1 || !/^[a-f0-9]{32}$/.test(record.salt) || !/^[a-f0-9]{64}$/.test(record.hash) || !Number.isSafeInteger(record.failures) || record.failures<0 || !Number.isFinite(record.retryAt) || record.retryAt<0) throw Error();
 } catch { error='Password storage could not be opened. Your data is preserved. Restore the paired app-lock backup; do not delete your portfolio.'; }
 const status=()=>({configured:!!record,locked:!unlocked,setupRequired:!record&&!error,retryAt:record?.retryAt||0,error});
 const announce=()=>{changed(status());return status()};
 const persist=next=>{writeEncrypted(file,JSON.stringify(next),safeStorage);record=next};
 const ready=()=>{if(error)throw Error(error);if(busy)throw Error('A password check is already running.');};
 async function check(password) {
  if(!record)throw Error('Create an app password first.');
  if(now()<record.retryAt)throw Error('Too many attempts. Wait before trying again.');
  if(typeof password!=='string'||password.length>256)throw Error('Incorrect password.');
  const value=await derive(password,record.salt);
  const ok=crypto.timingSafeEqual(value,Buffer.from(record.hash,'hex'));value.fill(0);
  if(!ok){const failures=record.failures+1;persist({...record,failures,retryAt:failures>=5?now()+Math.min(900000,30000*2**Math.min(failures-5,5)):0});throw Error('Incorrect password.');}
 }
 return {
  status,
  assertAllowed(channel){if(!PUBLIC_CHANNELS.has(channel)&&(!unlocked||error))throw Error('Unlock HardEarner to continue.');},
  lock(){generation++;unlocked=false;return announce();},
  async setup(password,confirmation){ready();if(record)throw Error('An app password already exists.');validPassword(password);if(password!==confirmation)throw Error('Passwords do not match.');busy=true;const started=generation;try{const salt=crypto.randomBytes(16).toString('hex'),hash=await derive(password,salt);try{persist({version:1,salt,hash:hash.toString('hex'),failures:0,retryAt:0})}finally{hash.fill(0)}unlocked=started===generation;return announce()}finally{busy=false}},
  async unlock(password){ready();busy=true;const started=generation;try{await check(password);if(record.failures||record.retryAt)persist({...record,failures:0,retryAt:0});unlocked=started===generation;return announce()}finally{busy=false}},
  async change(current,password,confirmation){ready();if(!unlocked)throw Error('Unlock HardEarner to continue.');validPassword(password);if(password!==confirmation)throw Error('Passwords do not match.');busy=true;try{await check(current);const salt=crypto.randomBytes(16).toString('hex'),hash=await derive(password,salt);try{persist({version:1,salt,hash:hash.toString('hex'),failures:0,retryAt:0})}finally{hash.fill(0)}return announce()}finally{busy=false}}
 };
}
module.exports={createAppLock, PUBLIC_CHANNELS};
