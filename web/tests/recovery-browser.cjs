const {chromium,webkit}=require('../../desktop/node_modules/playwright'),assert=require('node:assert/strict');
const URL='http://127.0.0.1:8794',oldPassword='Original reset fixture password',nextPassword='Replacement reset fixture password';
async function run(engine,name){const browser=await engine.launch({headless:true});try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addCookies([{name:'test-user',value:'reset-'+name,url:URL}]);
 await context.route('**/api/market',r=>r.fulfill({json:{fx:{USD:1,TRY:45,EUR:.85,GBP:.75},crypto:{},metals:{},status:{}}}));
 await context.route('**/api/research',r=>r.fulfill({json:{state:'unavailable',data:null,message:'Synthetic fixture'}}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(URL);
 await page.getByLabel('Kasa şifresi',{exact:true}).fill(oldPassword);await page.getByLabel('Kasa şifresini tekrarla',{exact:true}).fill(oldPassword);await page.getByRole('button',{name:'Özel kasayı oluştur',exact:true}).click();await page.locator('.private-toolbar').waitFor();
 await page.evaluate(async()=>{const x=await hardearner.load();x.state.goals=[{id:'reset-preserve',name:'Encrypted old fixture',target:500,currency:'TRY'}];await hardearner.save(x.state)});
 const oldHead=await (await context.request.get(URL+'/api/vault')).json();
 const other=await context.newPage();await other.goto(URL);await other.getByLabel('Kasa şifresi',{exact:true}).fill(oldPassword);await other.getByRole('button',{name:'Kasayı aç',exact:true}).click();await other.locator('.private-toolbar').waitFor();
 await page.getByRole('button',{name:'Lock vault',exact:true}).click();await page.getByRole('button',{name:'Şifremi unuttum',exact:true}).click();
 const send=page.getByRole('button',{name:'Sıfırlama kodunu gönder',exact:true});assert.equal(await send.isEnabled(),false);
 await page.getByLabel('Boş bir kasayla başlayacağımı anlıyorum.').check();await send.click();await page.getByText('Kod gönderildi.',{exact:false}).waitFor();
 assert.equal((await (await context.request.get(URL+'/api/vault')).json()).revision,oldHead.revision);
 const mail=await(await context.request.get(URL+'/__test__/mail')).json(),code=mail.text.match(/\b\d{8}\b/)[0];
 await page.getByLabel('E-posta kodu',{exact:true}).fill(code==='00000000'?'99999999':'00000000');await page.getByLabel('Yeni kasa şifresi',{exact:true}).fill(nextPassword);await page.getByLabel('Kasa şifresini tekrarla',{exact:true}).fill(nextPassword);
 await page.getByRole('button',{name:'Kodu doğrula ve boş kasa oluştur',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal((await(await context.request.get(URL+'/api/vault')).json()).revision,oldHead.revision);
 await page.getByLabel('E-posta kodu',{exact:true}).fill(code);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:'../.artifacts/screenshots/password-reset-'+name+'-phone.png',fullPage:true});
 // Simulate the server committing while its success response is lost.
 await page.route('**/api/recovery/complete',async route=>{await route.fetch();await route.abort()});
 await page.getByRole('button',{name:'Kodu doğrula ve boş kasa oluştur',exact:true}).click();await page.getByRole('heading',{name:'Yeni kasan hazır',exact:true}).waitFor();
 await other.getByLabel('Kasa şifresi',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Giriş ekranına dön',exact:true}).click();await page.getByLabel('Kasa şifresi',{exact:true}).fill(oldPassword);await page.getByRole('button',{name:'Kasayı aç',exact:true}).click();await page.getByRole('alert').waitFor();
 await page.getByLabel('Kasa şifresi',{exact:true}).fill(nextPassword);await page.getByRole('button',{name:'Kasayı aç',exact:true}).click();await page.locator('.private-toolbar').waitFor();assert.equal((await page.evaluate(()=>hardearner.load())).state.goals.length,0);
 const archives=await page.evaluate(()=>hardearner.resetArchives());assert.equal(archives.length,1);
 const archive=await (await context.request.post(URL+'/api/recovery/archive',{headers:{Origin:URL},data:{id:archives[0].id}})).json();assert.deepEqual(archive.envelope,oldHead.envelope);
 const identity=await(await context.request.get(URL+'/api/session')).json();
 const preview=await page.evaluate(async({archive,identity,password})=>hardearner.inspectVaultBackup({format:'hardearner-vault-backup-v1',identity:identity.id,createdAt:archive.savedAt,version:'2.16.1',envelope:archive.envelope},password),{archive,identity,password:oldPassword});assert.equal(preview.goals,1);
 await page.reload();await page.getByLabel('Kasa şifresi',{exact:true}).fill(nextPassword);await page.getByRole('button',{name:'Kasayı aç',exact:true}).click();await page.locator('.private-toolbar').waitFor();
 const cross=await browser.newContext();await cross.addCookies([{name:'test-user',value:'reset-other-'+name,url:URL}]);assert.equal((await(await cross.request.post(URL+'/api/recovery/archive',{headers:{Origin:URL},data:{id:archives[0].id}})).json()).envelope,undefined);
 assert.deepEqual(errors,[]);console.log('PASS '+name+': reset consent, email-code errors, lost response, new-password login, preserved encrypted archive, other-tab lock, restart, per-user isolation and mobile layout');
 }finally{await browser.close()}}
(async()=>{if(process.env.TEST_ENGINE!=='webkit')await run(chromium,'chromium');if(process.env.TEST_ENGINE!=='chromium')await run(webkit,'webkit')})().catch(e=>{console.error(e);process.exitCode=1});
