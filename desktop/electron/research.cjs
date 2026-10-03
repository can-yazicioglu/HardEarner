// Public research data only. Never receives a portfolio, account ID or API key.
const {request}=require('./exchange-adapters.cjs');
const finite=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
const positive=v=>finite(v)!=null&&v>=0?v:null;
const text=(v,n=120)=>typeof v==='string'?v.slice(0,n):'';
function coins(raw){
 if(!Array.isArray(raw))throw Error('Market ranking is unavailable.');
 return raw.filter(r=>r&&text(r.id)&&text(r.symbol)&&positive(r.current_price)!=null).slice(0,250).map(r=>({
  id:text(r.id),asset:text(r.symbol,64).toUpperCase(),name:text(r.name),price:positive(r.current_price),cap:positive(r.market_cap),rank:positive(r.market_cap_rank),volume:positive(r.total_volume),change:finite(r.price_change_percentage_24h),week:finite(r.price_change_percentage_7d_in_currency),high:positive(r.high_24h),low:positive(r.low_24h),supply:positive(r.circulating_supply),maxSupply:positive(r.max_supply),ath:positive(r.ath),atl:positive(r.atl),athChange:finite(r.ath_change_percentage),at:Date.parse(r.last_updated)||null,
  spark:(r.sparkline_in_7d?.price||[]).filter(v=>positive(v)!=null).slice(-168)
 }));
}
function globalData(raw){const d=raw?.data;if(!d||positive(d.total_market_cap?.usd)==null)throw Error('Market totals are unavailable.');return{cap:d.total_market_cap.usd,volume:positive(d.total_volume?.usd),change:finite(d.market_cap_change_percentage_24h_usd),coins:positive(d.active_cryptocurrencies),markets:positive(d.markets),dominance:Object.entries(d.market_cap_percentage||{}).filter(([k,v])=>/^[a-z0-9_]{1,30}$/.test(k)&&positive(v)!=null&&v<=100).map(([asset,value])=>({asset:asset.toUpperCase(),value})),at:positive(d.updated_at)?d.updated_at*1000:null};}
function trending(raw){if(!Array.isArray(raw?.coins))throw Error('Search trends are unavailable.');return raw.coins.slice(0,15).map(({item:r})=>({id:text(r?.id),asset:text(r?.symbol,64).toUpperCase(),name:text(r?.name),rank:positive(r?.market_cap_rank),price:positive(r?.data?.price),change:finite(r?.data?.price_change_percentage_24h?.usd)})).filter(r=>r.id&&r.asset);}
function paprikaCoins(raw){
 if(!Array.isArray(raw))throw Error('Market ranking is unavailable.');
 const rows=raw.filter(r=>r&&text(r.id)&&text(r.symbol)&&positive(r.quotes?.USD?.price)!=null&&positive(r.rank)>0).sort((a,b)=>a.rank-b.rank).slice(0,100).map(r=>{const q=r.quotes.USD;return{
  id:text(r.id),asset:text(r.symbol,64).toUpperCase(),name:text(r.name),price:positive(q.price),cap:positive(q.market_cap),rank:r.rank,volume:positive(q.volume_24h),change:finite(q.percent_change_24h),week:finite(q.percent_change_7d),high:null,low:null,supply:positive(r.circulating_supply),maxSupply:positive(r.max_supply),ath:positive(q.ath_price),atl:null,athChange:finite(q.percent_from_price_ath),at:Date.parse(r.last_updated)||null,spark:[]
 }});
 if(!rows.length)throw Error('Market ranking is unavailable.');return rows;
}
function paprikaGlobal(raw){
 if(positive(raw?.market_cap_usd)==null)throw Error('Market totals are unavailable.');
 const btc=positive(raw.bitcoin_dominance_percentage);
 return{cap:raw.market_cap_usd,volume:positive(raw.volume_24h_usd),change:finite(raw.market_cap_change_24h),coins:positive(raw.cryptocurrencies_number),markets:null,dominance:btc!=null&&btc<=100?[{asset:'BTC',value:btc}]:[],at:positive(raw.last_updated)?raw.last_updated*1000:null};
}
function protocols(raw){if(!Array.isArray(raw))throw Error('DeFi data is unavailable.');return raw.filter(r=>r.category!=='CEX'&&r.category!=='Chain'&&positive(r.tvl)>0).sort((a,b)=>b.tvl-a.tvl).slice(0,30).map(r=>({id:text(r.slug),name:text(r.name),asset:text(r.symbol,64),category:text(r.category),tvl:r.tvl,change:finite(r.change_1d),chains:(r.chains||[]).filter(x=>typeof x==='string').slice(0,8)}));}
function stablecoins(raw){if(!Array.isArray(raw?.peggedAssets))throw Error('Stablecoin data is unavailable.');const rows=raw.peggedAssets.filter(r=>r.pegType==='peggedUSD'&&positive(r.circulating?.peggedUSD)!=null).map(r=>({id:String(r.id),name:text(r.name),asset:text(r.symbol,64),cap:r.circulating.peggedUSD,prior:positive(r.circulatingPrevMonth?.peggedUSD),price:positive(r.price)})).sort((a,b)=>b.cap-a.cap);if(!rows.length)throw Error('Stablecoin data is unavailable.');const cap=rows.reduce((s,r)=>s+r.cap,0),prior=rows.every(r=>r.prior!=null)?rows.reduce((s,r)=>s+r.prior,0):null;return{cap,change:prior>0?(cap/prior-1)*100:null,rows:rows.slice(0,15)};}
const SOURCES={
 global:['https://api.coingecko.com/api/v3/global',globalData,'CoinGecko'],
 coins:['https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=true&price_change_percentage=7d',coins,'CoinGecko'],
 trending:['https://api.coingecko.com/api/v3/search/trending',trending,'CoinGecko searches'],
 defi:['https://api.llama.fi/protocols',protocols,'DefiLlama'],
 stablecoins:['https://stablecoins.llama.fi/stablecoins?includePrices=true',stablecoins,'DefiLlama · USD-pegged supply']
};
const FALLBACKS={
 global:['https://api.coinpaprika.com/v1/global',paprikaGlobal,'Powered by CoinPaprika'],
 coins:['https://api.coinpaprika.com/v1/tickers?quotes=USD',paprikaCoins,'Powered by CoinPaprika']
};
function createResearch({requester=request,now=Date.now}={}){
 const saved=new Map(),inflight=new Map();
 async function section(key){const [url,parse,source]=SOURCES[key],old=saved.get(key);if(old&&now()-old.checkedAt<300000)return structuredClone(old);if(inflight.has(key))return inflight.get(key);
  const job=(async()=>{let next;
   // Independent public provider fallback; never substitute fabricated totals or trends.
   for(const [feedURL,parser,provider] of [[url,parse,source],...(FALLBACKS[key]?[FALLBACKS[key]]:[])]){try{next={data:parser(await requester(feedURL)),source:provider,at:now(),checkedAt:now(),stale:false,error:null};break}catch{}}
   if(!next)next={...(old||{data:null,source,at:null}),checkedAt:now(),stale:true,error:'This feed is temporarily unavailable. Retry later.'};
   saved.set(key,next);return structuredClone(next);
  })();inflight.set(key,job);try{return await job}finally{inflight.delete(key)}
 }
 return{overview:async()=>Object.fromEntries(await Promise.all(Object.keys(SOURCES).map(async k=>[k,await section(k)])))};
}
const live=createResearch();
module.exports={coins,globalData,trending,paprikaCoins,paprikaGlobal,protocols,stablecoins,createResearch,overview:live.overview};
