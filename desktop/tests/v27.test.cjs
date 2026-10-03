const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {checkpoint,activity}=require('../electron/purchase-tracking.cjs'),{linkedHoldings}=require('../electron/connections-view.cjs'),{reconcileLots}=require('../electron/transaction-ledger.cjs'),{normalize,fetchHistory}=require('../electron/kraken-history.cjs');
const t=Date.parse('2026-09-01T10:00:00Z'),day=86400000;
const buy=(id,time,quantity,paid,extra={})=>({id,time,base:'BTC',quote:'TRY',side:'BUY',quantity,paid,fee:0,feeAsset:'TRY',source:'Spot',...extra});
const balance=quantity=>({id:'Spot:BTC',asset:'BTC',type:'crypto',name:'Bitcoin',quantity,available:quantity});
const conn=(quantity,events=[])=>({id:'test',kind:'binancetr',included:true,label:'Binance TR',balances:quantity?[balance(quantity)]:[],lastSync:new Date(t).toISOString(),history:{events,complete:true,fx:{}}});
test('Unknown opening BTC never blocks two later purchases, nor fabricates its own cost/date',()=>{
 const c=conn(2);checkpoint(c);c.history.events=[buy('one',t+day,1,100),buy('two',t+2*day,2,200)];c.balances=[balance(5)];
 const h=linkedHoldings([c]);assert.equal(h.length,3);assert.deepEqual(h.map(x=>x.cost),[null,100,200]);assert.equal(h[0].purchaseDate,'');assert.equal(h[1].purchaseDate,'2026-09-02');assert.equal(h.reduce((s,x)=>s+x.quantity,0),5);const log=activity(c,'BTC');assert(log.opening);assert.equal(log.current.length,2);assert(log.matched);
});
test('Partial sale keeps original purchase logs and FIFO remaining costs; total sale starts a new period',()=>{
 const c=conn(3,[buy('one',t,1,100),buy('two',t+day,2,200)]);c.history.events.push(buy('partial',t+2*day,1,150,{side:'SELL'}));c.balances=[balance(2)];assert.deepEqual(linkedHoldings([c]).map(h=>h.cost),[200]);assert.equal(activity(c,'BTC').current.length,3);
 c.history.events.push(buy('sell',t+3*day,2,300,{side:'SELL'}),buy('new',t+4*day,1,175));c.balances=[balance(1)];const log=activity(c,'BTC');assert.equal(log.closed.length,1);assert.deepEqual(log.current.map(e=>e.id),['new']);assert.equal(log.closed[0].events.length,4);assert.equal(linkedHoldings([c])[0].cost,175);assert.equal(c.history.events.length,5);
});
test('Observed empty account resets unknown inventory without deleting history; repurchase uses fresh cost',()=>{
 const c=conn(2);checkpoint(c);const previous=c.balances;c.balances=[];c.lastSync=new Date(t+day).toISOString();checkpoint(c,previous);c.history.events=[buy('later',t+2*day,2,300)];c.balances=[balance(2)];assert.equal(linkedHoldings([c])[0].cost,300);assert.equal(activity(c,'BTC').current[0].id,'later');
});
test('Same-size sell and rebuy invalidates old manual acquisition; real imported cost wins',()=>{
 const c=conn(1);checkpoint(c);c.acquisitions={BTC:{quantity:1,cost:50,currency:'TRY',date:'2026-08-01',updatedAt:new Date(t).toISOString(),fx:{TRY:1}}};c.history.events=[buy('exit',t+day,1,100,{side:'SELL'}),buy('reenter',t+2*day,1,200)];c.lastSync=new Date(t+3*day).toISOString();checkpoint(c,[balance(1)]);assert(c.acquisitions.BTC.invalidatedAt);const h=linkedHoldings([c]);assert.equal(h[0].cost,200);assert.equal(h[0].manualAcquisition,false);
});
test('Unexplained deposits and failed history keep balance authoritative and do not invent reconciled costs',()=>{
 const c=conn(2);checkpoint(c);c.history.events=[buy('new',t+day,1,100)];c.balances=[balance(4)];assert.equal(reconcileLots(c).BTC.matched,false);assert.equal(linkedHoldings([c])[0].cost,null);c.balances=[balance(3)];c.history.complete=false;assert.equal(reconcileLots(c).BTC.matched,false);
});
const assets={XXBT:{altname:'XBT'},ZGBP:{altname:'GBP'}};
const ledger=(refid,asset,amount,fee='0',type='trade',time=t)=>({refid,asset,amount,fee,type,time:time/1000,subtype:'',aclass:'currency'});
test('Kraken ledger pairs use exact amounts, both fee assets and actual dates; deposits are not fake purchases',()=>{
 const p=normalize({a:ledger('buy','ZGBP','-100','1','spend'),b:ledger('buy','XXBT','2','0.01','receive'),d:ledger('deposit','ZGBP','500','0','deposit')},assets);assert.equal(p.events.length,1);assert.equal(p.events[0].source,'Instant Buy / Sell');const c=conn(1.99,p.events);assert.equal(linkedHoldings([c])[0].cost,101);assert.equal(linkedHoldings([c])[0].costCurrency,'GBP');assert.equal(linkedHoldings([c])[0].purchaseDate,'2026-09-01');
 const sale=normalize({a:ledger('sell','XXBT','-2'),b:ledger('sell','ZGBP','200','1')},assets).events[0];assert.equal(sale.side,'SELL');assert.equal(sale.base,'BTC');assert.equal(sale.paid,200);
});
test('Unpaired or unsupported Kraken ledgers are explicit, not inferred from current prices',()=>{
 assert.equal(normalize({a:ledger('unpaired','XXBT','1')},assets).issues.length,1);assert.throws(()=>normalize({a:ledger('bad','XXBT','NaN')},assets));assert.throws(()=>normalize({a:{...ledger('bad','XXBT','1'),subtype:'unknown'}},assets));
});
test('Kraken history authenticates only fixed read endpoints, paginates, deduplicates and resumes safely',async()=>{
 const c={apiKey:'fixture',apiSecret:Buffer.from('fixture-secret').toString('base64')},calls=[],records=Object.fromEntries(Array.from({length:26},(_,i)=>[[`a${i}`,ledger('trade'+i,'ZGBP','-100')],[`b${i}`,ledger('trade'+i,'XXBT','1')]]).flat());
 const fetcher=async(url,o)=>{const u=new URL(url);assert.equal(u.origin,'https://api.kraken.com');assert.equal(o.redirect,'error');let d;if(u.pathname.endsWith('/Assets'))d=assets;else{assert.equal(u.pathname,'/0/private/Ledgers');assert.equal(o.method,'POST');const p=new URLSearchParams(o.body),n=p.get('nonce'),digest=crypto.createHash('sha256').update(n+o.body).digest(),signature=crypto.createHmac('sha512',Buffer.from(c.apiSecret,'base64')).update(Buffer.concat([Buffer.from(u.pathname),digest])).digest('base64');assert.equal(o.headers['API-Sign'],signature);calls.push(Number(p.get('ofs')));d={ledger:Object.fromEntries(Object.entries(records).slice(Number(p.get('ofs')),Number(p.get('ofs'))+50)),count:52};}return{ok:true,json:async()=>({error:[],result:d})}};
 c.history=await fetchHistory(c,{fetcher,now:t+day});assert(c.history.complete);assert.equal(c.history.events.length,26);assert.deepEqual(calls,[0,50]);c.history=await fetchHistory(c,{fetcher,now:t+2*day});assert.equal(c.history.events.length,26);
});
test('Missing Kraken ledger permission and rate limits preserve previously imported purchases',async()=>{
 const c={apiKey:'fixture',apiSecret:Buffer.from('secret').toString('base64'),history:{events:[buy('old',t,1,100)],fx:{},ledgers:{}}};
 const h=await fetchHistory(c,{now:t+day,fetcher:async url=>({ok:true,json:async()=>url.endsWith('/Assets')?{error:[],result:assets}:{error:['EGeneral:Permission denied']}})});assert.equal(h.complete,false);assert.match(h.issues[0],/Query ledger entries/);assert.equal(h.events.length,1);
 let calls=0;const limited=await fetchHistory(c,{fetcher:async()=>{calls++;return{ok:false,status:429}}});assert.equal(calls,1);assert(limited.retryAt>Date.now());assert.equal(limited.events.length,1);
});
