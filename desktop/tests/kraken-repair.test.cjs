const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const auth=require('../electron/kraken-auth.cjs'),{createConnections}=require('../electron/connections.cjs');
const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s).map(b=>b^53),decryptString:b=>Buffer.from(b).map(v=>v^53).toString()};
const creds={apiKey:'old-fixture-key',apiSecret:Buffer.from('old-fixture-secret').toString('base64')};
function fixture(extra={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'he-kraken-repair-')),file=path.join(dir,'connections.encrypted');
 const c={id:'same-id',kind:'kraken',label:'Kraken',...creds,balances:[{id:'Spot:XXBT',asset:'BTC',quantity:1,available:1,type:'crypto'}],included:true,inclusionDecision:'included',lastSync:'2026-09-23T12:00:00Z',history:{events:[],fx:{},ledgers:{},complete:true},tracking:{sentinel:'keep'},acquisitions:{BTC:{sentinel:'keep'}},...extra};
 fs.writeFileSync(file,safeStorage.encryptString(JSON.stringify({connections:[c],notifications:[{id:'notice',connectionId:c.id}]})));
 return {dir,file,options:{dir,safeStorage},read:()=>JSON.parse(require('../electron/encrypted-read.cjs').readEncrypted(file,safeStorage).text)};
}
const reply=d=>({ok:true,status:200,json:async()=>d});
const goodFetch=async url=>reply(url.endsWith('/GetApiKeyInfo')?{error:[],result:{permissions:['query-funds','query-ledger']}}:url.endsWith('/BalanceEx')?{error:[],result:{XXBT:{balance:'2',hold_trade:'0'}}}:url.endsWith('/Assets')?{error:[],result:{XXBT:{altname:'XBT'}}}:{error:[],result:{ledger:{},count:0}});

