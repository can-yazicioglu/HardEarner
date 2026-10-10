const labCore=require('./research-lab.cjs');
const {defaultDesk,validateDesk,ACCESS}=require('./research-catalog.cjs');
const {PANELS,PERIODS,selection,finite,createInsights,marketDay}=require('./research-insights.cjs');
const {createLiquidations}=require('./research-liquidations.cjs');
const {METRICS}=require('./research-metrics.cjs');
const defaults={version:1,keys:{},settings:{asset:'BTC',period:'7d',enabled:['funding','interest'],summary:false,minUSD:1000000,addresses:[],allAssets:false},alerts:[],observations:{etf:{},positions:{}}};
function validKey(provider,key){if(!['coinglass','glassnode','fred','coingecko','defillama','fmp'].includes(provider)||typeof key!=='string'||!(key===''||/^[A-Za-z0-9_-]{12,250}$/.test(key)))throw Error('Enter a valid market-data API key.');return key;}
function validateAlert(v){
 if(!Object.hasOwn(METRICS,v?.metric)||!['above','below'].includes(v.condition)||finite(v.threshold)===null||!Number.isFinite(v.cooldownMinutes)||v.cooldownMinutes<5||v.cooldownMinutes>10080)throw Error('Choose a metric, numeric threshold and a cooldown of 5 minutes to 7 days.');
 if(['transfers','exchangeFlows','interest','mvrv','sopr','mayer','optionPCR','volumeRatio','stableSupply','fearGreed','breadth'].includes(v.metric)&&v.threshold<0)throw Error('This metric requires a non-negative threshold.');
 if(['fearGreed','breadth'].includes(v.metric)&&v.threshold>100)throw Error('This metric is bounded between 0 and 100.');
 if(v.metric==='optionPCR'&&!['BTC','ETH'].includes(v.asset))throw Error('Choose BTC or ETH for options.');
 const c=selection(v);if(['etf','mvrv','nupl','sopr'].includes(v.metric)&&!['BTC','ETH'].includes(c.asset))throw Error('Choose BTC or ETH for this metric.');
 return{metric:v.metric,asset:c.asset,period:c.period,condition:v.condition,threshold:Number(v.threshold),cooldownMinutes:v.cooldownMinutes};
}
const fingerprint=a=>[a.metric,a.asset,a.period,a.condition,a.threshold].join(':');
function alertValue(result,metric,now){
 if(result?.state!=='ready'||result.stale||!result.data)return null;
 const d=result.data;
 if(['transfers','exchangeFlows'].includes(metric)){const e=(d.events||[]).filter(e=>e.time>=now-3600000&&e.time<=now+60000).sort((a,b)=>b.value-a.value)[0];return e?{value:e.value,at:e.time,evidence:e.evidence}:null;}
 if(metric==='etf'&&d.completeness==='incomplete')return null;
 const at=d.at||d.time,age=['funding','interest','premium','optionPCR'].includes(metric)?180000:metric==='etf'?5*86400000:3*86400000;
 return finite(d.value)!==null&&at&&at<=now+60000&&now-at<=age?{value:d.value,at}:null;
}
function createResearchWorkspace({dir,safeStorage,query,notify=()=>{},now=()=>Date.now(),liquidationFactory=createLiquidations}={}){
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),file=path.join(dir,'research.encrypted');
 let data=structuredClone(defaults),error=null,running=false,checkError=null;
 const service=createInsights(),lab=labCore.createLab(),feeds=new Map();
 if(fs.existsSync(file))try{const d=JSON.parse(require('./encrypted-read.cjs').readEncrypted(file,safeStorage).text);if(d.desk)validateDesk(d.desk);if(d.version!==1||!d.keys||typeof d.keys!=='object'||Array.isArray(d.keys)||!Array.isArray(d.alerts)||d.alerts.length>100||!Array.isArray(d.settings?.enabled)||d.settings.enabled.some(v=>!PANELS.includes(v)))throw Error();selection(d.settings);for(const [p,k]of Object.entries(d.keys))validKey(p,k);for(const a of d.alerts){validateAlert(a);if(typeof a.id!=='string'||typeof a.active!=='boolean'||!Array.isArray(a.history))throw Error();}data={...d,observations:{etf:d.observations?.etf||{},positions:d.observations?.positions||{}}};}catch{error='Research settings could not be read. The encrypted original was preserved.';}
 function save(next){if(error)throw Error(error);require('./encrypted-file.cjs').writeEncrypted(file,JSON.stringify(next),safeStorage);data=next;}
 function view(){return{settings:structuredClone(data.settings),desk:structuredClone(data.desk||defaultDesk()),configured:Object.fromEntries(['coinglass','glassnode','fred','coingecko','defillama','fmp'].map(p=>[p,!!data.keys[p]])),alerts:structuredClone(data.alerts),error,checkError};}
 function mutate(action,value){
  if(action==='desk'){save({...data,desk:validateDesk(value)});}
  else if(action==='settings'){const c=selection({...data.settings,...value}),enabled=value.enabled??data.settings.enabled;if(!Array.isArray(enabled)||enabled.some(v=>!PANELS.includes(v)))throw Error('Choose supported research panels.');save({...data,settings:{...c,enabled:[...new Set(enabled)],summary:value.summary??data.settings.summary}});}
  else if(action==='key'){validKey(value.provider,value.key);save({...data,keys:{...data.keys,[value.provider]:value.key}});service.clear();lab.clear();}
  else if(action==='alert'){const a=validateAlert(value);if(data.alerts.filter(a=>a.active).length>=40)throw Error('Up to 40 metric alerts can be active.');if(data.alerts.some(x=>x.active&&fingerprint(x)===fingerprint(a)))throw Error('This metric alert is already active.');save({...data,alerts:[...data.alerts.slice(-99),{...a,id:crypto.randomUUID(),active:true,inside:false,lastTriggered:null,lastObserved:null,history:[],createdAt:now()}]});}
  else if(action==='deleteAlert')save({...data,alerts:data.alerts.filter(a=>a.id!==value)});
  else if(action==='toggleAlert'){const a=data.alerts.find(a=>a.id===value);if(!a)throw Error('Metric alert not found.');if(!a.active){if(data.alerts.filter(x=>x.active).length>=40)throw Error('Up to 40 metric alerts can be active.');if(data.alerts.some(x=>x.active&&fingerprint(x)===fingerprint(a)))throw Error('This metric alert is already active.');}save({...data,alerts:data.alerts.map(a=>a.id===value?{...a,active:!a.active,inside:false}:a)});}
  else throw Error('Unknown research setting.');return view();
 }
 async function load(kind,input={}){
  if(error)throw Error(error);
  if(kind.startsWith('lab:')){const k=kind.slice(4),c=labCore.selection({...data.settings,...input}),provider=ACCESS[k]?.provider||(['onchainMetric','activity'].includes(k)?'glassnode':['radar','sectors','cex'].includes(k)?'coingecko':null),keys=provider&&data.keys[provider]?{[provider]:data.keys[provider]}:{};return query?query(kind,c,keys):lab.query(k,c,keys);}
  const extra={mayer:['cycles',{}],premium:['premium',{}],fearGreed:['sentiment',{}],optionPCR:['options',{}],volumeRatio:['volume',{}],breadth:['radar',{}],stableSupply:['stablecoins',{}],rateSpread:['macro',{series:'rateSpread'}]}[kind];
  if(extra)return load('lab:'+extra[0],{...input,...extra[1]});
  const c=selection({...data.settings,...input});
  if(kind==='liquidations'){
   let entry=feeds.get(c.asset);if(!entry){if(feeds.size>=4){const first=feeds.keys().next().value;feeds.get(first).feed.stop();feeds.delete(first);}entry={feed:liquidationFactory(c.asset),touched:now()};feeds.set(c.asset,entry);}entry.touched=now();return entry.feed.view();
  }
  const provider=['etf','transfers','exchangeFlows','heatmap'].includes(kind)?'coinglass':['mvrv','nupl','sopr'].includes(kind)?'glassnode':null;
  const keys=provider?{[provider]:data.keys[provider]||''}:{};
  const result=await(query?query(kind,c,keys):service.query(kind,c,keys));
  if(result.state!=='ready')return result;
  if(kind==='etf'){
   const previous=data.observations.etf[c.asset]||{},next={},reports=result.data.reports.map(r=>{const signature=JSON.stringify([r.value,r.funds]),old=previous[r.date];const revision=!!old&&(old.signature!==signature||old.revision);next[r.date]={signature,revision};return{...r,revision};});
   result.data={...result.data,...reports.at(-1),reports,calendar:marketDay(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now()))};
   if(JSON.stringify(previous)!==JSON.stringify(next))save({...data,observations:{...data.observations,etf:{...data.observations.etf,[c.asset]:next}}});
  }
  if(kind==='positions'){
   const previous=data.observations.positions,next={...previous};
   result.data.accounts=result.data.accounts.map(account=>{const old=previous[account.address],changes=[];
    if(old&&now()-old.at<7*86400000)for(const asset of new Set([...old.positions.map(p=>p.asset),...account.positions.map(p=>p.asset)])){const before=old.positions.find(p=>p.asset===asset)?.size||0,after=account.positions.find(p=>p.asset===asset)?.size||0;if(before!==after)changes.push({asset,before,after,delta:after-before,from:old.at,to:account.at});}
    const history=[...changes,...(old?.changes||[])].filter(v=>now()-v.to<7*86400000).slice(0,20);
    next[account.address]={at:account.at,positions:account.positions.map(p=>({asset:p.asset,size:p.size})),changes:history};return{...account,changes:history,baseline:!old};});
   const keep=new Set(c.addresses);for(const address of Object.keys(next))if(!keep.has(address))delete next[address];
   if(JSON.stringify(previous)!==JSON.stringify(next))save({...data,observations:{...data.observations,positions:next}});
  }
  return result;
 }
 async function check(){
  for(const [asset,e]of feeds)if(now()-e.touched>90000){e.feed.stop();feeds.delete(asset);}
  if(running||error)return;running=true;try{
   const active=data.alerts.filter(a=>a.active),results=new Map();let failed=false;
   for(const a of active){const id=[a.metric,a.asset,a.period].join(':');if(results.has(id))continue;const r=await load(a.metric,{asset:a.asset,period:a.period,minUSD:0,allAssets:false});results.set(id,alertValue(r,a.metric,now()));if(!results.get(id))failed=true;}
   const next=structuredClone(data),notices=[];
   for(const a of next.alerts.filter(a=>a.active)){const v=results.get([a.metric,a.asset,a.period].join(':'));if(!v)continue;const inside=a.condition==='above'?v.value>=a.threshold:v.value<=a.threshold;
    if(inside&&!a.inside&&(!a.lastTriggered||now()-a.lastTriggered>=a.cooldownMinutes*60000)){
     a.lastTriggered=now();const event={at:now(),value:v.value,observedAt:v.at,evidence:v.evidence||null};a.history=[...a.history,event].slice(-20);notices.push({...a,event});
    }a.inside=inside;a.lastObserved=v;
   }
   if(JSON.stringify(next.alerts)!==JSON.stringify(data.alerts))save(next);
   checkError=failed?'Some metric feeds are unavailable, stale or incomplete. Those alerts remain active.':null;
   for(const a of notices)try{notify(a)}catch{checkError='A metric alert was saved but the device notification could not be shown.';}
  }catch{checkError='Metric alerts could not be checked. Saved alerts were kept.';}finally{running=false;}
 }
 return{view,mutate,query:load,check,stop(){for(const e of feeds.values())e.feed.stop();feeds.clear();service.clear();lab.clear();}};
}
module.exports={METRICS,defaults,validKey,validateAlert,fingerprint,alertValue,createResearchWorkspace};
