import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {deriveKey,newSalt,seal,open} from '../client/crypto.mjs';
test('real Workers SQLite stores chunked ciphertext and atomically rejects a competing revision',async()=>{
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'build/worker.mjs',compatibilityDate:'2026-09-28',compatibilityFlags:['nodejs_compat'],durableObjects:{VAULTS:{className:'UserVault',useSQLite:true}}}));
 try{
  const ns=await mf.getDurableObjectNamespace('VAULTS'),aId=ns.idFromName('synthetic-a'),bId=ns.idFromName('synthetic-b'),a=ns.get(aId),b=ns.get(bId);
  const salt=newSalt(),key=await deriveKey('Synthetic runtime password',salt),id='a'.repeat(64);
  const envelope=await seal({synthetic:'fixture'.repeat(20000)},key,salt,id);
  const write={revision:0,envelope,requestId:crypto.randomUUID()};
  const results=await Promise.all([a.write(write),a.write({...write,requestId:crypto.randomUUID()})]);
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.conflict).length,1);
  const saved=await a.read();assert.equal(saved.revision,1);assert.equal((await open(saved.envelope,key,id)).synthetic.length,140000);
  const empty=await b.read();assert.equal(empty.envelope,null);
  const denied=await mf.dispatchFetch('https://local.test/api/vault');assert.equal(denied.status,503);await denied.text();
  for(const value of [...results,saved,empty,a,b,aId,bId,ns])value[Symbol.dispose]?.();
 }finally{await mf.dispose()}
});
