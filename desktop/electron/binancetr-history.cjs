const crypto=require('node:crypto');
const {validAssetSymbol}=require('./asset-symbol.cjs');
const {spot,parseJSON}=require('./binance-history.cjs');
// Official read-only API: https://www.binance.tr/apidocs/#account-trade-list-signed
function trade(row,pair){
 if(![0,1].includes(row.isBuyer)||!/^\d+$/.test(String(row.tradeId))||typeof row.tradeId==='number'&&!Number.isSafeInteger(row.tradeId))throw Error('Invalid Binance TR trade.');
 const e=spot({...row,id:row.tradeId,isBuyer:row.isBuyer===1},pair);return{...e,id:'binancetr:'+pair.symbol+':'+row.tradeId,source:'Spot'};
}
async function fetchHistory(connection,{fetcher=fetch,now=Date.now()}={}){
 const h=structuredClone({version:2,since:now-89*86400000,events:[],pairs:{},fx:{},...connection.history}),issues=[];
 let calls=0,offset=0,blocked=false;const deadline=Date.now()+45000;
 if(h.retryAt>now)return h;
 async function get(endpoint,params={},signed=false){
  if(blocked||++calls>48||Date.now()>deadline)throw Error('History import continues on the next sync.');
  const q=new URLSearchParams(params);if(signed){q.set('timestamp',String(Date.now()+offset));q.set('recvWindow','20000');q.set('signature',crypto.createHmac('sha256',connection.apiSecret).update(q.toString()).digest('hex'));}
  let r;try{r=await fetcher('https://www.binance.tr'+endpoint+(q.size?'?'+q:''),{method:'GET',headers:signed?{'X-MBX-APIKEY':connection.apiKey}:{},signal:AbortSignal.timeout(15000),redirect:'error'})}catch{throw Error('Some transaction history is unavailable.')}
  if(!r.ok){if([418,429].includes(r.status)){blocked=true;h.retryAt=Date.now()+Math.max(60,Number(r.headers?.get('retry-after'))||300)*1000;throw Error('History rate limit reached. Import will retry later.')}throw Error('History access refused. Check read permissions.')}
  let d;try{d=r.text?parseJSON(await r.text()):await r.json()}catch{throw Error('Invalid Binance TR history response.')}
  if(d.code===3255)throw Error('Binance TR refused this date range (three-month limit). Saved records are kept.');if(d.code!==0)throw Error('Binance TR refused trade history. Check read permissions and the Windows clock.');return d;
 }
 const merge=rows=>{const m=new Map(h.events.map(e=>[e.id,e]));for(const e of rows)m.set(e.id,e);if(m.size>100000)throw Error('Transaction storage limit reached; saved history was kept.');h.events=[...m.values()].sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id));};
 try{
  const clock=await get('/open/v1/common/time');if(!Number.isSafeInteger(clock.timestamp))throw Error('Binance TR time is unavailable.');offset=clock.timestamp-Date.now();
  const symbols=await get('/open/v1/common/symbols');if(!Array.isArray(symbols.data?.list))throw Error('Trading pairs are unavailable.');
  const known=new Set([...(connection.balances||[]).map(b=>b.asset),...(connection.history?.movements||[]).map(m=>m.asset),...h.events.flatMap(e=>[e.base,e.quote,e.feeAsset])]);
  const fiat=new Set(['TRY','USD','GBP','EUR']);
  const pairs=symbols.data.list.filter(p=>validAssetSymbol(p.baseAsset)&&validAssetSymbol(p.quoteAsset)&&p.symbol===p.baseAsset+'_'+p.quoteAsset&&((known.has(p.baseAsset)&&!fiat.has(p.baseAsset))||(!['TRY','USD','GBP','EUR','USDT','USDC','FDUSD','DAI'].includes(p.quoteAsset)&&known.has(p.quoteAsset))||Object.hasOwn(h.pairs,p.symbol)));
  pairs.sort((a,b)=>(h.pairs[a.symbol]?.at||0)-(h.pairs[b.symbol]?.at||0)||(a.quoteAsset==='TRY'?-1:b.quoteAsset==='TRY'?1:0));
  for(const p of pairs.slice(0,24)){
   try{let state=h.pairs[p.symbol]||{};
    if(state.complete)state={...state,nextStart:Math.max(h.since,(state.nextStart||now)-7*86400000),active:null,complete:false};
    for(let page=0;page<4;page++){
     const start=state.active?.start??state.nextStart??h.since,end=state.active?.end??Math.min(now,start+30*86400000-1),cursor=state.active?.backfill;
     const params={symbol:p.symbol,startTime:String(start),endTime:String(end),limit:'1000'};
     // Use only returned trade IDs. Zero is rejected by Binance TR (error 1108).
     if(cursor){params.fromId=cursor;params.direct='next';}
     const d=await get('/open/v1/orders/trades',params,true);
     if(!Array.isArray(d.data?.list))throw Error('Invalid Binance TR history response.');
     const raw=d.data.list,rows=raw.map(r=>trade(r,p)),ids=raw.map(r=>BigInt(r.tradeId));
     if(rows.some(e=>e.time<start||e.time>end))throw Error('Binance TR returned trades outside the requested dates.');
     const min=ids.length?ids.reduce((a,b)=>a<b?a:b):null,full=raw.length>=1000;
     if(cursor&&(ids.some(id=>id>BigInt(cursor))||full&&min>=BigInt(cursor)))throw Error('Binance TR trade pagination did not advance.');
     merge(rows);
     state={at:now,baseAsset:p.baseAsset,quoteAsset:p.quoteAsset,nextStart:full?start:end+1,active:full?{start,end,backfill:String(min)}:null,complete:!full&&end>=now};
     h.pairs[p.symbol]=state;if(state.complete)break;
    }
   }catch(e){issues.push(e.message);if(blocked)break;}
  }
  h.pairCount=pairs.length;h.pairsChecked=pairs.filter(p=>h.pairs[p.symbol]?.complete).length;
  if(h.pairsChecked<pairs.length)issues.push('More trading pairs will be checked on the next sync.');
 }catch(e){issues.push(e.message)}
 h.updatedAt=new Date(now).toISOString();h.issues=[...new Set(issues)];h.complete=!h.issues.length;return h;
}
module.exports={fetchHistory,trade};
