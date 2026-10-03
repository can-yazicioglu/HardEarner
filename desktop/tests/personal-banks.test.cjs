const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {fetchBank,credentials}=require('../electron/personal-banks.cjs');
const {createConnections,linkedHoldings}=require('../electron/connections.cjs');
const {portfolio}=require('../electron/domain.cjs');
const {newer,installHandoff}=require('../electron/release-handoff.cjs');
const token='PERSONAL_FIXTURE_TOKEN_123456',reply=d=>({ok:true,json:async()=>d}),uid='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s).map(b=>b^53),decryptString:b=>Buffer.from(b).map(v=>v^53).toString()};
test('Monzo uses only fixed GET endpoints, keeps pence precision and counts Pots exactly once',async t=>{
 t.mock.method(global,'fetch',async(url,options)=>{assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer '+token);assert.equal(new URL(url).origin,'https://api.monzo.com');assert(!url.includes(token));if(url.endsWith('whoami'))return reply({authenticated:true});if(url.endsWith('accounts'))return reply({accounts:[{id:'acc_one',type:'uk_retail'},{id:'acc_closed',closed:true},{id:'acc_business',type:'uk_business'}]});return reply({balance:10001,total_balance:35002,currency:'GBP',overdraft_limit:500000})});
 const rows=await fetchBank('monzo',{accessToken:token});assert.equal(rows.length,1);assert.equal(rows[0].quantity,350.02);assert.equal(rows[0].available,100.01);
});
test('Starling verifies read-only scopes and counts Spaces through total effective balance, never credit limits',async t=>{
 let scopes=['account:read','balance:read'];t.mock.method(global,'fetch',async(url,o)=>{assert.equal(new URL(url).origin,'https://api.starlingbank.com');assert.equal(o.method,'GET');if(url.endsWith('/identity/token'))return reply({authenticated:true,scopes});if(url.endsWith('/accounts'))return reply({accounts:[{accountUid:uid,currency:'GBP'}]});return reply({effectiveBalance:{minorUnits:20000,currency:'GBP'},totalEffectiveBalance:{minorUnits:90000,currency:'GBP'},acceptedOverdraft:{minorUnits:500000,currency:'GBP'}})});
 const rows=await fetchBank('starling',{accessToken:token});assert.equal(rows[0].quantity,900);assert.equal(rows[0].available,200);scopes.push('pay-local:create');await assert.rejects(fetchBank('starling',{accessToken:token}),/read-only/);
});
test('Malformed or missing totals, mismatched currency, duplicate accounts and invalid tokens fail without zero substitution',async t=>{
 assert.throws(()=>credentials('evil',{accessToken:token}));assert.throws(()=>credentials('monzo',{accessToken:'long-invalid\r\nHeader:x'}));let mode='missing';t.mock.method(global,'fetch',async url=>url.endsWith('whoami')?reply({authenticated:true}):url.endsWith('accounts')?reply({accounts:mode==='duplicates'?[{id:'acc_one'},{id:'acc_one'}]:[{id:'acc_one'}]}):reply({balance:1,total_balance:mode==='missing'?undefined:mode==='fraction'?1.2:100,currency:mode==='currency'?'XXX':'GBP'}));for(mode of ['missing','fraction','duplicates','currency'])await assert.rejects(fetchBank('monzo',{accessToken:token}));
});
test('Bank token renewal retains inclusion and account ID; expiry keeps cached balances; renderer and backups expose no token',async t=>{
 let expired=false;t.mock.method(global,'fetch',async url=>expired?{ok:false,status:401}:url.endsWith('whoami')?reply({authenticated:true}):url.endsWith('accounts')?reply({accounts:[{id:'acc_one'}]}):reply({balance:-2000,total_balance:-2000,currency:'GBP'}));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hardearner-banks-'));let c=createConnections({dir,safeStorage,openExternal:()=>{}});let v=await c.connectExchange('monzo',{accessToken:token});const id=v.connections[0].id;c.include(id,true);const h=linkedHoldings(c.view().connections);assert.equal(h[0].quantity,-20);assert.equal(portfolio(h,{fx:{GBP:.8,USD:1}},{}).total,-25);
 await c.connectExchange('monzo',{accessToken:token+'NEW'});assert.equal(c.view().connections[0].id,id);assert.equal(c.view().connections[0].included,true);assert(!JSON.stringify(c.view()).includes(token));assert(!fs.readFileSync(path.join(dir,'connections.encrypted')).includes(Buffer.from(token)));
 c=createConnections({dir,safeStorage,openExternal:()=>{}});expired=true;v=await c.sync(id);assert.equal(v.connections[0].balances[0].quantity,-20);assert.match(v.connections[0].error,/expired/);assert(!JSON.stringify(v).includes(token));
});
test('Failed renewal does not erase a working bank connection',async t=>{
 t.mock.method(global,'fetch',async(url,o)=>o.headers.Authorization.endsWith('BAD')?{ok:false,status:401}:url.endsWith('whoami')?reply({authenticated:true}):url.endsWith('accounts')?reply({accounts:[{id:'acc_one'}]}):reply({balance:100,total_balance:100,currency:'GBP'}));const c=createConnections({dir:fs.mkdtempSync(path.join(os.tmpdir(),'he-renew-')),safeStorage,openExternal:()=>{}});await c.connectExchange('monzo',{accessToken:token});const before=c.view();await assert.rejects(c.connectExchange('monzo',{accessToken:token+'BAD'}));assert.deepEqual(c.view(),before);
});
test('Version comparison and upgrade handoff exit the older instance, but ordinary relaunch only shows it',async()=>{
 assert(newer('2.4.0','2.3.9'));assert(!newer('2.4.0','2.4.0'));assert(!newer('invalid','2.3.0'));let listener,shown=0,quits=0,prepared=0;const app={getVersion:()=> '2.4.0',getPath:()=>fs.mkdtempSync(path.join(os.tmpdir(),'he-handoff-')),on:(_e,f)=>listener=f,requestSingleInstanceLock:data=>{assert.equal(data.hardearnerVersion,'2.4.0');return true},quit:()=>quits++};assert(await installHandoff(app,()=>shown++,()=>prepared++));listener(null,[],null,{hardearnerVersion:'2.4.0'});assert.equal(shown,1);assert.equal(quits,0);listener(null,[],null,{hardearnerVersion:'2.4.1'});assert.equal(quits,1);assert.equal(prepared,1);
});
