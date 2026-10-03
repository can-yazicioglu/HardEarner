let current={};
const key=p=>String(p).split(/[\\/]/).at(-1);
function setSnapshot(value){current=value;}
function existsSync(p){return Object.hasOwn(current,key(p));}
function readEncrypted(p){if(!existsSync(p))throw Error('Snapshot record missing.');return{text:JSON.stringify(current[key(p)]),recovered:false};}
function writeEncrypted(p,text){current[key(p)]=JSON.parse(text);}
module.exports={getSnapshot:()=>structuredClone(current),setSnapshot,existsSync,readEncrypted,writeEncrypted};
