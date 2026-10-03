const path=require('node:path'),{execFileSync}=require('node:child_process');
function protectWindowsKey(key){
 if(process.platform!=='win32')throw Error('Windows encryption is unavailable.');
 const script="Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); try { $p=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($p)) } finally { [Array]::Clear($b,0,$b.Length) }";
 const out=execFileSync(path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{input:key.toString('base64'),encoding:'utf8',windowsHide:true,timeout:10000,stdio:['pipe','pipe','pipe']});
 const protectedKey=Buffer.from(out.trim(),'base64');if(protectedKey.length<32)throw Error('Windows key protection failed.');return protectedKey;
}
module.exports={protectWindowsKey};
