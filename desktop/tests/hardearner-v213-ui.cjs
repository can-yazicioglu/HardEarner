// Isolated test profile and fake exchange credentials only. Never use the real APPDATA profile.

const {_electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

const profile=fs.mkdtempSync(path.resolve('../.artifacts/profiles/v213-ui-')),env={...process.env,HARDEARNER_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;

const password='UI-fixture-password!',out=path.resolve('../.artifacts/screenshots');let app,page;const errors=[];

async function launch(){

 app=await _electron.launch({executablePath:process.env.HARDEARNER_QA_EXE||require('electron'),args:process.env.HARDEARNER_QA_EXE?[]:[process.env.HARDEARNER_QA_APP||path.resolve('.')],env,timeout:20000});page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.locator('.app-lock-card').waitFor();

 await app.evaluate(({ipcMain,BrowserWindow})=>{

  global.chartIds=new Map();const original=ipcMain._invokeHandlers.get('analysis-stream-start');ipcMain.removeHandler('analysis-stream-start');ipcMain.handle('analysis-stream-start',(event,id,c)=>{global.chartIds.set(id,c);return original(event,id,c)});

  global.fetch=async (url,options={})=>{

   const u=new URL(url),reply=d=>({ok:true,status:200,json:async()=>d});

   if(u.hostname==='api.kraken.com'){

    const assets=['BTC','ETH','SOL','HYPE','JUP','PEPE','DOGE','NEAR','XRP','AAVE','LINK','SUI','XLM','BONK'];

    if(u.pathname.endsWith('/AssetPairs'))return reply({error:[],result:Object.fromEntries(assets.map(a=>[a+'USD',{wsname:a+'/USD',status:'online'}]))});

    if(u.pathname.endsWith('/Ticker'))return reply({error:[],result:Object.fromEntries(assets.map(a=>[a+'USD',{c:['83000'],a:['1'],b:['1']}]))});

    const row=(refid,asset,amount,time)=>({refid,asset,amount:String(amount),time,fee:'0',type:'trade',subtype:'tradespot',aclass:'currency'});

    const t=Date.parse('2026-09-01T10:00:00Z')/1000,allLedgers={a:row('buy1','ZUSD',-10000,t),b:row('buy1','XXBT',.1,t),c:row('buy2','ZUSD',-15000,t+86400),d:row('buy2','XXBT',.15,t+86400)};

    const bounds=new URLSearchParams(options.body||''),ledger=Object.fromEntries(Object.entries(allLedgers).filter(([,r])=>r.time>Number(bounds.get('start')||0)&&r.time<=Number(bounds.get('end')||Date.now()/1000)));
    return reply(u.pathname.endsWith('/GetApiKeyInfo')?{error:[],result:{permissions:['query-funds','query-ledger','export-data']}}:u.pathname.endsWith('/BalanceEx')?{error:[],result:{XXBT:{balance:'0.25',hold_trade:'0'}}}:u.pathname.endsWith('/Assets')?{error:[],result:{XXBT:{altname:'XBT'}}}:u.pathname.endsWith('/Ledgers')?{error:[],result:{ledger,count:Object.keys(ledger).length}}:{error:[],result:{USDTUSD:{a:['1'],b:['1']}}});

   }

   if(u.pathname.endsWith('/klines')){const step=({'1s':1,'1m':60,'1h':3600,'4h':14400,'1d':86400})[u.searchParams.get('interval')]||3600,end=Math.floor(Date.now()/1000/step)*step;return reply(Array.from({length:500},(_,i)=>[(end-(499-i)*step)*1000,100,110,90,101+(i%4),20]));}

   if(u.hostname==='api.gold-api.com')return reply({symbol:u.pathname.split('/').at(-1),price:3100,updatedAt:new Date().toISOString()});

   if(u.hostname==='api.frankfurter.dev'&&u.searchParams.get('from'))return reply(Array.from({length:260},(_,i)=>({date:new Date(Date.now()-(260-i)*86400000).toISOString().slice(0,10),base:u.searchParams.get('base'),quote:'USD',rate:3000+i})));
   if(u.hostname==='api.frankfurter.dev')return reply(['TRY','GBP','EUR'].map(quote=>({date:u.searchParams.get('date')||'2026-09-25',base:'USD',quote,rate:{TRY:40,GBP:.8,EUR:.9}[quote]})));

   if(u.pathname.endsWith('/ticker/24hr'))return reply([{symbol:'BTCUSDT',lastPrice:'100',bidPrice:'99',askPrice:'101',count:1,closeTime:Date.now()}]);

   throw Error('No fixture for public data');

  };

 });

}

async function unlock(first=false){await page.locator('.app-lock-card input[type=password]').nth(0).fill(password);if(first)await page.locator('.app-lock-card input[type=password]').nth(1).fill(password);await page.locator('.app-lock-card form button').click();await page.locator('.language-select').waitFor();if(first){assert.equal(await page.locator('.language-select').inputValue(),'tr');await page.locator('.language-select').selectOption('en')}await page.getByRole('button',{name:'Self Analysis',exact:true}).waitFor()}

async function stop(){await app.close()}

(async()=>{

 await launch();try{

  for(const method of ['load','connections','analysisLoad','performance','securities'])assert(await page.evaluate(async method=>{try{await window.hardearner[method]();return false}catch(e){return e.message.includes('Unlock')}},method));

  await unlock(true);

  const result=await page.evaluate(()=>window.hardearner.connectExchange('kraken',{apiKey:'UI_FIXTURE_KEY_NOT_REAL',apiSecret:btoa('UI_FIXTURE_SECRET_NOT_REAL')}));assert.equal(result.connections[0].kind,'kraken');assert.equal(result.connections[0].balances[0].quantity,.25);

  assert.equal(result.connections[0].history.complete,true);assert.equal(result.connections[0].history.events.length,2);

  const projected=require('../electron/connections-view.cjs').linkedHoldings(result.connections);assert.equal(projected.length,2);assert.equal(projected.reduce((s,h)=>s+h.cost,0),25000);assert(projected.every(h=>h.purchaseFx.TRY===40));

  await page.getByRole('button',{name:'Accounts',exact:true}).click();const card=page.locator('.provider-card').filter({has:page.getByRole('heading',{name:'Kraken',exact:true})});await card.getByRole('button',{name:'Manage',exact:true}).waitFor();

  const sizes=await card.locator('.provider-actions button').evaluateAll(nodes=>nodes.map(n=>({w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height,y:n.getBoundingClientRect().y})));assert.equal(sizes.length,2);assert(Math.abs(sizes[0].w-sizes[1].w)<1);assert.equal(sizes[0].h,sizes[1].h);assert.equal(sizes[0].y,sizes[1].y);

  await card.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'HardEarner-2.13-connections.png')});await card.getByRole('button',{name:'Manage',exact:true}).click();await page.getByRole('heading',{name:'Manage connection · Kraken',exact:true}).waitFor();await page.getByRole('button',{name:'Close dialog',exact:true}).click();

  await page.getByRole('button',{name:'Learn FAST',exact:true}).click();await page.locator('.fast-step').last().waitFor();assert.equal(await page.locator('.fast-step').count(),27);await page.screenshot({path:path.join(out,'HardEarner-2.13-learn.png')});

  await page.getByRole('button',{name:'Holdings',exact:true}).click();await page.getByText('Includes purchase fees',{exact:true}).waitFor();assert((await page.locator('.holdings-panel').innerText()).includes('1,000,000.00'));await page.getByRole('button',{name:'Purchase log BTC (Kraken)',exact:true}).click();await page.locator('.purchase-log-table').waitFor();assert.equal(await page.locator('.purchase-log-table tbody tr').count(),2);await page.screenshot({path:path.join(out,'HardEarner-2.13-purchases.png')});

  const parent=page;const child=app.waitForEvent('window');await page.getByRole('button',{name:'Self Analysis',exact:true}).click();page=await child;page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.locator('.research-shell').waitFor();assert(!(await page.locator('.research-ticker').innerText()).includes('NaN'));await page.getByRole('button',{name:'Charts',exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('.analysis-chart-panel')?.dataset.lastPrice)>0);

  await page.getByRole('button',{name:'Freehand pen 1',exact:true}).click();const box=await page.locator('.drawing-input').boundingBox();assert(box.width>500);await page.mouse.move(box.x+130,box.y+120);await page.mouse.down();for(let i=0;i<30;i++)await page.mouse.move(box.x+130+i*8,box.y+120+Math.sin(i/4)*45);await page.mouse.up();await page.locator('.drawing-overlay polyline[data-drawing-id]').waitFor();

  const points=await page.locator('.drawing-overlay polyline[data-drawing-id]').getAttribute('points');assert(points.split(' ').length>10);assert(!points.includes('NaN'));assert(points.split(' ').every(p=>p.split(',').every(v=>Number.isFinite(Number(v)))));

  await page.getByRole('button',{name:'Horizontal line 1',exact:true}).click();await page.locator('.drawing-input').click({position:{x:210,y:220}});await page.waitForFunction(()=>document.querySelectorAll('.drawing-overlay line').length===1);

  await page.getByRole('button',{name:'Fit chart 1',exact:true}).click();await page.waitForFunction(old=>document.querySelector('.drawing-overlay polyline')?.getAttribute('points')!==old,points);

  await page.screenshot({path:path.join(out,'HardEarner-2.13-pen.png')});

  const saved=await page.evaluate(()=>window.hardearner.analysisLoad());assert.equal(Object.values(saved.drawings)[0].length,2);

  // Deliver genuine-shaped stream updates to the real renderer and verify the last candle changes without a fetch.

  await app.evaluate(({BrowserWindow})=>{const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('#research')),time=Math.floor(Date.now()/3600000)*3600;for(const [id]of global.chartIds)win.webContents.send('analysis-stream',{id,status:'live',bar:{time,open:100,high:112,low:90,close:112,volume:20},tick:{price:112,at:Date.now()},mode:'trades',receivedAt:Date.now()})});

  await page.waitForFunction(()=>Number(document.querySelector('.analysis-chart-panel').dataset.lastPrice)===112);

  await page.getByText('Data source',{exact:true}).click();await page.getByRole('button',{name:'1s',exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('.analysis-chart-panel')?.dataset.lastPrice)>0);

  await page.getByLabel('Choose chart market 1',{exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Precious Metals',exact:true}).click();await page.locator('.market-picker-results button').filter({hasText:'XAU'}).click();await page.waitForFunction(()=>Number(document.querySelector('.analysis-chart-panel')?.dataset.lastPrice)>0);if(!await page.locator('.chart-feed-options').getAttribute('open').then(v=>v!==null))await page.locator('.chart-feed-options summary').click();await page.getByRole('button',{name:'Spot session',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.analysis-chart-panel')?.textContent.includes('Gold API'));

  assert.equal((await page.evaluate(()=>hardearner.analysisLoad())).panels[0].venue,'goldapi');assert.equal(await page.getByRole('button',{name:'1 week',exact:true}).isDisabled(),true);await page.screenshot({path:path.join(out,'HardEarner-2.13-metal-session.png')});

  await page.getByRole('button',{name:'Price alerts',exact:true}).click();await page.getByRole('button',{name:'Import USD alerts',exact:true}).click();await page.getByLabel('Price alert table',{exact:true}).fill('BTC,82000,87500\nETH,2600,-\nSOL,114,-\nHYPE,88,-\nJUP,0.28,0.34\nPEPE,0.00000395,0.00000480\nDOGE,0.092,0.106\nNEAR,3.80,5.40\nXRP,1.46,1.66\nAAVE,138,-\nLINK,12.70,-\nSUI,0.95,-\nXLM,0.20,-\nBONK,0.00000320,-');await page.getByRole('button',{name:'Preview alerts',exact:true}).click();assert.equal(await page.getByRole('dialog').locator('tbody tr').count(),20);await page.screenshot({path:path.join(out,'HardEarner-2.13-alert-preview.png')});await page.getByRole('button',{name:'Arm all alerts (20)',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});const alerts=(await page.evaluate(()=>window.hardearner.analysisLoad())).alerts;assert.equal(alerts.length,20);assert(alerts.every(a=>a.config.quote==='USD'));

  await page.locator('.alerts-panel').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'HardEarner-2.13-alerts.png')});

  await page.evaluate(()=>window.hardearner.authLock());await page.locator('.app-lock-card').waitFor();assert.equal(await page.locator('.analysis-workspace').count(),0);await parent.locator('.app-lock-card').waitFor();assert.equal(await page.locator('.wallet-table').count(),0);for(const method of ['load','connections','analysisLoad','performance','securities'])assert(await page.evaluate(async method=>{try{await window.hardearner[method]();return false}catch(e){return e.message.includes('Unlock')}},method));

  await page.screenshot({path:path.join(out,'HardEarner-2.13-locked.png')});

 }finally{await stop()}

 for(let attempt=0;attempt<2;attempt++){

  await launch();try{assert.equal(await page.getByRole('button',{name:'Unlock HardEarner',exact:true}).count(),1);await unlock();const result=await page.evaluate(()=>window.hardearner.connections());assert.equal(result.error,null);assert.equal(result.connections[0].kind,'kraken');assert.equal(result.connections[0].balances[0].quantity,.25);const saved=await page.evaluate(()=>window.hardearner.analysisLoad());assert.equal(saved.error,null);assert.equal(Object.values(saved.drawings)[0].length,2);assert.equal(saved.alerts.length,20);assert.equal(result.connections[0].history.events.length,2);

   await page.evaluate(async()=>{const c=(await window.hardearner.connections()).connections[0];await window.hardearner.syncAccount(c.id)});const synced=(await page.evaluate(()=>window.hardearner.connections())).connections[0];assert.equal(synced.error,null);assert.equal(synced.history.complete,true);assert.equal(synced.history.events.length,2);

  }finally{await stop()}

 }

 assert.deepEqual(errors,[]);console.log('PASS: tradespot costs and UI purchase log, equal-size Manage controls, 27 Learn FAST lessons, 20 USD alerts via UI and persistence, setup/unlock/IPC lock, freehand + horizontal rendering and zoom, live updates, 1s candles, metal session, encrypted Kraken connection and drawings retained over two restarts.');console.log('Isolated profile: '+profile);

})().catch(async e=>{console.error(e);if(page)console.error((await page.locator('body').innerText().catch(()=>'' )).slice(0,5000));if(app)await app.close().catch(()=>{});process.exitCode=1});

