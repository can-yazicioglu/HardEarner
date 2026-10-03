const {reconcileLots,flow}=require('./transaction-ledger.cjs');
const supported=kind=>['binance','binancetr','kraken','wallet','trading212'].includes(kind);
function quantities(balances){const out={};for(const b of balances||[])out[b.asset]=(out[b.asset]||0)+b.quantity;return out;}
// A balance checkpoint is explicitly unknown-cost inventory, never a fabricated purchase.
function checkpoint(c,previous=[]){
 if(!supported(c.kind)||(c.coverage||[]).some(w=>!w.ok))return;
 const q=quantities(c.balances),before=quantities(previous),at=Date.parse(c.lastSync);if(!Number.isFinite(at))return;
 if(!c.tracking){const matches=reconcileLots(c),lots=[];
  for(const [asset,quantity]of Object.entries(q)){if(!(quantity>0))continue;const m=matches[asset];if(m?.matched)lots.push(...m.lots.map(l=>structuredClone(l)));else lots.push({id:'opening:'+asset,asset,quantity,parts:null,time:null,source:'Opening balance'});}
  c.tracking={at,lots,resets:{}};
 }
 for(const [asset,quantity]of Object.entries(before))if(quantity>0&&!(q[asset]>0))c.tracking.resets[asset]=at;
 for(const [asset,entry]of Object.entries(c.acquisitions||{})){
  const changed=Math.abs((q[asset]||0)-entry.quantity)>Math.max(1e-12,entry.quantity*1e-10);
  const laterTrade=(c.history?.events||[]).some(e=>e.time>Date.parse(entry.updatedAt)&&[e.base,e.quote].includes(asset));
  if(changed||laterTrade)entry.invalidatedAt=new Date(at).toISOString();
 }
}
function activity(c,asset){
 const match=reconcileLots(c)[asset],tracking=c.tracking,tracked=match?.mode==='tracking'&&match.matched;
 const events=[...(c.history?.events||[]).filter(e=>e.base===asset||e.quote===asset),...(c.history?.movements||[]).filter(e=>e.asset===asset).map(e=>({...e,movement:true}))].sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id));
 let quantity=tracked?(tracking.lots||[]).filter(l=>l.asset===asset).reduce((s,l)=>s+l.quantity,0):0,current=[],closed=[],opening=quantity>0;
 const reset=tracking?.resets?.[asset];
 const timeline=[...events.filter(e=>!tracked||e.time>tracking.at),...(reset?[{id:'reset',time:reset,reset:true}]:[])].sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id));
 const finish=at=>{if(current.length||opening)closed.push({events:current,closedAt:at,opening});current=[];opening=false;};
 for(const e of timeline){if(e.reset){finish(e.time);quantity=0;continue;}const f=e.movement?null:flow(e),delta=e.movement?e.delta:(f.incoming===asset?f.credit:0)-(f.outgoing===asset?f.debit:0);current.push(e);const prior=quantity;quantity=Math.max(0,quantity+delta);if(delta<0&&quantity<=Math.max(1e-12,prior*1e-10)){quantity=0;finish(e.time);}}
 const archived=tracked?events.filter(e=>e.time<=tracking.at):[];
 return{current,closed,archived,opening,tracked,matched:!!match?.matched,trackingAt:tracking?.at||null};
}
module.exports={supported,checkpoint,activity,quantities};
