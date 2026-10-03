const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {normalize,fetchHistory}=require('../electron/kraken-history.cjs');
const {linkedHoldings}=require('../electron/connections-view.cjs');
const {lotCost,reconcileLots}=require('../electron/transaction-ledger.cjs');
const {activity}=require('../electron/purchase-tracking.cjs');
const {createAnalysis,alertKey,alertConfig}=require('../electron/analysis.cjs');
const {createUsdQuotes,parseAlertTable}=require('../electron/alert-markets.cjs');
const time=Date.parse('2026-09-01T10:00:00Z');
const ledger=(refid,asset,amount,type='trade',extra={})=>({refid,asset,amount:String(amount),type,subtype:type==='trade'?'tradespot':'',fee:'0',aclass:'currency',time:time/1000,...extra});
const baseRows={a:ledger('buy','ZUSD',-200),b:ledger('buy','XXBT',2)};
const conn=parsed=>({id:'fixture',kind:'kraken',included:true,label:'Kraken',balances:[{id:'Spot:BTC',asset:'BTC',type:'crypto',quantity:2,available:2}],history:{...parsed,complete:!parsed.issues.length,coverageComplete:true,fx:{}}});
test('Kraken tradespot regression: actual subtype imports purchases rather than aborting the account',()=>{
 const c=conn(normalize(baseRows,{})),h=linkedHoldings([c]);assert.equal(h[0].cost,200);assert.equal(h[0].costCurrency,'USD');assert.equal(h[0].purchaseDate,'2026-09-01');assert.equal(activity(c,'BTC').current.length,1);
});
test('Malformed unrelated Kraken entries do not hide a valid reconciled asset',()=>{
 const c=conn(normalize({...baseRows,c:ledger('bad','XETH','NaN')},{},{tolerant:true}));assert.equal(c.history.complete,false);assert(c.history.assetIssues.ETH);assert.equal(linkedHoldings([c])[0].cost,200);
 c.history.assetIssues.BTC=['Missing record'];assert.equal(linkedHoldings([c])[0].cost,null);
});
test('Earn transfers cancel; rewards retain unknown cost without erasing actual purchases',()=>{
 const parsed=normalize({...baseRows,c:ledger('earn','XXBT',-1,'earn',{subtype:'allocation'}),d:ledger('earn','XXBT.B',1,'earn',{subtype:'allocation'}),e:ledger('reward','XXBT.F',.1,'earn',{subtype:'reward',time:time/1000+1})},{}),c=conn(parsed);c.balances[0].quantity=2.1;c.balances[0].available=2.1;
 assert.equal(parsed.movements.length,1);const h=linkedHoldings([c]);assert.equal(h.length,2);assert.equal(h[0].cost,200);assert.equal(h[1].cost,null);assert.equal(h[1].purchaseDate,'');assert.equal(activity(c,'BTC').current.at(-1).source,'Reward');
});
test('A full withdrawal closes the holding period and a repurchase starts a fresh log',()=>{
 const c=conn(normalize({...baseRows,c:ledger('out','XXBT',-2,'withdrawal',{time:time/1000+1}),d:ledger('again','ZUSD',-300,'trade',{time:time/1000+2}),e:ledger('again','XXBT',2,'trade',{time:time/1000+2})},{}));
 assert.equal(linkedHoldings([c])[0].cost,300);const log=activity(c,'BTC');assert.equal(log.closed.length,1);assert.equal(log.current.length,1);assert.equal(log.closed[0].events.at(-1).source,'Withdrawal');
});
test('Mixed currency cost uses each actual purchase date, not present-day FX or a stablecoin peg',()=>{
 const lot={parts:[{amount:100,currency:'GBP',date:'2026-09-01'},{amount:40,currency:'USD',date:'2026-09-02'}]};
 const h={fx:{'GBP:2026-09-01':{rates:{USD:1.25,TRY:50}},'USD:2026-09-02':{rates:{GBP:.8,TRY:40}}}};
 const c=lotCost(lot,h);assert.equal(c.cost,132);assert.equal(c.costCurrency,'GBP');assert.equal(c.cost*c.purchaseFx.USD,165);assert.equal(c.cost*c.purchaseFx.TRY,6600);delete h.fx['USD:2026-09-02'];assert.equal(lotCost(lot,h).cost,null);
});
test('Kraken v1 migration backfills old records and validates ledger pagination',async()=>{
 const c={apiKey:'fixture',apiSecret:Buffer.from('fixture').toString('base64'),history:{version:1,since:time,events:[],ledgers:{},fx:{},lastEnd:time}};let start;
 const h=await fetchHistory(c,{now:time+86400000,fetcher:async(url,o)=>{if(url.endsWith('/Ledgers'))start=Number(new URLSearchParams(o.body).get('start'));return{ok:true,json:async()=>({error:[],result:url.endsWith('/Assets')?{}:{ledger:baseRows,count:2}})}}});assert.equal(start,1483228799);assert(h.complete);assert.equal(h.events.length,1);
});
const table='BTC,82000,87500\nETH,2600,-\nSOL,114,-\nHYPE,88,-\nJUP,0.28,0.34\nPEPE,0.00000395,0.00000480\nDOGE,0.092,0.106\nNEAR,3.80,5.40\nXRP,1.46,1.66\nAAVE,138,-\nLINK,12.70,-\nSUI,0.95,-\nXLM,0.20,-\nBONK,0.00000320,-';
test('USD table matches all 20 user targets without rounding or currency substitution',()=>{
 const a=parseAlertTable(table);assert.equal(a.length,20);assert.equal(a.filter(a=>a.intent==='BUY').length,14);assert.equal(a.filter(a=>a.intent==='SELL').length,6);assert(a.every(a=>a.config.quote==='USD'&&a.config.venue==='kraken'));assert.equal(a.find(a=>a.config.asset==='PEPE'&&a.intent==='BUY').price,.00000395);assert.equal(parseAlertTable('BTC,,87500')[0].intent,'SELL');assert.equal(parseAlertTable('BTC\t\t87500')[0].intent,'SELL');assert.throws(()=>parseAlertTable('BTC,82,000,87,500'));assert.throws(()=>parseAlertTable('BTC,1,-\nBTC,1,-'));
});
test('Kraken USD quotes use one cached public snapshot and never substitute unavailable markets',async()=>{
 let calls=0;const quote=createUsdQuotes(async url=>{calls++;return{error:[],result:url.endsWith('AssetPairs')?{XXBTZUSD:{wsname:'XBT/USD',status:'online'},BTCUSDT:{wsname:'XBT/USDT',status:'online'}}:{XXBTZUSD:{c:['82000']}}}});
 const c={venue:'kraken',type:'crypto',asset:'BTC',quote:'USD'};assert.equal((await quote(c)).value,82000);assert.equal((await quote(c)).quote,'USD');assert.equal(calls,2);await assert.rejects(quote({...c,asset:'UNKNOWN'}));await assert.rejects(quote({...c,quote:'USDT'}));
 assert.notEqual(alertKey(c),alertKey({venue:'binance',type:'crypto',asset:'BTC',interval:'1m',style:'line'}));assert.throws(()=>alertConfig({venue:'binance',type:'crypto',asset:'BTC',quote:'USD',interval:'1m',style:'line'}),/currency/);
});
test('Batch alerts are atomic, duplicate-safe, encrypted, one-shot and retained after restart',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'he-211-alerts-')),safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s).map(b=>b^52),decryptString:b=>Buffer.from(b).map(v=>v^52).toString()},notices=[];
 const options={dir,safeStorage,notify:a=>notices.push(a),getQuote:async()=>({value:83000,at:Date.now()})};let a=createAnalysis(options);
 a.mutate('alerts',parseAlertTable(table));assert.equal(a.view().alerts.length,20);assert.throws(()=>a.mutate('alerts',parseAlertTable(table)),/already armed/);assert.equal(a.view().alerts.length,20);
 assert.throws(()=>a.mutate('alerts',[...parseAlertTable('BTC,1,-'),{config:{venue:'evil'}}]));assert.equal(a.view().alerts.length,20);
 await a.check();const count=notices.length;await a.check();assert.equal(notices.length,count);a=createAnalysis(options);assert.equal(a.view().alerts.length,20);await a.check();assert.equal(notices.length,count);assert(!fs.readFileSync(path.join(dir,'analysis.encrypted')).includes(Buffer.from('kraken')));
});

