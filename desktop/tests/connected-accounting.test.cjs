const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {linkedHoldings,createConnections,assertReadOnly}=require('../electron/connections.cjs');
const {portfolio,DEFAULT}=require('../electron/domain.cjs');
const {fetchHistory,spot,convert,fiat,parseJSON}=require('../electron/binance-history.cjs');
const {backup}=require('../electron/upgrade-backup.cjs');
const time=Date.parse('2026-09-01T10:00:00Z');
const buy=(id,quantity,paid,extra={})=>({id,source:'Spot',base:'BTC',quote:'TRY',quantity,paid,side:'BUY',fee:0,feeAsset:'TRY',time,...extra});
const balance=(asset,quantity,extra={})=>({id:asset,asset,name:asset,type:'crypto',quantity,available:quantity,wallet:'Spot',...extra});
const connection=(events,balances,extra={})=>({id:'fixture',kind:'binance',included:true,label:'Binance.com',balances,history:{events,complete:true,fx:{},since:time},...extra});
const market={fx:{USD:1,TRY:40,GBP:.8},crypto:{BTC:{usd:10,bidUSD:9},USDT:{usd:1}}};
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('TRY buys automatically produce dated remaining lots and FIFO costs after a partial sale',()=>{
 const c=connection([buy('a',2,200),buy('b',2,300,{time:time+1000}),buy('c',1,180,{time:time+2000,side:'SELL'})],[balance('BTC',3)]);
 const h=linkedHoldings([c]);assert.equal(h.length,2);near(h[0].cost,100);near(h[1].cost,300);assert.equal(h[0].purchaseDate,'2026-09-01');
 const p=portfolio(h,market,DEFAULT.settings,'TRY');near(p.total,1200);near(p.cost,400);near(p.sell,1080);near(p.saleGain,680);
 assert.equal(c.history.events[0].quantity,2);assert.equal(c.balances[0].quantity,3);
});
test('Base/quote commissions reduce quantity or increase actual purchase cost; unknown third-token fees do not invent basis',()=>{
 let h=linkedHoldings([connection([buy('a',2,200,{fee:.1,feeAsset:'BTC'})],[balance('BTC',1.9)])]);near(h[0].quantity,1.9);near(h[0].cost,200);
 h=linkedHoldings([connection([buy('a',2,200,{fee:2})],[balance('BTC',2)])]);near(h[0].cost,202);
 h=linkedHoldings([connection([buy('a',2,200,{fee:.1,feeAsset:'BNB'})],[balance('BTC',2)])]);assert.equal(h[0].cost,null);assert(h[0].purchaseDate);
});
test('TRY to USDT to coin retains funded capital and original FX dates, without treating USDT as USD',()=>{
 const c=connection([buy('fund',100,4000,{base:'USDT'}),buy('coin',2,60,{quote:'USDT',time:time+86400000})],[balance('BTC',2),balance('USDT',40)]);
 c.history.fx={'TRY:2026-09-01':{rates:{TRY:1,USD:.025,GBP:.02},date:'2026-09-01'}};
 const h=linkedHoldings([c]);near(h[0].cost,2400);near(h[1].cost,1600);near(portfolio(h,market,DEFAULT.settings,'USD').cost,100);assert.equal(h[0].purchaseDate,'2026-09-02');
 const unknown=linkedHoldings([connection([buy('coin',2,60,{quote:'USDT'})],[balance('BTC',2)])]);assert.equal(unknown[0].cost,null);
});
test('Wallet allocations preserve quantities and costs once; Earn is wealth and not a false 100% loss',()=>{
 const c=connection([buy('a',2,200)],[balance('BTC',.5),balance('BTC',1.5,{id:'Earn:BTC',wallet:'Earn flexible',available:0})]);
 const h=linkedHoldings([c]),p=portfolio(h,market,DEFAULT.settings,'TRY');near(p.total,800);near(p.cost,200);near(p.sell,180);near(p.saleGain,130);assert.equal(p.rows[1].saleGain,null);near(p.rows[1].gain,450);assert.equal(new Set(h.map(x=>x.id)).size,h.length);
});
test('Incomplete, rewarded, transferred and stale wallet quantities stay valued with unknown costs',()=>{
 for(const change of [c=>c.balances[0].quantity=3,c=>c.history.complete=false,c=>c.coverage=[{wallet:'Earn',ok:false}]]){const c=connection([buy('a',2,200)],[balance('BTC',2)]);change(c);const h=linkedHoldings([c]);assert.equal(h[0].cost,null);assert.equal(h[0].quantity,c.balances[0].quantity);assert.equal(h[0].purchaseDate,'');assert(h[0].costStatus)}
});
test('Native migration includes crypto alongside manual gold, avoids duplicates and remembers intentional exclusion',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hardearner-inclusion-')),safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()};
 const c=connection([],[balance('BTC',1)],{included:false});fs.writeFileSync(path.join(dir,'connections.encrypted'),JSON.stringify({connections:[c]}));
 let manual=[{asset:'XAU',type:'metal',quantity:1}];const create=()=>createConnections({dir,safeStorage,getHoldings:()=>manual});let service=create();assert.equal(service.view().connections[0].included,true);
 service.include(c.id,false);service=create();assert.equal(service.view().connections[0].included,false);
 fs.writeFileSync(path.join(dir,'connections.encrypted'),JSON.stringify({connections:[c]}));manual=[{asset:'BTC',type:'crypto',quantity:1}];service=create();assert.equal(service.view().connections[0].included,false);manual[0].excluded=true;service.reconcile();assert.equal(service.view().connections[0].included,true);
});
test('Source parsers retain 64-bit IDs, exact symbols, fees and BUY/SELL; malformed values fail',()=>{
 assert.equal(parseJSON('{"orderId":940708407462087200,"text":"940708407462087200"}').orderId,'940708407462087200');
 const p={symbol:'BTCTRY',baseAsset:'BTC',quoteAsset:'TRY'},r={symbol:'BTCTRY',id:123,qty:'2',quoteQty:'200',isBuyer:true,commission:'1',commissionAsset:'TRY',time};
 assert.equal(spot(r,p).paid,200);for(const bad of [{id:null},{id:9007199254740992},{qty:' '},{commission:'-1'},{time:0},{symbol:'BTCUSDT'}])assert.throws(()=>spot({...r,...bad},p));
 assert.equal(convert({orderStatus:'FAILED'}),null);assert.equal(fiat({status:'Failed'},'0'),null);
 assert.equal(fiat({status:'Completed',orderNo:'1',cryptoCurrency:'USDT',fiatCurrency:'TRY',sourceAmount:'400',obtainAmount:'10',totalFee:'2',createTime:time},'0').feeIncluded,true);
 assert.throws(()=>assertReadOnly({enableReading:true,permitsUniversalTransfer:true}),/read-only/);
});
test('Newly discovered wallet overlaps are reviewed, while explicit user inclusion is preserved',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hardearner-later-overlap-')),safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()};
 const c=connection([],[balance('BTC',1,{wallet:'Funding'})],{included:true,inclusionDecision:'automatic'});fs.writeFileSync(path.join(dir,'connections.encrypted'),JSON.stringify({connections:[c]}));
 const service=createConnections({dir,safeStorage,getHoldings:()=>[{asset:'BTC',type:'crypto',quantity:1}]});assert.equal(service.view().connections[0].included,false);service.include(c.id,true);service.reconcile();assert.equal(service.view().connections[0].included,true);
});
test('History import uses signed read endpoints, resumes IDs, deduplicates and preserves saved history on API errors',async()=>{
 const calls=[],c={apiKey:'fixture-key',apiSecret:'fixture-secret',balances:[balance('BTC',2)]},now=time+86400000;
 const fetcher=async(url,o)=>{const u=new URL(url);calls.push(u);assert(!url.includes(c.apiSecret));assert.equal(o.redirect,'error');if(!u.pathname.endsWith('/time')&&!u.pathname.endsWith('/exchangeInfo')){assert.equal(o.headers['X-MBX-APIKEY'],c.apiKey);assert(u.searchParams.has('signature'))}let d;
  if(u.pathname.endsWith('/time'))d={serverTime:now};else if(u.pathname.endsWith('/exchangeInfo'))d={symbols:[{symbol:'BTCTRY',baseAsset:'BTC',quoteAsset:'TRY'}]};else if(u.pathname.endsWith('/myTrades'))d=u.searchParams.get('fromId')==='0'?[{symbol:'BTCTRY',id:5,qty:'2',quoteQty:'200',commission:'0',commissionAsset:'TRY',time,isBuyer:true}]:[];else if(u.pathname.endsWith('/tradeFlow'))d={list:[],moreData:false};else d={success:true,total:0};return{ok:true,text:async()=>JSON.stringify(d)};
 };
 c.history=await fetchHistory(c,{fetcher,now});assert.equal(c.history.events.length,1);assert.equal(c.history.complete,true);assert.equal(c.history.pairs.BTCTRY.next,'6');
 c.history=await fetchHistory(c,{fetcher,now:now+600000});assert.equal(c.history.events.length,1);assert(calls.some(u=>u.searchParams.get('fromId')==='6'));
 const h=await fetchHistory(c,{now:now+1200000,fetcher:async()=>{throw Error('private upstream text')}});assert.equal(h.complete,false);assert.equal(h.events.length,1);assert(!JSON.stringify(h).includes('private upstream text'));
});
test('Rate limits stop calls and retain cursor/history for retry',async()=>{
 let count=0;const c={apiKey:'a',apiSecret:'b',balances:[],history:{events:[buy('a',1,100)],fx:{},pairs:{},windows:{},since:time}};
 const h=await fetchHistory(c,{now:time+86400000,fetcher:async()=>{count++;return{ok:false,status:429,headers:{get:()=>120}}}});assert.equal(count,1);assert.equal(h.events.length,1);assert.equal(h.complete,false);assert(h.retryAt>Date.now());
});
test('Upgrade backup keeps paired ciphertext once and never replaces original recovery copies',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hardearner-backup-'));fs.writeFileSync(path.join(dir,'connections.encrypted'),'encrypted-original');fs.writeFileSync(path.join(dir,'Local State'),'envelope-original');backup(dir);fs.writeFileSync(path.join(dir,'connections.encrypted'),'changed');backup(dir);assert.equal(fs.readFileSync(path.join(dir,'recovery/before-v2.5/connections.encrypted'),'utf8'),'encrypted-original');assert.equal(fs.readFileSync(path.join(dir,'recovery/before-v2.5/Local State'),'utf8'),'envelope-original');
});
