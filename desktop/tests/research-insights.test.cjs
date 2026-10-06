const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const core=require('../electron/research-insights.cjs'),workspace=require('../electron/research-workspace.cjs'),{liquidationEvents,createLiquidations}=require('../electron/research-liquidations.cjs');
const now=Date.UTC(2026,9,6,14),by=(list,time=now)=>({retCode:0,result:{list},time});
const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()};
function fixture(t,options={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hardearner-insights-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return workspace.createResearchWorkspace({dir,safeStorage,...options});}
test('funding preserves zero, signed rates and actual settlement intervals, never missing = zero',()=>{
 const r=core.funding(by([{symbol:'BTCUSDT',fundingRate:'-0.0002',nextFundingTime:String(now+1000)}]),by([{fundingRate:'0',fundingRateTimestamp:String(now-1000)},{fundingRate:null,fundingRateTimestamp:String(now-2000)}]),by([{symbol:'BTCUSDT',fundingInterval:'60',contractType:'LinearPerpetual'}]),'BTC');
 assert.equal(r.value,-.02);assert.equal(r.intervalMinutes,60);assert.equal(r.points.length,1);assert.equal(r.points[0].value,0);assert.equal(r.nextSettlement,now+1000);
 for(const v of [null,undefined,'',true,' ',Infinity])assert.equal(core.finite(v),null);assert.equal(core.finite('0'),0);
});
test('open interest uses consistent side basis, correct base units and real historical baseline',()=>{
 const t=by([{symbol:'BTCUSDT',openInterest:'200',singleOpenInterest:'100',openInterestValue:'10000',singleOpenInterestValue:'5000'}]);
 const h=by([{timestamp:String(now-86400000),openInterest:'160',singleOpenInterest:'80'}]);const r=core.interest(t,h,'BTC','24h');assert.equal(r.value,100);assert.equal(r.change,25);assert.equal(r.unit,'BTC');assert.equal(r.quoteUnit,'USDT');assert.equal(r.quoteNotional,5000);
 const legacy=core.interest(t,by([{timestamp:String(now-86400000),openInterest:'160'}]),'BTC','24h');assert.equal(legacy.basis,'sum of long and short sides');assert.equal(legacy.change,25);assert.equal(legacy.value,200);
 assert.equal(core.interest(t,by([{timestamp:String(now-1000),openInterest:100}]),'BTC','1y').change,null);
});
test('ETF completeness, revisions and holidays do not invent zero flows',async t=>{
 let flow=10;const d=()=>({code:'0',data:[{timestamp:now-86400000,flow_usd:flow,etf_flows:[{etf_ticker:'A',flow_usd:flow}]}]});
 const w=fixture(t,{query:async()=>({state:'ready',data:core.etf(d(),'BTC'),fetchedAt:now})});let r=await w.query('etf');assert.equal(r.data.completeness,'provider-reported');assert.equal(r.data.revision,false);flow=20;r=await w.query('etf');assert.equal(r.data.revision,true);assert.equal((await w.query('etf')).data.revision,true);
 assert.equal(core.etf({code:'0',data:[{timestamp:now,flow_usd:5,etf_flows:[{etf_ticker:'A',flow_usd:null}]}]},'BTC').completeness,'incomplete');
 assert.equal(core.marketDay('2026-12-25'),'holiday');assert.equal(core.marketDay('2026-10-04'),'weekend');assert.equal(core.marketDay('2030-10-07'),'calendar-unverified');
 assert.equal(core.etf({code:'0',data:[{timestamp:now,change_usd:-5,etf_flows:[{ticker:'E',change_usd:-5}]}]},'ETH').value,-5);
});
test('on-chain scalar series rejects malformed values and keeps negative NUPL',()=>{
 const d=core.onchain([{t:now/1000,v:-.2},{t:now/1000-86400,v:null},{t:now/1000-2*86400,v:{value:1}}],'nupl','BTC');assert.equal(d.value,-.2);assert.equal(d.points.length,1);assert.equal(d.unit,'ratio');assert.throws(()=>core.onchain({error:'key'},'sopr','ETH'));
});
test('whale evidence and direction stay separate from trading, missing amounts excluded from totals',()=>{
 const d=core.transfers({code:'0',data:[{transaction_hash:'0x'+'a'.repeat(64),transaction_time:now/1000,asset_symbol:'USDT',amount_usd:100,asset_quantity:101,transfer_type:1,exchange_name:'Kraken'},{transaction_hash:'javascript:alert(1)',transaction_time:now/1000,amount_usd:null}]},true);
 assert.equal(d.events[0].direction,'inflow');assert.equal(d.events[0].value,100);assert.match(d.events[0].evidence,/^https:\/\/etherscan.io\/tx\/0x/);assert.equal(d.events[1].value,null);assert.equal(d.events[1].evidence,null);assert(!JSON.stringify(d).includes('BUY'));
});
test('liquidation side uses Bybit position convention, duplicates ignored, disconnect never looks live',()=>{
 const sockets=[],timers=[];class Socket{constructor(){sockets.push(this);this.readyState=1;}send(){}close(){this.onclose?.();}}
 let clock=now;const f=createLiquidations('BTC',{Socket,now:()=>clock,timer:(fn,ms)=>{timers.push([fn,ms]);return timers.length;},cancel(){}}),socket=sockets[0];socket.onopen();socket.onmessage({data:JSON.stringify({op:'subscribe',success:true})});
 const message={topic:'allLiquidation.BTCUSDT',data:[{T:now,s:'BTCUSDT',S:'Buy',v:'2',p:'100'},{T:now+1,s:'BTCUSDT',S:'Sell',v:'1',p:'90'}]};
 assert.equal(liquidationEvents(message,'ETH').length,0);socket.onmessage({data:JSON.stringify(message)});socket.onmessage({data:JSON.stringify(message)});assert.equal(f.view().count,2);assert.equal(f.view().long,200);assert.equal(f.view().short,90);socket.onclose();assert.equal(f.view().stale,true);assert.equal(f.view().gaps,1);f.stop();
});
test('heatmap only accepts indexed cells with actual price/time coordinates and never calls them actual liquidations',()=>{
 const r=core.heatmap({code:'0',data:{y_axis:[10,20],price_candlesticks:[[now/1000]],liquidation_leverage_data:[[0,1,100],[99,0,12],[0,0,null]]}});assert.deepEqual(r.points,[{time:now,price:20,value:100}]);assert.match(r.definition,/not observed/);
});
test('metric credentials are redacted from all renderer views and settings reject invalid keys and addresses',t=>{
 const w=fixture(t);w.mutate('key',{provider:'coinglass',key:'fixture-private-key-123'});w.mutate('settings',{asset:'ETH',enabled:['whales']});const v=w.view();assert.equal(v.configured.coinglass,true);assert(!JSON.stringify(v).includes('fixture-private'));assert.equal(v.settings.asset,'ETH');assert.throws(()=>w.mutate('key',{provider:'__proto__',key:'fixture-private-key-123'}));assert.throws(()=>w.mutate('settings',{addresses:['seed phrase words']}));
});
test('metric alerts deduplicate, enforce cooldown, require exit/reentry and do not trigger stale/incomplete data',async t=>{
 let clock=now,value=.02,stale=false;const fired=[],w=fixture(t,{now:()=>clock,notify:a=>fired.push(a),query:async()=>({state:stale?'stale':'ready',stale,data:{value,at:clock},fetchedAt:clock})});
 const a={metric:'funding',asset:'BTC',period:'7d',condition:'above',threshold:.01,cooldownMinutes:5};w.mutate('alert',a);assert.throws(()=>w.mutate('alert',{...a,cooldownMinutes:60}),/already active/);await w.check();await w.check();assert.equal(fired.length,1);value=0;await w.check();value=.02;await w.check();assert.equal(fired.length,1);clock+=6*60000;await w.check();assert.equal(fired.length,1);value=0;await w.check();stale=true;value=.03;await w.check();assert.equal(fired.length,1);stale=false;await w.check();assert.equal(fired.length,2);
 assert.equal(workspace.alertValue({state:'ready',data:{value:10,time:now,completeness:'incomplete'}},'etf',now),null);assert.equal(workspace.alertValue({state:'ready',data:{value:10,at:now-86400000}},'interest',now),null);
});
test('provider failures retain stale values, paid endpoints never run without keys, unknown routes cannot be proxied',async()=>{
 let clock=now,fail=false,calls=0;const svc=core.createInsights({now:()=>clock,fetcher:async url=>{calls++;if(fail)return new Response('{}',{status:429,headers:{'retry-after':'90'}});const u=new URL(url);return Response.json(u.pathname.endsWith('tickers')?by([{symbol:'BTCUSDT',fundingRate:'0'}]):u.pathname.endsWith('instruments-info')?by([{symbol:'BTCUSDT',fundingInterval:'480',contractType:'LinearPerpetual'}]):by([]));}});
 assert.equal((await svc.query('etf')).state,'configuration');assert.equal(calls,0);await assert.rejects(svc.query('https://example.invalid'),/Unknown/);
 assert.equal((await svc.query('funding')).state,'ready');const count=calls;await svc.query('funding');assert.equal(calls,count);clock+=61000;fail=true;let r=await svc.query('funding');assert.equal(r.state,'stale');assert.equal(r.data.value,0);const after=calls;await svc.query('interest');assert.equal(calls,after);assert(r.retryAt>clock);
});
test('public Hyperliquid snapshots retain size changes without inventing a first change',async t=>{
 let size='2';const address='0x'+'1'.repeat(40),w=fixture(t,{now:()=>now,query:async()=>({state:'ready',data:{accounts:[core.positions({assetPositions:[{position:{coin:'BTC',szi:size,entryPx:'100',positionValue:'200'}}]},address,now)]}})});w.mutate('settings',{addresses:[address]});assert.equal((await w.query('positions')).data.accounts[0].baseline,true);size='-1';const r=await w.query('positions');assert.equal(r.data.accounts[0].changes[0].delta,-3);assert.equal(r.data.accounts[0].positions[0].size,-1);assert.equal((await w.query('positions')).data.accounts[0].changes.length,1);
});
test('saved research state survives restart, corrupted originals are not overwritten',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hardearner-research-restore-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const args={dir,safeStorage},w=workspace.createResearchWorkspace(args);w.mutate('key',{provider:'glassnode',key:'synthetic-private-key'});w.mutate('settings',{asset:'ETH',summary:true});const restored=workspace.createResearchWorkspace(args);assert.equal(restored.view().settings.asset,'ETH');assert.equal(restored.view().configured.glassnode,true);
 const file=path.join(dir,'research.encrypted');fs.writeFileSync(file,'damaged-original');const broken=workspace.createResearchWorkspace(args);assert.match(broken.view().error,/preserved/);assert.throws(()=>broken.mutate('settings',{asset:'SOL'}),/preserved/);assert.equal(fs.readFileSync(file,'utf8'),'damaged-original');
});
test('resuming an alert cannot bypass duplicate prevention and public queries receive no API keys',async t=>{
 const calls=[],w=fixture(t,{query:async(kind,input,keys)=>{calls.push({kind,keys});return{state:'unavailable',data:null}}});w.mutate('key',{provider:'coinglass',key:'synthetic-private-key'});await w.query('funding');assert.deepEqual(calls[0].keys,{});await w.query('etf');assert.deepEqual(Object.keys(calls[1].keys),['coinglass']);
 const a={metric:'funding',asset:'BTC',period:'7d',condition:'above',threshold:0.1,cooldownMinutes:60};let v=w.mutate('alert',a),id=v.alerts[0].id;w.mutate('toggleAlert',id);w.mutate('alert',a);assert.throws(()=>w.mutate('toggleAlert',id),/already active/);
});
test('rate limits stay isolated by provider and failures never leak keys or request URLs',async()=>{
 const secret='synthetic-private-key',calls=[],svc=core.createInsights({now:()=>now,fetcher:async url=>{calls.push(url);if(url.includes('bybit'))return new Response('{}',{status:429,headers:{'retry-after':'60'}});throw Error('request '+url);}});
 await svc.query('funding');const r=await svc.query('mvrv',{asset:'BTC'},{glassnode:secret});assert.equal(r.retryAt,null);assert(calls.some(u=>u.includes('glassnode')));assert(!JSON.stringify(r).includes(secret));assert(!JSON.stringify(r).includes('https:'));assert.equal(r.data,null);
});
