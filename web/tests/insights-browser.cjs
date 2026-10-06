// Synthetic public metrics and a disposable vault. Never reads personal accounts.
const {chromium,webkit}=require('../../desktop/node_modules/playwright'),assert=require('node:assert/strict');
const root='http://127.0.0.1:8794',password='Isolated insights QA 2026';
async function run(engine,name){
 const browser=await engine.launch({headless:true}),errors=[];
 try{
  const context=await browser.newContext({viewport:{width:1536,height:1000}});await context.addCookies([{name:'test-user',value:'insights-'+name+'-'+Date.now(),url:root}]);
  await context.route('https://www.tradingview-widget.com/**',r=>r.fulfill({contentType:'text/html',body:'<body style="background:#171218;color:#eee">Isolated dark widget</body>'}));
  await context.route('**/api/market',r=>{const {op}=r.request().postDataJSON();return r.fulfill({json:op==='refresh'?{fx:{USD:1,TRY:40,GBP:.8,EUR:.9},crypto:{BTC:{usd:80000}},metals:{},status:{}}:{}})});
  const now=Date.now(),points=Array.from({length:70},(_,i)=>({time:now-(69-i)*3600000,value:i/1000-.02}));let requests=0;
  await context.route('**/api/research',async r=>{
   requests++;const {kind,selection,keys}=r.request().postDataJSON(),base={state:'ready',stale:false,fetchedAt:now,asset:selection.asset,period:selection.period};
   if(kind==='funding')return r.fulfill({json:{...base,data:{value:.01,intervalMinutes:480,nextSettlement:now+3600000,at:now,points,source:'Synthetic Bybit fixture',coverage:selection.asset+'USDT · Bybit only'}}});
   if(kind==='interest')return r.fulfill({json:{...base,data:{value:1000,change:5,changeFrom:now-86400000,quoteNotional:80000000,unit:selection.asset,basis:'single side',at:now,points:points.map(p=>({...p,value:1000+p.value})),source:'Synthetic Bybit fixture',coverage:selection.asset+'USDT · Bybit only'}}});
   if(['etf','transfers','exchangeFlows','heatmap'].includes(kind)&&!keys.coinglass||['mvrv','nupl','sopr'].includes(kind)&&!keys.glassnode)return r.fulfill({json:{state:'configuration',provider:'test-provider',required:'Provider API access required',data:null}});
   return r.fulfill({json:{state:'configuration',required:'Add a public Hyperliquid address in panel settings.',data:null}});
  });
  await context.routeWebSocket('wss://stream.bybit.com/**',socket=>socket.onMessage(raw=>{const d=JSON.parse(String(raw));if(d.op==='subscribe'){socket.send(JSON.stringify({op:'subscribe',success:true}));socket.send(JSON.stringify({topic:d.args[0],data:[{T:now,s:'BTCUSDT',S:'Buy',v:'2',p:'100'}]}));}}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(root+'/#research');
  await page.getByLabel(/^(Kasa şifresi|Vault password)$/).fill(password);await page.getByLabel(/^(Kasa şifresini tekrarla|Confirm vault password)$/).fill(password);await page.locator('.app-lock-card form button').click();await page.locator('.language-select').waitFor();await page.locator('.language-select').selectOption('en');
  const section=page.locator('.research-insights');await section.getByText('Synthetic Bybit fixture',{exact:false}).first().waitFor();
  assert.equal(await section.locator('.insight-panel').count(),2);await section.getByText('1,000 BTC',{exact:true}).waitFor();
  await section.screenshot({path:'../.artifacts/screenshots/HardEarner-2.15-insights-'+name+'.png'});
  await section.getByRole('button',{name:'Whale tracking',exact:true}).click();await section.getByText('Provider setup required',{exact:true}).first().waitFor();assert(await section.getByText(/A transfer is not a buy or sell/).isVisible());
  await section.getByRole('button',{name:'BTC / ETH ETF flows',exact:true}).click();await section.getByRole('button',{name:'On-chain valuation',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.insight-empty strong').length>=5);
  await section.getByRole('button',{name:'Observed liquidations',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.insight-body')&&[...document.querySelectorAll('.insight-datum strong')].some(e=>e.textContent==='200 USDT'));
  await section.getByRole('button',{name:'Metric alert',exact:true}).click();await section.getByLabel('Threshold · % / settlement').fill('.02');await section.getByRole('button',{name:'Create alert',exact:true}).click();await section.locator('.insight-alert-row').waitFor();
  await section.getByRole('button',{name:'Metric alert',exact:true}).click();await section.getByLabel('Threshold · % / settlement').fill('.02');await section.getByRole('button',{name:'Create alert',exact:true}).click();await section.getByText('This metric alert is already active.',{exact:true}).waitFor();await section.getByRole('button',{name:'Cancel',exact:true}).click();
  await section.getByRole('button',{name:'Research data settings',exact:true}).click();await section.getByLabel('CoinGlass API key').fill('synthetic-key-not-a-real-key');await section.getByRole('button',{name:'Save key',exact:true}).first().click();await section.getByText('Key saved · access not yet verified',{exact:true}).waitFor();assert.equal(await section.getByLabel('CoinGlass API key').inputValue(),'');
  const safe=await page.evaluate(async()=>hardearner.researchState());assert(safe.configured.coinglass);assert(!JSON.stringify(safe).includes('synthetic-key'));await section.getByRole('button',{name:'Remove key',exact:true}).click();await section.getByRole('button',{name:'Close settings',exact:true}).click();
  await section.getByRole('checkbox',{name:'Evidence summary',exact:true}).check();await section.getByRole('heading',{name:'Evidence notebook'}).waitFor();
  await page.setViewportSize({width:390,height:844});await section.scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await section.screenshot({path:'../.artifacts/screenshots/HardEarner-2.15-insights-mobile-'+name+'.png'});
  await page.locator('.language-select').selectOption('tr');await section.getByRole('heading',{name:'Piyasa verileri'}).waitFor();await section.screenshot({path:'../.artifacts/screenshots/HardEarner-2.15-insights-tr-'+name+'.png'});
  const before=await page.evaluate(()=>hardearner.researchState());await page.evaluate(()=>hardearner.researchSettings('settings',{enabled:[]}));await page.reload();await page.getByLabel(/^(Kasa şifresi|Vault password)$/).fill(password);await page.locator('.app-lock-card form button').click();await section.getByRole('heading',{name:'Piyasa verileri'}).waitFor();const after=await page.evaluate(()=>hardearner.researchState());assert.equal(after.alerts.length,before.alerts.length);assert.deepEqual(after.settings.enabled,[]);assert.equal(after.configured.coinglass,false);
  assert.deepEqual(errors,[]);console.log(name+': new panels, liquidation stream, alert duplicate prevention, encrypted settings reload, redacted keys, Turkish UI and 390px layout passed ('+requests+' fixture requests).');
 }finally{await browser.close();}
}
(async()=>{await run(chromium,'chromium');await run(webkit,'webkit');})().catch(e=>{console.error(e);process.exitCode=1;});
