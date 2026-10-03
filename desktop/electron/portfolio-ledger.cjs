// Personal capital tracking across owned accounts. This is not tax cost-basis accounting.
// Quantities always come from providers. This projection never writes balances.
const {flow,fees,reconcileLots}=require('./transaction-ledger.cjs');
const FIAT=new Set(['USD','TRY','GBP','EUR']);
const day=t=>new Date(t).toISOString().slice(0,10);
const tolerance=q=>Math.max(1e-10,Math.abs(q)*1e-8);
const hash=h=>typeof h==='string'?h.replace(/^0x/i,'').toLowerCase():'';
function network(v){v=String(v||'').toLowerCase();return /arbitrum/.test(v)?'arbitrum':/optimism/.test(v)?'optimism':/polygon|matic/.test(v)?'polygon':/bep20|bsc|bnb smart/.test(v)?'bsc':/tron|trc20|^trx$/.test(v)?'tron':/solana|^sol$/.test(v)?'solana':/bitcoin|^btc$/.test(v)?'bitcoin':/ethereum|erc20|^eth$/.test(v)?'ethereum':/^base$/.test(v)?'base':null;}
const scales=(parts,f)=>parts?.map(p=>({...p,amount:p.amount*f}));
function usdPrice(c,asset,time){if(asset==='USD')return 1;const h=c.history||{};if(FIAT.has(asset))return h.fx?.[asset+':'+day(time)]?.rates?.USD??null;return h.usdPrices?.[asset+':'+Math.floor(time/60000)]?.price??null;}
function valueUSD(c,asset,q,time){const p=usdPrice(c,asset,time);return Number.isFinite(p)&&p>0?q*p:null;}
function sharedFx(connections){return Object.assign({},...connections.map(c=>c.history?.fx||{}));}
function matchTransfers(connections){
 const rows=connections.filter(c=>!c.sandbox).flatMap(c=>(c.history?.movements||[]).filter(m=>['Deposit','Withdrawal','Transfer'].includes(m.source)&&m.delta!==0).map(m=>({...m,cid:c.id,label:c.label,key:c.id+':'+m.id})));
 const ins=rows.filter(m=>m.delta>0),outs=rows.filter(m=>m.delta<0),candidates=new Map();
 for(const to of ins){const from=outs.filter(o=>o.cid!==to.cid&&o.asset===to.asset&&(!network(o.network)||!network(to.network)||network(o.network)===network(to.network))&&Math.abs(o.time-to.time)<=7*86400000&&Math.abs((o.netQuantity??(-o.delta-(o.fee||0)))-to.delta)<=tolerance(to.delta)&&hash(o.txid)&&hash(o.txid)===hash(to.txid));if(from.length===1)candidates.set(to.key,{from:from[0],to,method:'transaction hash'});}
 // Never link by amount alone: repeated amounts and unrelated deposits are common.
 const counts=new Map();for(const v of candidates.values())counts.set(v.from.key,(counts.get(v.from.key)||0)+1);
 return new Map([...candidates].filter(([,v])=>counts.get(v.from.key)===1));
}
function project(connections){
 const active=connections.filter(c=>!c.sandbox),fx=sharedFx(active),byId=new Map(active.map(c=>[c.id,{...c,history:{...c.history,fx}}]));
 const links=matchTransfers(active),outlinks=new Map([...links.values()].map(l=>[l.from.key,l]));
 const books=new Map(),reservations=new Map(),eventDetails={},problems=new Map();
 const book=(id,asset)=>{const key=id+'|'+asset;if(!books.has(key))books.set(key,[]);return books.get(key)};
 const problem=(id,asset,reason)=>{const key=id+'|'+asset;if(!problems.has(key))problems.set(key,new Set());problems.get(key).add(reason)};
 const step=(c,e,extra)=>({id:c.id+':'+e.id,time:e.time,account:c.label,connectionId:c.id,timeZoneUnverified:e.timeZoneUnverified,displayTime:e.displayTime,...extra});
 const baseline=(c,asset,quantity,time,source)=>({id:'entry:'+asset+':'+time,asset,quantity,time:null,receivedAt:time,source,parts:FIAT.has(asset)?[{amount:quantity,currency:asset,date:day(time)}]:usdPrice(c,asset,time)?[{amount:quantity*usdPrice(c,asset,time),currency:'USD',date:day(time),estimated:true,entry:true}]:null,
  provenance:[step(c,{id:'entry:'+asset+':'+time,time},{kind:'entry',asset,quantity,valueUSD:valueUSD(c,asset,quantity,time),estimated:!FIAT.has(asset),source})]});
 function consume(c,asset,quantity,time){
  let left=quantity;const slices=[];
  for(const l of book(c.id,asset)){if(left<=tolerance(quantity))break;const q=Math.min(left,l.quantity);if(q<=0)continue;const f=q/l.quantity;slices.push({...l,quantity:q,parts:scales(l.parts,f)});l.parts=scales(l.parts,1-f);l.quantity-=q;left-=q;}
  if(left>tolerance(quantity)){
   // A missing acquisition is visible, not silently fabricated as a trade.
   const l=baseline(c,asset,left,time,'First observed spend · earlier acquisition unavailable');slices.push(l);
   problem(c.id,asset,'Earlier acquisition records are unavailable; entry value is an estimate.');
  }
  return slices;
 }
 const provenance=lots=>{const rows=new Map();for(const l of lots)for(const p of l.provenance||[])rows.set(p.id,p);return [...rows.values()].sort((a,b)=>a.time-b.time).slice(-250);};
 const partsOf=lots=>lots.length&&lots.every(l=>l.parts?.length)?lots.flatMap(l=>l.parts):null;
 const events=active.flatMap(c=>[...(c.history?.events||[]).map(e=>({...e,cid:c.id})),...(c.history?.movements||[]).map(e=>({...e,cid:c.id,movement:true})),...(c.tracking?.at?[{id:'checkpoint',time:c.tracking.at,cid:c.id,checkpoint:true}]:[])]);
 // Providers may timestamp the receipt before final withdrawal settlement. Process
 // the source withdrawal before its matched receipt without moving earlier purchases.
 const effective=e=>{const link=outlinks.get(e.cid+':'+e.id);return link?Math.min(e.time,link.to.time):e.time;};
 events.sort((a,b)=>effective(a)-effective(b)||(outlinks.has(a.cid+':'+a.id)?-1:outlinks.has(b.cid+':'+b.id)?1:0)||a.id.localeCompare(b.id));
 const seen=new Set();
 for(const e of events){
  const c=byId.get(e.cid),key=e.cid+':'+e.id;if(seen.has(key))continue;seen.add(key);
  if(e.checkpoint){
   const quantities={};for(const l of c.tracking.lots||[])quantities[l.asset]=(quantities[l.asset]||0)+l.quantity;
   for(const [asset,q]of Object.entries(quantities)){const present=book(c.id,asset).reduce((s,l)=>s+l.quantity,0);if(q-present>tolerance(q))book(c.id,asset).push(baseline(c,asset,q-present,e.time,'Balance first observed by HardEarner · earlier acquisition unavailable'));}
   continue;
  }
  if(e.movement){
   if(e.delta<0){const lots=consume(c,e.asset,-e.delta,e.time);reservations.set(key,lots);continue;}
   if(e.delta<=0)continue;
   const link=links.get(key),moved=link&&reservations.get(link.from.key);
   if(moved?.length){
    const total=moved.reduce((s,l)=>s+l.quantity,0),net=e.delta;
    for(let i=0;i<moved.length;i++){const l=moved[i];book(c.id,e.asset).push({...l,id:e.id+':'+i,quantity:net*l.quantity/total,provenance:[...(l.provenance||[]),step(c,e,{kind:'transfer',asset:e.asset,quantity:net,from:link.from.label,to:c.label,fee:link.from.fee||0,match:link.method})]});}
    eventDetails[key]={transferFrom:link.from.label,matchedTransfer:true};
   }else{
    const l=baseline(c,e.asset,e.delta,e.time,e.source==='Reward'?'Reward entry value':'External deposit entry value');
    l.id=e.id;l.source=e.source;book(c.id,e.asset).push(l);
    eventDetails[key]={entryValueUSD:valueUSD(c,e.asset,e.delta,e.time),external:true};
   }
   continue;
  }
  const f=flow(e);if(!(f.credit>0)||!(f.debit>0))continue;
  let spent=consume(c,f.outgoing,f.debit,e.time);
  // Without a recorded fiat deposit, the actual fiat paid remains authoritative.
  if(FIAT.has(f.outgoing))spent=spent.map(l=>l.parts?l:{...l,parts:[{amount:l.quantity,currency:f.outgoing,date:day(e.time)}]});
  const extra=[];for(const fee of fees(e).filter(v=>v.amount>0&&v.asset!==f.outgoing&&v.asset!==f.incoming))extra.push(...consume(c,fee.asset,fee.amount,e.time));
  const capital=partsOf([...spent,...extra]),tradedUSD=valueUSD(c,f.outgoing,e.side==='BUY'?e.paid:e.quantity,e.time),unitUSD=tradedUSD==null?null:tradedUSD/(e.side==='BUY'?e.quantity:e.paid);
  const trace=step(c,e,{kind:'trade',asset:f.incoming,outgoing:f.outgoing,incoming:f.incoming,quantity:f.credit,paid:e.side==='BUY'?e.paid:e.quantity,currency:f.outgoing,valueUSD:tradedUSD,unitUSD,source:e.source,fees:fees(e)});
  const l={id:e.id,asset:f.incoming,quantity:f.credit,parts:capital,time:e.time,source:e.source,provenance:[...provenance([...spent,...extra]),trace]};book(c.id,f.incoming).push(l);
  eventDetails[key]={valueUSD:tradedUSD,unitUSD,provenance:l.provenance};
 }
 const allocations={};
 for(const c of active){allocations[c.id]={};const totals={};for(const b of c.balances||[])totals[b.asset]=(totals[b.asset]||0)+b.quantity;
  for(const [asset,q] of Object.entries(totals)){
   let lots=(books.get(c.id+'|'+asset)||[]).filter(l=>l.quantity>tolerance(q)),sum=lots.reduce((s,l)=>s+l.quantity,0);
   const h=c.history||{},complete=h.complete===true||h.coverageComplete===true&&!h.assetIssues?.[asset]?.length&&!h.assetIssues?.['*']?.length;
   const walletOK=!(c.coverage||[]).some(w=>!w.ok);
   const matched=complete&&walletOK&&Math.abs(sum-q)<=tolerance(q);
   if(!matched){const legacy=reconcileLots(c)[asset];if(legacy?.matched){allocations[c.id][asset]=legacy;continue;}}
   allocations[c.id][asset]={matched,lots:matched?lots:[],mode:'portfolio',reason:!complete?'Transaction history is incomplete':!walletOK?'Some wallet balances are unavailable':!matched?'Balance differs from imported history; missing transactions need review':lots.some(l=>!l.parts)?'Historical entry price is unavailable; cost remains incomplete':null};
  }
 }
 return{allocations,fx,eventDetails,transfers:[...links.values()].map(l=>({from:l.from.cid,to:l.to.cid,asset:l.to.asset,quantity:l.to.delta,time:l.to.time,method:l.method}))};
}
module.exports={project,matchTransfers,usdPrice,valueUSD,sharedFx,network};
