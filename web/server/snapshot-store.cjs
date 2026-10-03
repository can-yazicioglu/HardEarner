const {AsyncLocalStorage}=require('node:async_hooks');
const context=new AsyncLocalStorage();
function files(){const value=context.getStore();if(!value)throw Error('A request-scoped snapshot is required.');return value;}
const key=p=>String(p).split(/[\\/]/).at(-1);
function withSnapshot(input,action){return context.run(structuredClone(input),async()=>{const result=await action();return{result,files:structuredClone(files())}})}
function existsSync(p){return Object.hasOwn(files(),key(p));}
function readEncrypted(p){if(!existsSync(p))throw Error('Snapshot record missing.');return{text:JSON.stringify(files()[key(p)]),recovered:false};}
function writeEncrypted(p,text){files()[key(p)]=JSON.parse(text);}
module.exports={withSnapshot,existsSync,readEncrypted,writeEncrypted};
