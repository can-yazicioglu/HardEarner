// Isolated test profile and fake exchange credentials only. Never use the real APPDATA profile.

const {_electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

const profile=fs.mkdtempSync(path.resolve('../.artifacts/profiles/v213-investments-')),env={...process.env,HARDEARNER_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;

const password='UI-fixture-password!',out=path.resolve('../.artifacts/screenshots');let app,page;const errors=[];

async function launch(){

 app=await _electron.launch({executablePath:process.env.HARDEARNER_QA_EXE||require('electron'),args:process.env.HARDEARNER_QA_EXE?[]:[process.env.HARDEARNER_QA_APP||path.resolve('.')],env,timeout:20000});page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));await page.locator('.app-lock-card').waitFor();

 await app.evaluate(({ipcMain,BrowserWindow})=>{

  global.chartIds=new Map();const original=ipcMain._invokeHandlers.get('analysis-stream-start');ipcMain.removeHandler('analysis-stream-start');ipcMain.handle('analysis-stream-start',(event,id,c)=>{global.chartIds.set(id,c);return original(event,id,c)});

  global.fetch=async (url,options={})=>{

   const u=new URL(url),reply=d=>({ok:true,status:200,json:async()=>d});

   
   if(u.hostname==='api.twelvedata.com'){
    const symbol=u.searchParams.get('symbol')||'AAPL',exchange=u.searchParams.get('exchange')||'NASDAQ',day=Math.floor(Date.now()/86400000)*86400;
    if(u.pathname==='/symbol_search')return reply({data:[{symbol:'AAPL',exchange:'NASDAQ',currency:'USD',instrument_type:'Common Stock',instrument_name:'Apple Inc.',mic_code:'XNGS'}]});
    if(u.pathname==='/quote')return reply({symbol,exchange,currency:'USD',timestamp:day,last_quote_at:Math.floor(Date.now()/1000),close:100,high:102,low:99,volume:10000,percent_change:1});
    return reply({meta:{symbol,exchange,currency:'USD'},values:Array.from({length:260},(_,i)=>({datetime:new Date((day-(259-i)*86400)*1000).toISOString().slice(0,10),open:70+i/10,high:71+i/10,low:69+i/10,close:70.5+i/10,volume:1000}))});
   }
   if(u.hostname==='live.trading212.com'){
    const instrument={ticker:'AAPL_US_EQ',currency:'USD',name:'Apple Inc.',isin:'US0378331005'},at=new Date(Date.now()-2*86400000).toISOString();
    if(u.pathname.endsWith('/summary'))return reply({currency:'GBP',cash:{availableToTrade:100,reservedForOrders:0,inPies:20}});
    if(u.pathname.endsWith('/positions'))return reply([{instrument,quantity:1,quantityAvailableForTrading:1,currentPrice:100,averagePricePaid:100,createdAt:at,walletImpact:{currency:'GBP',totalCost:81,currentValue:80}}]);
    if(u.pathname.endsWith('/instruments'))return reply([{ticker:'AAPL_US_EQ',type:'STOCK',name:'Apple Inc.'}]);
    if(u.pathname.endsWith('/orders'))return reply({items:[{order:{side:'BUY',instrument},fill:{id:1,type:'TRADE',filledAt:at,price:100,quantity:1,walletImpact:{currency:'GBP',netValue:-81,taxes:[{name:'CURRENCY_CONVERSION_FEE',currency:'GBP',quantity:1}]}}}],nextPagePath:null});
    return reply({items:[],nextPagePath:null});
   }

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
  await unlock(true);
  await page.locator('aside').getByRole('button',{name:'Stocks & funds',exact:true}).click();
  await page.getByRole('button',{name:'Data settings',exact:true}).click();
  await page.getByLabel('Market data API key',{exact:true}).fill('FIXTURE_ONLY_KEY_123456');
  await page.getByRole('button',{name:'Save key',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByLabel('Search investments',{exact:true}).fill('AAPL');
  await page.getByRole('button',{name:'Search provider',exact:true}).click();
  await page.locator('.investment-search-results button').click();
  await page.getByLabel('Refresh AAPL',{exact:true}).click();await page.locator('.investment-screener td').filter({hasText:'Twelve Data'}).waitFor();
  await page.getByRole('button',{name:'Edit listing details',exact:true}).click();
  await page.getByRole('dialog').getByLabel('ISIN · Optional',{exact:true}).fill('US0378331005');
  await page.getByRole('button',{name:'Save listing',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByLabel('Compare AAPL',{exact:true}).check();await page.getByRole('button',{name:'Load comparison',exact:true}).click();
  await page.locator('.investment-comparison .recharts-line').waitFor();assert(!(await page.locator('.investment-comparison').innerText()).includes('NaN'));
  await page.screenshot({path:path.join(out,'HardEarner-2.13-investments.png')});
  await page.getByRole('button',{name:'Connect investment account',exact:true}).click();
  const card=page.locator('.provider-card').filter({has:page.getByRole('heading',{name:'Trading 212',exact:true})});
  await card.getByRole('button',{name:'Connect',exact:true}).click();
  await page.getByRole('dialog').getByLabel('API key',{exact:true}).fill('FIXTURE_ACCOUNT_KEY_123');await page.getByRole('dialog').getByLabel('API secret',{exact:true}).fill('FIXTURE_ACCOUNT_SECRET_123');await page.getByRole('dialog').getByRole('checkbox').check();
  await page.getByRole('button',{name:'Connect & fetch balances',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await card.getByRole('button',{name:'Manage',exact:true}).waitFor();
  const account=(await page.evaluate(()=>window.hardearner.connections())).connections[0];assert.equal(account.kind,'trading212');assert.equal(account.history.events[0].paid,80);assert.equal(account.balances.find(b=>b.type==='cash').quantity,120);
  await page.getByRole('button',{name:'Watchlist',exact:true}).click();await page.getByText('AAPL_US_EQ',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Holdings',exact:true}).click();await page.getByRole('button',{name:'Performance',exact:true}).click();await page.getByRole('button',{name:'Fees & taxes',exact:true}).click();await page.getByText('CURRENCY_CONVERSION_FEE',{exact:true}).waitFor();
  await page.screenshot({path:path.join(out,'HardEarner-2.13-fees.png')});await page.getByRole('button',{name:'Daily log',exact:true}).click();await page.getByLabel('Performance asset',{exact:true}).waitFor();
  await page.locator('aside').getByRole('button',{name:'Stocks & funds',exact:true}).click();await page.locator('.investment-screener .asset-link').filter({hasText:'Apple Inc.'}).click();
  const parent=page,child=app.waitForEvent('window');await page.getByRole('button',{name:'Analyse & draw',exact:true}).click();page=await child;page.on('pageerror',e=>errors.push(e.message));await page.locator('.research-shell').waitFor();await page.getByRole('button',{name:'Charts',exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('.analysis-chart-panel')?.dataset.lastPrice)>0);
  assert.equal((await page.evaluate(()=>hardearner.analysisLoad())).panels[0].venue,'securities');
  await page.locator('.chart-trades summary').click();assert.equal(await page.locator('.chart-trades tbody tr').count(),1);assert((await page.locator('.chart-trades').innerText()).includes('Trading 212'));assert((await page.locator('.chart-trades').innerText()).includes('100.00'));
  await page.screenshot({path:path.join(out,'HardEarner-2.13-trade-markers.png')});
  await page.getByRole('button',{name:'Horizontal line 1',exact:true}).click();await page.locator('.drawing-input').click({position:{x:300,y:150}});await page.waitForFunction(()=>document.querySelectorAll('.drawing-overlay line').length===1);assert(Number.isFinite(Number(await page.locator('.drawing-overlay line').getAttribute('y1'))));
  await page.getByLabel('Back to portfolio',{exact:true}).click();page=parent;await page.locator('.language-select').selectOption('tr');await page.locator('aside').getByRole('button',{name:'Hisseler ve fonlar',exact:true}).click();await page.screenshot({path:path.join(out,'HardEarner-2.13-investments-tr.png')});
  await page.locator('.language-select').selectOption('en');await page.getByRole('button',{name:'Learn FAST',exact:true}).click();await page.getByLabel('Search lessons',{exact:true}).fill('daily');assert(await page.locator('.fast-step').count()>0);assert(await page.locator('.fast-step').count()<23);
 }catch(e){console.error(e);console.error((await page.locator('body').innerText()).slice(-9000));await page.screenshot({path:path.join(out,'HardEarner-2.13-test-failure.png'),timeout:5000}).catch(()=>{});throw e}finally{await stop()}
 await launch();try{await unlock();const accounts=await page.evaluate(()=>window.hardearner.connections());assert.equal(accounts.connections[0].kind,'trading212');const s=await page.evaluate(()=>window.hardearner.securities());assert.equal(s.configured,true);assert.equal(s.instruments[0].isin,'US0378331005');assert.equal(s.quotes[s.instruments[0].id].price,100);assert.equal((await page.evaluate(()=>window.hardearner.performance('TRY'))).error,null);const a=await page.evaluate(()=>window.hardearner.analysisLoad());assert.equal(Object.values(a.drawings)[0].length,1)}finally{await stop()}
 assert.deepEqual(errors,[]);console.log('PASS: stocks discovery, key setup, exact listing/ISIN, quote, comparison, Trading 212 UI connection, authoritative positions, fees, favourites, stock chart execution marker, drawing, Turkish screen, lesson search and encrypted restart persistence. Fixture data only. Profile: '+profile);
})().catch(async e=>{console.error(e);if(page)console.error((await page.locator('body').innerText().catch(()=>'' )).slice(0,6500));if(app)await app.close().catch(()=>{});process.exitCode=1});
