const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {decryptEnvelope,unwrapWindowsKey}=require('./encrypted-read.cjs');
let sessionKey=null,sessionEnvelope=null;
function nativeRecord(text){
 if(!sessionKey){const key=crypto.randomBytes(32);try{const wrapped=require('./windows-key.cjs').protectWindowsKey(key),verified=unwrapWindowsKey(wrapped);const equal=crypto.timingSafeEqual(key,verified);verified.fill(0);if(!equal)throw Error('Windows key verification failed.');sessionEnvelope={os_crypt:{encrypted_key:Buffer.concat([Buffer.from('DPAPI'),wrapped]).toString('base64')}};sessionKey=key;}catch(e){key.fill(0);throw e;}}
 const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',sessionKey,iv),bytes=Buffer.concat([Buffer.from('v10'),iv,cipher.update(text,'utf8'),cipher.final(),cipher.getAuthTag()]);
 if(decryptEnvelope(bytes,sessionEnvelope)!==text)throw Error('Encryption verification failed.');
 return {format:'hardearner-encrypted-v3',cipher:bytes.toString('base64'),envelope:sessionEnvelope};
}
// Commit the ciphertext and its matching Windows key envelope in one atomic record.
// Raw ciphertext from previous releases remains readable; migration keeps a paired backup.
function writeEncrypted(file,text,safeStorage){
 if(!safeStorage.isEncryptionAvailable())throw Error('Windows encryption is unavailable. Changes were not saved.');
 const bytes=safeStorage.encryptString(text);
 if(safeStorage.decryptString(bytes)!==text)throw Error('Encryption verification failed. Changes were not saved.');
 const dir=path.dirname(file);fs.mkdirSync(dir,{recursive:true});
 const key=path.join(dir,'Local State');
 // CurrentUser DPAPI protects our own AES key, independently of Chromium's asynchronous
 // Local State file. Each record carries its wrapped key and authenticates its ciphertext.
 const record=JSON.stringify(bytes.subarray(0,3).toString()==='v10'?nativeRecord(text):{format:'hardearner-encrypted-v2',cipher:bytes.toString('base64'),envelope:null});
 if(fs.existsSync(file)){
  fs.copyFileSync(file,file+'.previous');
  const previousKey=fs.existsSync(file+'.key-envelope')?file+'.key-envelope':key;
  if(fs.existsSync(previousKey))fs.copyFileSync(previousKey,file+'.previous.key-envelope');
 }
 fs.writeFileSync(file+'.tmp',record,{flush:true});
 fs.renameSync(file+'.tmp',file);
}
module.exports={writeEncrypted};
