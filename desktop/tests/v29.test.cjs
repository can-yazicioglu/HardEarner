const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {observe}=require('../electron/account-movements.cjs');
const {RANGES,rangeStart,SECONDS}=require('../electron/chart-ranges.cjs');
const {config,chartKey,exchangeHistory}=require('../electron/analysis.cjs');
const {createConnections}=require('../electron/connections.cjs');
const b=(asset,quantity,extra={})=>({asset,quantity,...extra});
const c=()=>({id:'fixture',kind:'binance',label:'Fixture exchange',balances:[b('BTC',1)],coverage:[{wallet:'Spot',ok:true}]});
test('First sync is silent; deposits, full withdrawals and conversions produce signed notices exactly once',()=>{
 const a=c();assert.deepEqual(observe(a,1),[]);a.balances=[b('BTC',1.5)];let events=observe(a,2);assert.equal(events[0].direction,'in');assert.equal(events[0].amount,.5);assert.equal(events[0].since,1);assert.deepEqual(observe(a,3),[]);
 a.balances=[b('ETH',10)];events=observe(a,4);assert.deepEqual(events.map(e=>[e.asset,e.direction,e.amount]),[['BTC','out',1.5],['ETH','in',10]]);a.balances=[];assert.equal(observe(a,5)[0].amount,10);
});
test('Internal exchange wallet moves, order locks, market prices and floating point dust are not inflows',()=>{
 const a=c();observe(a);a.balances=[b('BTC',.25,{wallet:'Spot',available:.1}),b('BTC',.75,{wallet:'Earn locked',available:0})];assert.deepEqual(observe(a),[]);a.balances=[b('BTC',1+1e-14,{usd:99999})];assert.deepEqual(observe(a),[]);
});
test('Failed or partially covered reads preserve the good baseline; recovery compares once; sandbox is silent',()=>{
 const a=c();observe(a,1);a.balances=[];a.coverage=[{wallet:'Spot',ok:false}];assert.deepEqual(observe(a,2),[]);assert.equal(a.balanceWatch.at,1);a.coverage=[{wallet:'Spot',ok:true}];a.balances=[b('BTC',2)];assert.equal(observe(a,3)[0].amount,1);a.error='offline';a.balances=[];assert.deepEqual(observe(a,4),[]);a.error=null;a.sandbox=true;assert.deepEqual(observe(a,5),[]);
});
test('Separate bank accounts in the same currency retain individual inflows/outflows, including overdrafts',()=>{
 const a={id:'bank',kind:'monzo',label:'Monzo',balances:[b('GBP',100,{id:'a',name:'Current'}),b('GBP',50,{id:'b',name:'Joint'})]};observe(a,1);a.balances=[b('GBP',-20,{id:'a',name:'Current'}),b('GBP',170,{id:'b',name:'Joint'})];const events=observe(a,2);assert.deepEqual(events.map(e=>[e.account,e.direction,e.amount]),[['Current','out',120],['Joint','in',120]]);
});
test('Connection service saves before notifying, survives restart, keeps read status and honours device toggle',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'he-v29-')),safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s).map(b=>b^53),decryptString:b=>Buffer.from(b).map(v=>v^53).toString()};let quantity=10000,fail=false,notices=[];
 t.mock.method(global,'fetch',async url=>{if(fail)return{ok:false,status:500};const d=url.endsWith('whoami')?{authenticated:true}:url.endsWith('accounts')?{accounts:[{id:'acc_fixture',type:'uk_retail'}]}:{balance:quantity,total_balance:quantity,currency:'GBP'};return{ok:true,json:async()=>d}});
 const options={dir,safeStorage,notifyMovements:(events,device)=>{const stored=JSON.parse(require('../electron/encrypted-read.cjs').readEncrypted(path.join(dir,'connections.encrypted'),safeStorage).text);assert(stored.notifications.some(n=>n.id===events[0].id));notices.push({events,device})}};
 let service=createConnections(options);const id=(await service.connectExchange('monzo',{accessToken:'FIXTURE_ONLY_READ_TOKEN_123'})).connections[0].id;await service.sync(id);assert.equal(notices.length,0);quantity=15000;await service.sync(id);assert.equal(notices[0].events[0].amount,50);assert(notices[0].device);service.readNotifications([notices[0].events[0].id]);service.setMovementNotifications(false);
 service=createConnections(options);await service.sync(id);assert.equal(notices.length,1);assert(service.view().notifications[0].read);fail=true;await service.sync(id);assert.equal(notices.length,1);fail=false;quantity=0;await service.sync(id);assert.equal(notices.length,2);assert.equal(notices[1].events[0].amount,150);assert.equal(notices[1].device,false);assert(!JSON.stringify(service.view()).includes('FIXTURE_ONLY_READ_TOKEN'));
 service.disconnect(id);assert.deepEqual(service.view().notifications,[]);
});
test('Calendar chart ranges clamp month-end, handle leap years and keep drawing keys across display periods',()=>{
 const at=Date.parse('2024-03-31T12:00:00Z');assert.equal(new Date(rangeStart('1M',at)*1000).toISOString(),'2024-02-29T12:00:00.000Z');assert.equal(new Date(rangeStart('1Y',Date.parse('2024-02-29T12:00Z'))*1000).toISOString(),'2023-02-28T12:00:00.000Z');assert.equal(rangeStart('2W',at),(at-14*86400000)/1000);
 const base={venue:'binance',type:'crypto',asset:'BTC',interval:'1h',style:'candles'};assert.equal(chartKey(config({...base,range:'1W'})),chartKey(config({...base,range:'2W'})));assert.equal(config({...base,range:'1Y'}).interval,'1d');assert.throws(()=>config({...base,range:'infinite'}));assert.equal(config({...base,venue:'reference',type:'metal',asset:'XAU',range:'1Y'}).interval,'1d');
});
test('All six Binance periods have real candles spanning their range with bounded reads',async()=>{
 const now=Date.parse('2026-09-24T12:00Z');
 for(const range of Object.keys(RANGES)){
  const c=config({venue:'binance',type:'crypto',asset:'BTC',interval:'1h',style:'candles',range});const d=await exchangeHistory(c,{now,requester:async url=>{const u=new URL(url);assert.equal(u.origin,'https://api.binance.com');assert.equal(u.pathname,'/api/v3/klines');const step=SECONDS[c.interval],last=Math.floor(now/1000/step)*step;return Array.from({length:500},(_,i)=>[(last-(499-i)*step)*1000,10,12,9,11,1])}});assert(d.bars[0].time<=rangeStart(range,now));assert(d.bars.length<=600);assert.equal(d.bars.at(-1).close,11);
 }
});
test('OKX annual history paginates backwards beyond 300 candles, then reuses old data on refresh',async()=>{
 const now=Date.parse('2026-09-24T12:00Z'),step=86400,last=Math.floor(now/1000/step)*step,all=Array.from({length:700},(_,i)=>[(last-i*step)*1000,10,12,9,11,1]);let historyCalls=0;
 const c=config({venue:'okx',type:'crypto',asset:'BTC',interval:'1h',style:'candles',range:'1Y'});
 const requester=async url=>{const u=new URL(url);assert.equal(u.origin,'https://www.okx.com');assert.equal(u.searchParams.get('bar'),'1Dutc');const after=Number(u.searchParams.get('after'));if(after)historyCalls++;return{code:'0',data:all.filter(r=>!after||r[0]<after).slice(0,Number(u.searchParams.get('limit')))}};
 const d=await exchangeHistory(c,{now,requester});assert(historyCalls>=2);assert(d.bars[0].time<=rangeStart('1Y',now));const calls=historyCalls;const refreshed=await exchangeHistory(c,{now:now+60000,requester,prior:d.bars});assert.equal(historyCalls,calls);assert.equal(refreshed.bars.at(-1).close,11);
});
test('New listings do not fabricate a year; broken pagination fails explicitly',async()=>{
 const now=Date.now(),c=config({venue:'okx',type:'crypto',asset:'BTC',interval:'1d',style:'candles',range:'1Y'}),rows=[[now-100000,1,2,.5,1,5]];
 const d=await exchangeHistory(c,{now,requester:async url=>({code:'0',data:url.includes('history-candles')?[]:rows})});assert.equal(d.bars.length,1);await assert.rejects(exchangeHistory(c,{now,requester:async()=>({code:'0',data:rows})}),/Older chart history/);
});

test('Kraken invalid credentials are actionable and never replaced by stale success',async t=>{
 t.mock.method(global,'fetch',async()=>({ok:true,json:async()=>({error:['EAPI:Invalid key']})}));
 await assert.rejects(require('../electron/exchange-adapters.cjs').fetchExchange('kraken',{apiKey:'fixture-key',apiSecret:Buffer.from('fixture-secret').toString('base64')}),/rejected this API key/);
});
