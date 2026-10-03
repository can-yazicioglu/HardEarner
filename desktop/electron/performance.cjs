// Cash-flow adjusted observations, not a reconstructed tax or exchange statement.
const {unitUSD}=require('./domain.cjs');
const {flow,fees}=require('./transaction-ledger.cjs');
const {usdPrice,matchTransfers}=require('./portfolio-ledger.cjs');
const DAY=86400000,REPORTS=['USD','TRY','GBP','EUR'];
const assetKey=h=>['stock','etf','fund'].includes(h.type)?`${h.type}:${h.securityId||h.asset}`:`${h.type}:${h.asset}`;
const sourceKey=h=>h.connectionId||'manual:'+h.id;
const positionKey=h=>sourceKey(h)+'|'+assetKey(h);
const near=(a,b)=>Math.abs(a-b)<=Math.max(1e-8,Math.abs(a)*1e-7,Math.abs(b)*1e-7);
function observation(holdings,market,now=Date.now(),accountIds){
 const entries={};
 for(const h of holdings.filter(h=>!h.excluded)){
  const k=positionKey(h),u=unitUSD(h,market),old=entries[k];
  if(old){old.quantity+=h.quantity;old.valueUSD=u==null||old.valueUSD==null?null:old.valueUSD+u*h.quantity;}
  else entries[k]={key:k,assetKey:assetKey(h),asset:h.asset,type:h.type,name:h.name||h.asset,source:sourceKey(h),label:h.sourceLabel||h.location||'Manual',manual:!h.connected,quantity:h.quantity,unitUSD:u,valueUSD:u==null?null:u*h.quantity};
 }
 return{time:now,day:new Date(now).toISOString().slice(0,10),entries,accountIds:accountIds||[...new Set(Object.values(entries).filter(e=>!e.manual).map(e=>e.source))],fx:{USD:1,...market.fx}};
}
function empty(){return{version:1,baseline:null,closes:{},adjustments:[]}}
function record(book,sample){
 const b=structuredClone(book||empty());if(!b.baseline){b.baseline=sample;b.closes[sample.day]=sample;return b}
 const prior=Object.values(b.closes).sort((a,z)=>z.time-a.time)[0]||b.baseline;
 if(sample.time<=prior.time)return b;
 const beforeSources=new Set(prior.accountIds),afterSources=new Set(sample.accountIds);
 for(const k of new Set([...Object.keys(prior.entries),...Object.keys(sample.entries)])){
  const p=prior.entries[k],n=sample.entries[k],e=n||p,delta=(n?.quantity||0)-(p?.quantity||0);
  if(!delta)continue;
  // Adding, editing or excluding a holding/account changes the tracking boundary.
  if(e.manual||!beforeSources.has(e.source)||!afterSources.has(e.source)){
   const unit=n?.unitUSD??p?.unitUSD;
   b.adjustments.push({key:k,assetKey:e.assetKey,time:sample.time,quantity:delta,usd:unit==null?null:delta*unit,fx:sample.fx,reason:e.manual?'Manual edit':'Tracking boundary'});
  }
 }
 b.closes[sample.day]=sample;
 const keys=Object.keys(b.closes).sort();if(keys.length>731){const removed=keys.slice(0,-731);b.baseline=b.closes[removed.at(-1)];for(const k of removed)delete b.closes[k];b.adjustments=b.adjustments.filter(x=>x.time>b.baseline.time)}
 return b;
}
function historicalRate(c,currency,time){if(currency==='USD')return 1;const day=new Date(time).toISOString().slice(0,10);const fx=c.history?.fx?.['USD:'+day]?.rates?.[currency];return Number.isFinite(fx)&&fx>0?fx:null}
function feeLedger(connections){
 const out=[];
 for(const c of connections.filter(c=>!c.sandbox)){
  for(const e of c.history?.events||[]){
   const fs=e.reportedFee>0&&e.feeIncluded?[{asset:e.feeAsset,amount:e.reportedFee}]:fees(e);
   fs.forEach((f,i)=>{if(!(f.amount>0))return;const p=usdPrice(c,f.asset,e.time);out.push({id:c.id+':trade:'+e.id+':'+i,time:e.time,source:c.label,asset:f.asset,amount:f.amount,usd:p==null?null:p*f.amount,kind:f.name||(/convert/i.test(e.source)||!['USD','TRY','GBP','EUR'].includes(e.quote)?'Conversion':'Trade'),included:!!e.feeIncluded,estimated:!['USD','TRY','GBP','EUR'].includes(f.asset),reference:e.id})});
  }
  for(const m of c.history?.movements||[])if(m.fee>0){const a=m.feeAsset||m.asset,p=usdPrice(c,a,m.time);out.push({id:c.id+':funding:'+m.id,time:m.time,source:c.label,asset:a,amount:m.fee,usd:p==null?null:p*m.fee,kind:m.source==='Fee'?'Account fee':m.delta<0?'Withdrawal':'Deposit',included:true,estimated:!['USD','TRY','GBP','EUR'].includes(a),reference:m.id})}
 }
 return [...new Map(out.map(e=>[e.id,e])).values()].sort((a,b)=>b.time-a.time);
}
function interval(start,end,connections,adjustments,currency='USD'){
 const rows={},changedSources=new Set(),startSources=new Set(start.accountIds),endSources=new Set(end.accountIds);
 for(const s of new Set([...startSources,...endSources]))if(startSources.has(s)!==endSources.has(s))changedSources.add(s);
 const ensure=(key,meta={})=>rows[key]||(rows[key]={key,...meta,flow:0,quantityFlow:0,issues:[]});
 const add=(key,qty,usd,rate,meta={})=>{const r=ensure(key,meta);r.quantityFlow+=qty;if(usd==null||usd!==0&&rate==null)r.issues.push('Missing historical flow price');else r.flow+=usd*(rate||1)};
 const within=t=>t>start.time&&t<=end.time;
 for(const a of adjustments.filter(a=>within(a.time)))add(a.key,a.quantity,a.usd,a.fx?.[currency]);
 const active=connections.filter(c=>!c.sandbox&&!changedSources.has(c.id)&&(startSources.has(c.id)||endSources.has(c.id))),links=matchTransfers(active),byId=new Map(active.map(c=>[c.id,c]));
 for(const c of active){
  const kind=a=>c.balances?.find(b=>b.asset===a)?.type||c.history?.events?.find(e=>e.base===a&&e.assetType)?.assetType||(['USD','TRY','GBP','EUR','CHF','CAD','AUD','JPY'].includes(a)?'cash':'crypto');
  const key=a=>c.id+'|'+kind(a)+':'+a;
  const meta=a=>({assetKey:kind(a)+':'+a,asset:a,name:a,type:kind(a),label:c.label});
  for(const e of c.history?.events||[]){if(!within(e.time))continue;const f=flow(e),p=usdPrice(c,e.quote,e.time),v=p==null?null:e.paid*p,rate=historicalRate(c,currency,e.time);
   // Equal opposite gross trade flows cancel at portfolio level. Fees reduce NAV.
   add(key(f.outgoing),-f.debit,v==null?null:-v,rate,meta(f.outgoing));add(key(f.incoming),f.credit,v,rate,meta(f.incoming));
   for(const fee of fees(e))if(fee.amount>0){if(fee.asset!==f.outgoing&&fee.asset!==f.incoming)add(key(fee.asset),-fee.amount,0,1,meta(fee.asset));if(fee.asset!==e.base){const fp=usdPrice(c,fee.asset,e.time),fv=fp==null?null:fp*fee.amount;add(key(fee.asset),0,fv==null?null:-fv,rate,meta(fee.asset));add(key(e.base),0,fv,rate,meta(e.base));}}
  }
  for(const m of c.history?.movements||[]){if(!within(m.time))continue;const link=links.get(c.id+':'+m.id),origin=link&&byId.get(link.from.cid),time=origin?link.from.time:m.time,p=usdPrice(origin||c,m.asset,time),income=/reward|staking|interest|dividend|earn/i.test(m.source||''),principal=m.delta<0?(m.netQuantity??Math.max(0,-m.delta-(m.fee||0))):m.delta+(m.fee||0);const dividend=m.source==='Dividend'&&m.security&&m.delta>0,amount=p==null?null:m.delta*p,rate=historicalRate(origin||c,currency,time);add(key(m.asset),m.delta,dividend?amount:income?0:p==null?null:Math.sign(m.delta)*principal*p,rate,meta(m.asset));if(dividend)add(key(m.security),0,amount==null?null:-amount,rate,meta(m.security));}
 }
 const sf=start.fx?.[currency],ef=end.fx?.[currency];
 for(const k of new Set([...Object.keys(start.entries),...Object.keys(end.entries),...Object.keys(rows)])){
  const s=start.entries[k],e=end.entries[k],meta=e||s||rows[k];if(!meta?.assetKey){delete rows[k];continue}
  const r=ensure(k),account=byId.get(meta.source||k.split('|')[0]);if(account?.history?.complete===false)r.issues.push('Transaction history is incomplete');if(account?.history?.corporateActions?.some(a=>a.asset===meta.asset&&within(a.time)))r.issues.push('Corporate action needs reconciliation');Object.assign(r,{assetKey:meta.assetKey,asset:meta.asset,name:meta.name,type:meta.type,source:meta.label});
  r.opening=s?s.valueUSD==null||!sf?null:s.valueUSD*sf:0;r.closing=e?e.valueUSD==null||!ef?null:e.valueUSD*ef:0;
  if(!near((s?.quantity||0)+r.quantityFlow,e?.quantity||0))r.issues.push('Unexplained quantity change');
  if(r.opening==null||r.closing==null)r.issues.push('Missing valuation');
  r.change=r.opening==null||r.closing==null?null:r.closing-r.opening;r.pnl=r.issues.length?null:r.change-r.flow;
 }
 const assets={};for(const r of Object.values(rows)){const a=assets[r.assetKey]||(assets[r.assetKey]={key:r.assetKey,asset:r.asset,name:r.name,type:r.type,opening:0,closing:0,flow:0,pnl:0,issues:[],sources:[]});for(const f of ['opening','closing','flow','pnl'])a[f]=a[f]==null||r[f]==null?null:a[f]+r[f];a.issues.push(...r.issues);a.sources.push(r.source)}
 const list=Object.values(assets).map(a=>({...a,issues:[...new Set(a.issues)],sources:[...new Set(a.sources)]})),sum=f=>list.some(a=>a[f]==null)?null:list.reduce((s,a)=>s+a[f],0);
 return{day:end.day,from:start.time,to:end.time,currency,opening:sum('opening'),closing:sum('closing'),flow:sum('flow'),pnl:sum('pnl'),assets:list,partial:start.day===end.day||end.time-start.time>DAY*1.5,firstDay:start.day===end.day};
}
function daily(book,connections,currency='USD'){
 if(!REPORTS.includes(currency))throw Error('Unsupported reporting currency.');if(!book?.baseline)return[];
 let prev=book.baseline;return Object.values(book.closes).sort((a,b)=>a.time-b.time).flatMap(s=>{if(s.time<=prev.time)return[];const r=interval(prev,s,connections,book.adjustments||[],currency);prev=s;return[r]}).reverse();
}
function createPerformance({dir,safeStorage}){
 const fs=require('node:fs'),path=require('node:path'),file=path.join(dir,'performance.encrypted');let book=empty(),error=null;
 if(fs.existsSync(file))try{book=JSON.parse(require('./encrypted-read.cjs').readEncrypted(file,safeStorage).text);if(book.version!==1||!book.closes||!Array.isArray(book.adjustments))throw Error('Invalid history')}catch{error='Daily history could not be opened. The original file was preserved.'}
 return{capture(holdings,market,now,accounts){if(error)throw Error(error);const next=record(book,observation(holdings,market,now,accounts.filter(c=>c.included&&!c.sandbox).map(c=>c.id)));next.evidence={...book.evidence};for(const c of accounts.filter(c=>!c.sandbox))next.evidence[c.id]={id:c.id,label:c.label,kind:c.kind,balances:c.balances,history:{events:c.history?.events||[],movements:c.history?.movements||[],fx:c.history?.fx||{},usdPrices:c.history?.usdPrices||{},complete:c.history?.complete,corporateActions:c.history?.corporateActions||[]}};require('./encrypted-file.cjs').writeEncrypted(file,JSON.stringify(next),safeStorage);book=next},view(connections,currency){const evidence={...book.evidence};for(const c of connections)evidence[c.id]=c;return{error,startedAt:book.baseline?.time,days:daily(book,Object.values(evidence),currency),fees:feeLedger(Object.values(evidence)),timeZone:'UTC'}}};
}
module.exports={assetKey,positionKey,observation,record,empty,interval,daily,feeLedger,createPerformance};
