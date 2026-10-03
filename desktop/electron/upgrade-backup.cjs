const fs=require('node:fs'),path=require('node:path');
function backup(dir,version='2.5'){
 const destination=path.join(dir,'recovery','before-v'+version);
 if(fs.existsSync(path.join(destination,'complete.json')))return;
 fs.mkdirSync(destination,{recursive:true});
 for(const name of fs.readdirSync(dir)){if(name==='Local State'||/^(vault|connections|analysis|app-lock|performance|securities)\.encrypted(?:\.previous|\.key-envelope|\.previous\.key-envelope)?$/.test(name)){const source=path.join(dir,name);if(fs.statSync(source).isFile())fs.copyFileSync(source,path.join(destination,name));}}
 fs.writeFileSync(path.join(destination,'complete.json'),JSON.stringify({version,at:new Date().toISOString(),note:'Encrypted originals and key envelopes. No plaintext credentials.'}));
}
module.exports={backup};
