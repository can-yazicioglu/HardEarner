const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path'),{execFileSync}=require('node:child_process');
const keyCache=new Map();
function unwrapWindowsKey(wrapped){
 if(process.platform!=='win32')throw Error('Windows key recovery is unavailable.');
 const id=wrapped.toString('base64');if(keyCache.has(id))return Buffer.from(keyCache.get(id));
 // DPAPI stays bound to this Windows user. Key bytes travel only over private process pipes.
 const script="Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); try { $k=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($k)) } finally { if($k){[Array]::Clear($k,0,$k.Length)}; [Array]::Clear($b,0,$b.Length) }";
 const out=execFileSync(path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{input:wrapped.toString('base64'),encoding:'utf8',windowsHide:true,timeout:10000,stdio:['pipe','pipe','pipe']});
 const key=Buffer.from(out.trim(),'base64');if(key.length!==32)throw Error('Invalid encryption key.');if(keyCache.size>=8){const oldest=keyCache.keys().next().value;keyCache.get(oldest).fill(0);keyCache.delete(oldest)}keyCache.set(id,Buffer.from(key));return key;
}
function decryptEnvelope(cipher,envelope,unwrap=unwrapWindowsKey){
 if(cipher.length<31||cipher.subarray(0,3).toString()!=='v10')throw Error('Unsupported encrypted format.');
 const wrapped=Buffer.from(envelope?.os_crypt?.encrypted_key||'','base64');
 if(wrapped.subarray(0,5).toString()!=='DPAPI')throw Error('Invalid Windows key envelope.');
 let key;try{key=unwrap(wrapped.subarray(5));if(key.length!==32)throw Error('Invalid encryption key.');const decipher=crypto.createDecipheriv('aes-256-gcm',key,cipher.subarray(3,15));decipher.setAuthTag(cipher.subarray(-16));return Buffer.concat([decipher.update(cipher.subarray(15,-16)),decipher.final()]).toString('utf8')}finally{key?.fill(0)}
}
function readEncrypted(file,safeStorage){
 const bytes=fs.readFileSync(file);let cipher=bytes,envelope,native=false;
 // v2 commits ciphertext and its matching Windows envelope in a single rename.
 if(bytes[0]===123)try{const record=JSON.parse(bytes.toString('utf8'));if(['hardearner-encrypted-v2','hardearner-encrypted-v3'].includes(record.format)){if(typeof record.cipher!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(record.cipher))throw Error();cipher=Buffer.from(record.cipher,'base64');envelope=record.envelope||null;native=record.format==='hardearner-encrypted-v3';}}catch{throw Error('Encrypted storage could not be opened. Original files were preserved.')}
 if(!native)try{return{text:safeStorage.decryptString(cipher),recovered:false}}catch{}
 // Only the envelope saved alongside this exact ciphertext is considered. No key searching.
 try{const text=decryptEnvelope(cipher,envelope===undefined?JSON.parse(fs.readFileSync(file+'.key-envelope','utf8')):envelope);JSON.parse(text);return{text,recovered:!native}}catch{throw Error('Encrypted storage could not be opened. Original files were preserved.')}
}
module.exports={readEncrypted,decryptEnvelope,unwrapWindowsKey};
