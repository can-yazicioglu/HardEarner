// Public market research only. Provider credentials never appear in results/errors.
const DAY=86400000;
const PANELS=['funding','interest','liquidations','whales','etf','onchain'];
const PERIODS={'1h':3600000,'24h':DAY,'7d':7*DAY,'30d':30*DAY,'90d':90*DAY,'1y':365*DAY};
const finite=v=>!['number','string'].includes(typeof v)||v===null||v===undefined||(typeof v==='string'&&!v.trim())||typeof v==='boolean'?null:Number.isFinite(Number(v))?Number(v):null;
const positive=v=>finite(v)>0?finite(v):null;
const text=v=>typeof v==='string'?v.slice(0,160):'';
const rows=v=>{if(!Array.isArray(v))throw Error('Provider returned an unsupported data format.');return v;};
const ordered=values=>[...new Map(values.filter(p=>positive(p.time)&&finite(p.value)!==null).map(p=>[p.time,p])).values()].sort((a,b)=>a.time-b.time);
function selection(v={}){
 const asset=String(v.asset||'BTC').toUpperCase(),period=v.period||'7d';
 if(!/^[A-Z0-9]{1,16}$/.test(asset)||!Object.hasOwn(PERIODS,period))throw Error('Choose a valid research asset and period.');
 const minUSD=v.minUSD===undefined?1000000:finite(v.minUSD);
 if(minUSD===null||minUSD<0||minUSD>1e13)throw Error('Enter a valid USD threshold.');
 const addresses=Array.isArray(v.addresses)?[...new Set(v.addresses.map(a=>String(a).toLowerCase()))]:[];
 if(addresses.length>5||addresses.some(a=>!/^0x[0-9a-f]{40}$/.test(a)))throw Error('Use up to five public Hyperliquid addresses. Never enter a private key.');
 return{asset,period,minUSD,addresses,allAssets:v.allAssets===true};
}
function bybit(d){if(d?.retCode!==0)throw Error('Bybit market unavailable or request limited.');return rows(d.result?.list);}
function funding(ticker,history,instrument,asset){
 const t=bybit(ticker).find(r=>r.symbol===asset+'USDT'),i=bybit(instrument).find(r=>r.symbol===asset+'USDT');
 if(!t||!i||i.contractType!=='LinearPerpetual')throw Error('No supported USDT perpetual market for this asset.');
 const points=ordered(bybit(history).map(r=>({time:positive(r.fundingRateTimestamp),value:finite(r.fundingRate)===null?null:Number(r.fundingRate)*100})));
 return{value:finite(t.fundingRate)===null?null:Number(t.fundingRate)*100,unit:'% / settlement',intervalMinutes:positive(i.fundingInterval),nextSettlement:positive(t.nextFundingTime),at:positive(ticker.time),points,source:'Bybit',coverage:asset+'USDT · linear perpetual · Bybit only',definition:'Current rate is indicative until settlement. Positive: longs pay shorts. Negative: shorts pay longs. History contains settled rates.'};
}
function interest(ticker,history,asset,period){
 const t=bybit(ticker).find(r=>r.symbol===asset+'USDT'),all=bybit(history);
 if(!t)throw Error('Open interest unavailable for this market.');
 // Bybit now returns both-side and single-side OI. Never silently mix bases.
 const single=finite(t.singleOpenInterest)!==null&&all.every(r=>finite(r.singleOpenInterest)!==null),field=single?'singleOpenInterest':'openInterest';
 const points=ordered(all.map(r=>({time:positive(r.timestamp),value:finite(r[field])}))),value=finite(t[field]),at=positive(ticker.time);
 const target=at-PERIODS[period],before=points.filter(p=>p.time<=target).at(-1),after=points.find(p=>p.time>=target),base=before||after;
 const interval={'1h':300000,'24h':900000,'7d':3600000,'30d':14400000,'90d':DAY,'1y':DAY}[period];
 const change=base&&Math.abs(base.time-target)<=interval*1.1&&base.value>0&&value!==null?(value/base.value-1)*100:null;
 return{value,at,unit:asset,usdNotional:null,quoteNotional:finite(t[single?'singleOpenInterestValue':'openInterestValue']),quoteUnit:'USDT',basis:single?'single side':'sum of long and short sides',change,changeFrom:change===null?null:base.time,period,points,source:'Bybit',coverage:asset+'USDT · linear perpetual · Bybit only',definition:'Outstanding contracts expressed in base-asset units. USDT notional also moves when price changes; it is not a USD amount.'};
}
function coinGlass(d){if(String(d?.code)!=='0')throw Error('CoinGlass access unavailable. Check the key, endpoint entitlement and quota.');return d.data;}
function etf(d,asset){
 const reports=rows(coinGlass(d)).map(r=>{
  const time=positive(r.timestamp),funds=rows(r.etf_flows||[]).map(f=>({ticker:text(f.etf_ticker||f.ticker),value:finite(f.flow_usd??f.change_usd)})).sort((a,b)=>a.ticker.localeCompare(b.ticker));
  const value=finite(r.flow_usd??r.change_usd),sum=funds.length&&funds.every(f=>f.value!==null)?funds.reduce((s,f)=>s+f.value,0):null;
  return{time,value,date:time?new Date(time).toISOString().slice(0,10):null,funds,sum,completeness:!funds.length||value===null||sum===null||Math.abs(sum-value)>Math.max(1,Math.abs(value)*0.00001)?'incomplete':'provider-reported',revision:false};
 }).filter(r=>r.time).sort((a,b)=>a.time-b.time).slice(-370);
 if(!reports.length)throw Error('No ETF flow reports were returned.');
 return{...reports.at(-1),reports,points:reports.map(r=>({time:r.time,value:r.value})),asset,unit:'USD / reporting day',source:'CoinGlass',coverage:'US spot '+asset+' ETFs · funds returned by provider',definition:'Net subscriptions minus redemptions, not trading volume. Publication can lag. Provider reports may be revised; a balanced sum does not confirm that every fund has reported.'};
}
const HOLIDAYS={2026:['01-01','01-19','02-16','04-03','05-25','06-19','07-03','09-07','11-26','12-25'],2027:['01-01','01-18','02-15','03-26','05-31','06-18','07-05','09-06','11-25','12-24'],2028:['01-17','02-21','04-14','05-29','06-19','07-04','09-04','11-23','12-25']};
function marketDay(date){const d=new Date(date+'T12:00:00Z');if(!Number.isFinite(+d))return'unknown';if([0,6].includes(d.getUTCDay()))return'weekend';if(!HOLIDAYS[d.getUTCFullYear()])return'calendar-unverified';return HOLIDAYS[d.getUTCFullYear()].includes(date.slice(5))?'holiday':'reporting day';}
function onchain(d,metric,asset){
 const points=ordered(rows(d).map(r=>({time:positive(r.t)?Number(r.t)*1000:null,value:finite(r.v)})));
 if(!points.length)throw Error('This on-chain metric is unavailable for the selected asset or plan.');
 const definitions={mvrv:'Market value divided by realized value. A ratio of 1 means these values are equal; it is not a price target.',nupl:'Net unrealized profit or loss divided by market value. Negative readings indicate aggregate unrealized losses. This is a ratio, not a percentage.',sopr:'Value when coins are spent divided by their value when created. Above 1 indicates aggregate realized profit; below 1 indicates loss. It is not your portfolio return.'};
 return{...points.at(-1),at:points.at(-1).time,points,unit:'ratio',metric,source:'Glassnode',coverage:asset+' · daily · unadjusted metric',definition:definitions[metric]};
}
function evidenceURL(chain,hash){
 if(typeof hash!=='string'||!/^([0-9a-f]{64}|0x[0-9a-f]{64}|[1-9A-HJ-NP-Za-km-z]{80,90})$/i.test(hash))return null;
 const base={bitcoin:'https://mempool.space/tx/',ethereum:'https://etherscan.io/tx/',tron:'https://tronscan.org/#/transaction/',polygon:'https://polygonscan.com/tx/',solana:'https://solscan.io/tx/',litecoin:'https://blockchair.com/litecoin/transaction/',dogecoin:'https://blockchair.com/dogecoin/transaction/',ripple:'https://xrpscan.com/tx/'}[String(chain).toLowerCase()];
 return base?base+encodeURIComponent(hash):null;
}
function transfers(d,exchange=false){
 const events=rows(coinGlass(d)).map(r=>({id:text(r.transaction_hash)+':'+text(r.asset_symbol)+':'+text(r.to_address),hash:text(r.transaction_hash),time:positive(r.block_timestamp??r.transaction_time)?Number(r.block_timestamp??r.transaction_time)*1000:null,asset:text(r.asset_symbol),value:finite(r.amount_usd),quantity:finite(r.asset_quantity),from:text(r.from_address||r.from),to:text(r.to_address||r.to),exchange:exchange?text(r.exchange_name):null,direction:exchange?({1:'inflow',2:'outflow',3:'internal'})[r.transfer_type]||'unclassified':'transfer',chain:exchange?'ethereum':text(r.blockchain_name),evidence:evidenceURL(exchange?'ethereum':r.blockchain_name,r.transaction_hash)})).filter(r=>r.time);
 return{events:[...new Map(events.map(e=>[e.id,e])).values()].sort((a,b)=>b.time-a.time).slice(0,200),source:'CoinGlass',unit:'USD (provider estimate)',coverage:exchange?'Ethereum ERC-20 · latest 100 provider-labelled exchange transfers':'Supported chains · provider minimum $10M per transfer',definition:'Transfers do not prove buying or selling. Labels identify provider-attributed wallets. Coverage is partial; internal movements may appear.'};
}
function positions(d,address,at){
 return{address,at:positive(d?.time)||at,source:'Hyperliquid',coverage:'Public main perpetual DEX positions for this address; excludes spot and other DEXs',unit:'USD notional',positions:rows(d?.assetPositions).map(({position:p})=>({asset:text(p?.coin),size:finite(p?.szi),value:finite(p?.positionValue),entry:finite(p?.entryPx),liquidation:finite(p?.liquidationPx),pnl:finite(p?.unrealizedPnl)})).filter(p=>p.asset&&p.size!==null),evidence:'https://app.hyperliquid.xyz/explorer/address/'+address};
}
function heatmap(d){
 const v=coinGlass(d),prices=rows(v?.y_axis).map(finite),candles=rows(v?.price_candlesticks),points=rows(v?.liquidation_leverage_data).flatMap(r=>{const [x,y,n]=r;return Number.isInteger(x)&&Number.isInteger(y)&&positive(candles[x]?.[0])&&positive(prices[y])&&finite(n)!==null&&n>=0?[{time:Number(candles[x][0])*1000,price:prices[y],value:Number(n)}]:[];});
 if(!points.length)throw Error('No compatible heatmap cells were returned.');
 return{points:points.slice(-50000),source:'CoinGlass · Model 1',unit:'USD estimated liquidation exposure',coverage:'Bybit USDT perpetual · estimated leverage levels',definition:'Modelled potential liquidation levels, not observed liquidations and not a forecast.'};
}
function createInsights({fetcher=(...a)=>fetch(...a),now=()=>Date.now()}={}){
 const cache=new Map(),pending=new Map();const blocks=new Map();
 async function get(url,options={}){
  const host=new URL(url).hostname;if((blocks.get(host)||0)>now())throw Error('Provider rate limit reached. Requests are paused before retrying.');
  let r;try{r=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json','User-Agent':'HardEarner/2.15 (+https://desktop.hardearner.com/privacy)',...options.headers}})}catch{throw Error('Provider could not be reached. Saved data was kept.');}
  if(r.status===429){const h=r.headers.get('retry-after'),seconds=Number(h),until=Number.isFinite(seconds)&&seconds>0?now()+seconds*1000:Date.parse(h);blocks.set(host,Math.max(blocks.get(host)||0,Number.isFinite(until)?Math.min(now()+3600000,until):now()+60000));throw Error('Provider rate limit reached. Requests are paused before retrying.');}
  if(!r.ok)throw Error([401,402,403].includes(r.status)?'Provider access required. Check the key, plan and regional availability.':'Provider unavailable. Saved data was kept.');
  try{return await r.json()}catch{throw Error('Provider returned unreadable data.');}
 }
 async function query(kind,input={},keys={}){
  if(!['funding','interest','etf','mvrv','nupl','sopr','transfers','exchangeFlows','positions','heatmap'].includes(kind))throw Error('Unknown research metric.');
  const c=selection(input),provider=['etf','transfers','exchangeFlows','heatmap'].includes(kind)?'coinglass':['mvrv','nupl','sopr'].includes(kind)?'glassnode':null;
  const config={etf:'CoinGlass API access · Hobbyist or above',transfers:'CoinGlass API access · Startup or above',exchangeFlows:'CoinGlass API access · Hobbyist or above',heatmap:'CoinGlass API access · Professional or above',mvrv:'Glassnode API access for MVRV',nupl:'Glassnode API access for NUPL',sopr:'Glassnode API access for SOPR'};
  if(provider&&!keys[provider])return{state:'configuration',provider,required:config[kind],data:null,fetchedAt:null};
  if(['etf','mvrv','nupl','sopr'].includes(kind)&&!['BTC','ETH'].includes(c.asset))return{state:'unsupported',data:null,message:'Choose BTC or ETH for this integration.'};
  if(kind==='positions'&&!c.addresses.length)return{state:'configuration',provider:'hyperliquid',required:'Add a public Hyperliquid address in panel settings.',data:null};
  const id=kind+JSON.stringify(c),cached=cache.get(id),ttl=['funding','interest','positions'].includes(kind)?60000:['etf','mvrv','nupl','sopr'].includes(kind)?3600000:300000;
  if(cached&&now()-cached.fetchedAt<ttl)return structuredClone(cached);
  if(pending.has(id))return pending.get(id);
  const job=(async()=>{try{
   
   const start=now()-PERIODS[c.period],by=async(path,params={})=>get('https://api.bybit.com/v5/market/'+path+'?'+new URLSearchParams({category:'linear',symbol:c.asset+'USDT',...params}));
   const cg=async(path,params={})=>get('https://open-api-v4.coinglass.com'+path+'?'+new URLSearchParams(params),{headers:{'CG-API-KEY':keys.coinglass}});
   let data;
   if(kind==='funding'){
    const [t,h,i]=await Promise.all([by('tickers'),by('funding/history',{limit:'200',startTime:String(start),endTime:String(now())}),by('instruments-info')]);data=funding(t,h,i,c.asset);
   }else if(kind==='interest'){
    const interval={'1h':'5min','24h':'15min','7d':'1h','30d':'4h','90d':'1d','1y':'1d'}[c.period];
    const [t,h]=await Promise.all([by('tickers'),by('open-interest',{intervalTime:interval,limit:'200',startTime:String(start-2*DAY),endTime:String(now())})]);data=interest(t,h,c.asset,c.period);
   }else if(kind==='etf'){data=etf(await cg('/api/etf/'+(c.asset==='BTC'?'bitcoin':'ethereum')+'/flow-history'),c.asset);
   }else if(['mvrv','nupl','sopr'].includes(kind)){
    const route={mvrv:'market/mvrv',nupl:'indicators/net_unrealized_profit_loss'+(c.asset==='ETH'?'_account_based':''),sopr:'indicators/sopr'}[kind];
    data=onchain(await get('https://api.glassnode.com/v1/metrics/'+route+'?'+new URLSearchParams({a:c.asset,i:'24h',s:String(Math.floor(start/1000)),api_key:keys.glassnode})),kind,c.asset);
   }else if(kind==='transfers'){data=transfers(await cg('/api/chain/v2/whale-transfer',{...(c.allAssets?{}:{symbol:c.asset}),start_time:String(start),end_time:String(now())}));
   }else if(kind==='exchangeFlows'){data=transfers(await cg('/api/exchange/chain/tx/list',{...(c.allAssets?{}:{symbol:c.asset}),start_time:String(start),min_usd:String(c.minUSD),per_page:'100',page:'1'}),true);
   }else if(kind==='heatmap'){data=heatmap(await cg('/api/futures/liquidation/heatmap/model1',{exchange:'Bybit',symbol:c.asset+'USDT',range:['7d','30d','90d','1y'].includes(c.period)?c.period:'24h'}));
   }else{data={accounts:[]};for(const address of c.addresses){const d=await get('https://api.hyperliquid.xyz/info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'clearinghouseState',user:address})});data.accounts.push(positions(d,address,now()));}data.source='Hyperliquid';data.coverage='Watched public addresses only';}
   if(data.events)data.events=data.events.filter(r=>r.value!==null&&r.value>=c.minUSD&&(c.allAssets||r.asset===c.asset));
   const observed=data.at||data.time,maxAge=['funding','interest'].includes(kind)?180000:kind==='etf'?5*DAY:['mvrv','nupl','sopr'].includes(kind)?3*DAY:Infinity;
   const stale=!!observed&&(observed>now()+60000||now()-observed>maxAge);
   if(data.points?.length){data.historyStart=data.points[0].time;data.historyEnd=data.points.at(-1).time;data.historyLimited=data.historyStart>start+(['funding','interest'].includes(kind)?DAY:2*DAY);}
   const result={state:stale?'stale':'ready',data,fetchedAt:now(),stale,period:c.period,asset:c.asset,...(stale?{message:'Provider returned an older observation. It is excluded from alerts.'}:{})};cache.set(id,result);if(cache.size>100)cache.delete(cache.keys().next().value);return structuredClone(result);
  }catch(e){const host=provider==='coinglass'?'open-api-v4.coinglass.com':provider==='glassnode'?'api.glassnode.com':kind==='positions'?'api.hyperliquid.xyz':'api.bybit.com';return{state:cached?'stale':'unavailable',data:cached?.data||null,fetchedAt:cached?.fetchedAt||null,stale:true,message:e.message,retryAt:(blocks.get(host)||0)>now()?blocks.get(host):null};}})();
  pending.set(id,job);try{return await job}finally{pending.delete(id)}
 }
 return{query,clear(){cache.clear();blocks.clear();}};
}
module.exports={DAY,PANELS,PERIODS,finite,positive,selection,ordered,funding,interest,etf,onchain,transfers,positions,heatmap,evidenceURL,marketDay,createInsights};
