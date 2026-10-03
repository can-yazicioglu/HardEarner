const crypto=require('node:crypto');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {validAssetSymbol}=require('./asset-symbol.cjs');
const exchanges=require('./exchange-adapters.cjs');
const personalBanks=require('./personal-banks.cjs');
const REDIRECT='http://localhost:43827/callback';
async function request(url,options={}){
 let response;try{response=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)});}catch{throw Error('Connection unavailable. Check your internet connection and try again.');}
 if(!response.ok){const e=Error(response.status===401||response.status===403?'Access was refused. Check permissions or reconnect.':response.status===429?'Provider rate limit reached. Please try later.':'The provider could not complete the request. Please retry or reconnect.');e.status=response.status;throw e;}
 try{return await response.json()}catch{throw Error('The provider returned an invalid response.');}
}
function validateBinanceCredentials(input){
 for(const key of ['apiKey','apiSecret'])if(typeof input?.[key]!=='string'||!/^[A-Za-z0-9]{32,256}$/.test(input[key]))throw Error('Enter a valid Binance API key and secret.');
 return {apiKey:input.apiKey,apiSecret:input.apiSecret};
}
function assertReadOnly(p){
 if(p.enableReading!==true)throw Error('Enable reading permission for this API key.');
 if(p.permitsUniversalTransfer===true||Object.entries(p).some(([k,v])=>v===true&&/^enable/i.test(k)&&/(trade|trading|withdraw|transfer|futures|margin|vanilla|options)/i.test(k)))throw Error('Use a read-only key. Disable trading, transfers and withdrawals in Binance first.');
}
function normalizeBinance(data){
 if(!Array.isArray(data?.balances))throw Error('Binance returned incomplete balances.');
 const decimal=v=>(typeof v==='number'||typeof v==='string'&&/^\d+(?:\.\d+)?$/.test(v))&&Number.isFinite(Number(v))&&Number(v)>=0;
 const balances=[],seen=new Set();
 for(const b of data.balances){
  if(!b||!decimal(b.free)||!decimal(b.locked)||!Number.isFinite(Number(b.free)+Number(b.locked)))throw Error('Binance returned an invalid balance amount. Previously saved balances were kept.');
  const free=Number(b.free),locked=Number(b.locked);
  // Some responses contain a full asset catalogue, including empty legacy rows.
  if(free===0&&locked===0)continue;
  if(!validAssetSymbol(b.asset))throw Error('Binance returned an unsupported asset identifier. Previously saved balances were kept.');
  if(seen.has(b.asset))throw Error('Binance returned duplicate asset balances. Previously saved balances were kept.');
  seen.add(b.asset);balances.push({id:b.asset,asset:b.asset,quantity:free+locked,available:free,locked,name:b.asset,type:'crypto'});
 }
 return balances;
}
async function fetchBinance(credentials){
 const {apiKey,apiSecret}=validateBinanceCredentials(credentials);
 const time=await request('https://api.binance.com/api/v3/time');if(!Number.isFinite(time.serverTime))throw Error('Binance time is unavailable.');
 const signed=async(endpoint,params={})=>{const q=new URLSearchParams({timestamp:String(time.serverTime),recvWindow:'20000',...params}).toString();const signature=crypto.createHmac('sha256',apiSecret).update(q).digest('hex');return request('https://api.binance.com'+endpoint+'?'+q+'&signature='+signature,{headers:{'X-MBX-APIKEY':apiKey}})};
 assertReadOnly(await signed('/sapi/v1/account/apiRestrictions'));
 return normalizeBinance(await signed('/api/v3/account',{omitZeroBalances:'true'}));
}
function normalizeBank(account,balance){
 const b=balance?.results?.[0],quantity=Number(b?.current),available=b?.available==null?quantity:Number(b.available);
 if(!b||b.current==null||!Number.isFinite(quantity)||!Number.isFinite(available)||!/^[A-Z]{3}$/.test(account.currency)||b.currency!==account.currency||!account.account_id)throw Error('The bank returned an incomplete balance. Previous balances were kept.');
 return {id:String(account.account_id),asset:account.currency,quantity,available,locked:Math.max(0,quantity-available),name:String(account.display_name||'Bank account').slice(0,100),type:'cash',at:Number.isFinite(Date.parse(b.update_timestamp))?b.update_timestamp:null};
}
async function fetchBinanceWallets(c){
 const spot=await fetchBinance(c),at=new Date().toISOString(),balances=spot.map(b=>({...exchanges.row(b.asset,b.quantity,b.available,'Spot',b.id),at})),coverage=[{wallet:'Spot',ok:true,at}];
 const clock=await request('https://api.binance.com/api/v3/time');if(!Number.isFinite(clock.serverTime))throw Error('Binance time is unavailable.');const offset=clock.serverTime-Date.now();
 const signed=async(endpoint,params={},method='GET')=>{const q=new URLSearchParams({...params,timestamp:String(Date.now()+offset),recvWindow:'20000'}).toString(),signature=crypto.createHmac('sha256',c.apiSecret).update(q).digest('hex'),encoded=q+'&signature='+signature;return request('https://api.binance.com'+endpoint+(method==='GET'?'?'+encoded:''),{method,headers:{'X-MBX-APIKEY':c.apiKey,'Content-Type':'application/x-www-form-urlencoded'},...(method==='POST'?{body:encoded}:{})})};
 for(const wallet of ['Funding','Earn flexible','Earn locked']){
  try{let rows=[];
   if(wallet==='Funding'){const data=await signed('/sapi/v1/asset/get-funding-asset',{},'POST');if(!Array.isArray(data))throw Error('Incomplete Funding response.');rows=data.map(b=>exchanges.row(b.asset,exchanges.amount(b.free)+exchanges.amount(b.locked)+exchanges.amount(b.freeze)+exchanges.amount(b.withdrawing),b.free,wallet));}
   else {const flexible=wallet==='Earn flexible';let count=0;for(let page=1;page<=100;page++){const d=await signed('/sapi/v1/simple-earn/'+(flexible?'flexible':'locked')+'/position',{current:String(page),size:'100'});if(!Array.isArray(d.rows)||!Number.isInteger(Number(d.total))||Number(d.total)<0)throw Error('Incomplete Earn response.');rows.push(...d.rows.map(b=>{const id=flexible?b.productId:b.positionId;if(id==null)throw Error('Incomplete Earn position.');return exchanges.row(b.asset,flexible?b.totalAmount:b.amount,0,wallet,String(id))}));count+=d.rows.length;if(count>=Number(d.total))break;if(!d.rows.length||page===100)throw Error('Incomplete Earn pagination.');}}
   balances.push(...exchanges.unique(rows).map(b=>({...b,at})));coverage.push({wallet,ok:true,at});
  }catch{const previous=(c.balances||[]).filter(b=>b.wallet===wallet);balances.push(...previous);coverage.push({wallet,ok:false,at:c.coverage?.find(w=>w.wallet===wallet)?.at||null,cached:previous.length>0});}
 }
 return{balances,coverage};
}
const{linkedHoldings}=require('./connections-view.cjs');
function createConnections({dir,safeStorage,openExternal,getHoldings=()=>[],notifyMovements=()=>{}}){
 const file=path.join(dir,'connections.encrypted');let data={connections:[]},broken=false,pending=null,storageError=null;const inflight=new Map();
 let recovered=false;
 if(fs.existsSync(file))try{const opened=require('./encrypted-read.cjs').readEncrypted(file,safeStorage);data=JSON.parse(opened.text);if(!Array.isArray(data.connections))throw Error();recovered=opened.recovered;}catch{broken=true;data={connections:[]};}
 function reconcile(){let changed=false;const manual=getHoldings();if(!manual)return false;for(const c of data.connections){if(c.sandbox||c.inclusionDecision==='excluded'||c.included&&c.inclusionDecision!=='automatic')continue;const overlaps=manual.some(h=>!h.excluded&&(c.balances||[]).some(b=>b.quantity!==0&&b.asset===h.asset&&b.type===h.type));if(overlaps){if(c.included){c.included=false;c.inclusionDecision='review';changed=true;}}else if(!c.included){c.included=true;c.inclusionDecision='automatic';changed=true;}}return changed;}
 let durable=structuredClone(data);
 function persist(){try{reconcile();if(broken)throw Error('Connection storage could not be opened. Your original file was preserved.');if(!safeStorage.isEncryptionAvailable())throw Error('Windows encryption is unavailable.');require('./encrypted-file.cjs').writeEncrypted(file,JSON.stringify(data),safeStorage);durable=structuredClone(data);storageError=null;}catch(e){data=structuredClone(durable);storageError=e.message;e.storageFailure=true;throw e;}}
 function view(){return {error:broken?'Connection storage could not be opened. Your original file was preserved.':storageError,pending:!!pending,redirect:REDIRECT,notifications:data.notifications||[],movementNotifications:data.movementNotifications!==false,connections:data.connections.map(({id,kind,label,balances,lastSync,error,included,sandbox,coverage,history,inclusionDecision,acquisitions,tracking,retry,funding,network,address})=>({id,kind,label,balances,lastSync,error,included,sandbox,coverage,retry,network,address,funding:funding?{complete:funding.complete,issues:funding.issues,updatedAt:funding.updatedAt,count:funding.records?.length}:undefined,history:history?{...history,ledgers:undefined,pending:undefined}:history,inclusionDecision,acquisitions,tracking,syncing:inflight.has(id)}))};}
 function find(id){const c=data.connections.find(c=>c.id===id);if(!c)throw Error('Connection not found.');return c;}
 async function bankBalances(c){
  const auth=c.sandbox?'https://auth.truelayer-sandbox.com':'https://auth.truelayer.com',api=c.sandbox?'https://api.truelayer-sandbox.com':'https://api.truelayer.com';
  if(Date.now()>c.expiresAt-60000){if(!c.refreshToken)throw Error('Your bank access has expired. Reconnect to renew consent.');const token=await request(auth+'/connect/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',client_id:c.clientId,client_secret:c.clientSecret,refresh_token:c.refreshToken}).toString()});if(!token.access_token)throw Error('Your bank access has expired. Reconnect to renew consent.');c.accessToken=token.access_token;c.refreshToken=token.refresh_token||c.refreshToken;c.expiresAt=Date.now()+Number(token.expires_in||3600)*1000;persist();}
  const headers={Authorization:'Bearer '+c.accessToken};const result=await request(api+'/data/v1/accounts',{headers});if(!Array.isArray(result.results))throw Error('The bank returned incomplete accounts.');
  const balances=[];for(const a of result.results){balances.push(normalizeBank(a,await request(api+'/data/v1/accounts/'+encodeURIComponent(a.account_id)+'/balance',{headers})));}return balances;
 }
 async function sync(id,{automatic=false}={}){if(require('./kraken-auth.cjs').blocked(find(id),automatic))return view();if(inflight.has(id))return inflight.get(id);const job=(async()=>{const c=find(id),originalToken=c.accessToken,previousBalances=structuredClone(c.balances||[]);try{const result=c.kind==='trading212'?await require('./trading212.cjs').fetchAccount(c):c.kind==='wallet'?await require('./public-wallets.cjs').fetchWallet(c):c.kind==='binance'?await fetchBinanceWallets(c):{balances:c.kind==='truelayer'?await bankBalances(c):personalBanks.SUPPORTED.includes(c.kind)?await personalBanks.fetchBank(c.kind,c):await exchanges.fetchExchange(c.kind,c)};if(!data.connections.includes(c)||personalBanks.SUPPORTED.includes(c.kind)&&c.accessToken!==originalToken)return view();c.balances=result.balances;c.coverage=result.coverage;if(c.kind==='wallet'||c.kind==='trading212')c.history=result.history;if(c.kind==='trading212')c.brokerMetadata=result.brokerMetadata;c.lastSync=new Date().toISOString();c.error=null;delete c.retry;if(c.kind==='binance')c.label='Binance.com';const movements=require('./account-movements.cjs').observe(c);if(movements.length)data.notifications=[...(data.notifications||[]),...movements].slice(-200);persist();if(movements.length)try{notifyMovements(movements,data.movementNotifications!==false)}catch{}
 if(c.kind==='trading212'){await require('./history-values.cjs').enrich(c);if(data.connections.includes(c))persist();}
 if(c.kind==='wallet'){require('./purchase-tracking.cjs').checkpoint(c,previousBalances);await require('./history-values.cjs').enrich(c);if(data.connections.includes(c))persist();}
 if(['binance','binancetr','kraken'].includes(c.kind)){
  try{c.funding=await require('./funding-history.cjs').fetchFunding(c);if(!data.connections.includes(c))return view();c.history={...(c.history||{events:[],fx:{}}),movements:c.kind==='kraken'?c.history?.movements||[]:c.funding.records};const history=require('./funding-history.cjs').withFunding(c,await require(c.kind==='kraken'?'./kraken-history.cjs':c.kind==='binancetr'?'./binancetr-history.cjs':'./binance-history.cjs').fetchHistory(c));if(!data.connections.includes(c))return view();c.history=history;if(c.kind==='kraken'&&history.errorCode){const e=require('./kraken-auth.cjs').responseError([history.errorCode]);if(e){c.error=e.message;require('./kraken-auth.cjs').recordFailure(c,e)}}require('./purchase-tracking.cjs').checkpoint(c,previousBalances);persist();
   const keys=[...new Set((history.events||[]).flatMap(e=>[e.quote,e.base,e.feeAsset,...(e.fees||[]).map(f=>f.asset)].filter(a=>['TRY','USD','GBP','EUR'].includes(a)).map(a=>a+':'+new Date(e.time).toISOString().slice(0,10))))].filter(k=>!history.fx[k]);
   for(const key of keys.slice(0,8)){const [base,date]=key.split(':');try{history.fx[key]=await require('./market.cjs').costRates(base,date)}catch{break}}
   await require('./history-values.cjs').enrich(c);if(data.connections.includes(c))persist();
  }catch(e){if(e.storageFailure)throw e;if(data.connections.includes(c)){c.history={...(c.history||{events:[],fx:{}}),complete:false,issues:['Some transaction history is unavailable.']};persist();}}
 }}catch(e){if(e.storageFailure)throw e;if(data.connections.includes(c)&&(!personalBanks.SUPPORTED.includes(c.kind)||c.accessToken===originalToken)){c.error=e.message;require('./kraken-auth.cjs').recordFailure(c,e);persist();}}return view()})();inflight.set(id,job);try{return await job}finally{inflight.delete(id)}}
 async function replaceExchangeKey(id,input){
  const c=find(id);if(!['binance','trading212',...exchanges.PROVIDERS].includes(c.kind))throw Error('Use Renew access for this provider.');
  if(input?.sameAccount!==true)throw Error('Confirm this key belongs to the same connected account.');
  if(inflight.has(id))throw Error('Wait for the current sync to finish.');
  if(c.retry?.notBefore>Date.now())throw Error('Wait until the displayed retry time before contacting Kraken again.');
  const creds=c.kind==='trading212'?require('./trading212.cjs').credentials(input):c.kind==='binance'?validateBinanceCredentials(input):exchanges.credentials(c.kind,input);
  const job=(async()=>{try{
   const result=c.kind==='trading212'?await require('./trading212.cjs').fetchAccount({...c,...creds}):c.kind==='binance'?await fetchBinanceWallets(creds):{balances:await exchanges.fetchExchange(c.kind,creds)};const balances=result.balances;
   if(!data.connections.includes(c))throw Error('Connection not found.');
   // Verify before replacing credentials; keep this same account's saved lots.
   Object.assign(c,creds,{balances,coverage:result.coverage,lastSync:new Date().toISOString(),error:null});delete c.retry;
   if(c.history){delete c.history.retryAt;delete c.history.errorCode;}
   persist();return view();
  }catch(e){if(data.connections.includes(c)&&e.code==='EGeneral:Temporary lockout'){c.error=e.message;require('./kraken-auth.cjs').recordFailure(c,e);persist()}throw e}})();
  inflight.set(id,job);try{return await job}finally{inflight.delete(id)}
 }
 const replaceKrakenKey=async(id,input)=>{if(find(id).kind!=='kraken')throw Error('This repair is only available for Kraken.');return replaceExchangeKey(id,input)};
 async function connectBinance(input){if(data.connections.some(c=>c.kind==='binance'))throw Error('Binance is already connected. Disconnect before replacing its key.');const credentials=validateBinanceCredentials(input);const {balances,coverage}=await fetchBinanceWallets(credentials);data.connections.push({id:crypto.randomUUID(),kind:'binance',label:'Binance.com',...credentials,balances,coverage,included:false,lastSync:new Date().toISOString(),error:null});persist();return view();}
 async function connectExchange(kind,input){if(kind==='trading212'){if(data.connections.some(c=>c.kind===kind))throw Error('This provider is already connected.');const creds=require('./trading212.cjs').credentials(input),result=await require('./trading212.cjs').fetchAccount(creds);data.connections.push({id:crypto.randomUUID(),kind,label:'Trading 212',...creds,...result,included:false,lastSync:new Date().toISOString(),error:null});persist();return view();}if(personalBanks.SUPPORTED.includes(kind)){const creds=personalBanks.credentials(kind,input),balances=await personalBanks.fetchBank(kind,creds),existing=data.connections.find(c=>c.kind===kind);if(existing)Object.assign(existing,creds,{balances,lastSync:new Date().toISOString(),error:null});else data.connections.push({id:crypto.randomUUID(),kind,label:kind==='monzo'?'Monzo · UK':'Starling Bank · UK',...creds,balances,included:false,lastSync:new Date().toISOString(),error:null});persist();return view()}if(kind==='binance'){const result=await connectBinance(input);return sync(result.connections.find(c=>c.kind==='binance').id)}if(data.connections.some(c=>c.kind===kind))throw Error('This provider is already connected.');const creds=exchanges.credentials(kind,input),balances=await exchanges.fetchExchange(kind,creds);const label={binancetr:'Binance TR',btcturk:'BtcTurk',paribu:'Paribu',kraken:'Kraken',coinbase:'Coinbase',okx:'OKX'}[kind];data.connections.push({id:crypto.randomUUID(),kind,label,...creds,balances,included:false,lastSync:new Date().toISOString(),error:null});persist();return ['binancetr','kraken'].includes(kind)?sync(data.connections.find(c=>c.kind===kind).id):view()}
 async function importOlder(id,date){const c=find(id);if(!['binance','binancetr','kraken'].includes(c.kind))throw Error('History import is available for Binance.com, Binance TR and Kraken.');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||date<'2017-01-01'||Date.parse(date)>Date.now())throw Error('Choose a valid start date, today or earlier.');if(inflight.has(id))throw Error('Wait for the current sync to finish.');const since=Date.parse(date);if(c.history?.since&&since>=c.history.since)throw Error('Choose an earlier start date.');c.history={...(c.history||{events:[],pairs:{},fx:{}}),since,windows:{},...(c.kind==='binancetr'?{pairs:{}}:{}),...(c.kind==='kraken'?{pending:null,lastEnd:null}:{}),complete:false,issues:['History import continues on the next sync.']};persist();return sync(id);}
 async function connectWallet(input){
 const fields=require('./public-wallets.cjs').credentials(input);if(data.connections.some(c=>c.kind==='wallet'&&c.network===fields.network&&c.address===fields.address))throw Error('This address and network are already connected.');if(data.connections.filter(c=>c.kind==='wallet').length>=100)throw Error('Up to 100 public addresses are supported.');
 const c={id:crypto.randomUUID(),kind:'wallet',...fields,included:false},result=await require('./public-wallets.cjs').fetchWallet(c);Object.assign(c,result,{lastSync:new Date().toISOString(),error:null});require('./purchase-tracking.cjs').checkpoint(c);await require('./history-values.cjs').enrich(c);data.connections.push(c);persist();return view();
 }
 async function importConversions(id,input){
 const c=find(id);if(c.kind!=='binancetr')throw Error('This statement importer is for Binance TR conversions.');if(inflight.has(id))throw Error('Wait for the current sync to finish.');if(input?.confirmed!==true)throw Error('Review and confirm completed conversion rows first.');
 const rows=require('./statement-import.cjs').preview(input);
 const job=(async()=>{const h=c.history||{events:[],fx:{},complete:false,issues:['Sync history to complete the import.']},events=new Map((h.events||[]).map(e=>[e.id,e])),added=[];
 for(const e of rows){const duplicate=[...events.values()].some(x=>x.base===e.base&&x.quote===e.quote&&x.side===e.side&&Math.abs(x.time-e.time)<1000&&Math.abs(x.quantity-e.quantity)<Math.max(1e-12,e.quantity*1e-10)&&Math.abs(x.paid-e.paid)<Math.max(1e-10,e.paid*1e-10));if(duplicate)continue;
 const eid='statement:'+crypto.createHash('sha256').update(JSON.stringify(e)).digest('hex');events.set(eid,{...e,id:eid});added.push(eid);}
 if(events.size>100000)throw Error('Transaction storage limit reached.');c.history={...h,events:[...events.values()].sort((a,b)=>a.time-b.time),accountingVersion:2,...(added.length?{statementBatch:added}:{})};persist();await require('./history-values.cjs').enrich(c);if(data.connections.includes(c))persist();})();
 inflight.set(id,job);try{await job}finally{inflight.delete(id)}return view();
 }
 function undoConversions(id){const c=find(id);if(inflight.has(id))throw Error('Wait for the current sync to finish.');const ids=new Set(c.history?.statementBatch||[]);if(!ids.size)throw Error('No conversion import to undo.');c.history.statementArchive=[...(c.history.statementArchive||[]),...(c.history.events||[]).filter(e=>ids.has(e.id))].slice(-2000);c.history.events=c.history.events.filter(e=>!ids.has(e.id));c.history.statementBatch=[];persist();return view();}
 async function setAcquisition(id,asset,input){const c=find(id);if(typeof asset!=='string'||!validAssetSymbol(asset))throw Error('Invalid asset symbol.');if(input===null){if(c.acquisitions)delete c.acquisitions[asset];persist();return view();}const entry=require('./acquisition.cjs').validate(c,asset,input);try{const fx=await require('./market.cjs').costRates(entry.currency,entry.date);entry.fx=fx.rates;entry.fxDate=fx.date}catch{}if(!data.connections.includes(c))throw Error('Connection not found.');require('./acquisition.cjs').validate(c,asset,input);c.acquisitions||={};c.acquisitions[asset]=entry;persist();return view();}
 function disconnect(id){find(id);data.notifications=(data.notifications||[]).filter(n=>n.connectionId!==id);data.connections=data.connections.filter(c=>c.id!==id);persist();return view();}
 function readNotifications(ids){if(!Array.isArray(ids)||ids.length>200||ids.some(id=>typeof id!=='string'))throw Error('Invalid notification selection.');for(const n of data.notifications||[])if(ids.includes(n.id))n.read=true;persist();return view();}
 function setMovementNotifications(enabled){if(typeof enabled!=='boolean')throw Error('Invalid notification setting.');data.movementNotifications=enabled;persist();return view();}
 function include(id,value){const c=find(id);if(c.sandbox&&value)throw Error('Sandbox balances cannot be included in your portfolio.');c.included=!!value;c.inclusionDecision=value?'included':'excluded';persist();return view();}
 async function beginBank(input){
  if(pending)throw Error('Finish or cancel the current bank connection first.');
  if(data.connections.some(c=>c.kind==='truelayer'&&c.sandbox===(input?.sandbox!==false)))throw Error('A UK bank connection already exists in this environment. Disconnect it before reconnecting.');
  if(!/^[A-Za-z0-9_-]{3,150}$/.test(input?.clientId)||typeof input.clientSecret!=='string'||input.clientSecret.length<8||input.clientSecret.length>500)throw Error('Enter your TrueLayer application credentials in Advanced setup.');
  const config={clientId:input.clientId,clientSecret:input.clientSecret,sandbox:input.sandbox!==false};
  const state=crypto.randomBytes(32).toString('hex');const auth=config.sandbox?'https://auth.truelayer-sandbox.com':'https://auth.truelayer.com';
  const server=http.createServer(async(req,res)=>{
   const url=new URL(req.url,'http://localhost:43827');res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');
   if(req.method!=='GET'||url.pathname!=='/callback'||url.searchParams.get('state')!==state){res.writeHead(400);res.end('Invalid callback. Return to HardEarner.');return;}
   if(!pending||pending.consumed){res.writeHead(409);res.end('This connection request is no longer active.');return;}pending.consumed=true;
   if(url.searchParams.has('error')||!url.searchParams.get('code')){res.end('Connection cancelled. Return to HardEarner.');cancelBank();return;}
   try{
    const token=await request(auth+'/connect/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:REDIRECT,code:url.searchParams.get('code')}).toString()});
    if(!token.access_token)throw Error('Bank authorization failed.');
    const c={id:crypto.randomUUID(),kind:'truelayer',label:config.sandbox?'UK bank · Sandbox':'UK bank · TrueLayer',...config,accessToken:token.access_token,refreshToken:token.refresh_token,expiresAt:Date.now()+Number(token.expires_in||3600)*1000,included:false,error:null};
    c.balances=await bankBalances(c);c.lastSync=new Date().toISOString();if(!pending||pending.state!==state)throw Error('Connection cancelled.');data.connections.push(c);persist();res.end('Account connected. Return to HardEarner to review balances before including them.');
   }catch{res.writeHead(400);res.end('Connection could not be completed. Return to HardEarner and retry.');}finally{cancelBank();}
  });
  await new Promise((resolve,reject)=>{server.once('error',()=>reject(Error('The local bank callback port is busy. Close other connection windows and retry.')));server.listen(43827,'localhost',resolve)});
  const timer=setTimeout(()=>cancelBank(),5*60*1000);timer.unref();pending={server,timer,state,consumed:false};
  const url=new URL(auth);url.search=new URLSearchParams({response_type:'code',client_id:config.clientId,redirect_uri:REDIRECT,scope:'accounts balance offline_access',state,providers:config.sandbox?'uk-cs-mock':'uk-ob-all uk-oauth-all'}).toString();
  try{await openExternal(url.href)}catch{cancelBank();throw Error('The browser could not be opened.');}return view();
 }
 function cancelBank(){if(pending){clearTimeout(pending.timer);pending.server.close();pending=null;}return view();}
 if(!broken&&reconcile())try{persist()}catch{}
 return {view,readNotifications,setMovementNotifications,sync,importOlder,importConversions,undoConversions,connectWallet,setAcquisition,reconcile:()=>{if(reconcile())persist();return view()},connectBinance,connectExchange,replaceKrakenKey,replaceExchangeKey,disconnect,include,beginBank,cancelBank};
}
module.exports={createConnections,normalizeBinance,normalizeBank,linkedHoldings,assertReadOnly,fetchBinance,fetchBinanceWallets,REDIRECT};
