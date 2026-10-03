const crypto=require('node:crypto');
const BANKS=new Set(['monzo','starling','truelayer']);
function snapshot(c){
 if(c.sandbox||c.error||!Array.isArray(c.balances)||(c.coverage||[]).some(w=>!w.ok))return null;
 const entries=new Map();
 for(const b of c.balances){
  if(!Number.isFinite(b.quantity)||typeof b.asset!=='string')return null;
  // Merge exchange wallets so Spot -> Earn is not reported as money leaving.
  // Keep bank accounts separate even when they use the same currency.
  const key=BANKS.has(c.kind)?JSON.stringify([b.id,b.asset]):b.asset;
  const prior=entries.get(key)||{asset:b.asset,quantity:0,account:BANKS.has(c.kind)?b.name:''};
  prior.quantity+=b.quantity;entries.set(key,prior);
 }
 return Object.fromEntries(entries);
}
function observe(c,now=Date.now()){
 const entries=snapshot(c);if(!entries)return[];
 const previous=c.balanceWatch;
 c.balanceWatch={version:1,at:now,entries};
 // First successful sync establishes a baseline, not a historical deposit.
 if(!previous||previous.version!==1)return[];
 const events=[];
 for(const key of new Set([...Object.keys(previous.entries),...Object.keys(entries)])){
  const before=previous.entries[key]?.quantity||0,after=entries[key]?.quantity||0,delta=after-before;
  if(Math.abs(delta)<=Math.max(1e-12,Math.max(Math.abs(before),Math.abs(after))*1e-12))continue;
  const item=entries[key]||previous.entries[key];
  events.push({id:crypto.randomUUID(),connectionId:c.id,provider:c.label,asset:item.asset,account:item.account,direction:delta>0?'in':'out',amount:Math.abs(delta),before,after,since:previous.at,detectedAt:now,read:false});
 }
 return events;
}
module.exports={snapshot,observe};
