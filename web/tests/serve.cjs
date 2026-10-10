// Isolated loopback test harness. Never deployed; no real user data or keys.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const {buildTestWorker}=require('./build.cjs');
(async()=>{
 await buildTestWorker();
 const {handle,UserVault}=await import('../build/test-worker.mjs');const users=new Map(),outbox=new Map();
 const recoveryEnv={RECOVERY_SECRET:'a'.repeat(64),RECOVERY_FROM:'security@test.invalid',RECOVERY_EMAIL:{async send(message){outbox.set(message.to,message.text)}}};
 const env={VAULTS:{getByName(id){if(!users.has(id)){const db=new DatabaseSync(':memory:'),storage={sql:{exec:(q,...a)=>{const rows=db.prepare(q).all(...a);return{toArray:()=>rows}}},transactionSync:fn=>{db.exec('BEGIN');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}}};users.set(id,new UserVault({storage},recoveryEnv));}return users.get(id)}},ASSETS:{async fetch(r){const url=new URL(r.url),name=url.pathname==='/'?'index.html':url.pathname.slice(1),full=path.resolve('dist',name);if(!full.startsWith(path.resolve('dist')+path.sep)||!fs.existsSync(full))return new Response('Missing',{status:404});return new Response(fs.readFileSync(full),{headers:{'Content-Type':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/html'}})}}};
 const server=http.createServer(async(req,res)=>{try{const body=[];for await(const chunk of req)body.push(chunk);const request=new Request('http://127.0.0.1:8794'+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(body)}:{})});
 const user=req.headers.cookie?.match(/(?:^|;\s*)test-user=([^;]+)/)?.[1],alternate=user==='two',identity={id:user&&user!=='two'?require('node:crypto').createHash('sha256').update('isolated-test-'+user).digest('hex'):(alternate?'b':'a').repeat(64),email:alternate?'second@test.invalid':'first@test.invalid'};
 // Synthetic loopback harness only. This route and outbox are not in the Worker bundle.
 if(req.url==='/__test__/mail'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({text:outbox.get(identity.email)||''}));return;}
 const r=await handle(request,env,identity);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));}catch(e){res.writeHead(e.status||500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}});
 server.listen(8794,'127.0.0.1',()=>console.log('Synthetic private-app tests only: http://127.0.0.1:8794'));
})();
