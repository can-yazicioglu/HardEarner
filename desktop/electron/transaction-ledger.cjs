// Pure accounting projection. Authoritative wallet quantities are never changed by history.
const FIAT=new Set(['TRY','USD','GBP','EUR']);
// Broader fiat list is for transaction labels only; reporting FX remains limited to supported currencies.
const CASH=new Set(['TRY','USD','GBP','EUR','CHF','CAD','AUD','JPY','AED','ARS','BRL','CZK','DKK','HKD','HUF','IDR','ILS','INR','KRW','MXN','NOK','NZD','PLN','RON','RUB','SAR','SEK','SGD','THB','TWD','UAH','VND','ZAR']);
function isConversion(e){return ['Convert','Imported Convert'].includes(e.source)||(!CASH.has(e.base)&&!CASH.has(e.quote));}
const day=t=>new Date(t).toISOString().slice(0,10);
const scale=(parts,r)=>parts.map(p=>({...p,amount:p.amount*r}));
function fees(e){return e.fees||[{asset:e.feeAsset,amount:e.fee||0}]}
function flow(e){const outgoing=e.side==='BUY'?e.quote:e.base,incoming=e.side==='BUY'?e.base:e.quote;return{outgoing,incoming,debit:(e.side==='BUY'?e.paid:e.quantity)+fees(e).filter(f=>f.asset===outgoing).reduce((s,f)=>s+f.amount,0),credit:(e.side==='BUY'?e.quantity:e.paid)-fees(e).filter(f=>f.asset===incoming).reduce((s,f)=>s+f.amount,0)}}
function lotsFromHistory(history,tracking=null){
 const books=new Map();
 const book=a=>{if(!books.has(a))books.set(a,[]);return books.get(a)};
 if(tracking)for(const l of tracking.lots||[])book(l.asset).push(structuredClone(l));
 function consume(a,q){let left=q;const parts=[];let known=true;
  for(const l of book(a)){if(left<=1e-12)break;const take=Math.min(left,l.quantity);if(take<=0)continue;
   if(!l.parts)known=false;else{parts.push(...scale(l.parts,take/l.quantity));l.parts=scale(l.parts,1-take/l.quantity)}l.quantity-=take;left-=take;
  }
  if(left>Math.max(1e-10,q*1e-8))known=false;
  return known?parts:null;
 }
 const events=(history?.events||[]).filter(e=>!tracking||e.time>tracking.at);
 const resets=tracking?Object.entries(tracking.resets||{}).map(([asset,time])=>({id:'reset:'+asset,asset,time,reset:true})):[];
 const movements=(history?.movements||[]).filter(e=>!tracking||e.time>tracking.at).map(e=>({...e,movement:true}));
 for(const e of [...events,...resets,...movements].sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id))){
  if(e.reset){books.set(e.asset,[]);continue;}
  if(e.movement){if(e.delta<0)consume(e.asset,-e.delta);else if(e.delta>0)book(e.asset).push({id:e.id,asset:e.asset,quantity:e.delta,parts:null,time:null,receivedAt:e.time,source:e.source});continue;}
  const {outgoing,incoming,debit,credit}=flow(e);
  let parts=consume(outgoing,debit);
  if(FIAT.has(outgoing))parts=[{amount:debit,currency:outgoing,date:day(e.time)}];
  for(const f of fees(e).filter(f=>f.amount>0&&f.asset!==outgoing&&f.asset!==incoming)){const extra=FIAT.has(f.asset)?[{amount:f.amount,currency:f.asset,date:day(e.time)}]:consume(f.asset,f.amount);parts=parts&&extra?[...parts,...extra]:null;}
  // Fiat received from a sale is cash at its face value, not the disposed asset's cost.
  if(FIAT.has(incoming))parts=[{amount:credit,currency:incoming,date:day(e.time)}];
  if(credit>0)book(incoming).push({id:e.id,asset:incoming,quantity:credit,parts,time:e.time,source:e.source});
 }
 return books;
}
function reconcileLots(connection){
 const h=connection.history,books=lotsFromHistory(h),tracked=connection.tracking?lotsFromHistory(h,connection.tracking):null,result={},quantities={};
 for(const b of connection.balances||[])quantities[b.asset]=(quantities[b.asset]||0)+b.quantity;
 for(const [a,q]of Object.entries(quantities)){
  let lots=(books.get(a)||[]).filter(l=>l.quantity>1e-12),mode='history';
  const matches=rows=>Math.abs(rows.reduce((s,l)=>s+l.quantity,0)-q)<=Math.max(1e-10,Math.abs(q)*1e-8);
  if(!matches(lots)&&tracked){lots=(tracked.get(a)||[]).filter(l=>l.quantity>1e-12);mode='tracking';}
  const complete=h?.complete===true||h?.coverageComplete===true&&!h.assetIssues?.[a]?.length&&!h.assetIssues?.['*']?.length;
  // An unavailable wallet may contain the same asset. Do not allocate costs
  // against a mixture of current and cached quantities.
  const walletsComplete=!(connection.coverage||[]).some(w=>!w.ok);
  const matched=complete&&walletsComplete&&matches(lots);
  result[a]={matched,mode,lots:matched?lots:[],reason:!h?'Transaction history not loaded':!walletsComplete?'Some wallet balances are unavailable':!complete?'Transaction history is incomplete':!matched?'Balance differs from imported trades; transfers, rewards or older history may be missing':lots.some(l=>!l.parts)?'Original payment currency cost is not fully known':null};
 }
 return result;
}
function lotCost(l,history){
 if(!l.parts?.length)return{cost:null,costCurrency:'TRY',purchaseFx:{}};
 const currency=l.parts[0].currency;
 const total=target=>{const rates=l.parts.map(p=>p.currency===target?1:history.fx?.[p.currency+':'+p.date]?.rates?.[target]);return rates.every(r=>Number.isFinite(r)&&r>0)?l.parts.reduce((s,p,i)=>s+p.amount*rates[i],0):null};
 const cost=total(currency),purchaseFx={[currency]:1};
 if(cost==null)return{cost:null,costCurrency:currency,purchaseFx:{}};
 for(const target of FIAT){if(target===currency)continue;const value=total(target);if(value!=null&&cost>0)purchaseFx[target]=value/cost;}
 return{cost,costCurrency:currency,purchaseFx,purchaseFxDate:l.parts.length===1?history.fx?.[currency+':'+l.parts[0].date]?.date||'':''};
}
module.exports={lotsFromHistory,reconcileLots,lotCost,flow,fees,isConversion};