test('Signing matches Kraken published authentication example without sending any request',()=>{
 const nonce='1616492376594',body='nonce=1616492376594&ordertype=limit&pair=XBTUSD&price=37500&type=buy&volume=1.25';
 const exampleSecret='kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg=='; // gitleaks:allow -- public test vector: https://docs.kraken.com/exchange/guides/rest/authentication
 assert.equal(auth.sign('/0/private/AddOrder',nonce,body,exampleSecret),'4/dpxb3iT4tp/ZCVEwSnEsLxx0bqyhLpdfOpc6fn7OR8+UClSV5n9E6aSS8MPtnRfp32bAb0nmbRn6H8ndwLUQ==');
});
test('Invalid key stops automatic retries across restart; deliberate retry can recover the same key',async t=>{
 const f=fixture(),options=f.options;let now=Date.now(),calls=0,fail=true;t.mock.method(Date,'now',()=>now);
 t.mock.method(global,'fetch',async url=>{calls++;return fail?reply({error:['EAPI:Invalid key']}):goodFetch(url)});
 let service=createConnections(options);await service.sync('same-id');assert.equal(calls,1);assert(service.view().connections[0].retry.paused);assert.equal(service.view().connections[0].balances[0].quantity,1);
 now+=2*60000;service=createConnections(options);await service.sync('same-id',{automatic:true});assert.equal(calls,1);fail=false;await service.sync('same-id');assert(calls>1);assert.equal(service.view().connections[0].error,null);assert.equal(service.view().connections[0].retry,undefined);assert.equal(f.read().connections[0].apiKey,creds.apiKey);
});
test('Lockout blocks both scheduled and manual reads for twenty minutes, including after restart',async t=>{
 const f=fixture();let now=Date.now(),calls=0;t.mock.method(Date,'now',()=>now);t.mock.method(global,'fetch',async()=>{calls++;return reply({error:['EGeneral:Temporary lockout']})});
 let service=createConnections(f.options);await service.sync('same-id');assert.equal(calls,1);assert.equal(service.view().connections[0].retry.notBefore,now+20*60000);
 now+=19*60000;service=createConnections(f.options);await service.sync('same-id');await service.sync('same-id',{automatic:true});assert.equal(calls,1);
 await assert.rejects(service.replaceKrakenKey('same-id',{...creds,sameAccount:true}),/retry time/);assert.equal(calls,1);
 now+=2*60000;await service.sync('same-id',{automatic:true});assert.equal(calls,2);
});
test('Old vague Kraken errors require a deliberate retry; other exchanges are not paused',()=>{
 assert(auth.blocked({kind:'kraken',error:'old generic failure'},true));assert(!auth.blocked({kind:'kraken',error:'old generic failure'},false));assert(!auth.blocked({kind:'binance',error:'failed'},true));
 assert.equal(auth.responseError(['Secret-looking untrusted response']),null);
});
test('Failed replacement and unsafe write permissions preserve existing credentials, balances and lots',async t=>{
 const f=fixture(),service=createConnections(f.options),before=fs.readFileSync(f.file);let write=false;
 t.mock.method(global,'fetch',async()=>reply(write?{error:[],result:{permissions:['query-funds','withdraw-funds']}}:{error:['EAPI:Invalid key']}));
 const input={apiKey:'new-fixture-key',apiSecret:Buffer.from('new-fixture-secret').toString('base64'),sameAccount:true};
 await assert.rejects(service.replaceKrakenKey('same-id',{...input,sameAccount:false}),/same connected account/);
 await assert.rejects(service.replaceKrakenKey('same-id',input),/rejected this API key/);write=true;await assert.rejects(service.replaceKrakenKey('same-id',input),/read permissions/);
 assert(fs.readFileSync(f.file).equals(before));
});
test('Verified replacement keeps connection identity, history, acquisition details, inclusion and notifications',async t=>{
 const f=fixture({error:'old error'}),service=createConnections(f.options),before=f.read().connections[0];t.mock.method(global,'fetch',goodFetch);
 const input={apiKey:'new-fixture-key',apiSecret:Buffer.from('new-fixture-secret').toString('base64'),sameAccount:true};
 const view=await service.replaceKrakenKey('same-id',input),after=f.read().connections[0];
 assert.equal(after.apiKey,input.apiKey);assert.equal(after.apiSecret,input.apiSecret);for(const field of ['id','tracking','history','acquisitions','included','inclusionDecision'])assert.deepEqual(after[field],before[field]);
 assert.equal(after.balances[0].quantity,2);assert.equal(after.error,null);assert.equal(view.notifications.length,1);assert(!JSON.stringify(view).includes('fixture-key'));assert(!JSON.stringify(view).includes(input.apiSecret));
});
test('Concurrent sync joins a key replacement; disconnect during validation never resurrects it',async t=>{
 const f=fixture(),service=createConnections(f.options);let resolve,started,calls=0;const ready=new Promise(r=>started=r);
 t.mock.method(global,'fetch',async url=>{calls++;if(url.endsWith('GetApiKeyInfo')){started();await new Promise(r=>resolve=r)}return goodFetch(url)});
 const promise=service.replaceKrakenKey('same-id',{...creds,sameAccount:true});await ready;const sync=service.sync('same-id');assert.equal(calls,1);service.disconnect('same-id');resolve();await assert.rejects(promise,/not found/);await assert.rejects(sync,/not found/);assert.equal(service.view().connections.length,0);
});
test('Authentication failure during history import also pauses repeated private requests',async t=>{
 const f=fixture(),service=createConnections(f.options);let calls=0;t.mock.method(global,'fetch',async url=>{calls++;return url.endsWith('/Ledgers')?reply({error:['EGeneral:Temporary lockout']}):goodFetch(url)});
 await service.sync('same-id');const c=service.view().connections[0];assert.equal(c.retry.code,'EGeneral:Temporary lockout');assert.equal(c.history.complete,false);const count=calls;await service.sync('same-id',{automatic:true});assert.equal(calls,count);
});

for(const kind of ['binancetr','okx'])test('Manage safely replaces '+kind+' credentials without resetting the account',async t=>{
 const f=fixture({kind,label:kind}),service=createConnections(f.options),before=f.read().connections[0];let fail=true;
 t.mock.method(global,'fetch',async url=>{
  if(fail)return reply({code:'REFUSED'});
  if(kind==='binancetr')return reply({code:0,data:{accountAssets:[{asset:'BTC',free:'2',locked:'0'}]}});
  return reply({code:'0',data:url.endsWith('/config')?[{perm:'read_only',acctLv:'1'}]:url.endsWith('/balance')?[{details:[{ccy:'BTC',cashBal:'2',availBal:'2'}]}]:[]});
 });
 const input={apiKey:'new-fixture-key',apiSecret:'new-fixture-secret',passphrase:'fixture-passphrase',region:'eea',sameAccount:true};
 await assert.rejects(service.replaceExchangeKey('same-id',input));assert.deepEqual(f.read().connections[0],before);
 fail=false;await service.replaceExchangeKey('same-id',input);const after=f.read().connections[0];assert.equal(after.apiKey,input.apiKey);assert.equal(after.balances[0].quantity,2);
 for(const field of ['id','tracking','history','acquisitions','included','inclusionDecision'])assert.deepEqual(after[field],before[field]);
 assert.equal(createConnections(f.options).view().connections.length,1);assert(!JSON.stringify(service.view()).includes('new-fixture'));
});