test('A large Binance pair catalogue leaves time for Convert and fiat imports, then resumes pairs',async()=>{
 const now=Date.now(),paths=[],c={apiKey:'fixture',apiSecret:'fixture',balances:[{asset:'BTC',quantity:1}]};
 const fetcher=async url=>{const u=new URL(url);paths.push(u.pathname);let d;
  if(u.pathname.endsWith('/time'))d={serverTime:now};else if(u.pathname.endsWith('/exchangeInfo'))d={symbols:Array.from({length:40},(_,i)=>({symbol:'BTCQ'+i,baseAsset:'BTC',quoteAsset:'Q'+i}))};else if(u.pathname.endsWith('/myTrades'))d=[];else if(u.pathname.endsWith('/tradeFlow'))d={list:[],moreData:false};else if(u.pathname.endsWith('/payments'))d={success:true,total:0,data:[]};else throw Error('Unexpected route');
  return{ok:true,json:async()=>d};};
 const fetchHistory=require('../electron/binance-history.cjs').fetchHistory;c.history=await fetchHistory(c,{fetcher,now});assert(!c.history.complete);assert(paths.includes('/sapi/v1/convert/tradeFlow'));assert(paths.includes('/sapi/v1/fiat/payments'));assert(paths.length<=48);
 c.history=await fetchHistory(c,{fetcher,now});assert.equal(c.history.pairsChecked,40);assert(c.history.complete);
});
