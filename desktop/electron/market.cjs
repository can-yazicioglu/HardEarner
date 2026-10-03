const {validAssetSymbol}=require('./asset-symbol.cjs');
const {OZ,positive}=require('./domain.cjs');
const BINANCE='https://data-api.binance.vision/api/v3';
async function json(url){const r=await fetch(url,{signal:AbortSignal.timeout(14000),headers:{'User-Agent':'HardEarner/2.0 personal portfolio'}});if(!r.ok)throw Error(`Provider returned HTTP ${r.status}`);return r.json();}
async function ticker(path){try{return await json(BINANCE+path)}catch{return json('https://api.binance.com/api/v3'+path)}}
async function refresh(previous={},symbols=[]){
 const m=structuredClone(previous);m.fx=m.fx||{USD:1};m.metals=m.metals||{};m.crypto=m.crypto||{};m.status={};const now=new Date().toISOString();
 const jobs=[
  (async()=>{const rows=await json('https://api.frankfurter.dev/v2/rates?base=USD');const fx={USD:1};for(const r of rows)if(positive(r.rate)&&/^[A-Z]{3}$/.test(r.quote))fx[r.quote]=r.rate;if(!fx.TRY||!fx.GBP)throw Error('Incomplete exchange rates');m.fx=fx;m.fxDate=rows.find(r=>r.quote==='TRY')?.date;m.fxFetched=now;m.status.fx={ok:true,at:now,source:'Frankfurter · daily reference rates'};})(),
  ...['XAU','XAG','XPT','XPD'].map(asset=>(async()=>{const r=await json(`https://api.gold-api.com/price/${asset}`);if(!positive(r.price)||!r.updatedAt)throw Error('No valid price');m.metals[asset]={usd:r.price,at:r.updatedAt,source:'Gold API',fetched:now};m.status[asset]={ok:true,at:r.updatedAt,source:'Gold API · USD / troy ounce'};})()),
  (async()=>{
   let usd;let source;
   try{const r=await json('https://api.kraken.com/0/public/Ticker?pair=USDTUSD');const t=Object.values(r.result||{})[0];usd=(Number(t.a[0])+Number(t.b[0]))/2;source='Kraken USDT/USD';}catch{const r=await json('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=usd');usd=r.tether?.usd;source='CoinGecko USDT/USD';}
   if(!positive(usd))throw Error('USDT/USD conversion unavailable');
   const all=await ticker('/ticker/24hr');if(!Array.isArray(all))throw Error('Crypto feed unavailable');
   const assets=[...new Set(['USDT',...symbols,...all.filter(t=>t.symbol.endsWith('USDT')&&Number(t.count)>0).map(t=>t.symbol.slice(0,-4))])].filter(validAssetSymbol).slice(0,2000);
   m.usdtUSD=usd;m.usdtSource=source;
   for(const asset of assets){const t=all.find(t=>t.symbol===asset+'USDT');if(asset==='USDT')m.crypto[asset]={usd,change:0,at:now,source};else if(t&&positive(Number(t.lastPrice)))m.crypto[asset]={usd:Number(t.lastPrice)*usd,usdt:Number(t.lastPrice),bidUSD:Number(t.bidPrice)>0?Number(t.bidPrice)*usd:null,askUSD:Number(t.askPrice)>0?Number(t.askPrice)*usd:null,bid:Number(t.bidPrice),ask:Number(t.askPrice),high:Number(t.highPrice),low:Number(t.lowPrice),volume:Number(t.quoteVolume),change:Number(t.priceChangePercent),at:new Date(t.closeTime).toISOString(),source:'Binance + '+source};}
   m.cryptoCatalog=all.filter(t=>t.symbol.endsWith('USDT')&&Number(t.lastPrice)>0&&Number(t.count)>0).map(t=>t.symbol.slice(0,-4)).sort();m.status.crypto={ok:true,at:now,source:'Binance · converted using '+source};
  })()
 ];
 const results=await Promise.allSettled(jobs);['fx','XAU','XAG','XPT','XPD','crypto'].forEach((k,i)=>{if(results[i].status==='rejected')m.status[k]={ok:false,error:results[i].reason?.message||'Feed unavailable',at:k==='fx'?m.fxFetched:k==='crypto'?previous.status?.crypto?.at:m.metals[k]?.at};});m.fetchedAt=now;return m;
}
const chartCache=new Map();
async function history(asset,type,days,currency='TRY'){
 if(!validAssetSymbol(asset)||!['cash','crypto','metal'].includes(type)||![7,30,90,365].includes(days)||!['USD','GBP','TRY','EUR'].includes(currency))throw Error('Unsupported chart request');
 const key=[asset,type,days,currency].join(':');const cached=chartCache.get(key);if(cached&&Date.now()-cached.cachedAt<55000)return cached;
 let result;
 if(type==='crypto'){
  if(asset==='USDT')throw Error('Select another coin to view its USDT market history.');
  const interval=days<=7?'1h':days<=30?'4h':'1d';const limit=days<=7?168:days<=30?180:days;
  const rows=await ticker(`/klines?symbol=${encodeURIComponent(asset+'USDT')}&interval=${interval}&limit=${limit}`);if(!Array.isArray(rows))throw Error('This coin has no supported Binance market.');
  result={points:rows.map(r=>({time:Number(r[0]),value:Number(r[4])})),currency:'USDT',unit:'coin',source:'Binance · historical closing prices',note:'Chart is quoted in USDT. Portfolio values use the current USDT/USD exchange rate.'};
 }else{
  const from=new Date(Date.now()-days*86400000).toISOString().slice(0,10);const quote=asset===currency?(asset==='USD'?'GBP':'USD'):currency;
  const rows=await json(`https://api.frankfurter.dev/v2/rates?base=${encodeURIComponent(asset)}&quotes=${quote}&from=${from}`);
  result={points:rows.map(r=>({time:Date.parse(r.date),value:r.rate/(type==='metal'?OZ:1)})),currency:quote,unit:type==='metal'?'pure gram':'unit',source:'Frankfurter · daily reference history',note:type==='metal'?'Daily reference prices per pure gram. The live spot quote can differ.':'Daily reference rates, not intraday bank dealing prices.'};
 }
 result.points=result.points.filter(p=>positive(p.value)&&Number.isFinite(p.time)).sort((a,b)=>a.time-b.time);if(!result.points.length)throw Error('No historical prices returned.');result.cachedAt=Date.now();chartCache.set(key,result);return result;
}
const activityCache=new Map();
async function activity(asset){
 if(!validAssetSymbol(asset)||asset==='USDT')throw Error('Choose a supported coin with a USDT market.');
 const cached=activityCache.get(asset);if(cached&&Date.now()-cached.fetched<10000)return cached;
 const rows=await ticker(`/aggTrades?symbol=${encodeURIComponent(asset+'USDT')}&limit=500`);
 if(!Array.isArray(rows))throw Error('Trade activity is unavailable.');
 const trades=rows.filter(r=>positive(Number(r.p))&&positive(Number(r.q))&&typeof r.m==='boolean').map(r=>({id:r.a,time:r.T,price:Number(r.p),quantity:Number(r.q),side:r.m?'SELL':'BUY'}));
 const buy=trades.filter(t=>t.side==='BUY').reduce((s,t)=>s+t.price*t.quantity,0),sell=trades.filter(t=>t.side==='SELL').reduce((s,t)=>s+t.price*t.quantity,0);
 const result={asset,trades:trades.slice(-14).reverse(),buy,sell,buyPct:buy+sell>0?buy/(buy+sell)*100:null,count:trades.length,from:trades[0]?.time,to:trades.at(-1)?.time,fetched:Date.now(),source:'Binance · recent aggregate trades'};activityCache.set(asset,result);return result;
}
async function costRates(base,date){
 if(!['TRY','GBP','USD','EUR'].includes(base)||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date>new Date().toLocaleDateString('en-CA'))throw Error('Enter a valid purchase date, today or earlier.');
 const quotes=['TRY','GBP','USD','EUR'].filter(c=>c!==base).join(',');const rows=await json(`https://api.frankfurter.dev/v2/rates?base=${base}&quotes=${quotes}&date=${date}`);const rates={[base]:1};for(const r of rows)if(positive(r.rate)&&['TRY','GBP','USD','EUR'].includes(r.quote))rates[r.quote]=r.rate;
 if(Object.keys(rates).length!==4)throw Error('Historical currency rates are incomplete.');return{rates,date:rows[0]?.date||date};
}
module.exports={refresh,history,activity,costRates};
