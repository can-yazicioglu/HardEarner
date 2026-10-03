const auth=require('./kraken-auth.cjs');
const {nextNonce}=require('./exchange-adapters.cjs');
const {validAssetSymbol}=require('./asset-symbol.cjs');
const {assetSymbol}=require('./kraken-assets.cjs');
const DAY=86400000,FIAT=new Set(['TRY','USD','GBP','EUR','CHF','CAD','AUD','JPY']);
const decimal=(v,signed=false)=>{if(!['string','number'].includes(typeof v)||!new RegExp(signed?'^-?\\d+(?:\\.\\d+)?$':'^\\d+(?:\\.\\d+)?$').test(String(v))||!Number.isFinite(Number(v)))throw Error('Invalid Kraken ledger amount.');return Number(v)};
function normalize(rows,assets,{tolerant=false}={}){
 const groups=new Map(),issues=[],assetIssues={},movements=[];
 const issue=(message,affected)=>{issues.push(message);for(const a of affected)if(a)(assetIssues[a]??=[]).push(message)};
 for(const [id,r]of Object.entries(rows)){
  let asset;
  try{
  asset=assetSymbol(r.asset,assets);
  const trade=['trade','spend','receive','adjustment'].includes(r.type);
  // Kraken now returns tradespot for ordinary Spot fills. Older accounts
  // and fixtures use an empty subtype. Neither is a margin transaction.
  if(r.aclass!=='currency'||trade&&r.subtype&&!(r.type==='trade'&&r.subtype==='tradespot'))throw Error('Some Kraken transactions use an unsupported ledger format.');
  if(!/^[\w-]{1,100}$/.test(r.refid||id))throw Error('Invalid Kraken ledger reference.');
  const time=Math.round(Number(r.time)*1000);if(!Number.isSafeInteger(time)||time<1483228800000||time>Date.now()+DAY)throw Error('Invalid Kraken ledger date.');
  const item={id,asset,time,type:r.type,subtype:r.subtype||'',amount:decimal(r.amount,true),fee:decimal(r.fee)};
  const ref=r.refid||id;
  if(!groups.has(ref))groups.set(ref,[]);groups.get(ref).push(item);
  }catch(e){if(!tolerant)throw e;issue(e.message,[asset||'*']);}
 }
 const events=[];
 for(const [refid,group]of groups){
  const sums=new Map();for(const r of group){const v=sums.get(r.asset)||{asset:r.asset,amount:0,fee:0};v.amount+=r.amount;v.fee+=r.fee;sums.set(r.asset,v);}
  const trading=group.some(r=>['trade','spend','receive','adjustment'].includes(r.type));
  if(!trading){
   // Same-asset Spot/Earn transfers cancel after mapping wallet suffixes.
   // Deposits and rewards are inventory changes, not invented purchases.
   for(const r of sums.values()){
    const delta=r.amount-r.fee;if(Math.abs(delta)<1e-14)continue;
    const source=group.every(x=>x.type==='deposit')?'Deposit':group.every(x=>x.type==='withdrawal')?'Withdrawal':group.some(x=>['staking','earn','invite bonus'].includes(x.type)&&['','reward'].includes(x.subtype))?'Reward':'Transfer';
    movements.push({id:'kraken-ledger:'+refid+':'+r.asset,asset:r.asset,delta,time:Math.max(...group.map(x=>x.time)),source,fee:r.fee});
   }
   continue;
  }
  const outgoing=[...sums.values()].filter(r=>r.amount<0),incoming=[...sums.values()].filter(r=>r.amount>0);
  if(outgoing.length!==1||incoming.length!==1){issue('Some Kraken trades are missing a matching ledger entry. Saved balances are unaffected.',[...sums.keys()]);continue;}
  const out=outgoing[0],inc=incoming[0],sell=FIAT.has(inc.asset)&&!FIAT.has(out.asset),fees=[...sums.values()].filter(r=>r.fee>0).map(r=>({asset:r.asset,amount:r.fee}));
  if(inc.amount-inc.fee<=0){if(!tolerant)throw Error('Invalid Kraken ledger fee.');issue('Invalid Kraken ledger fee.',[...sums.keys()]);continue;}
  events.push({id:'kraken:'+refid,source:group.some(r=>r.type==='adjustment')?'Convert':group.some(r=>['spend','receive'].includes(r.type))?'Instant Buy / Sell':'Spot',base:sell?out.asset:inc.asset,quote:sell?inc.asset:out.asset,quantity:sell?-out.amount:inc.amount,paid:sell?inc.amount:-out.amount,side:sell?'SELL':'BUY',fee:fees[0]?.amount||0,feeAsset:fees[0]?.asset||(sell?inc.asset:out.asset),fees,time:Math.max(...group.map(r=>r.time))});
 }
 return{events,issues:[...new Set(issues)],movements,assetIssues};
}
async function fetchHistory(c,{fetcher=fetch,now=Date.now()}={}){
 const h=structuredClone({version:2,since:1483228800000,events:[],fx:{},ledgers:{},...c.history});if(h.retryAt>now)return h;delete h.errorCode;
 if(h.version<2){h.version=2;h.since=1483228800000;h.pending=null;h.lastEnd=null;}
 const deadline=Date.now()+40000;
 async function request(endpoint,params={},signed=true){
  if(Date.now()>deadline)throw Error('History import continues on the next sync.');
  let options={redirect:'error',signal:AbortSignal.timeout(15000)};
  if(signed){const n=nextNonce(),body=new URLSearchParams({nonce:n,...params}).toString();const signature=auth.sign(endpoint,n,body,c.apiSecret);options={...options,method:'POST',headers:{'API-Key':c.apiKey,'API-Sign':signature,'Content-Type':'application/x-www-form-urlencoded'},body};}
  let r;try{r=await fetcher('https://api.kraken.com'+endpoint,options)}catch{throw Error('Some transaction history is unavailable.')}
  if(r.status===429){h.retryAt=Date.now()+300000;throw Error('History rate limit reached. Import will retry later.');}
  if(!r.ok)throw Error('History access refused. Check read permissions.');
  let d;try{d=await r.json()}catch{throw Error('Invalid Kraken history response.');}
  if(d.error?.some(e=>e.includes('Rate limit')||e.includes('Throttled'))){h.retryAt=Date.now()+300000;throw Error('History rate limit reached. Import will retry later.');}
  if(d.error?.some(e=>e.includes('Permission denied')))throw Error('Kraken history needs Data → Query ledger entries. Enable it on this API key, then sync again.');
  const authError=auth.responseError(d.error);if(authError)throw authError;
  if(!Array.isArray(d.error)||d.error.length||!d.result)throw Error('Kraken history is unavailable. Check API permissions and nonce settings.');return d.result;
 }
 try{
  const assets=await request('/0/public/Assets',{},false);
  const p=h.pending||{start:Math.floor(Math.max(h.since,(h.lastEnd||h.since)-7*DAY)/1000)-1,end:Math.floor(now/1000),offset:0,rows:{}};h.pending=p;
  for(let page=0;page<10;page++){
   const d=await request('/0/private/Ledgers',{type:'all',start:String(p.start),end:String(p.end),ofs:String(p.offset)});
   if(!d.ledger||typeof d.ledger!=='object'||Array.isArray(d.ledger)||!Number.isSafeInteger(d.count)||d.count<0)throw Error('Invalid Kraken history response.');
   if(p.count!=null&&p.count!==d.count){h.pending=null;throw Error('Kraken ledger pagination changed. Retry history import.');}p.count=d.count;
   const entries=Object.entries(d.ledger);if(entries.some(([id])=>Object.hasOwn(p.rows,id))){h.pending=null;throw Error('Kraken ledger pagination changed. Retry history import.');}
   for(const [id,r]of entries){if(!Number.isFinite(Number(r.time))||Number(r.time)<=p.start||Number(r.time)>p.end)throw Error('Invalid Kraken ledger date.');if(!/^[\w-]{1,100}$/.test(id)||!validAssetSymbol(id))throw Error('Invalid Kraken ledger identifier.');p.rows[id]={refid:r.refid,time:r.time,type:r.type,subtype:r.subtype,aclass:r.aclass,asset:r.asset,amount:r.amount,fee:r.fee};}
   p.offset+=entries.length;
   if(Object.keys(p.rows).length>100000)throw Error('Transaction storage limit reached; saved history was kept.');
   if(p.offset>=d.count){
    const all={...h.ledgers,...p.rows};if(Object.keys(all).length>100000)throw Error('Transaction storage limit reached; saved history was kept.');
    const parsed=normalize(all,assets,{tolerant:true});h.ledgers=all;h.events=parsed.events.sort((a,b)=>a.time-b.time||a.id.localeCompare(b.id));h.movements=parsed.movements;h.assetIssues=parsed.assetIssues;h.coverageComplete=true;h.lastEnd=p.end*1000;h.pending=null;h.issues=[...new Set(parsed.issues)];h.complete=!h.issues.length;h.updatedAt=new Date(now).toISOString();return h;
   }
   if(!entries.length)throw Error('Kraken ledger pagination is incomplete.');
  }
  throw Error('History import continues on the next sync.');
 }catch(e){if(e.code)h.errorCode=e.code;h.coverageComplete=false;h.complete=false;h.issues=[e.message];h.updatedAt=new Date(now).toISOString();return h;}
}
module.exports={fetchHistory,normalize};
