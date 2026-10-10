// Isolated Windows profile, synthetic provider replies and fake credentials only.
const {_electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const profile=fs.mkdtempSync(path.resolve('../.artifacts/profiles/v216-research-'));
const env={...process.env,HARDEARNER_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
const password='Synthetic Research QA!',key='fixture-market-key-12345';let app,page;const socketTimers=[];
const errors=[];
async function launch(){
 app=await _electron.launch({executablePath:require('electron'),args:[path.resolve('.')],env});page=await app.firstWindow();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));await page.locator('.app-lock-card').waitFor();
 await app.evaluate(()=>{global.fetch=async url=>{const u=new URL(url),now=Date.now(),by=list=>Response.json({retCode:0,time:now,result:{list}});if(u.hostname==='api.bybit.com'){
  if(u.pathname.endsWith('tickers'))return by([{symbol:'BTCUSDT',fundingRate:'0.0001',nextFundingTime:String(now+3600000),singleOpenInterest:'1000',singleOpenInterestValue:'80000000'}]);
  if(u.pathname.endsWith('instruments-info'))return by([{symbol:'BTCUSDT',contractType:'LinearPerpetual',fundingInterval:'480'}]);
  if(u.pathname.endsWith('funding/history'))return by([{fundingRateTimestamp:String(now-3600000),fundingRate:'0.00009'}]);
  return by(Array.from({length:169},(_,i)=>({timestamp:String(now-(168-i)*3600000),singleOpenInterest:String(900+i)})));
 }if(u.hostname==='data-api.binance.vision'&&u.pathname.endsWith('/depth'))return Response.json({lastUpdateId:100,bids:[['80000','1']],asks:[['80001','2']]});
 if(u.hostname==='api.alternative.me')return Response.json({data:[{timestamp:String(Math.floor(now/1000)),value:'55'}]});
 throw Error('No synthetic response configured.');};});
}
async function unlock(first){await page.locator('.app-lock-card input[type=password]').nth(0).fill(password);if(first)await page.locator('.app-lock-card input[type=password]').nth(1).fill(password);await page.locator('.app-lock-card form button').click();await page.locator('.language-select').waitFor();if(first)await page.locator('.language-select').selectOption('en');}
(async()=>{try{
 await launch();for(const name of ['researchState','researchSettings','researchQuery'])assert(await page.evaluate(async n=>{try{await window.hardearner[n]();return false}catch(e){return /Unlock/.test(e.message)}},name));await unlock(true);
 await page.context().routeWebSocket(/wss:\/\//,ws=>{if(ws.url().includes('@depth')){let id=101;const timer=setInterval(()=>{try{ws.send(JSON.stringify({e:'depthUpdate',s:'BTCUSDT',U:id,u:id++,b:[['80000','3']],a:[['80001','4']]}))}catch{}},200);socketTimers.push(timer);ws.onClose(()=>clearInterval(timer));}});
 const child=app.waitForEvent('window');await page.getByRole('button',{name:'Self Analysis',exact:true}).click();const research=await child;research.setDefaultTimeout(20000);research.on('pageerror',e=>errors.push(e.message));await research.locator('.research-insights').waitFor();await research.getByText('1,000 BTC',{exact:true}).waitFor();
 assert.equal(await app.evaluate(({nativeTheme})=>nativeTheme.shouldUseDarkColors),true);
 const section=research.locator('.research-insights');await section.getByRole('button',{name:'Research data settings',exact:true}).click();await section.getByLabel('CoinGlass API key').fill(key);await section.getByRole('button',{name:'Save key',exact:true}).nth(0).click();await section.getByText('Key saved · access not yet verified',{exact:true}).waitFor();
 const state=await research.evaluate(()=>window.hardearner.researchState());assert.equal(state.configured.coinglass,true);assert(!JSON.stringify(state).includes(key));assert(!fs.readFileSync(path.join(profile,'research.encrypted'),'utf8').includes(key));
 await section.getByRole('button',{name:'Close settings',exact:true}).click();await section.getByRole('button',{name:'Metric alert',exact:true}).click();await section.getByLabel(/Threshold/).fill('0.02');await section.getByRole('button',{name:'Create alert',exact:true}).click();await section.getByRole('button',{name:'Pause',exact:true}).waitFor();
 await research.getByRole('button',{name:'Switch to light theme'}).click();assert.equal(await app.evaluate(({nativeTheme})=>nativeTheme.shouldUseDarkColors),false);await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
 await research.getByRole('button',{name:'Switch to dark theme'}).click();assert.equal(await app.evaluate(({nativeTheme})=>nativeTheme.shouldUseDarkColors),true);
 await research.getByRole('button',{name:'Research Lab',exact:true}).click();await research.locator('.lab-workspace').waitFor();await research.getByRole('button',{name:'Tool library',exact:true}).click();assert.equal(await research.locator('.lab-catalog>button').count(),44);
 await research.locator('.lab-catalog>button').filter({hasText:'Order-book heatmap'}).click();await research.getByText('Live · observed session',{exact:true}).waitFor();await research.waitForFunction(()=>document.querySelector('.lab-book-quotes')?.textContent.includes('80,000'));await research.screenshot({path:path.resolve('../.artifacts/screenshots/HardEarner-2.16-native-orderbook.png'),animations:'disabled'});
 await research.getByRole('button',{name:'Charts',exact:true}).click();await research.getByLabel('Chart layout',{exact:true}).selectOption('8');await research.waitForFunction(()=>document.querySelectorAll('.multi-panel').length===8);await research.getByLabel('Layout name',{exact:true}).fill('Native eight');await research.getByRole('button',{name:'Save layout',exact:true}).click();await research.waitForFunction(async()=>(await hardearner.analysisLoad()).savedLayouts?.length===1);
 await research.screenshot({path:path.resolve('../.artifacts/screenshots/HardEarner-2.16-native-research.png'),animations:'disabled'});await app.close();app=null;
 await launch();await unlock(false);const saved=await page.evaluate(()=>window.hardearner.researchState());assert.equal(saved.configured.coinglass,true);assert.equal(saved.alerts.length,1);assert.equal(saved.alerts[0].threshold,.02);assert.equal((await page.evaluate(()=>hardearner.analysisLoad())).savedLayouts[0].panels.length,8);
 await page.evaluate(()=>window.hardearner.authLock());await page.locator('.app-lock-card').waitFor();assert(await page.evaluate(async()=>{try{await window.hardearner.researchQuery('funding',{});return false}catch(e){return /Unlock/.test(e.message)}}));assert.deepEqual(errors,[]);
 console.log('PASS: Windows Research IPC lock, dark/light native windows, funding/OI UI, encrypted provider-key redaction, metric alert, 44-tool catalogue, sequenced order-book WebSocket, eight saved charts and restart persistence. Synthetic fixtures only.');
}finally{for(const t of socketTimers)clearInterval(t);if(app)await app.close()}})().catch(e=>{console.error(e);process.exitCode=1});
