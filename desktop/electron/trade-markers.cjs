const {isConversion}=require('./transaction-ledger.cjs');
function executions(connections,holdings=[]){
 const rows=connections.filter(c=>!c.sandbox).flatMap(c=>(c.history?.events||[]).flatMap(e=>{
  if(!Number.isFinite(e.time)||e.quantity<=0||e.paid<0)return[];
  const common={time:e.time,source:c.label,reference:e.id,isin:e.instrument?.isin||'',conversion:isConversion(e),fees:e.fees||[{asset:e.feeAsset,amount:e.reportedFee??e.fee??0}]};
  const result=[{...common,id:c.id+':'+e.id+':base',asset:e.base,type:e.assetType||'crypto',side:e.side,quantity:e.quantity,price:e.executionPrice??e.paid/e.quantity,currency:e.executionCurrency||e.quote}];
  if(isConversion(e)&&!['USD','TRY','GBP','EUR'].includes(e.quote)&&e.paid>0)result.push({...common,id:c.id+':'+e.id+':quote',asset:e.quote,type:'crypto',side:e.side==='BUY'?'SELL':'BUY',quantity:e.paid,price:e.quantity/e.paid,currency:e.base});
  return result;
 }));
 for(const h of holdings.filter(h=>!h.connected&&!h.excluded&&h.purchaseDate))rows.push({id:'manual:'+h.id,asset:h.asset,type:h.type,side:'BUY',quantity:h.quantity,price:h.cost==null?null:h.cost/h.quantity,currency:h.costCurrency,time:Date.parse(h.purchaseDate+'T12:00:00Z'),dateOnly:true,source:h.location||'Physical / manual',reference:h.id,fees:[{asset:h.costCurrency,amount:h.purchaseFee||0}]});
 return [...new Map(rows.map(r=>[r.id,r])).values()].sort((a,b)=>a.time-b.time);
}
function markers(rows,asset,type,bars){
 if(!bars.length)return[];const groups=new Map();
 for(const r of rows.filter(r=>r.asset===asset&&r.type===type)){
  const time=r.time/1000;if(time<bars[0].time||time>bars.at(-1).time+(bars.length>1?bars.at(-1).time-bars.at(-2).time:86400))continue;
  let lo=0,hi=bars.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(bars[mid].time<=time)lo=mid;else hi=mid-1}
  const k=bars[lo].time+':'+r.side,g=groups.get(k)||{time:bars[lo].time,side:r.side,rows:[]};g.rows.push(r);groups.set(k,g);
 }
 return [...groups.values()].sort((a,b)=>a.time-b.time||a.side.localeCompare(b.side)).map(g=>({id:g.time+':'+g.side,time:g.time,position:g.side==='BUY'?'belowBar':'aboveBar',shape:g.side==='BUY'?'arrowUp':'arrowDown',color:g.side==='BUY'?'#58d4ae':'#ed8397',text:(g.side==='BUY'?'B':'S')+(g.rows.length>1?' ×'+g.rows.length:''),rows:g.rows}));
}
function favourites(saved,holdings){return [...new Set([...saved,...holdings.filter(h=>!h.excluded&&h.quantity!==0).map(h=>h.type+':'+h.asset)])]}
module.exports={executions,markers,favourites};
