const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalize}=require('../electron/kraken-history.cjs'),{convert,fetchHistory}=require('../electron/binance-history.cjs'),{isConversion,flow,reconcileLots,lotCost}=require('../electron/transaction-ledger.cjs'),{activity}=require('../electron/purchase-tracking.cjs');
const t=Date.parse('2026-09-01T10:00:00Z'),day=86400000;
const buy={id:'buy',source:'Spot',base:'BTC',quote:'TRY',side:'BUY',quantity:1,paid:100,fee:0,feeAsset:'TRY',time:t};
const row=(asset,amount,fee='0',type='adjustment')=>({refid:'swap',asset,amount,fee,type,subtype:'',aclass:'currency',time:(t+day)/1000});
const balance=(asset,quantity)=>({asset,quantity});
test('Kraken paired conversion adjustment tracks both coins and both fees, preserving known capital',()=>{
 const parsed=normalize({a:row('XXBT','-0.9','0.1'),b:row('XETH','2','0.01')},{XXBT:{altname:'XBT'},XETH:{altname:'ETH'}});assert.deepEqual(parsed.issues,[]);assert.equal(parsed.events.length,1);const e=parsed.events[0];assert(isConversion(e));assert.equal(e.source,'Convert');assert.deepEqual(flow(e),{outgoing:'BTC',incoming:'ETH',debit:1,credit:1.99});
 const c={history:{complete:true,events:[buy,e],fx:{}},balances:[balance('ETH',1.99)]};const lot=reconcileLots(c).ETH;assert(lot.matched);assert.equal(lotCost(lot.lots[0],c.history).cost,100);assert.equal(activity(c,'BTC').closed.length,1);assert.equal(activity(c,'ETH').current[0].id,e.id);
});
test('Unpaired conversion adjustments never invent the missing coin or cost; deposits and staking stay separate',()=>{
 assert.equal(normalize({a:row('XXBT','-1')},{}).issues.length,1);assert.equal(normalize({a:row('XXBT','1','0','deposit'),b:row('XETH','1','0','staking')},{}).events.length,0);
 const e=normalize({a:row('BTC','-1'),b:row('ETH','2')},{}).events[0];const c={history:{complete:true,events:[e],fx:{}},balances:[balance('ETH',2)]};assert.equal(lotCost(reconcileLots(c).ETH.lots[0],c.history).cost,null);
});
test('Crypto spot pairs display as conversions, fiat buys/sales retain their labels',()=>{
 assert(!isConversion(buy));assert(!isConversion({...buy,quote:'CHF'}));assert(isConversion({...buy,quote:'USDT'}));assert(isConversion({...buy,quote:'ETH',side:'SELL'}));assert(isConversion({...buy,source:'Convert'}));
});
test('Binance Convert partial and full disposals retain FIFO cost, original dates and closed-period logs',()=>{
 const swap=(id,from,to,fromAmount,toAmount,time)=>convert({orderStatus:'SUCCESS',orderId:id,fromAsset:from,toAsset:to,fromAmount:String(fromAmount),toAmount:String(toAmount),createTime:time});
 const events=[buy,swap('1','BTC','ETH',.4,2,t+day),swap('2','BTC','USDT',.6,100,t+2*day),{...buy,id:'new',paid:200,time:t+3*day}];const c={history:{events,complete:true,fx:{}},balances:[balance('BTC',1),balance('ETH',2),balance('USDT',100)]},lots=reconcileLots(c);
 assert.equal(lotCost(lots.ETH.lots[0],c.history).cost,40);assert.equal(lotCost(lots.USDT.lots[0],c.history).cost,60);assert.equal(lotCost(lots.BTC.lots[0],c.history).cost,200);assert.equal(activity(c,'BTC').closed[0].events.length,3);assert.deepEqual(activity(c,'BTC').current.map(e=>e.id),['new']);assert.equal(lots.ETH.lots[0].time,t+day);
});
test('Repeated Binance Convert history syncs keep one event and use only signed read endpoints',async()=>{
 const c={apiKey:'fixture',apiSecret:'fixture',balances:[]},event={orderStatus:'SUCCESS',orderId:'123',fromAsset:'BTC',toAsset:'ETH',fromAmount:'1',toAmount:'10',createTime:t},now=t+day;
 const fetcher=async(url,o)=>{const u=new URL(url);assert.equal(o.redirect,'error');assert(!o.method||o.method==='GET');let d;if(u.pathname.endsWith('/time'))d={serverTime:now};else if(u.pathname.endsWith('/exchangeInfo'))d={symbols:[]};else{assert(u.searchParams.has('signature'));assert.equal(o.headers['X-MBX-APIKEY'],'fixture');if(u.pathname.endsWith('/tradeFlow'))d={list:Number(u.searchParams.get('startTime'))<=t&&Number(u.searchParams.get('endTime'))>=t?[event]:[],moreData:false};else if(u.pathname.endsWith('/payments'))d={success:true,total:0};else throw Error('Unexpected endpoint');}return{ok:true,text:async()=>JSON.stringify(d)}};
 c.history=await fetchHistory(c,{fetcher,now});assert.equal(c.history.events.length,1);assert(c.history.complete);c.history=await fetchHistory(c,{fetcher,now:now+600000});assert.equal(c.history.events.length,1);assert(isConversion(c.history.events[0]));
});
