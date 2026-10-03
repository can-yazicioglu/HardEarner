const {flow,fees}=require('./transaction-ledger.cjs');
const FIAT=new Set(['USD','TRY','GBP','EUR']);
const key=(asset,time)=>asset+':'+Math.floor(time/60000);
async function historicalUSD(asset,time,{fetcher=fetch}={}){
 if(asset==='USD')return{price:1,source:'USD',time};
 if(!/^[A-Z0-9]{2,20}$/.test(asset)||!Number.isFinite(time))throw Error('Unsupported historical asset.');
 const start=Math.floor(time/60000)*60000,end=start+60000;
 const url='https://api.exchange.coinbase.com/products/'+asset+'-USD/candles?'+new URLSearchParams({granularity:'60',start:new Date(start).toISOString(),end:new Date(end).toISOString()});
 const r=await fetcher(url,{signal:AbortSignal.timeout(10000),redirect:'error'});if(!r.ok)throw Error('Historical USD price unavailable.');const rows=await r.json();
 const row=Array.isArray(rows)&&rows.find(r=>Array.isArray(r)&&r[0]*1000===start&&Number.isFinite(Number(r[4]))&&Number(r[4])>0);
 if(!row)throw Error('No historical USD candle for this minute.');
 return{price:Number(row[4]),source:'Coinbase Exchange · one-minute USD close',time:start,estimated:true};
}
async function enrich(c,{fetcher=fetch,costRates=require('./market.cjs').costRates,budget=16,now=Date.now()}={}){
 const h=c.history;if(!h)return;h.fx||={};h.usdPrices||={};h.valueRetries||={};
 const needs=new Map(),add=(asset,time)=>{if(asset&&Number.isFinite(time))needs.set(key(asset,time),{asset,time})};
 for(const m of h.movements||[]){add(m.asset,m.time);add('USD',m.time)}
 for(const e of h.events||[]){const f=flow(e);if((!e.timeZoneUnverified||FIAT.has(f.outgoing))&&!['stock','etf','fund'].includes(e.assetType))add(f.outgoing,e.time);add(e.quote,e.time);add('USD',e.time);for(const fee of fees(e))if(fee.amount>0&&(!e.timeZoneUnverified||FIAT.has(fee.asset)))add(fee.asset,e.time);}
 // Opening balances without returned acquisitions receive an explicitly estimated
 // baseline at the original tracking checkpoint, never at every later refresh.
 for(const l of c.tracking?.lots||[])if(!l.parts)add(l.asset,c.tracking.at);
 for(const [k,{asset,time}]of needs){
  if(budget<=0)break;
  const day=new Date(time).toISOString().slice(0,10),cacheKey=FIAT.has(asset)?asset+':'+day:k;
  if(FIAT.has(asset)?h.fx[cacheKey]:h.usdPrices[k])continue;
  if(h.valueRetries[cacheKey]>now)continue;budget--;
  try{if(FIAT.has(asset))h.fx[cacheKey]=await costRates(asset,day);else h.usdPrices[k]=await historicalUSD(asset,time,{fetcher});delete h.valueRetries[cacheKey];}
  catch{h.valueRetries[cacheKey]=now+3600000;}
 }
 h.accountingVersion=2;
}
module.exports={historicalUSD,enrich,key};
