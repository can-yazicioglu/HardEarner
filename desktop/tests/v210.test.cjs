const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createAppLock}=require('../electron/app-lock.cjs');
const {writeEncrypted}=require('../electron/encrypted-file.cjs'),{readEncrypted}=require('../electron/encrypted-read.cjs');
const {createConnections}=require('../electron/connections.cjs');
const {createAnalysis,chartKey,config}=require('../electron/analysis.cjs');
const {logicalToTime,timeToLogical}=require('../electron/drawing-coordinates.cjs');
const {createMetalSessions}=require('../electron/metal-session.cjs');
const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s).map(b=>b^53),decryptString:b=>Buffer.from(b).map(v=>v^53).toString()};
const fixture=()=>({dir:fs.mkdtempSync(path.join(os.tmpdir(),'he-210-')),safeStorage});
const password='Only-a-test-password!';
test('Password gate protects data before setup, on restart and after explicit lock; changes verify the old password',async()=>{
 const f=fixture();let a=createAppLock(f);assert(a.status().setupRequired);assert.throws(()=>a.assertAllowed('connections-list'),/Unlock/);a.assertAllowed('auth-status');
 await assert.rejects(a.setup('short','short'),/10 and 256/);await assert.rejects(a.setup(password,'different'),/match/);
 await a.setup(password,password);a.assertAllowed('load');assert(!fs.readFileSync(path.join(f.dir,'app-lock.encrypted')).includes(Buffer.from(password)));
 a=createAppLock(f);assert(a.status().locked);await assert.rejects(a.unlock('wrong'),/Incorrect/);assert.throws(()=>a.assertAllowed('backup'),/Unlock/);
 await a.unlock(password);await assert.rejects(a.change('wrong','New-test-password!','New-test-password!'),/Incorrect/);await a.change(password,'New-test-password!','New-test-password!');a.lock();assert.throws(()=>a.assertAllowed('analysis-load'),/Unlock/);await assert.rejects(a.unlock(password),/Incorrect/);await a.unlock('New-test-password!');a.assertAllowed('connections-list');
});
test('Password cooldown survives restarts and a Windows lock during hashing cannot reopen the app',async()=>{
 let now=100000;const f={...fixture(),now:()=>now};let a=createAppLock(f);await a.setup(password,password);a.lock();for(let i=0;i<5;i++)await assert.rejects(a.unlock('bad'),/Incorrect/);
 a=createAppLock(f);assert.equal(a.status().retryAt,now+30000);await assert.rejects(a.unlock(password),/Wait/);now+=30001;
 const pending=a.unlock(password);a.lock();await pending;assert(a.status().locked);await a.unlock(password);assert(!a.status().locked);
});
test('Damaged password storage fails closed without replacing the original; failed setup does not unlock',async()=>{
 const f=fixture(),file=path.join(f.dir,'app-lock.encrypted');fs.writeFileSync(file,'damaged');const a=createAppLock(f);assert(a.status().error);assert(!a.status().setupRequired);await assert.rejects(a.setup(password,password),/storage/);assert.equal(fs.readFileSync(file,'utf8'),'damaged');
 const b=createAppLock({...fixture(),safeStorage:{...safeStorage,isEncryptionAvailable:()=>false}});await assert.rejects(b.setup(password,password),/encryption/);assert(b.status().locked);assert(b.status().setupRequired);
});
test('A failed disk commit leaves existing credentials and memory intact, without a phantom connected account',async t=>{
 const f=fixture(),file=path.join(f.dir,'connections.encrypted'),prior={id:'kept',kind:'okx',label:'OKX',apiKey:'prior-fixture',apiSecret:'prior-secret',included:true,balances:[]};writeEncrypted(file,JSON.stringify({connections:[prior]}),safeStorage);const before=fs.readFileSync(file);
 const service=createConnections(f);t.mock.method(require('../electron/exchange-adapters.cjs'),'fetchExchange',async()=>[]);
 const nativeRename=fs.renameSync;t.mock.method(fs,'renameSync',(from,to)=>{if(to===file)throw Error('Fixture disk full');return nativeRename(from,to)});
 await assert.rejects(service.connectExchange('kraken',{apiKey:'fixture-public-key-123456',apiSecret:Buffer.from('fixture-secret').toString('base64')}),/disk full/);
 assert.deepEqual(service.view().connections.map(c=>c.id),['kept']);assert(service.view().error);assert.deepEqual(fs.readFileSync(file),before);assert.deepEqual(createConnections(f).view().connections.map(c=>c.id),['kept']);
 assert.throws(()=>service.disconnect('kept'),/disk full/);assert.equal(service.view().connections.length,1);
});
test('Atomic encrypted record reads after migration; failed rename retains the complete previous record',t=>{
 const f=fixture(),file=path.join(f.dir,'connections.encrypted');fs.writeFileSync(file,safeStorage.encryptString('{"old":true}'));fs.writeFileSync(file+'.key-envelope','legacy-envelope');writeEncrypted(file,'{"new":true}',safeStorage);
 assert.equal(readEncrypted(file,safeStorage).text,'{"new":true}');assert.equal(readEncrypted(file+'.previous',safeStorage).text,'{"old":true}');assert.equal(fs.readFileSync(file+'.previous.key-envelope','utf8'),'legacy-envelope');
 const before=fs.readFileSync(file);t.mock.method(fs,'renameSync',()=>{throw Error('Fixture crash before commit')});assert.throws(()=>writeEncrypted(file,'{"lost":true}',safeStorage));assert.deepEqual(fs.readFileSync(file),before);
});
test('Freehand strokes persist fractional time and price; weekend gaps, zoom and new candles preserve anchors',()=>{
 const bars=[{time:100},{time:160},{time:400}],step=60;
 for(const x of [-2,.123,1.4,2,5.31])assert(Math.abs(timeToLogical(logicalToTime(x,bars,step),bars,step)-x)<1e-10);
 const t=logicalToTime(1.4,bars,step);assert(Math.abs(timeToLogical(t,bars.slice(1),step)-.4)<1e-10);
 const f=fixture(),cfg={venue:'binance',type:'crypto',asset:'BTC',interval:'1s',style:'candles'},points=[{time:1700000000.12,price:100},{time:1700000000.47,price:103},{time:1700000001.32,price:101}];let a=createAnalysis(f);a.mutate('drawing',{config:cfg,kind:'freehand',points});a=createAnalysis(f);assert.deepEqual(a.view().drawings[chartKey(cfg)][0].points,points);
 assert.throws(()=>a.mutate('drawing',{config:cfg,kind:'freehand',points:[points[0]]}));assert.throws(()=>a.mutate('drawing',{config:cfg,kind:'freehand',points:Array(1001).fill(points[0])}));assert.throws(()=>a.mutate('drawing',{config:cfg,kind:'freehand',points:[points[0],{time:Infinity,price:100}]}));
});
test('Metal session timestamps come from the provider; duplicate polls, old quotes and missing prices are not fabricated',async()=>{
 let now=1800000000000,at=now,price=3100,calls=0;const service=createMetalSessions({now:()=>now,requester:async()=>{calls++;return{symbol:'XAU',price,updatedAt:new Date(at).toISOString()}}});
 const first=await service.sample('XAU');assert.equal(first.bars[0].time,at/1000);assert.equal(first.bars[0].close,3100/31.1034768);assert(!first.stale);await service.sample('XAU');assert.equal(calls,1);
 now+=5001;assert.equal((await service.sample('XAU')).bars.length,1);now+=120000;assert((await service.sample('XAU')).stale);at=now;price=3200;now+=5001;assert.equal((await service.sample('XAU')).bars.length,2);now+=5001;at-=60000;await assert.rejects(service.sample('XAU'),/older quote/);at=now;price=0;await assert.rejects(service.sample('XAU'),/invalid quote/);await assert.rejects(service.sample('../XAU'),/Choose/);
 assert.equal(config({venue:'goldapi',type:'metal',asset:'XAU',interval:'5s',style:'candles'}).style,'line');assert.throws(()=>config({venue:'goldapi',type:'crypto',asset:'BTC',interval:'5s',style:'line'}));
});
