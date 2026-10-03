const {test}=require('node:test'),assert=require('node:assert/strict');
const {project,matchTransfers}=require('../electron/portfolio-ledger.cjs');
const {linkedHoldings}=require('../electron/connections-view.cjs');
const {normalize,withFunding,fetchFunding}=require('../electron/funding-history.cjs');
const {historicalUSD,enrich,key}=require('../electron/history-values.cjs');
const T=Date.parse('2026-09-01T10:00:00Z'),at=n=>T+n*60000;
const bal=(asset,quantity)=>({id:asset,asset,quantity,available:quantity,type:asset==='USD'||asset==='TRY'?'cash':'crypto'});
const buy=(id,base,quote,quantity,paid,n,extra={})=>({id,base,quote,quantity,paid,time:at(n),source:'Convert',side:'BUY',fee:0,feeAsset:quote,...extra});
const movement=(id,asset,delta,n,extra={})=>({id,asset,delta,time:at(n),source:delta>0?'Deposit':'Withdrawal',...extra});
function c(id,balances,events=[],movements=[]){return{id,label:id,included:true,balances,history:{accountingVersion:2,complete:true,events,movements,fx:{'TRY:2026-09-01':{rates:{TRY:1,USD:.025,GBP:.02}},'USD:2026-09-01':{rates:{USD:1,TRY:40,GBP:.8}}},usdPrices:{}}}}
function price(c,a,n,p){c.history.usdPrices[key(a,at(n))]={price:p,estimated:true};return c}
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('TRY capital follows USDT transfer and ONDO conversion, with dates, fees and no double count',()=>{
 const a=c('Binance TR',[],[buy('convert','USDT','TRY',500,20000,1)],[movement('deposit','TRY',20000,0),movement('out','USDT',-500,2,{txid:'0xabc',fee:1,netQuantity:499,network:'ERC20'})]);
 const b=price(c('Kraken',[bal('ONDO',998)], [buy('ondo','ONDO','USDT',998,498,4,{fee:1})],[movement('in','USDT',499,3,{txid:'abc',network:'Ethereum'})]),'USDT',4,1.001);
 const h=linkedHoldings([a,b]);assert.equal(h.length,1);near(h[0].cost,20000);near(h[0].cost*h[0].purchaseFx.USD,500);assert.equal(h[0].purchaseTime,at(4));assert.equal(h[0].entryEstimate,false);
 assert.deepEqual(h[0].provenance.map(p=>p.kind),['entry','trade','transfer','trade']);near(h[0].provenance.at(-1).valueUSD,498.498);near(h[0].provenance.at(-1).unitUSD,498.498/998);
 assert.equal(project([a,b]).transfers.length,1);assert.deepEqual(linkedHoldings([a,b]),h);
});
test('$20,000 SOL lot preserves original date and cost after a transfer fee',()=>{
 const a=c('Binance',[],[buy('buy','SOL','USD',200,20000,0)],[movement('out','SOL',-200,1,{txid:'tx',fee:1,netQuantity:199})]);
 const b=c('Kraken',[bal('SOL',199)],[],[movement('in','SOL',199,2,{txid:'tx'})]);const h=linkedHoldings([a,b]);near(h[0].cost,20000);assert.equal(h[0].purchaseTime,at(0));assert.equal(h[0].provenance.at(-1).from,'Binance');
});
test('BTC conversion distinguishes original invested capital from USD market value at conversion',()=>{
 const a=price(c('Kraken',[bal('ONDO',1000)],[buy('btc','BTC','USD',.01,500,0),buy('ondo','ONDO','BTC',1000,.01,2)]),'BTC',2,80000);
 const h=linkedHoldings([a])[0];near(h.cost,500);near(h.provenance.at(-1).valueUSD,800);near(h.provenance.at(-1).unitUSD,.8);assert.equal(h.provenance.at(-1).currency,'BTC');
});
test('External deposit has USD entry baseline and no invented original purchase date',()=>{
 const a=price(c('Kraken',[bal('SOL',2)],[],[movement('dep','SOL',2,0)]),'SOL',0,100);const h=linkedHoldings([a])[0];near(h.cost,200);assert.equal(h.purchaseDate,'');assert.equal(h.entryEstimate,true);
 delete a.history.usdPrices;assert.equal(linkedHoldings([a])[0].cost,null);
});

