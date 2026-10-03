const {OZ}=require('./domain.cjs');
const {request}=require('./exchange-adapters.cjs');
function createMetalSessions({requester=request,now=Date.now}={}){
 const sessions=new Map(),pending=new Map();
 async function sample(asset){
  if(!['XAU','XAG','XPT','XPD'].includes(asset))throw Error('Choose gold, silver, platinum or palladium.');
  const prior=sessions.get(asset);if(prior&&now()-prior.fetchedAt<30000)return structuredClone(prior);
  if(pending.has(asset))return pending.get(asset);
  const job=(async()=>{
   const d=await requester('https://api.gold-api.com/price/'+asset),price=Number(d.price),at=Date.parse(d.updatedAt);
   if(!Number.isFinite(price)||price<=0||!Number.isFinite(at)||at>now()+60000||d.symbol&&d.symbol!==asset)throw Error('The metal provider returned an invalid quote.');
   const bars=(prior?.bars||[]).slice(),point={time:Math.floor(at/1000),close:price/OZ},last=bars.at(-1);
   if(last&&point.time<last.time)throw Error('The metal provider returned an older quote.');
   if(last?.time===point.time)bars[bars.length-1]=point;else bars.push(point);
   const result={bars:bars.slice(-600),source:'Gold API · USD / pure gram',fetchedAt:now(),quotedAt:at,stale:now()-at>120000,lastTime:point.time,rangeStart:null,session:true};sessions.set(asset,result);return structuredClone(result);
  })();pending.set(asset,job);try{return await job}finally{pending.delete(asset)}
 }
 return{sample};
}
const live=createMetalSessions();
module.exports={createMetalSessions,sample:live.sample};
