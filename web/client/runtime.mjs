import {researchSession} from './research-session.mjs';
import {mergeMarket,failedMarket,performanceMarket} from './market-state.mjs';
import performanceCore from '../../desktop/electron/performance.cjs';
import securitiesCore from '../../desktop/electron/securities.cjs';
import {researchLink} from '../../desktop/electron/research-links.cjs';
import {rangeStart} from '../../desktop/electron/chart-ranges.cjs';
import domain from '../../desktop/electron/domain.cjs';
import connectionView from '../../desktop/electron/connections-view.cjs';
import analysisCore from '../../desktop/electron/analysis.cjs';
import streamCore from '../../desktop/electron/chart-stream.cjs';
import snapshotStore from './snapshot-store.cjs';
import {createStore} from './storage.mjs';
import {deriveKey,newSalt,seal,open} from './crypto.mjs';
import {WEB_VERSION,BACKUP_FORMAT,encryptedBackup,readBackup,backupSummary,holdingsCSV} from './vault-files.mjs';

let identity,remote,key,salt,data,analysis,cache,market={},busy=false,queue=Promise.resolve(),pendingRemote=false;
let securities,researchWorkspace;
import researchWorkspaceCore from '../../desktop/electron/research-workspace.cjs';
let lastSaved=null,sessionError=null,refreshing=null,pendingSave=null,noticeBuffer=null;
let generation=0,restoreCandidate=null,preferredLanguage='tr';
const requests=new Set();
const authListeners=new Set(),streamListeners=new Map(),movementListeners=new Set(),cloudListeners=new Set();
const streams=streamCore.createChartStreams({emit:(id,value)=>streamListeners.get(id)?.(value),metalSample:asset=>marketCall('metalSession',asset)});
const clone=value=>structuredClone(value);
const status=()=>({locked:!key,setupRequired:!remote?.envelope,email:identity?.email,error:sessionError,language:data?.portfolio?.settings?.language||preferredLanguage});
function authChanged(){for(const listener of authListeners)listener(status());}
function cloudStatus(){return {busy,lastSaved,pendingRemote,pendingSave:!!pendingSave,pendingPassword:!!pendingSave&&pendingSave.envelope.salt!==salt,error:sessionError,email:identity?.email,language:status().language}}
function notifyCloud(){window.dispatchEvent(new CustomEvent('hardearner-cloud',{detail:cloudStatus()}));}
async function request(path,body,method=body===undefined?'GET':'POST'){
  const controller=new AbortController();requests.add(controller);
  try{
  const r=await fetch(path,{method,headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin',redirect:'error',cache:'no-store',signal:controller.signal});
  let v;try{v=await r.json();}catch{throw Error('Your private session may have expired. Reload to sign in again.');}
  if(!r.ok){const retry=Number.isFinite(v.retryAt)&&v.retryAt>Date.now()?' · Tekrar deneme: '+new Date(v.retryAt).toLocaleString('tr-TR'):'';const e=Error((v.error||(r.status===409?'Your portfolio changed on another device. Reload before saving.':'Request failed.'))+retry);e.status=r.status;throw e;}return v;
  }finally{requests.delete(controller)}
}
const bootstrap=(async()=>{identity=await request('/api/session');cache=createStore('hardearner-private-'+identity.id);remote=await request('/api/vault');return status();})();
bootstrap.catch(e=>{sessionError=e.message;authChanged();notifyCloud();});
const researchSessionBridge=researchSession({
 getSession:async()=>{await queue;requireUnlocked();if(pendingSave||busy)return null;return{key,identity:identity.id,salt};},
 acceptSession:async(session)=>{await bootstrap;if(session.identity!==identity.id||!(session.key instanceof CryptoKey)||session.key.extractable||session.key.algorithm.name!=='AES-GCM')throw Error('Invalid session.');const epoch=generation,next=await request('/api/vault');if(!next.envelope||next.envelope.salt!==session.salt)throw Error('Session changed.');const decoded=await open(next.envelope,session.key,identity.id);if(generation!==epoch)throw Error('Session locked.');install(decoded);key=session.key;salt=session.salt;remote=next;pendingSave=(await cache.read('pending')).value||null;checkSession(epoch);sessionError=null;authChanged();notifyCloud();},
 onLock:()=>{clearSession();authChanged();}
});
const sessionReady=bootstrap.then(async()=>{researchSessionBridge.bind(identity.id);await researchSessionBridge.accept();return status();});
sessionReady.catch(()=>{});

function requireUnlocked(){if(!key||!data)throw Error('Unlock your private vault first.');}
function checkSession(expected){requireUnlocked();if(expected!==generation)throw Error('The vault was locked. Unlock it before continuing.');}
function install(next){
  if(next?.version!==1||!Array.isArray(next.connections?.connections))throw Error('This vault format is not supported. It was not reset.');
  next.portfolio=domain.validateState(next.portfolio);data=next;preferredLanguage=next.portfolio.settings.language;
  researchWorkspace?.stop();
  const files={...(next.research?{'research.encrypted':next.research}:{}),...(next.analysis?{'analysis.encrypted':next.analysis}:{}),...(next.securities?{'securities.encrypted':next.securities}:{})};snapshotStore.setSnapshot(files);securities=securitiesCore.createSecurities({dir:'/',safeStorage:{isEncryptionAvailable:()=>true},fetcher:async url=>{const u=new URL(url),d=await request('/api/securities-data',{endpoint:u.pathname,parameters:Object.fromEntries(u.searchParams)});return{ok:true,json:async()=>d}}});if(securities.view().error)throw Error(securities.view().error);
  researchWorkspace=researchWorkspaceCore.createResearchWorkspace({dir:'/',safeStorage:{isEncryptionAvailable:()=>true},query:(kind,selection,keys)=>request('/api/research',{kind,selection,keys}),notify:a=>{const args=['Research · '+a.asset+' · '+a.metric,a.event.value+' · '+a.condition+' '+a.threshold];if(noticeBuffer)noticeBuffer.push(args);else notice(...args);}});
  if(researchWorkspace.view().error)throw Error(researchWorkspace.view().error);
  analysis=analysisCore.createAnalysis({dir:'/',safeStorage:{isEncryptionAvailable:()=>true},getQuote:c=>marketCall('quote',c),notify:a=>{const args=[`${a.intent} · ${a.config.asset}/${a.config.quote}`,`${a.observed} · ${a.condition} ${a.price}`];if(noticeBuffer)noticeBuffer.push(args);else notice(...args);}});
  if(analysis.view().error)throw Error(analysis.view().error);
  data.analysis=analysis.view();delete data.analysis.error;delete data.analysis.lastCheck;delete data.analysis.checkError;
}
function capture(){const next=clone(data);next.research=snapshotStore.getSnapshot()['research.encrypted'];next.securities=snapshotStore.getSnapshot()['securities.encrypted'];next.analysis=analysis.view();delete next.analysis.error;delete next.analysis.lastCheck;delete next.analysis.checkError;return next;}
async function persist(){
  requireUnlocked();const epoch=generation,next=capture(),envelope=await seal(next,key,salt,identity.id),requestId=crypto.randomUUID();checkSession(epoch);
  // Encrypted pending copy survives network errors without exposing API credentials.
  const write={revision:remote.revision,envelope,requestId};await cache.write([['pending',write]]);checkSession(epoch);pendingSave=write;
  let result;
  try{result=await request('/api/vault',write,'PUT');}
  catch(e){if(epoch===generation){sessionError=e.message;pendingRemote=e.status===409;notifyCloud();}throw e;}
  checkSession(epoch);
  if(result.currentRevision&&result.currentRevision!==result.revision)throw Error('A newer cloud version exists. Reload before making another change.');
  remote={revision:result.revision,envelope};data=next;lastSaved=result.savedAt||new Date().toISOString();sessionError=null;
  await cache.write([['saved',remote],['pending',null,null,false]]);checkSession(epoch);pendingSave=null;notifyCloud();return next;
}
function mutate(action){const epoch=generation;const job=queue.then(async()=>{checkSession(epoch);if(pendingSave)throw Error('Review the unsaved encrypted copy before making more changes.');busy=true;noticeBuffer=[];notifyCloud();const before=capture();try{
  const head=await request('/api/vault');checkSession(epoch);if(head.revision!==remote.revision){pendingRemote=true;throw Error('Newer changes are available from another device. Use Load cloud changes before editing.');}
  const result=await action();checkSession(epoch);const moneyChanged=JSON.stringify(data.portfolio.holdings)!==JSON.stringify(before.portfolio.holdings)||JSON.stringify(data.connections)!==JSON.stringify(before.connections);recordPerformance(moneyChanged);if(JSON.stringify(capture())!==JSON.stringify(before))await persist();checkSession(epoch);for(const args of noticeBuffer)notice(...args);notifyCloud();return result;
}catch(e){if(epoch===generation){install(before);sessionError=e.message;notifyCloud();}throw e;}finally{if(epoch===generation){busy=false;noticeBuffer=null;notifyCloud();}else if(!key)snapshotStore.setSnapshot({});}});queue=job.catch(()=>{});return job;}
async function pull(){requireUnlocked();const epoch=generation;if(busy)throw Error('Wait for the current save to finish.');if(pendingSave)throw Error('Review the unsaved encrypted copy before loading cloud changes.');const next=await request('/api/vault');checkSession(epoch);if(busy)throw Error('Wait for the current save to finish.');if(next.revision===remote.revision){pendingRemote=false;notifyCloud();return false;}
  if(next.envelope.salt!==salt){clearSession();remote=next;sessionError='The vault password changed on another device. Unlock with your new password.';authChanged();return false;}
  const decoded=await open(next.envelope,key,identity.id);checkSession(epoch);if(busy)throw Error('Wait for the current save to finish.');install(decoded);remote=next;market.securities=securities.view().quotes;pendingRemote=false;sessionError=null;notifyCloud();for(const f of cloudListeners)f();return true;
}
async function unlock(password,confirmation){await bootstrap;await queue;const epoch=generation;const currentSession=()=>{if(epoch!==generation)throw Error('The vault was locked.');};
  const next=await request('/api/vault');
  currentSession();if(!next.envelope){if(password!==confirmation)throw Error('Passwords do not match.');const candidateSalt=newSalt(),candidate=await deriveKey(password,candidateSalt);currentSession();salt=candidateSalt;key=candidate;remote=next;const portfolio=clone(domain.DEFAULT);portfolio.settings.language='tr';portfolio.settings.currency='TRY';install({version:1,portfolio,connections:{connections:[]}});try{await persist();}catch(e){clearSession();throw e;}}
  else{const candidate=await deriveKey(password,next.envelope.salt);const decoded=await open(next.envelope,candidate,identity.id);currentSession();install(decoded);salt=next.envelope.salt;key=candidate;remote=next;}
  pendingSave=(await cache.read('pending')).value||null;
  checkSession(epoch);
  if(pendingSave&&JSON.stringify(pendingSave.envelope)===JSON.stringify(remote.envelope)){await cache.write([['pending',null,null,false]]);pendingSave=null;}
  const cached=(await cache.read('public-market')).value;checkSession(epoch);market={...(cached||{}),securities:securities.view().quotes};
  sessionError=null;authChanged();notifyCloud();return status();
}
async function recoverPending(mode,password){
  requireUnlocked();await queue;if(busy||!pendingSave)throw Error('No pending save is available.');
  if(mode==='download')return download('HardEarner-encrypted-recovery-'+Date.now()+'.json',JSON.stringify({format:'hardearner-pending-v1',identity:identity.id,...pendingSave}));
  if(mode==='archive'){await cache.write([['recovery-'+Date.now(),pendingSave],['pending',null,null,false]]);pendingSave=null;sessionError=null;notifyCloud();await pull();return true;}
  if(mode!=='retry')throw Error('Unsupported recovery action.');
  const epoch=generation;busy=true;notifyCloud();try{
    const candidate=pendingSave.envelope.salt===salt?key:await deriveKey(password,pendingSave.envelope.salt);
    const decoded=await open(pendingSave.envelope,candidate,identity.id);checkSession(epoch);const result=await request('/api/vault',pendingSave,'PUT');checkSession(epoch);
    if(result.currentRevision&&result.currentRevision!==result.revision)throw Error('Newer cloud edits exist. Download this recovery copy and keep the cloud version.');
    install(decoded);key=candidate;salt=pendingSave.envelope.salt;remote={revision:result.revision,envelope:pendingSave.envelope};await cache.write([['saved',remote],['pending',null,null,false]]);checkSession(epoch);pendingSave=null;sessionError=null;lastSaved=result.savedAt;for(const f of cloudListeners)f();
  }catch(e){if(epoch===generation)sessionError=e.message;throw e;}finally{if(epoch===generation){busy=false;notifyCloud();}}
}
function clearSession(){generation++;for(const r of requests)r.abort();requests.clear();streams.stopAll();researchWorkspace?.stop();researchWorkspace=null;streamListeners.clear();key=null;data=null;analysis=null;securities=null;restoreCandidate=null;market={};busy=false;noticeBuffer=null;snapshotStore.setSnapshot({});}
async function lock(){researchSessionBridge.lock();clearSession();authChanged();}
async function changePassword(current,password,confirmation){
  const epoch=generation;await queue;checkSession(epoch);if(busy||pendingSave)throw Error('Finish the pending save before changing the password.');if(password!==confirmation)throw Error('Passwords do not match.');
  const job=(async()=>{busy=true;notifyCloud();try{
    const head=await request('/api/vault');checkSession(epoch);if(head.revision!==remote.revision)throw Error('Load cloud changes before changing your password.');
    await open(head.envelope,await deriveKey(current,head.envelope.salt),identity.id);checkSession(epoch);
    const nextSalt=newSalt(),nextKey=await deriveKey(password,nextSalt),envelope=await seal(capture(),nextKey,nextSalt,identity.id);checkSession(epoch);
    const write={revision:remote.revision,envelope,requestId:crypto.randomUUID()};
    await cache.write([['before-password-change',remote],['pending',write]]);checkSession(epoch);pendingSave=write;
    const result=await request('/api/vault',write,'PUT');checkSession(epoch);
    if(result.currentRevision&&result.currentRevision!==result.revision)throw Error('Newer cloud changes exist. Review the encrypted pending copy.');
    key=nextKey;salt=nextSalt;remote={revision:result.revision,envelope};lastSaved=result.savedAt;
    await cache.write([['saved',remote],['pending',null,null,false]]);checkSession(epoch);pendingSave=null;sessionError=null;researchSessionBridge.lock();return true;
  }catch(e){if(epoch===generation)sessionError=e.message;throw e;}finally{if(epoch===generation){busy=false;notifyCloud();}}})();queue=job.catch(()=>{});return job;
}
async function exportVault(){const epoch=generation;await queue;checkSession(epoch);if(pendingSave)throw Error('Resolve the pending save or download its encrypted recovery copy first.');const backup=await encryptedBackup(capture(),key,salt,identity.id);checkSession(epoch);return download('HardEarner-vault-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(backup));}
async function previousVault(downloadFile=false){requireUnlocked();const epoch=generation,saved=(await cache.read('before-full-restore')).value;checkSession(epoch);if(!downloadFile)return!!saved?.envelope;if(!saved?.envelope)throw Error('No previous restore copy is available on this browser.');return download('HardEarner-before-restore-'+Date.now()+'.json',JSON.stringify({format:BACKUP_FORMAT,identity:identity.id,createdAt:new Date().toISOString(),version:WEB_VERSION,envelope:saved.envelope}));}
async function inspectVaultBackup(raw,password){const epoch=generation;await queue;checkSession(epoch);const next=await readBackup(raw,password,identity.id);checkSession(epoch);next.portfolio=domain.validateState(next.portfolio);const token=crypto.randomUUID();restoreCandidate={token,next};return{token,...backupSummary(next)};}
function restoreVaultBackup(token){return mutate(async()=>{if(!restoreCandidate||token!==restoreCandidate.token)throw Error('Preview this encrypted backup before restoring it.');const epoch=generation;await cache.write([['before-full-restore',remote]]);checkSession(epoch);install(clone(restoreCandidate.next));restoreCandidate=null;return true;}).then(result=>{for(const f of cloudListeners)f();return result;});}
function accountView(){requireUnlocked();return {error:null,pending:false,notifications:data.connections.notifications||[],movementNotifications:data.connections.movementNotifications!==false,connections:data.connections.connections.map(c=>{
  const {apiKey,apiSecret,accessToken,refreshToken,clientSecret,passphrase,brokerMetadata,...publicData}=c;
  if(publicData.history)publicData.history={...publicData.history,ledgers:undefined,pending:undefined};return publicData;
})};}
async function accountCall(op,...args){const epoch=generation;const {view,events}=await mutate(async()=>{
  const known=new Set((data.connections.notifications||[]).map(n=>n.id));
  const result=await request('/api/accounts',{op,args,revision:remote.revision,portfolio:data.portfolio,connections:data.connections});checkSession(epoch);data.connections=result.connections;
  return {view:result.view,events:(result.view.notifications||[]).filter(n=>!known.has(n.id))};
});
  checkSession(epoch);for(const listener of movementListeners)listener((view.notifications||[]).filter(n=>!n.read));
  if(view.movementNotifications!==false)for(const e of events)notice(e.direction==='in'?'🟢 Bakiye arttı':'🔴 Bakiye azaldı',e.provider+' · '+(data.portfolio.settings.hideBalances?'••••':e.amount)+' '+e.asset);
  return view;}
const allHoldings=()=>[...data.portfolio.holdings,...connectionView.linkedHoldings(accountView().connections)];
function recordPerformance(force=false){if(!market.fx?.USD||!data.performance?.baseline&&!allHoldings().length)return;const latest=Math.max(data.performance?.baseline?.time||0,...Object.values(data.performance?.closes||{}).map(c=>c.time));if(!force&&Date.now()-latest<300000)return;const accounts=accountView().connections;const b=performanceCore.record(data.performance||performanceCore.empty(),performanceCore.observation(allHoldings(),performanceMarket(market),Date.now(),accounts.filter(c=>c.included&&!c.sandbox).map(c=>c.id)));b.evidence={...data.performance?.evidence};for(const c of accounts.filter(c=>!c.sandbox))b.evidence[c.id]={id:c.id,label:c.label,kind:c.kind,balances:c.balances,history:c.history};data.performance=b;}
function performanceView(currency){requireUnlocked();const evidence={...data.performance?.evidence};for(const c of accountView().connections)evidence[c.id]=c;return{error:null,startedAt:data.performance?.baseline?.time,days:performanceCore.daily(data.performance,Object.values(evidence),currency),fees:performanceCore.feeLedger(Object.values(evidence)),timeZone:'UTC'}}
function marketCall(op,...args){return request('/api/market',{op,args});}
async function refreshInvestments(){
  const view=securities.view();if(!view.configured)return;
  const held=new Set(allHoldings().filter(h=>['stock','etf','fund'].includes(h.type)&&!h.connected).map(h=>h.asset));
  const listing=view.instruments.filter(i=>held.has(i.id)).sort((a,b)=>(view.quotes[a.id]?.fetchedAt||0)-(view.quotes[b.id]?.fetchedAt||0))[0];
  if(listing&&Date.now()-(view.quotes[listing.id]?.fetchedAt||0)>300000)await mutate(async()=>{const v=await securities.quote(listing.id);market.securities=v.quotes;});
}
function download(name,text,type='application/json') {const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);return true;}
function pickBackup(){return new Promise((resolve,reject)=>{const input=document.createElement('input');input.type='file';input.accept='.json';input.addEventListener('cancel',()=>resolve(null),{once:true});input.addEventListener('change',async()=>{try{const file=input.files[0];if(!file)return resolve(null);if(file.size>10*1024*1024)throw Error('Maximum backup size is 10 MB.');const raw=JSON.parse(await file.text());resolve(domain.validateState(raw.portfolio||raw));}catch(e){reject(e)}},{once:true});input.click();});}
function notice(title,body){if(!key)return;window.dispatchEvent(new CustomEvent('hardearner-notice',{detail:title+' · '+body}));if('Notification'in window&&Notification.permission==='granted')try{new Notification(title,{body,icon:'/icon-192.png'});}catch{}}
const links={privacy:'/privacy.html',support:'https://desktop.hardearner.com/',monzo:'https://developers.monzo.com/',starling:'https://developer.starlingbank.com/get-started',tradingview:'https://www.tradingview.com/',binance:'https://www.binance.com/en/my/settings/api-management',binancetr:'https://www.binance.tr/apidocs/',binancetrStatements:'https://www.binance.tr/usercenter/account-statement',btcturk:'https://docs.btcturk.com/',paribu:'https://www.paribu.com/destek/security/api-keys',kraken:'https://support.kraken.com/articles/360000919966-how-to-create-an-api-key',coinbase:'https://portal.cdp.coinbase.com/',okx:'https://www.okx.com/account/my-api',trading212:'https://docs.trading212.com/',twelvedata:'https://twelvedata.com/account/api-keys',midas:'https://www.getmidas.com/',garanti:'https://www.garantibbva.com.tr/yatirim',erste:'https://www.sparkasse.at/erstebank/privatkunden/sparen-anlegen/wertpapiere',finviz:'https://finviz.com/screener.ashx',fintables:'https://fintables.com/',justetf:'https://www.justetf.com/en/find-etf.html',tefas:'https://www.tefas.gov.tr/FonKarsilastirma.aspx'};
window.hardearner=Object.freeze({
  researchState:async()=>{requireUnlocked();return researchWorkspace.view();},
  researchSettings:(action,value)=>mutate(()=>researchWorkspace.mutate(action,value)),
  researchQuery:(kind,input)=>kind==='liquidations'?(requireUnlocked(),researchWorkspace.query(kind,input)):mutate(()=>researchWorkspace.query(kind,input)),
  research:()=>marketCall('research'),researchLink:async key=>window.open(researchLink(key),'_blank','noopener,noreferrer'),
  openResearch:async()=>{requireUnlocked();return researchSessionBridge.open()},closeResearch:async()=>{location.hash='';return false},
  platform:'private-web',performance:async c=>performanceView(c),securities:async()=>{requireUnlocked();return securities.view()},securitiesKey:k=>mutate(()=>securities.setKey(k)),securitiesAdd:i=>mutate(()=>securities.add(i)),securitiesFacts:(id,v)=>mutate(()=>securities.facts(id,v)),securitiesSearch:async q=>{requireUnlocked();return securities.search(q)},securitiesQuote:id=>mutate(async()=>{const d=await securities.quote(id);market.securities=d.quotes;return d}),securitiesHistory:async(id,days)=>{requireUnlocked();return securities.history(id,days)},authStatus:()=>sessionReady.then(status),authSetup:unlock,authUnlock:unlock,authLock:lock,
  onSettingsChanged:f=>{const handler=e=>f(e.detail);window.addEventListener('hardearner-settings',handler);return()=>window.removeEventListener('hardearner-settings',handler)},
  onAuthState:f=>{authListeners.add(f);return()=>authListeners.delete(f)},
  authChange:changePassword,exportVault,inspectVaultBackup,restoreVaultBackup,previousVault,cloudStatus:async()=>cloudStatus(),
  loadCloudChanges:pull,onCloudUpdate:f=>{cloudListeners.add(f);return()=>cloudListeners.delete(f)},
  recoverPending,
  // The shared theme component handles DOM appearance; only Electron has native window chrome.
  setTheme:async value=>{if(!['dark','light'].includes(value))throw Error('Choose a supported theme.');return value},
  load:async()=>{requireUnlocked();return{state:clone(data.portfolio),market:clone(market),encrypted:true,vaultError:null,version:WEB_VERSION+' Web',dataPath:null,launchPage:location.hash.startsWith('#research')?'Self Analysis':null}},
  save:next=>mutate(()=>{data.portfolio=domain.validateState(next);return clone(data.portfolio)}),
  saveSetting:(name,value)=>mutate(()=>{if(!Object.hasOwn(domain.DEFAULT.settings,name))throw Error('Unsupported setting.');data.portfolio=domain.validateState({...data.portfolio,settings:{...data.portfolio.settings,[name]:value}});return clone(data.portfolio)}),
  refresh:()=>refreshing||(refreshing=(async()=>{requireUnlocked();const epoch=generation;try{const next=await marketCall('refresh',allHoldings().filter(h=>h.type==='crypto').map(h=>h.asset));checkSession(epoch);market={...mergeMarket(market,next),securities:securities.view().quotes};const {securities:privateQuotes,...publicMarket}=market;await cache.write([['public-market',publicMarket,null,false]]);checkSession(epoch);try{await refreshInvestments()}catch{};checkSession(epoch);if(allHoldings().length&&Date.now()-Math.max(0,...Object.values(data.performance?.closes||{}).map(c=>c.time))>300000)try{await mutate(()=>true)}catch{};}catch(e){if(epoch!==generation)throw Error('The vault was locked.');market=failedMarket(market,e.message);}checkSession(epoch);return clone(market);})().finally(()=>refreshing=null)),
  history:(...a)=>marketCall('history',...a),activity:(...a)=>marketCall('activity',...a),costRates:(...a)=>marketCall('costRates',...a),analysisHistory:async c=>{if(c?.venue!=='securities')return marketCall('analysisHistory',c);requireUnlocked();const config=analysisCore.config(c),d=await securities.history(config.asset,({'1W':7,'2W':14,'1M':30,'3M':90,'6M':180,'1Y':365,recent:365})[config.range]);if(d.currency!==config.quote)throw Error('Chart currency does not match this listing.');return{...config,...d,rangeStart:rangeStart(config.range),lastTime:d.bars.at(-1).time}} ,
  analysisLoad:async()=>{requireUnlocked();return{...analysis.view(),notificationsSupported:true}},
  analysisMutate:(action,value)=>mutate(async()=>{if(action==='alert'||action==='alerts'){const rows=action==='alert'?[value]:value;if(!Array.isArray(rows)||rows.length>100)throw Error('Invalid alerts.');for(const c of new Map(rows.map(v=>[analysisCore.alertKey(v.config),v.config])).values())await marketCall('quote',c);}return analysis.mutate(action,value)}),
  analysisStream:(c,receive)=>{requireUnlocked();const id=crypto.randomUUID();streamListeners.set(id,receive);streams.start(id,c);return()=>{streams.stop(id);streamListeners.delete(id)}},
  testNotification:async()=>{if('Notification'in window&&Notification.permission==='default')await Notification.requestPermission();notice('HardEarner','Private web notification test. Keep HardEarner open for price alerts.');return true;},
  onAccountMovements:f=>{movementListeners.add(f);return()=>movementListeners.delete(f)},
  connections:async()=>accountView(),
  ...Object.fromEntries(['connectExchange','connectWallet','replaceExchangeKey','replaceKrakenKey','syncAccount','includeAccount','disconnectAccount','setAcquisition','importOlderHistory','importConversions','undoConversions','readNotifications','setMovementNotifications'].map(op=>[op,(...args)=>accountCall(op,...args)])),
  connectBinance:input=>accountCall('connectExchange','binance',input),
  connectBank:()=>{throw Error('Bank OAuth setup is not enabled in the private web preview.');},cancelBank:async()=>accountView(),
  officialLink:async name=>{if(!Object.hasOwn(links,name))throw Error('Unsupported link.');window.open(links[name],'_blank','noopener,noreferrer');},
  backup:async()=>{requireUnlocked();return download('HardEarner-portfolio-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(data.portfolio,null,2));},
  importBackup:pickBackup,restore:next=>mutate(()=>{data.portfolio=domain.validateState(next);return clone(data.portfolio)}),
  exportCSV:async()=>{requireUnlocked();const currency=data.portfolio.settings.currency,p=domain.portfolio(allHoldings(),market,data.portfolio.settings,currency);return download('HardEarner-holdings.csv',holdingsCSV(p.rows,currency),'text/csv');},
  snapshot:()=>mutate(()=>{const p=domain.portfolio(allHoldings(),market,data.portfolio.settings);if(!p.rows.length||p.missing)throw Error('Load all holding prices first.');data.portfolio={...data.portfolio,snapshots:[...data.portfolio.snapshots,{date:new Date().toISOString(),usd:p.total,try:p.total*market.fx.TRY,gbp:p.total*market.fx.GBP,eur:market.fx.EUR?p.total*market.fx.EUR:null,holdings:p.rows.length}].slice(-730)};return clone(data.portfolio);}),
  dataFolder:async()=>{throw Error('Use Export backup to save a file on this device.');},
  supportReport:async text=>{requireUnlocked();const feeds=Object.fromEntries(Object.entries(market.status||{}).map(([name,s])=>[name,{ok:!!s.ok,at:s.at||s.fetchedAt||null}]));return download('HardEarner-private-issue.txt','HardEarner '+WEB_VERSION+' Web\n'+new Date().toISOString()+'\n'+String(text).slice(0,5000)+'\n\nFeed availability: '+JSON.stringify(feeds)+'\nNo balances or account keys were automatically included.','text/plain')}
});
setInterval(async()=>{if(!key||busy||pendingSave||document.hidden)return;const epoch=generation;try{const head=await request('/api/vault');checkSession(epoch);if(busy)return;if(head.revision!==remote.revision){pendingRemote=true;notifyCloud();if(!document.querySelector('[role="dialog"],input:focus,textarea:focus,select:focus'))await pull();}}catch(e){if(epoch===generation){sessionError=e.message;notifyCloud();}}},30000);
setInterval(async()=>{if(!key||busy||document.hidden)return;try{await mutate(async()=>{await analysis.check();await researchWorkspace.check();return true;});}catch{}},30000);
setInterval(async()=>{if(!key||busy||pendingSave||document.hidden)return;const epoch=generation;for(const c of [...data.connections.connections]){if(epoch!==generation||pendingSave||pendingRemote)break;try{await accountCall('syncAccount',c.id,{automatic:true});}catch{/* One provider failure must not skip other accounts. */}}},300000);
window.addEventListener('pagehide',()=>{clearSession();authChanged();});
window.addEventListener('pageshow',event=>{if(event.persisted)authChanged();});
