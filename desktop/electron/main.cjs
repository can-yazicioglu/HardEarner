const {app,BrowserWindow,ipcMain,dialog,safeStorage,shell,session,Tray,Menu,Notification,powerMonitor,nativeTheme}=require('electron');
const fs=require('fs');const path=require('path');const {pathToFileURL}=require('url');
const {DEFAULT,validateState,portfolio}=require('./domain.cjs');const marketAPI=require('./market.cjs');
// Keep the original vault location so existing savings and Windows encryption remain intact.
app.setPath('userData',process.env.HARDEARNER_TEST_DATA||process.env.UMONEY_TEST_DATA||process.env.AUREL_TEST_DATA||path.join(app.getPath('appData'),'Aurel'));
nativeTheme.themeSource='dark';
app.setName('HardEarner');let win,state,market={},vaultError=null,refreshPromise=null,legacyVault=false,upgradeV21=false;
const dir=()=>app.getPath('userData');const vault=()=>path.join(dir(),'vault.encrypted');
let connections,analysis,tray,streams,appLock,performance,securities,researchWorkspace,researchWindow,performanceError=null,quitting=false;
const streamOwners=new Map();
const appWindows=()=>[win,researchWindow].filter(w=>w&&!w.isDestroyed());
const broadcast=(channel,value)=>{for(const w of appWindows())w.webContents.send(channel,value)};
function stopWindowStreams(sender){for(const [key,owner] of streamOwners)if(owner.sender===sender){streams?.stop(key);streamOwners.delete(key)}}
function secureWindow(w){const sender=w.webContents;w.webContents.setWindowOpenHandler(({url})=>{try{const u=new URL(url);if(u.protocol==='https:'&&(['www.tradingview.com','tradingview.com','www.coinglass.com','studio.glassnode.com','app.hyperliquid.xyz','mempool.space','etherscan.io','tronscan.org','polygonscan.com','solscan.io','blockchair.com','xrpscan.com','www.sec.gov','data.sec.gov','docs.deribit.com','docs.glassnode.com','defillama.com','alternative.me','docs.cdp.coinbase.com','www.binance.com','fred.stlouisfed.org','www.coingecko.com','hyperliquid.gitbook.io','api-docs.defillama.com','site.financialmodelingprep.com'].includes(u.hostname)))shell.openExternal(u.href).catch(()=>{})}catch{}return{action:'deny'}});w.webContents.on('will-navigate',e=>e.preventDefault());w.webContents.on('will-attach-webview',e=>e.preventDefault());w.webContents.on('did-start-navigation',(_event,_url,_inPlace,isMainFrame)=>{if(isMainFrame)stopWindowStreams(sender)});w.webContents.on('render-process-gone',()=>stopWindowStreams(sender));w.on('closed',()=>stopWindowStreams(sender));}
function openResearch(){if(researchWindow&&!researchWindow.isDestroyed()){researchWindow.show();researchWindow.focus();return true}researchWindow=new BrowserWindow({width:1580,height:1000,minWidth:850,minHeight:640,title:'HardEarner Research',backgroundColor:'#09090b',autoHideMenuBar:true,icon:path.join(__dirname,'../assets/icon.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,backgroundThrottling:true}});secureWindow(researchWindow);researchWindow.on('page-title-updated',e=>{e.preventDefault();researchWindow.setTitle('HardEarner Research · v'+app.getVersion())});researchWindow.on('closed',()=>{researchWindow=null});researchWindow.loadFile(path.join(__dirname,'../dist/index.html'),{hash:'research'});return true;}
// Store installs inherit the package AUMID from Windows for taskbar identity and notifications.
if(!process.windowsStore)app.setAppUserModelId('com.hardearner.desktop');
function show(){if(win&&!win.isDestroyed()){win.show();if(win.isMinimized())win.restore();win.focus()}}
function deviceNotice(title,body){if(appLock?.status().locked){title='HardEarner';body=state.settings.language==='tr'?'Yeni bir bildiriminiz var. Görmek için uygulamanın kilidini açın.':'You have a new notification. Unlock the app to view it.';}if(!Notification.isSupported())throw Error('Windows notifications are unavailable.');const n=new Notification({title,body,icon:path.join(__dirname,'../assets/icon.png')});n.on('click',show);n.show()}
function accountMovementNotice(events,device){
 if(win&&!win.isDestroyed()&&!appLock?.status().locked)win.webContents.send('account-movements',events);
 if(!device)return;
 const tr=state.settings.language==='tr',locale=tr?'tr-TR':'en-GB';
 for(const direction of ['in','out']){
  const group=events.filter(n=>n.direction===direction);if(!group.length)continue;
  const text=group.slice(0,4).map(n=>(state.settings.hideBalances?'••••':new Intl.NumberFormat(locale,{maximumFractionDigits:12}).format(n.amount))+' '+n.asset).join(', ');
  deviceNotice((direction==='in'?'🟢 ':'🔴 ')+(tr?(direction==='in'?'Bakiye arttı':'Bakiye azaldı'):(direction==='in'?'Balance increased':'Balance decreased')),group[0].provider+' · '+text+(group.length>4?' +'+(group.length-4):''));
 }
}
const allHoldings=()=>[...state.holdings,...require('./connections.cjs').linkedHoldings(connections.view().connections)];
function atomic(file,bytes){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',bytes);fs.renameSync(file+'.tmp',file);}
function save(next){if(vaultError)throw Error('Your vault could not be read. Restore a valid backup or recover the original vault before saving.');if(!safeStorage.isEncryptionAvailable())throw Error('Windows encryption is unavailable. Changes were not saved.');const valid=validateState(next);if(upgradeV21&&fs.existsSync(vault())&&!fs.existsSync(vault()+'.before-v2.1'))fs.copyFileSync(vault(),vault()+'.before-v2.1');if(legacyVault&&fs.existsSync(vault())&&!fs.existsSync(vault()+'.before-v2'))fs.copyFileSync(vault(),vault()+'.before-v2');require('./encrypted-file.cjs').writeEncrypted(vault(),JSON.stringify(valid),safeStorage);state=valid;connections?.reconcile();legacyVault=false;upgradeV21=false;return state;}
function load(){fs.mkdirSync(dir(),{recursive:true});state=structuredClone(DEFAULT);if(fs.existsSync(vault())){try{const original=JSON.parse(require('./encrypted-read.cjs').readEncrypted(vault(),safeStorage).text);legacyVault=original.version===1;upgradeV21=!original.settings?.language;state=validateState(original);}catch{vaultError='The encrypted vault could not be opened. Your original file has been preserved. Restore a JSON backup from Settings or recover vault.encrypted.previous.';}}try{market=JSON.parse(fs.readFileSync(path.join(dir(),'market-cache.json'),'utf8'));}catch{} }
function trusted(event){const base=pathToFileURL(path.join(__dirname,'../dist/index.html')).href;if(!appWindows().some(w=>w.webContents===event.sender)||event.senderFrame!==event.sender.mainFrame||![base,base+'#research'].includes(event.senderFrame.url))throw Error('Untrusted request');}
function handle(name,fn,withEvent=false){ipcMain.handle(name,async(event,...args)=>{trusted(event);appLock.assertAllowed(name);const result=await fn(...args,...(withEvent?[event]:[]));if(name!=='auth-lock')appLock.assertAllowed(name);return result;});}
function capturePerformance(){try{if(performance&&!vaultError){const accounts=connections.view().connections;performance.capture(allHoldings(),market,Date.now(),accounts);performanceError=null}}catch(e){performanceError=e.message}}
function refreshMarket(){if(refreshPromise)return refreshPromise;refreshPromise=(async()=>{market=await marketAPI.refresh(market,allHoldings().filter(h=>h.type==='crypto').map(h=>h.asset));const investments=securities.view();if(investments.configured){const ids=new Set(allHoldings().filter(h=>['stock','etf','fund'].includes(h.type)&&!h.connected).map(h=>h.asset));const i=investments.instruments.filter(i=>ids.has(i.id)).sort((a,b)=>(investments.quotes[a.id]?.fetchedAt||0)-(investments.quotes[b.id]?.fetchedAt||0))[0];if(i&&Date.now()-(investments.quotes[i.id]?.fetchedAt||0)>300000)try{await securities.quote(i.id)}catch{}}market.securities=securities.view().quotes;atomic(path.join(dir(),'market-cache.json'),JSON.stringify(market));capturePerformance();return market;})().finally(()=>refreshPromise=null);return refreshPromise;}
async function accountChange(action){capturePerformance();const result=await action();capturePerformance();return result;}
function register(){
 ipcMain.handle('appearance-theme',(event,value)=>{trusted(event);if(!['dark','light'].includes(value))throw Error('Invalid appearance.');nativeTheme.themeSource=value;for(const w of appWindows())w.setBackgroundColor(value==='dark'?'#09090b':'#f6f7f9');return true});
 handle('research-state',()=>researchWorkspace.view());
 handle('research-settings',(action,value)=>researchWorkspace.mutate(action,value));
 handle('research-query',(kind,input)=>researchWorkspace.query(kind,input));
 handle('research-overview',()=>require('./research.cjs').overview());
 handle('research-link',key=>shell.openExternal(require('./research-links.cjs').researchLink(key)));
 handle('research-open',openResearch);
 handle('research-close',()=>{show();researchWindow?.close();return true});
 handle('save-setting',(name,value)=>{if(!Object.hasOwn(DEFAULT.settings,name))throw Error('Unsupported setting.');const next=save({...state,settings:{...state.settings,[name]:value}});broadcast('settings-changed',next.settings);return next});
 handle('performance-load',currency=>{const v=performance.view(connections.view().connections,currency);return{...v,error:performanceError||v.error}});
 handle('securities-load',()=>securities.view());
 handle('securities-facts',(id,v)=>securities.facts(id,v));
 handle('securities-key',key=>securities.setKey(key));
 handle('securities-search',query=>securities.search(query));
 handle('securities-add',value=>securities.add(value));
 handle('securities-quote',async id=>{const v=await securities.quote(id);market.securities=v.quotes;capturePerformance();return v});
 handle('securities-history',(id,days)=>securities.history(id,days));
 handle('auth-status',()=>({...appLock.status(),language:state.settings.language}));
 handle('auth-setup',(password,confirmation)=>appLock.setup(password,confirmation));
 handle('auth-unlock',password=>appLock.unlock(password));
 handle('auth-change',(current,password,confirmation)=>appLock.change(current,password,confirmation));
 handle('auth-lock',()=>appLock.lock());
 handle('analysis-stream-start',(id,input,event)=>{if(typeof id!=='string'||!/^[a-z0-9-]{1,64}$/i.test(id))throw Error('Invalid stream identifier.');const key=event.sender.id+'-'+id;streamOwners.set(key,{sender:event.sender,id});try{return streams.start(key,input)}catch(e){streamOwners.delete(key);throw e}},true);
 handle('analysis-stream-stop',(id,event)=>{const key=event.sender.id+'-'+id;streams.stop(key);streamOwners.delete(key);return true},true);
 handle('connections-key-repair',(id,input)=>connections.replaceExchangeKey(id,input));
 handle('connections-kraken-repair',(id,input)=>connections.replaceKrakenKey(id,input));
 handle('connections-wallet',input=>accountChange(()=>connections.connectWallet(input)));
 handle('connections-exchange',(kind,input)=>accountChange(()=>connections.connectExchange(kind,input)));
 handle('analysis-history',async input=>{if(input?.venue==='securities'){const c=require('./analysis.cjs').config(input),days={'1W':7,'2W':14,'1M':30,'3M':90,'6M':180,'1Y':365,recent:365}[c.range],d=await securities.history(c.asset,days);if(d.currency!==c.quote)throw Error('Chart currency does not match this listing.');return{...c,...d,lastTime:d.bars.at(-1).time,rangeStart:require('./chart-ranges.cjs').rangeStart(c.range)}}return require('./analysis.cjs').history(input)});
 handle('analysis-load',()=>({...analysis.view(),notificationsSupported:Notification.isSupported()}));
 handle('analysis-mutate',async(action,value)=>{if(['alert','alerts'].includes(action)){const rows=action==='alerts'?value:[value];if(!Array.isArray(rows)||rows.length>100)throw Error('Invalid alerts.');const seen=new Set();for(const v of rows){const k=require('./analysis.cjs').alertKey(v.config);if(!seen.has(k)){await require('./analysis.cjs').quote(v.config);seen.add(k)}}}return analysis.mutate(action,value)});
 handle('analysis-test-notification',()=>{deviceNotice('HardEarner','Your price alerts will appear here. Check Windows notification settings if this message is not visible.');return true});
 handle('official-link',key=>{const links={privacy:'https://desktop.hardearner.com/privacy',support:'https://desktop.hardearner.com/',monzo:'https://developers.monzo.com/',starling:'https://developer.starlingbank.com/get-started',tradingview:'https://www.tradingview.com/',binance:'https://www.binance.com/en/my/settings/api-management',binancetr:'https://www.binance.tr/apidocs/',binancetrStatements:'https://www.binance.tr/usercenter/account-statement',btcturk:'https://docs.btcturk.com/',paribu:'https://www.paribu.com/destek/security/api-keys',kraken:'https://support.kraken.com/articles/360000919966-how-to-create-an-api-key',coinbase:'https://portal.cdp.coinbase.com/',okx:'https://www.okx.com/account/my-api',trading212:'https://docs.trading212.com/',twelvedata:'https://twelvedata.com/account/api-keys',midas:'https://www.getmidas.com/',garanti:'https://www.garantibbva.com.tr/yatirim',erste:'https://www.sparkasse.at/erstebank/privatkunden/sparen-anlegen/wertpapiere',finviz:'https://finviz.com/screener.ashx',fintables:'https://fintables.com/',justetf:'https://www.justetf.com/en/find-etf.html',tefas:'https://www.tefas.gov.tr/FonKarsilastirma.aspx'};if(!Object.hasOwn(links,key))throw Error('Unsupported link.');return shell.openExternal(links[key])});
 handle('support-report',async input=>{if(typeof input!=='string'||input.length>5000)throw Error('Keep the description under 5,000 characters.');const r=await dialog.showSaveDialog(win,{title:'Save a local issue report',defaultPath:'HardEarner-issue-report.txt',filters:[{name:'Text',extensions:['txt']}]});if(r.canceled)return false;const status=Object.entries(market.status||{}).map(([name,s])=>name+': '+(s.ok?'available':'unavailable')).join('\n');atomic(r.filePath,'HardEarner '+app.getVersion()+'\n'+new Date().toISOString()+'\nWindows '+process.getSystemVersion()+'\n\nMarket feeds\n'+status+'\n\nYour description (review before sharing)\n'+input+'\n\nNo account keys, balances, identifiers or local file paths were automatically included.\n');return true});
 handle('movement-read',ids=>connections.readNotifications(ids));
 handle('movement-notifications',value=>connections.setMovementNotifications(value));
 handle('connections-list',()=>connections.view());
 handle('connections-binance',input=>accountChange(()=>connections.connectBinance(input)));
 handle('connections-bank',input=>connections.beginBank(input));
 handle('connections-cancel',()=>connections.cancelBank());
 handle('connections-acquisition',(id,asset,input)=>connections.setAcquisition(id,asset,input));
 handle('connections-sync',async id=>{const r=await connections.sync(id);capturePerformance();return r});
 handle('connections-conversions-undo',id=>connections.undoConversions(id));
 handle('connections-conversions',(id,input)=>connections.importConversions(id,input));
 handle('connections-history-start',(id,date)=>connections.importOlder(id,date));
 handle('connections-include',(id,value)=>accountChange(()=>connections.include(id,value)));
 handle('connections-disconnect',id=>accountChange(()=>connections.disconnect(id)));
 handle('load',event=>({state,market,vaultError,encrypted:safeStorage.isEncryptionAvailable(),dataPath:dir(),version:app.getVersion(),launchPage:event.senderFrame.url.endsWith('#research')||process.argv.includes('--show-analysis')?'Self Analysis':null}),true);
 handle('save',next=>{const r=save(next);capturePerformance();return r});
 handle('refresh',refreshMarket);
 handle('history',(...args)=>marketAPI.history(...args));
 handle('activity',asset=>marketAPI.activity(asset));
 handle('cost-rates',(base,date)=>marketAPI.costRates(base,date));
 handle('backup',async()=>{const r=await dialog.showSaveDialog(win,{title:'Export unencrypted backup — keep this file private',defaultPath:`HardEarner-backup-${new Date().toISOString().slice(0,10)}.json`,filters:[{name:'HardEarner JSON backup',extensions:['json']}]});if(r.canceled)return false;atomic(r.filePath,JSON.stringify(state,null,2));return true;});
 handle('import',async()=>{const r=await dialog.showOpenDialog(win,{title:'Choose an HardEarner backup to preview',properties:['openFile'],filters:[{name:'HardEarner JSON backup',extensions:['json']}]});if(r.canceled)return null;const f=r.filePaths[0];if(fs.statSync(f).size>10*1024*1024)throw Error('Backup is too large (maximum 10 MB).');return validateState(JSON.parse(fs.readFileSync(f,'utf8')));});
 handle('restore',async(next)=>{const valid=validateState(next);const r=await dialog.showMessageBox(win,{type:'warning',title:'Replace local portfolio?',message:`Restore ${valid.holdings.length} holdings and ${valid.goals.length} goals?`,detail:'This replaces the current portfolio. A copy of the previous encrypted vault is retained on this computer.',buttons:['Cancel','Restore backup'],defaultId:0,cancelId:0});if(r.response!==1)return null;const priorError=vaultError;vaultError=null;try{return save(valid)}catch(e){vaultError=priorError;throw e;}});
 handle('export-csv',async()=>{const r=await dialog.showSaveDialog(win,{title:'Export private holdings data',defaultPath:'HardEarner-holdings.csv',filters:[{name:'CSV spreadsheet',extensions:['csv']}]});if(r.canceled)return false;const c=state.settings.currency;const rows=portfolio(allHoldings(),market,state.settings,c).rows;const amount=v=>v==null?'':Number(v).toFixed(2);const esc=v=>'"'+String(v??'').replace(/^[=+@-]/,"'").replace(/"/g,'""')+'"';const csv=[['Name','Type','Asset','Quantity','Purity','Purchase date','Purchase cost original','Buy fee original','Original cost currency','Historical FX date','Report currency','Total paid','Spot value','Gross sale estimate','Sale costs','Net sale estimate','Spot P/L','Sale P/L','Sale return %','Sale method','Source','Location'],...rows.map(h=>[h.name,h.type,h.asset,h.quantity,h.purity,h.purchaseDate,h.cost,h.purchaseFee,h.costCurrency,h.purchaseFxDate,c,amount(h.costBasis),amount(h.value),amount(h.grossSale),amount(h.saleCosts),amount(h.sell),amount(h.gain),amount(h.saleGain),amount(h.returnPct),h.saleMethod,require('./holding-source.cjs').holdingSource(h),h.location])].map(r=>r.map(esc).join(',')).join('\r\n');atomic(r.filePath,'\uFEFF'+csv);return true;});
 handle('data-folder',()=>shell.openPath(dir()));
 handle('snapshot',()=>{const p=portfolio(allHoldings(),market,state.settings);if(!p.rows.length||p.missing)throw Error('Add holdings and load all their prices before saving a snapshot.');const date=new Date().toISOString();return save({...state,snapshots:[...state.snapshots,{date,usd:p.total,try:p.total*(market.fx.TRY||0),gbp:p.total*(market.fx.GBP||0),holdings:p.rows.length}].slice(-730)});});
}
require('./release-handoff.cjs').installHandoff(app,show,()=>{quitting=true;connections?.cancelBank();streams?.stopAll()}).then(ready=>{if(!ready)return;
 app.whenReady().then(()=>{require('./upgrade-backup.cjs').backup(dir(),'2.16.0');researchWorkspace=require('./research-workspace.cjs').createResearchWorkspace({dir:dir(),safeStorage,notify:a=>deviceNotice('Research · '+a.asset+' · '+a.metric,a.event.value+' · '+a.condition+' '+a.threshold)});load();performance=require('./performance.cjs').createPerformance({dir:dir(),safeStorage});securities=require('./securities.cjs').createSecurities({dir:dir(),safeStorage});market.securities=securities.view().quotes;appLock=require('./app-lock.cjs').createAppLock({dir:dir(),safeStorage,changed:status=>{if(status.locked){streams?.stopAll();researchWorkspace?.stop();streamOwners.clear();connections?.cancelBank()}broadcast('auth-state',{...status,language:state.settings.language})}});connections=require('./connections.cjs').createConnections({dir:dir(),safeStorage,openExternal:url=>shell.openExternal(url),getHoldings:()=>vaultError?null:state.holdings,notifyMovements:accountMovementNotice});analysis=require('./analysis.cjs').createAnalysis({dir:dir(),safeStorage,notify:a=>deviceNotice(a.intent+' · '+a.config.asset+'/'+a.config.quote,a.config.venue.toUpperCase()+': '+a.observed+' '+a.config.quote+' · target '+a.price+' · '+a.condition)});win=new BrowserWindow({width:1440,height:960,minWidth:1060,minHeight:720,title:'HardEarner · Personal wealth',backgroundColor:'#09090b',autoHideMenuBar:true,icon:path.join(__dirname,'../assets/icon.png'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,backgroundThrottling:true}});session.defaultSession.setPermissionRequestHandler((_wc,_p,cb)=>cb(false));secureWindow(win);
 const iconPath=app.isPackaged?process.execPath:path.join(__dirname,'../assets/icon.ico');
 win.on('page-title-updated',event=>{event.preventDefault();win.setTitle('HardEarner · v'+app.getVersion())});
 win.setTitle('HardEarner · v'+app.getVersion());
 if(!process.windowsStore)win.setAppDetails({appId:'com.hardearner.desktop',appIconPath:iconPath,appIconIndex:0,relaunchDisplayName:'HardEarner',relaunchCommand:'"'+process.execPath+'"'+(app.isPackaged?'':' "'+app.getAppPath()+'"')});
 streams=require('./chart-stream.cjs').createChartStreams({emit:(key,value)=>{const owner=streamOwners.get(key);if(owner&&!owner.sender.isDestroyed())owner.sender.send('analysis-stream',{id:owner.id,...value})}});
 tray=new Tray(path.join(__dirname,'../assets/icon.ico'));tray.setToolTip('HardEarner · Price alerts running');tray.setContextMenu(Menu.buildFromTemplate([{label:'Open HardEarner',click:show},{label:'Quit HardEarner (stop alerts)',click:()=>{quitting=true;app.quit()}}]));tray.on('double-click',show);
 win.on('close',e=>{if(!quitting&&analysis.view().tray){e.preventDefault();appLock.lock();win.hide();researchWindow?.hide()}else{quitting=true;researchWindow?.close()}});
 powerMonitor.on('lock-screen',()=>appLock.lock());powerMonitor.on('suspend',()=>appLock.lock());
 register();win.loadFile(path.join(__dirname,'../dist/index.html'));setInterval(()=>{analysis.check();researchWorkspace.check();},30000).unref();setTimeout(()=>analysis.check(),3000).unref();const syncAccounts=async()=>{for(const c of connections.view().connections)try{await connections.sync(c.id,{automatic:true});capturePerformance()}catch{}};setInterval(()=>refreshMarket().catch(()=>{}),300000).unref();setInterval(syncAccounts,300000).unref();setTimeout(syncAccounts,4000).unref();});
 app.on('before-quit',()=>{quitting=true;connections?.cancelBank();streams?.stopAll()});
 app.on('window-all-closed',()=>app.quit());
});