test('User-entered purchase evidence overrides an estimated external-entry baseline',()=>{
 const a=price(c('Kraken',[bal('SOL',2)],[],[movement('dep','SOL',2,0)]),'SOL',0,100);a.acquisitions={SOL:{quantity:2,cost:150,currency:'USD',date:'2026-08-01',fx:{USD:1,TRY:40,GBP:.8}}};const h=linkedHoldings([a])[0];near(h.cost,150);assert.equal(h.manualAcquisition,true);assert.equal(h.entryEstimate,false);
});
test('Transfer matching rejects ambiguous, different-network and amount-only candidates',()=>{
 const a=c('a',[],[],[movement('out','USDT',-10,0,{txid:'a',network:'ERC20'})]);const b=c('b',[],[],[movement('in','USDT',10,1,{txid:'a',network:'TRC20'})]);assert.equal(matchTransfers([a,b]).size,0);
 b.history.movements[0].network='ETH';assert.equal(matchTransfers([a,b]).size,1);assert.equal(matchTransfers([a,b,{...b,id:'c'}]).size,0);delete b.history.movements[0].txid;assert.equal(matchTransfers([a,b]).size,0);
});
test('Partial sales consume oldest capital, third-asset fees are accounted and histories remain immutable',()=>{
 const a=c('a',[bal('BTC',1)], [buy('a','BTC','USD',1,100,0),buy('b','BTC','USD',1,200,1),buy('fee','BNB','USD',1,5,2),buy('sale','BTC','USD',1,300,3,{side:'SELL',fee:1,feeAsset:'BNB'})]);
 const original=structuredClone(a);const h=linkedHoldings([a]);near(h[0].cost,200);assert.deepEqual(a,original);
});
test('Missing older acquisition gets a stable opening baseline and never overwrites authoritative quantities',()=>{
 const a=price(c('a',[bal('BTC',2)],[]),'BTC',0,100);a.tracking={at:at(0),lots:[{asset:'BTC',quantity:2,parts:null}]};let h=linkedHoldings([a]);near(h[0].cost,200);assert.equal(h[0].purchaseDate,'');
 a.balances=[bal('BTC',3)];h=linkedHoldings([a]);assert.equal(h[0].quantity,3);assert.equal(h[0].cost,null);
});
test('Incomplete/cached balances cannot acquire a fabricated known capital total',()=>{
 const a=c('a',[bal('BTC',1)],[buy('b','BTC','USD',1,100,0)]);a.coverage=[{ok:false}];assert.equal(linkedHoldings([a])[0].cost,null);delete a.coverage;a.history.complete=false;assert.equal(linkedHoldings([a])[0].cost,null);
});
test('Funding normalization distinguishes withdrawal fee semantics and preserves ISO offsets',()=>{
 const row={id:'7',status:10,asset:'USDT',amount:'430.682865',fee:'.1',createTime:'2026-09-01T13:00:00+03:00'};const tr=normalize('binancetr',row,'withdrawal');near(tr.delta,-430.682865);near(tr.netQuantity,430.582865);assert.equal(tr.time,T);
 const b=normalize('binance',{...row,status:6},'withdrawal');near(b.delta,-430.782865);near(b.netQuantity,430.682865);assert.equal(normalize('binancetr',{...row,status:0},'withdrawal'),null);assert.throws(()=>normalize('binancetr',{...row,amount:'NaN'},'withdrawal'));
});
test('Funding augments Kraken ledger instead of counting the deposit twice',()=>{
 const a={kind:'kraken',funding:{records:[{refid:'ref',asset:'BTC',txid:'tx'}]}};const h=withFunding(a,{movements:[{id:'kraken:ref:x',asset:'BTC',delta:1}],events:[]});assert.equal(h.movements.length,1);assert.equal(h.movements[0].txid,'tx');
});
test('Rate limit stops funding requests and keeps previously imported records',async()=>{
 let calls=0;const a={kind:'kraken',apiKey:'fake',apiSecret:Buffer.from('fake').toString('base64'),funding:{records:[{refid:'keep',direction:'deposit',time:T}]}};
 const h=await fetchFunding(a,{now:at(10),fetcher:async()=>{calls++;return{ok:false,status:429,headers:{get:()=> '600'}}}});assert.equal(calls,1);assert.equal(h.records.length,1);assert.equal(h.complete,false);assert.equal(h.retryAt,at(10)+600000);
});
test('Historical prices use the exact minute, reject missing candles and never peg stablecoins to $1',async()=>{
 const p=await historicalUSD('USDT',T,{fetcher:async()=>({ok:true,json:async()=>[[T/1000,0,0,0,.98]]})});near(p.price,.98);assert.equal(p.estimated,true);
 await assert.rejects(()=>historicalUSD('USDT',T,{fetcher:async()=>({ok:true,json:async()=>[[T/1000-60,0,0,0,1]]})}),/No historical/);
 const a=c('a',[],[],[movement('d','SOL',1,0)]);let count=0;await enrich(a,{now:T,fetcher:async()=>{count++;throw Error('no price')},costRates:async()=>({rates:{USD:1,TRY:40,GBP:.8}})});await enrich(a,{now:T+10,fetcher:async()=>{count++;throw Error('no price')}});assert.equal(count,1);
});
