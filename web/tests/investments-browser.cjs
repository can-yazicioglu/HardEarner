// Loopback synthetic data only. Tests the real encrypted browser vault and shared UI.
const {chromium,webkit}=require('../../desktop/node_modules/playwright'),assert=require('node:assert/strict');
const root='http://127.0.0.1:8794',password='Private test password 2026',fixtureKey='FIXTURE_ONLY_MARKET_KEY_213';
async function unlock(p){await p.getByLabel(/^(Kasa şifresi|Vault password)$/).fill(password);const confirmation=p.getByLabel(/^(Kasa şifresini tekrarla|Confirm vault password)$/);if(await confirmation.isVisible()){await confirmation.fill(password);await p.getByRole('button',{name:/^(Özel kasayı oluştur|Create private vault)$/}).click()}else await p.getByRole('button',{name:/^(Kasayı aç|Unlock vault)$/}).click();await p.locator('.private-toolbar').waitFor()}
async function run(engine,name){const b=await engine.launch({headless:true});let p;try{
 const context=await b.newContext({viewport:{width:1440,height:1000}}),errors=[];
 await context.route('**/api/market',r=>r.fulfill({json:{fx:{USD:1,TRY:49,GBP:.75,EUR:.87},crypto:{BTC:{usd:80000}},metals:{XAU:{usd:3600}},status:{crypto:{ok:true},fx:{ok:true}}}}));
 let quotes=0;await context.route('**/api/securities-data',r=>{const d=r.request().postDataJSON(),now=Math.floor(Date.now()/1000),day=Math.floor(now/86400)*86400;assert.equal(d.parameters.apikey,fixtureKey);
  if(d.endpoint==='/symbol_search')return r.fulfill({json:{data:[{symbol:'AAPL',exchange:'NASDAQ',currency:'USD',instrument_type:'Common Stock',instrument_name:'Apple Inc.',mic_code:'XNGS'}]}});
  if(d.endpoint==='/quote'){quotes++;return r.fulfill({json:{symbol:'AAPL',exchange:'NASDAQ',currency:'USD',timestamp:day,last_quote_at:now,close:100,high:101,low:99,volume:10000,percent_change:1}})}
  assert.equal(d.endpoint,'/time_series');return r.fulfill({json:{meta:{symbol:'AAPL',exchange:'NASDAQ',currency:'USD'},values:Array.from({length:200},(_,i)=>({datetime:new Date((day-(199-i)*86400)*1000).toISOString().slice(0,10),open:90+i/20,high:91+i/20,low:89+i/20,close:90.5+i/20,volume:1000}))}});
 });
 p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(root);await unlock(p);await p.locator('.language-select').selectOption('en');
 await p.locator('aside').getByRole('button',{name:'Stocks & funds',exact:true}).click();await p.getByRole('button',{name:'Data settings',exact:true}).click();await p.getByLabel('Market data API key',{exact:true}).fill(fixtureKey);await p.getByRole('button',{name:'Save key',exact:true}).click();await p.getByRole('dialog').waitFor({state:'hidden'});
 await p.getByLabel('Search investments',{exact:true}).fill('AAPL');await p.getByRole('button',{name:'Search provider',exact:true}).click();await p.locator('.investment-search-results button').click();await p.getByLabel('Refresh AAPL',{exact:true}).waitFor();
 const before=await p.evaluate(()=>hardearner.securities()),id=before.instruments.find(i=>i.symbol==='AAPL').id;
 // Saving a manual security then refreshing must fetch a real provider quote once.
 await p.evaluate(async id=>{const d=await hardearner.load(),security=(await hardearner.securities()).instruments.find(i=>i.id===id);d.state.holdings=[{id:'web-test-stock',type:'stock',asset:id,security,quantity:2,name:'Apple Inc.',location:'Fixture broker',cost:190,costCurrency:'USD',purchaseDate:new Date().toISOString().slice(0,10),purchaseFee:1}];await hardearner.save(d.state);await hardearner.refresh()},id);
 assert(quotes>=1 || Date.now()-(before.quotes[id]?.fetchedAt||0)<300000);assert.equal((await p.evaluate(()=>hardearner.securities())).quotes[id].price,100);
 await p.getByRole('button',{name:'Holdings',exact:true}).click();await p.getByRole('button',{name:'Performance',exact:true}).click();await p.getByLabel('Performance asset',{exact:true}).waitFor();assert((await p.evaluate(()=>hardearner.performance('USD'))).startedAt);
 await p.locator('aside').getByRole('button',{name:'Stocks & funds',exact:true}).click();await p.getByLabel('Compare AAPL',{exact:true}).check();await p.getByRole('button',{name:'Load comparison',exact:true}).click();await p.locator('.investment-comparison .recharts-line').waitFor();
 await p.getByLabel('Refresh AAPL',{exact:true}).click();await p.locator('.investment-screener td').filter({hasText:'Twelve Data'}).waitFor();
 await p.evaluate(()=>window.scrollTo(0,0));await p.mouse.move(50,50);await p.screenshot({path:'../.artifacts/screenshots/HardEarner-private-2.13-'+name+'.png',fullPage:true,animations:'disabled'});
 const encrypted=await (await p.request.get(root+'/api/vault')).json();assert(!JSON.stringify(encrypted).includes(fixtureKey));assert(!JSON.stringify(encrypted).includes('Apple Inc.'));
 await p.reload();await unlock(p);assert.equal((await p.evaluate(()=>hardearner.securities())).configured,true);assert.equal((await p.evaluate(()=>hardearner.securities())).quotes[id].price,100);assert.equal((await p.evaluate(()=>hardearner.load())).state.holdings[0].asset,id);assert((await p.evaluate(()=>hardearner.performance('USD'))).startedAt);
 await p.evaluate(()=>hardearner.authLock());assert(await p.evaluate(async()=>{try{await hardearner.securities();return false}catch{return true}}));
 assert.deepEqual(errors,[]);console.log('PASS '+name+': shared investment UI, encrypted key/listing/quote/performance persistence, auto held-security refresh, comparison chart, lock gate. Synthetic fixtures only.');
 }catch(e){if(p){console.error((await p.locator('body').innerText()).slice(-6000));await p.screenshot({path:'../.artifacts/screenshots/HardEarner-private-2.13-failure.png',fullPage:true})}throw e}finally{await b.close()}}
(async()=>{await run(chromium,'chromium');await run(webkit,'webkit')})().catch(e=>{console.error(e);process.exitCode=1});
