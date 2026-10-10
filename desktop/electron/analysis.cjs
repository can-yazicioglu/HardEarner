const {LAYOUTS,layout:checkLayout}=require('./research-layout.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {request}=require('./exchange-adapters.cjs');
const {validAssetSymbol}=require('./asset-symbol.cjs');
const {RANGES,SECONDS,rangeStart}=require('./chart-ranges.cjs');
const cache=new Map(),pending=new Map();
const usdQuotes=require('./alert-markets.cjs').createUsdQuotes(request);
const alertConfig=v=>{if(v?.venue==='kraken')return require('./alert-markets.cjs').usdConfig(v);const c=config(v);if(v.quote&&v.quote!==c.quote)throw Error('The alert currency must match its exchange market.');return c;};
const alertKey=v=>{const c=alertConfig(v);return[c.venue,c.type,c.asset,c.quote].join(':')};
function config(v){
 if(v?.venue==='securities'){if(!require('./securities-domain.cjs').isSecurity(v.type)||!validAssetSymbol(v.asset)||!['USD','GBP','GBX','TRY','EUR','CHF','CAD','AUD','JPY'].includes(v.quote)||!['line','area','candles'].includes(v.style)||v.range!=null&&v.range!=='recent'&&!Object.hasOwn(RANGES,v.range))throw Error('Unsupported investment chart.');return{venue:'securities',type:v.type,asset:v.asset,quote:v.quote,interval:'1d',style:v.style,range:v.range||'1Y'}}
 if(!v||!['binance','okx','reference','goldapi'].includes(v.venue)||!['crypto','cash','metal'].includes(v.type)||!validAssetSymbol(v.asset)||!['1s','5s','1m','5m','15m','1h','4h','1d'].includes(v.interval)||!['candles','line','area'].includes(v.style))throw Error('Unsupported chart settings.');
 if(v.venue==='goldapi'){
  if(v.type!=='metal'||!['XAU','XAG','XPT','XPD'].includes(v.asset))throw Error('Choose gold, silver, platinum or palladium.');
  return{range:'recent',venue:'goldapi',type:'metal',asset:v.asset,interval:'5s',style:v.style==='candles'?'line':v.style,quote:'USD'};
 }
 if((v.venue==='reference')!==(v.type!=='crypto'))throw Error('Choose a matching market data source.');
 if(v.range!=null&&v.range!=='recent'&&!Object.hasOwn(RANGES,v.range))throw Error('Unsupported chart period.');
 if(v.interval==='5s'||v.venue==='okx'&&v.interval==='1s'&&(!v.range||v.range==='recent'))throw Error('One-second candles are available on Binance.');
 return{range:v.range||'recent',venue:v.venue,type:v.type,asset:v.asset,interval:v.venue==='reference'?'1d':RANGES[v.range]?.interval||v.interval,style:v.venue==='reference'&&v.style==='candles'?'line':v.style,quote:v.venue==='reference'?(v.asset==='USD'?'TRY':'USD'):'USDT'};
}
function chartKey(v){const c=config(v);return[c.venue,c.type,c.asset,c.interval,c.quote].join(':')}
function candles(raw,okx=false){if(!Array.isArray(raw))throw Error('No candle data returned.');const seen=new Set(),bars=[];for(const r of raw){const [ms,o,h,l,c,v]=r||[],time=Math.floor(Number(ms)/1000),open=Number(o),high=Number(h),low=Number(l),close=Number(c),volume=Number(v);if(!Number.isSafeInteger(time)||time<=0||[open,high,low,close].some(n=>!Number.isFinite(n)||n<=0)||!Number.isFinite(volume)||volume<0||high<Math.max(open,close,low)||low>Math.min(open,close,high)||seen.has(time))throw Error('The provider returned inconsistent candles.');seen.add(time);bars.push({time,open,high,low,close,volume})}if(!bars.length)throw Error('No price history is available for this market.');return bars.sort((a,b)=>a.time-b.time)}
async function exchangeHistory(c,{requester=request,now=Date.now(),prior=[]}={}){
 const start=rangeStart(c.range,now),floor=start==null?null:Math.floor(start/SECONDS[c.interval]-55)*SECONDS[c.interval];
 let bars,source;
 if(c.venue==='binance'){
  bars=candles(await requester('https://api.binance.com/api/v3/klines?'+new URLSearchParams({symbol:c.asset+'USDT',interval:c.interval,limit:'500'})));source='Binance';
 }else{
  const interval={'1h':'1H','4h':'4H','1d':'1Dutc'}[c.interval]||c.interval;
  const params={instId:c.asset+'-USDT',bar:interval};
  const get=async(path,extra)=>{const d=await requester('https://www.okx.com/api/v5/market/'+path+'?'+new URLSearchParams({...params,...extra}));if(d.code!=='0'||!Array.isArray(d.data))throw Error('This market is unavailable on OKX.');return d.data.length?candles(d.data,true):[]};
  bars=await get('candles',{limit:'300'});if(!bars.length)throw Error('No price history is available for this market.');
  // Reuse already-fetched older candles. Never bridge an unchecked offline gap.
  if(prior.length&&prior.at(-1).time>=bars[0].time){const merged=new Map(prior.map(b=>[b.time,b]));for(const b of bars)merged.set(b.time,b);bars=[...merged.values()].sort((a,b)=>a.time-b.time);}
  if(floor!=null)for(let page=0;page<6&&bars[0].time>floor;page++){
   const first=bars[0].time,older=await get('history-candles',{after:String(first*1000),limit:'100'});
   if(!older.length)break;
   const additions=older.filter(b=>b.time<first);if(!additions.length)throw Error('Older chart history could not be loaded.');
   bars=[...additions,...bars];
  }
  source='OKX';
 }
 return{bars:bars.filter(b=>floor==null||b.time>=floor).slice(-600),source,rangeStart:start};
}
async function history(input){const c=config(input);if(c.venue==='goldapi')return{...c,...await require('./metal-session.cjs').sample(c.asset)};const key=chartKey(c)+':'+c.range,cached=cache.get(key);if(cached&&Date.now()-cached.fetchedAt<15000)return cached;if(pending.has(key))return pending.get(key);const job=(async()=>{let bars,source,start=rangeStart(c.range);
 if(c.venue==='reference'){const d=await require('./market.cjs').history(c.asset,c.type,365,c.quote);bars=d.points.map(p=>({time:Math.floor(p.time/1000),close:p.value}));source=d.source;}
 else{const d=await exchangeHistory(c,{prior:cached?.bars||[]});bars=d.bars;source=d.source;start=d.rangeStart;}
 if(!bars.length)throw Error('No price history is available for this market.');
 const result={...c,bars,source,rangeStart:start,rangeLimited:start!=null&&bars[0].time>start+SECONDS[c.interval]*2,fetchedAt:Date.now(),lastTime:bars.at(-1).time};cache.set(key,result);if(cache.size>80)cache.delete(cache.keys().next().value);return result;
 })();pending.set(key,job);try{return await job}finally{pending.delete(key)}}
async function quote(input){if(input?.venue==='kraken')return usdQuotes(input);const c=config(input);if(c.venue==='reference'){const d=await history(c);return{value:d.bars.at(-1).close,at:d.bars.at(-1).time*1000,reference:true}}
 if(c.venue==='binance'){const d=await request('https://api.binance.com/api/v3/ticker/24hr?symbol='+encodeURIComponent(c.asset+'USDT'));return validQuote(d.lastPrice,d.closeTime)}const d=await request('https://www.okx.com/api/v5/market/ticker?instId='+encodeURIComponent(c.asset+'-USDT'));if(d.code!=='0')throw Error('Quote unavailable.');return validQuote(d.data?.[0]?.last,d.data?.[0]?.ts)}
function validQuote(value,at){value=Number(value);at=Number(at);if(!Number.isFinite(value)||value<=0||!Number.isFinite(at)||Date.now()-at>120000||at>Date.now()+60000)throw Error('Live quote is stale or invalid.');return{value,at}}
function crossed(a,q){return q.value>0&&Number.isFinite(q.value)&&(a.condition==='above'?q.value>=a.price:q.value<=a.price)}
const initial={version:1,researchVersion:1,panels:[{venue:'binance',type:'crypto',asset:'BTC',interval:'1h',style:'candles'}],drawings:{},notes:{},alerts:[],tray:true};
function createAnalysis({dir,safeStorage,notify,getQuote=quote}){const file=path.join(dir,'analysis.encrypted');let data=structuredClone(initial),error=null,running=false,lastCheck=null,checkError=null;
 if(fs.existsSync(file))try{const d=JSON.parse(require('./encrypted-read.cjs').readEncrypted(file,safeStorage).text);if(d.version!==1||!Array.isArray(d.alerts)||!Array.isArray(d.panels)||typeof d.drawings!=='object'||typeof d.notes!=='object')throw Error();if(d.panels.length<1||d.panels.length>8)throw Error();d.panels=d.panels.map(config);if(d.layout){d.layout=checkLayout(d.layout);if(LAYOUTS[d.layout.mode]!==d.panels.length)throw Error();}if(d.savedLayouts){if(!Array.isArray(d.savedLayouts)||d.savedLayouts.length>20||new Set(d.savedLayouts.map(l=>l.name)).size!==d.savedLayouts.length)throw Error();d.savedLayouts=d.savedLayouts.map(l=>{if(typeof l.name!=='string'||!l.name.trim()||l.name.length>48||!Array.isArray(l.panels))throw Error();const layout=checkLayout(l.layout);if(l.panels.length!==LAYOUTS[layout.mode])throw Error();return{name:l.name,layout,panels:l.panels.map(config)}});}if(!d.researchVersion){d.panels=d.panels.map(c=>c.venue==='goldapi'?config({...c,venue:'reference',interval:'1d',range:'1Y'}):c);d.researchVersion=1}data=d}catch{error='Analysis storage could not be read. The original file was preserved.'}
 function persist(next){if(error)throw Error(error);if(!safeStorage.isEncryptionAvailable())throw Error('Windows encryption unavailable.');require('./encrypted-file.cjs').writeEncrypted(file,JSON.stringify(next),safeStorage);data=next;}
 function view(){return structuredClone({...data,error,lastCheck,checkError})}
 function mutate(action,v){const d=structuredClone(data);
  if(action==='panels'){if(!Array.isArray(v)||v.length<1||v.length>8)throw Error('Choose between one and eight charts.');d.panels=v.map(config);d.layout=checkLayout({...d.layout,mode:({1:'1',2:d.layout?.mode==='2v'?'2v':'2h',3:'3',4:'4',6:'6',8:'8'})[v.length]||'8'});while(d.panels.length<LAYOUTS[d.layout.mode])d.panels.push({...d.panels.at(-1)});}
  else if(action==='layout'){d.layout=checkLayout(v);d.panels=Array.from({length:LAYOUTS[d.layout.mode]},(_,i)=>config(d.panels[i]||{...d.panels[0],asset:i%2?'ETH':'BTC',type:'crypto',venue:'binance',interval:'1h',style:'candles'}));}
  else if(action==='saveLayout'){const name=String(v).trim();if(!name||name.length>48)throw Error('Use a layout name up to 48 characters.');const saved=(d.savedLayouts||[]).filter(x=>x.name!==name);if(saved.length>=20)throw Error('Up to 20 layouts can be saved.');d.savedLayouts=[...saved,{name,panels:d.panels,layout:checkLayout(d.layout||{mode:d.panels.length===2?'2h':'1'})}];}
  else if(action==='loadLayout'){const saved=d.savedLayouts?.find(x=>x.name===v);if(!saved)throw Error('Layout not found.');d.panels=saved.panels.map(config);d.layout=checkLayout(saved.layout);}
  else if(action==='deleteLayout')d.savedLayouts=(d.savedLayouts||[]).filter(x=>x.name!==v);
  else if(action==='drawing'){const key=chartKey(v.config),list=d.drawings[key]||[];if(Object.keys(d.drawings).length>=200&&!d.drawings[key])throw Error('Drawing workspace is full.');if(!['horizontal','vertical','trend','freehand'].includes(v.kind)||list.length>=80||!Array.isArray(v.points)||(v.kind==='freehand'?(v.points.length<2||v.points.length>1000):v.points.length!==(v.kind==='trend'?2:1))||v.points.some(p=>!Number.isFinite(p.price)||p.price<=0||!Number.isFinite(p.time)||p.time<0||p.time>7258118400))throw Error('Invalid drawing.');d.drawings[key]=[...list,{id:crypto.randomUUID(),kind:v.kind,points:v.points.map(p=>({time:p.time,price:p.price}))}]}
  else if(action==='deleteDrawing'){const key=chartKey(v.config);d.drawings[key]=(d.drawings[key]||[]).filter(x=>x.id!==v.id)}
  else if(action==='note'){const key=chartKey(v.config);if(typeof v.text!=='string'||v.text.length>4000||Object.keys(d.notes).length>=200&&!Object.hasOwn(d.notes,key))throw Error('Note is too large.');d.notes[key]=v.text}
  else if(action==='alert'||action==='alerts'){
   const values=action==='alerts'?v:[v];if(!Array.isArray(values)||!values.length||values.length>100)throw Error('Choose between 1 and 100 price alerts.');
   const next=values.map(v=>{const c=alertConfig(v.config);if(c.type!=='crypto')throw Error('Device alerts require an intraday exchange feed.');if(!Number.isFinite(v.price)||v.price<=0||!['above','below'].includes(v.condition)||!['BUY','SELL','WATCH'].includes(v.intent))throw Error('Enter a positive price.');return{id:crypto.randomUUID(),config:c,price:v.price,condition:v.condition,intent:v.intent,status:'armed',createdAt:new Date().toISOString()};});
   const fingerprint=a=>[alertKey(a.config),a.intent,a.condition,a.price].join(':'),active=d.alerts.filter(a=>a.status==='armed'),seen=new Set(active.map(fingerprint));
   for(const a of next){if(seen.has(fingerprint(a)))throw Error('This price alert is already armed.');seen.add(fingerprint(a));}
   if(active.length+next.length>100)throw Error('Up to 100 alerts can be active.');
   d.alerts=[...d.alerts.filter(a=>a.status!=='armed').slice(-(200-active.length-next.length)),...active,...next];
  }
  else if(action==='deleteAlert')d.alerts=d.alerts.filter(a=>a.id!==v);
  else if(action==='tray')d.tray=!!v;
  else throw Error('Unknown analysis action.');persist(d);return view();
 }
 async function check(){if(running||error)return;running=true;try{const groups=new Map();for(const a of data.alerts.filter(a=>a.status==='armed')){const key=alertKey(a.config);if(!groups.has(key))groups.set(key,a.config)}const results=new Map();let failed=false;for(const[key,c]of groups)try{results.set(key,await getQuote(c))}catch{failed=true}lastCheck=new Date().toISOString();checkError=failed?'Some alert feeds are unavailable. Affected alerts remain armed.':null;const next=structuredClone(data),triggered=[];for(const a of next.alerts){const q=results.get(alertKey(a.config));if(a.status==='armed'&&q&&!q.reference&&Date.now()-q.at<=120000&&q.at<=Date.now()+60000&&crossed(a,q)){a.status='triggered';a.triggeredAt=lastCheck;a.observed=q.value;triggered.push(a)}}if(triggered.length){persist(next);for(const a of triggered)try{notify(a)}catch{checkError='An alert triggered but Windows could not display its notification. See alert history.'}}}catch{checkError='Alerts could not be saved. Check local storage.'}finally{running=false}}
 return{view,mutate,check};
}
module.exports={alertConfig,alertKey,config,chartKey,candles,history,exchangeHistory,quote,validQuote,crossed,createAnalysis};
