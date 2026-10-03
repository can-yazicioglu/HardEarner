// Public Invest / Stocks ISA API. Every request is GET; no order endpoints exist here.
const {validAssetSymbol}=require('./asset-symbol.cjs');
const num=(v,positive=false)=>{if(typeof v!=='number'||!Number.isFinite(v)||positive&&v<0)throw Error('Trading 212 returned an invalid amount. Saved balances were kept.');return v};
const date=v=>{const t=Date.parse(v);if(!Number.isFinite(t)||t<=0||t>Date.now()+60000)throw Error('Trading 212 returned an invalid date.');return t};
function credentials(v){if(v?.readOnly!==true)throw Error('Confirm that this key has only account, portfolio and history read permissions.');for(const k of ['apiKey','apiSecret'])if(typeof v[k]!=='string'||! /^[A-Za-z0-9_+/.=-]{10,300}$/.test(v[k]))throw Error('Enter the Trading 212 API key and secret.');return{apiKey:v.apiKey,apiSecret:v.apiSecret,readOnly:true}}
function nextPath(value,category){if(value==null||value==='')return null;if(typeof value!=='string'||value.length>1000||!value.startsWith('/api/v0/equity/history/'+category+'?'))throw Error('Unsafe or invalid Trading 212 pagination path.');const u=new URL(value,'https://live.trading212.com');if(u.origin!=='https://live.trading212.com'||u.pathname!=='/api/v0/equity/history/'+category||[...u.searchParams.keys()].some(k=>!['limit','cursor','ticker','time'].includes(k)))throw Error('Unsafe Trading 212 history cursor.');return u.pathname+u.search}
function security(i,metadata){if(!i||!validAssetSymbol(i.ticker)||!['USD','GBP','GBX','EUR','TRY','CHF','CAD','AUD','JPY'].includes(i.currency))throw Error('Unsupported Trading 212 instrument. Saved balances were kept.');const m=metadata.find(x=>x.ticker===i.ticker);if(!m||!['STOCK','ETF','REIT','ETC'].includes(m.type))throw Error('Trading 212 returned an unsupported instrument type.');return{asset:i.ticker,type:m.type==='ETF'?'etf':'stock',name:i.name||m.name||i.ticker,isin:i.isin||m.isin||'',currency:i.currency}}
function normalize(summary,positions,metadata){
 if(!Array.isArray(positions)||!Array.isArray(metadata)||!summary?.cash||!['USD','GBP','EUR','TRY','CHF','CAD','AUD','JPY'].includes(summary.currency))throw Error('Trading 212 returned incomplete account information.');
 const at=new Date().toISOString(),balances=positions.map(p=>{const s=security(p.instrument,metadata),q=num(p.quantity,true),available=num(p.quantityAvailableForTrading,true),impact=p.walletImpact;if(available>q+1e-8||!impact||impact.currency!==summary.currency)throw Error('Trading 212 returned inconsistent position balances.');return{...s,id:s.asset,quantity:q,available,locked:q-available,at,wallet:'Investments',brokerPrice:num(p.currentPrice,true),brokerPriceCurrency:s.currency,brokerCost:num(impact.totalCost,true),brokerCostCurrency:impact.currency,brokerValue:num(impact.currentValue,true),brokerValueCurrency:impact.currency,brokerAveragePrice:num(p.averagePricePaid,true),positionOpenedAt:date(p.createdAt)}}).filter(x=>x.quantity!==0);
 const a=num(summary.cash.availableToTrade),r=num(summary.cash.reservedForOrders,true),pie=num(summary.cash.inPies,true),quantity=a+r+pie;
 if(quantity!==0)balances.push({id:'cash:'+summary.currency,asset:summary.currency,type:'cash',name:summary.currency,quantity,available:a,locked:r+pie,wallet:'Cash including uninvested Pie cash',at});
 if(new Set(balances.map(b=>b.id)).size!==balances.length)throw Error('Trading 212 returned duplicate positions.');return balances;
}
function normalizeFill(row,metadata){
 const {order:o,fill:f}=row||{};if(!o||!f)throw Error('Incomplete Trading 212 fill.');const s=security(o.instrument,metadata),time=date(f.filledAt),quantity=Math.abs(num(f.quantity)),price=num(f.price,true);
 if(f.type!=='TRADE')return{corporateAction:true,id:'t212:action:'+String(f.id),time,asset:s.asset,type:f.type,quantity,source:'Trading 212 corporate action'};
 if(!['BUY','SELL'].includes(o.side)||quantity<=0||price<=0)throw Error('Invalid Trading 212 trade.');
 const charges=(f.walletImpact?.taxes||[]).map(t=>({asset:t.currency,amount:Math.abs(num(t.quantity)),name:t.name}));
 const wallet=f.walletImpact;if(!wallet||!['USD','GBP','EUR','TRY','CHF','CAD','AUD','JPY'].includes(wallet.currency))throw Error('Trading 212 settlement currency is unavailable.');
 const net=Math.abs(num(wallet.netValue)),settlementFees=charges.filter(f=>f.asset===wallet.currency).reduce((s,f)=>s+f.amount,0),paid=o.side==='BUY'?net-settlementFees:net+settlementFees;
 if(!(paid>0))throw Error('Trading 212 settlement value is inconsistent.');
 return{id:'t212:fill:'+String(f.id),base:s.asset,assetType:s.type,quote:wallet.currency,quantity,paid,executionPrice:price,executionCurrency:s.currency,side:o.side,time,fees:charges,fee:0,feeAsset:wallet.currency,source:'Trading 212 trade',instrument:s};
}
async function fetchAccount(input,{fetcher=fetch}={}){
 const creds=credentials(input);let stopped=false;
 async function get(p){if(stopped)throw Error('Trading 212 rate limit reached. Retry later.');let r;try{r=await fetcher('https://live.trading212.com'+p,{method:'GET',headers:{Authorization:'Basic '+Buffer.from(creds.apiKey+':'+creds.apiSecret).toString('base64')},redirect:'error',signal:AbortSignal.timeout(15000)})}catch{throw Error('Trading 212 is unavailable. Saved balances were kept.')}if(!r.ok){if(r.status===429)stopped=true;throw Error(r.status===429?'Trading 212 rate limit reached. Retry later.':'Trading 212 refused read access. Check key permissions and account type.')}return r.json()}
 const summary=await get('/api/v0/equity/account/summary'),positions=await get('/api/v0/equity/positions'),metadata=input.brokerMetadata||await get('/api/v0/equity/metadata/instruments');
 const balances=normalize(summary,positions,metadata),h=structuredClone(input.history||{events:[],movements:[],fx:{},usdPrices:{},cursors:{},corporateActions:[]});h.cursors||={};h.issues=[];
 const events=new Map((h.events||[]).map(x=>[x.id,x])),movements=new Map((h.movements||[]).map(x=>[x.id,x])),actions=new Map((h.corporateActions||[]).map(x=>[x.id,x]));
 for(const category of ['orders','dividends','transactions'])try{
  const p=nextPath(h.cursors[category],category)||'/api/v0/equity/history/'+category+'?limit=50',d=await get(p);if(!Array.isArray(d.items))throw Error('Incomplete Trading 212 history.');
  for(const row of d.items){
   if(category==='orders'){const e=normalizeFill(row,metadata);(e.corporateAction?actions:events).set(e.id,e)}
   else if(category==='dividends'){const m={id:'t212:dividend:'+row.reference,asset:row.currency,delta:num(row.amount),time:date(row.paidOn),source:'Dividend',security:row.instrument?.ticker||row.ticker,dividendType:row.type};movements.set(m.id,m)}
   else{if(!['DEPOSIT','WITHDRAW','FEE','TRANSFER','INTEREST_ON_FREE_CASH','LENDING_INTEREST'].includes(row.type))throw Error('Unsupported Trading 212 movement.');const amount=num(row.amount),m={id:'t212:transaction:'+row.reference,asset:row.currency,delta:row.type==='WITHDRAW'||row.type==='FEE'?-Math.abs(amount):amount,time:date(row.dateTime),source:row.type.includes('INTEREST')?'Interest':row.type==='DEPOSIT'?'Deposit':row.type==='WITHDRAW'?'Withdrawal':row.type==='FEE'?'Fee':'Transfer',fee:row.type==='FEE'?Math.abs(amount):0,netQuantity:row.type==='FEE'?0:Math.abs(amount)};movements.set(m.id,m)}
  }h.cursors[category]=nextPath(d.nextPagePath,category);if(h.cursors[category])h.issues.push('Older Trading 212 '+category+' will continue on the next sync.');
 }catch(e){h.issues.push(e.message);if(stopped)break}
 if(events.size+movements.size>100000)throw Error('Trading 212 history storage limit reached.');
 h.events=[...events.values()].sort((a,b)=>a.time-b.time);h.movements=[...movements.values()].sort((a,b)=>a.time-b.time);h.corporateActions=[...actions.values()];h.complete=!h.issues.length;h.updatedAt=new Date().toISOString();
 return{balances,history:h,brokerMetadata:metadata,coverage:[{wallet:'Invest / Stocks ISA',ok:true,at:h.updatedAt}],brokerSummary:{currency:summary.currency,totalValue:summary.totalValue,investments:summary.investments}};
}
module.exports={credentials,nextPath,normalize,normalizeFill,fetchAccount};
