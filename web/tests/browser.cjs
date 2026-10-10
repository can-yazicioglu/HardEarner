const {chromium,webkit}=require('../../desktop/node_modules/playwright'),assert=require('node:assert/strict');
const URL='http://127.0.0.1:8794',password='Private test password 2026';
async function unlock(p){await p.getByLabel(/^(Kasa şifresi|Vault password)$/).fill(password);const setup=p.getByLabel(/^(Kasa şifresini tekrarla|Confirm vault password)$/);if(await setup.isVisible()){await setup.fill(password);await p.getByRole('button',{name:/^(Özel kasayı oluştur|Create private vault)$/}).click();}else await p.getByRole('button',{name:/^(Kasayı aç|Unlock vault)$/}).click();await p.locator('.private-toolbar').waitFor();}
async function run(engine,name){const browser=await engine.launch({headless:true});try{
 const a=await browser.newContext({viewport:{width:1440,height:1000}}),b=await browser.newContext({viewport:{width:1440,height:1000}}),other=await browser.newContext();
 await other.addCookies([{name:'test-user',value:'two',url:URL}]);
 for(const context of [a,b,other])await context.route('**/api/research',r=>r.fulfill({json:{state:'unavailable',data:null,message:'Isolated legacy regression fixture'}}));
 for(const context of [a,b,other])await context.route('**/api/market',async route=>{const input=route.request().postDataJSON();
  if(input.op==='refresh')return route.fulfill({json:{fx:{USD:1,TRY:49,GBP:.75,EUR:.87},crypto:{BTC:{usd:80000,change:1},USDT:{usd:1},ONDO:{usd:.55}},metals:{XAU:{usd:3600}},status:{crypto:{ok:true},fx:{ok:true}}}});
  if(input.op==='analysisHistory'){const c=input.args[0],time=Math.floor(Date.now()/3600000)*3600;return route.fulfill({json:{...c,bars:Array.from({length:100},(_,i)=>({time:time-(100-i)*3600,open:80000+i,high:80010+i,low:79990+i,close:80002+i,volume:1})),source:'Synthetic UI test',fetchedAt:Date.now()}})}
  return route.fulfill({json:{value:80000,at:Date.now(),rates:{USD:1,TRY:49,GBP:.75},date:'2026-09-28'}});
 });
 const p=await a.newPage(),q=await b.newPage(),r=await other.newPage(),errors=[];for(const page of [p,q,r])page.on('pageerror',e=>errors.push(e.message));
 await p.goto(URL);await unlock(p);await p.locator('.language-select').selectOption('en');await p.getByRole('button',{name:'Add holding',exact:true}).waitFor();
 const s=await p.evaluate(()=>hardearner.load());s.state.settings.currency='USD';s.state.goals=[{id:'cloud-goal-'+name,name:'Saved from '+name,target:1500,currency:'USD'}];
 await p.evaluate(s=>hardearner.save(s),s.state);
 await q.goto(URL);await unlock(q);assert.equal((await q.evaluate(()=>hardearner.load())).state.goals[0].name,'Saved from '+name);
 const workspace=await p.evaluate(()=>hardearner.analysisLoad());const config={...workspace.panels[0],asset:'BTC',venue:'binance',type:'crypto',interval:'1h',style:'candles',quote:'USDT'};
 await p.evaluate(c=>hardearner.analysisMutate('drawing',{config:c,kind:'freehand',points:[{time:1700000000,price:80000},{time:1700000100,price:81000}]}),config);
 await q.evaluate(()=>hardearner.loadCloudChanges());assert(Object.values((await q.evaluate(()=>hardearner.analysisLoad())).drawings).some(rows=>rows.some(d=>d.kind==='freehand')));
 const child=a.waitForEvent('page');await p.getByRole('button',{name:'Self Analysis',exact:true}).click();const research=await child;await research.waitForLoadState();await research.locator('.research-shell').waitFor();assert.equal(await research.locator('.app-lock-card').count(),0);await research.getByRole('button',{name:'Charts',exact:true}).click();await research.locator('canvas').first().waitFor();
 await research.screenshot({path:'../.artifacts/screenshots/HardEarner-private-'+name+'-analysis.png',fullPage:true});
 await research.close();
 const rev=(await q.request.get(URL+'/api/vault')).json();assert((await rev).envelope.ciphertext);assert(!(JSON.stringify(await rev)).includes('Saved from '+name));
 await r.goto(URL);await unlock(r);assert.equal((await r.evaluate(()=>hardearner.load())).state.goals.length,0);assert.equal((await r.evaluate(()=>hardearner.connections())).connections.length,0);
 await q.getByRole('button',{name:'Lock vault',exact:true}).click();await q.getByLabel(/^(Kasa şifresi|Vault password)$/).waitFor();
 await q.getByLabel(/^(Kasa şifresi|Vault password)$/).fill('An incorrect test password');await q.getByRole('button',{name:/^(Kasayı aç|Unlock vault)$/}).click();await q.getByRole('alert').waitFor();await unlock(q);
 await q.reload();await unlock(q);assert.equal((await q.evaluate(()=>hardearner.load())).state.goals[0].name,'Saved from '+name);
 // A dropped save must survive a reload, and retry must not overwrite a newer device.
 await q.route('**/api/vault',route=>route.request().method()==='PUT'?route.abort():route.continue());
 const failure=await q.evaluate(async()=>{const s=await hardearner.load();s.state.goals[0].name='Recovered edit';try{await hardearner.save(s.state);return null}catch(e){return e.message}});assert(failure);
 await q.unroute('**/api/vault');await q.reload();await unlock(q);await q.getByRole('button',{name:/^(Tekrar kaydet|Retry save)$/}).waitFor();
 await q.getByRole('button',{name:/^(Tekrar kaydet|Retry save)$/}).click();await q.getByRole('button',{name:/^(Tekrar kaydet|Retry save)$/}).waitFor({state:'hidden'});
 assert.equal((await q.evaluate(()=>hardearner.load())).state.goals[0].name,'Recovered edit');
 await p.evaluate(()=>hardearner.loadCloudChanges());
 await q.route('**/api/vault',route=>route.request().method()==='PUT'?route.abort():route.continue());
 await q.evaluate(async()=>{const s=await hardearner.load();s.state.goals[0].name='Offline edit';try{await hardearner.save(s.state)}catch{}});await q.unroute('**/api/vault');
 await p.evaluate(async()=>{const s=await hardearner.load();s.state.goals[0].name='Newer cloud edit';await hardearner.save(s.state)});
 assert(await q.evaluate(async()=>{try{await hardearner.recoverPending('retry');return false}catch{return true}}));
 await q.evaluate(()=>hardearner.recoverPending('archive'));assert.equal((await q.evaluate(()=>hardearner.load())).state.goals[0].name,'Newer cloud edit');
 // iOS and denied browser notifications must still have a visible in-app fallback.
 await q.evaluate(()=>{delete window.Notification;return hardearner.testNotification()});
 await q.locator('.private-notices').getByText(/Private web notification test/).waitFor();
 await q.getByRole('button',{name:/^(Bildirimi kapat|Dismiss notification)$/}).click();await q.locator('.private-notices section').waitFor({state:'hidden'});
 await q.setViewportSize({width:390,height:844});await q.getByRole('button',{name:'Navigation menu',exact:true}).click();
 await q.locator('.sidebar').getByRole('button',{name:'Holdings',exact:true}).click();assert.equal(await q.getByRole('button',{name:'Navigation menu',exact:true}).getAttribute('aria-expanded'),'false');
 assert(await q.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await q.waitForFunction(()=>document.querySelector('.sidebar').getBoundingClientRect().right<=1);
 await q.screenshot({path:'../.artifacts/screenshots/HardEarner-private-phone.png',fullPage:true,animations:'disabled'});
 assert.deepEqual(errors,[]);console.log('PASS '+name+': shared desktop UI, encrypted cross-device save, drawing sync, separate users, wrong-password rejection, restart persistence, interrupted-save recovery, conflicting-device protection, phone navigation');
 }finally{await browser.close();}}
(async()=>{if(process.env.TEST_ENGINE!=='webkit')await run(chromium,'chromium');if(process.env.TEST_ENGINE!=='chromium')await run(webkit,'webkit');})().catch(e=>{console.error(e);process.exitCode=1});
