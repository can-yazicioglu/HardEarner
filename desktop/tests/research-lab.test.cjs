const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../electron/research-math.cjs'),{createLab,selection}=require('../electron/research-lab.cjs');
const {createBook}=require('../electron/research-book.cjs'),{holdings,compare}=require('../electron/research-sec.cjs');
const {defaultDesk,validateDesk,FEATURES,WIDGETS}=require('../electron/research-catalog.cjs');
const {validateAlert,alertValue}=require('../electron/research-workspace.cjs');
const DAY=M.DAY,now=Date.UTC(2026,9,10,12),json=v=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}});
test('research numbers reject absent, whitespace and objects while preserving actual zero',()=>{
 for(const v of [null,undefined,true,'',' ',[],[1],{},Infinity,'NaN'])assert.equal(M.number(v),null);assert.equal(M.number('0'),0);
 assert.equal(M.ratio(null,10),null);assert.equal(M.relative(null,2),null);assert(Math.abs(M.relative(20,10)-9.090909)<1e-5);
 assert.deepEqual(M.breadth([{return:20,relative:2},{return:-1,relative:-3},{return:null,relative:null}]),{universe:3,covered:2,missing:1,outperform:50,positive:50,weighting:'equal weight',methodVersion:'relative-1'});
});
test('daily bands require consecutive candles and never pad unavailable history',()=>{
 const p=Array.from({length:800},(_,i)=>({time:now-(800-i)*DAY,value:100})),b=M.cycleBands(p);
 assert.equal(b.sma730.length,71);assert.equal(b.mayer.at(-1).value,1);assert.equal(b.twoYearUpper.at(-1).value,500);assert.equal(b.golden1_6,undefined);assert.equal(b['golden1.6'].at(-1).value,160);
 assert.equal(M.sma(p.filter((_,i)=>i!==750),730).at(-1).time,p[749].time);
});
test('monthly and aggregate returns are compounded and incomplete periods stay marked',()=>{
 const jan=Date.UTC(2026,0,1),p=Array.from({length:33},(_,i)=>({time:jan+(i-1)*DAY,value:100+i})),rows=M.periodReturns(p,Date.UTC(2026,1,2));
 assert.equal(rows[0].incomplete,false);assert.equal(rows[1].incomplete,true);assert(Math.abs(rows[0].return-31)<1e-9);
 const quarters=M.aggregateReturns([{period:'2025-01',return:10},{period:'2025-02',return:-10},{period:'2025-03',return:0}]);assert(Math.abs(quarters[0].return+1)<1e-9);assert.equal(quarters[0].incomplete,false);
 assert.equal(M.aggregateReturns(rows,'year')[0].incomplete,true);assert.equal(M.compound([10,null]),null);
});
test('Black Scholes matches the standard benchmark and put-call parity',()=>{
 const v={spot:100,strike:100,years:1,volatility:.2,rate:.05};const c=M.blackScholes(v),p=M.blackScholes({...v,type:'put'});
 assert(Math.abs(c.price-10.4506)<.001);assert(Math.abs(c.delta-.63683)<.0001);assert(Math.abs(c.gamma-.018762)<.00001);assert(Math.abs(c.price-p.price-(100-100*Math.exp(-.05)))<.0001);
 assert.throws(()=>M.blackScholes({...v,volatility:0}));assert.throws(()=>M.blackScholes({...v,spot:NaN}));
});
test('macro correlation aligns observation dates, uses changes, and excludes insufficient or flat samples',()=>{
 const prices=[{time:now,value:100}],macro=[{time:now,value:5}];
 for(let i=1;i<=8;i++){prices.push({time:now+i*DAY,value:prices.at(-1).value*Math.exp(i/100)});macro.push({time:now+i*DAY,value:macro.at(-1).value+i});}
 const r=M.macroCorrelation(prices,macro);assert.equal(r.samples,8);assert(Math.abs(r.value-1)<1e-12);assert.equal(r.rolling.length,3);
 assert.equal(M.macroCorrelation(prices,macro.slice(0,6)).value,null);assert.equal(M.macroCorrelation(prices,macro.map(r=>({...r,value:1}))).value,null);
 assert.equal(M.macroCorrelation(prices,macro.slice(0,-1)).samples,7);
});
test('FRED net liquidity uses millions consistently for calculation and every plotted line',async()=>{
 const lab=createLab({now:()=>now,fetcher:async url=>{const id=new URL(url).searchParams.get('series_id');return json({observations:[{date:'2026-10-09',value:{WALCL:'10000',WTREGEN:'2000',RRPONTSYD:'3'}[id]}]})}});
 const r=await lab.query('macro',{series:'netLiquidity'},{fred:'synthetic-key'});assert.equal(r.data.value,5000);assert.equal(r.data.unit,'USD millions');assert.equal(r.data.series.at(-1).points[0].value,3000);
});
test('option OI is underlying units, max pain is per expiry and gamma is explicitly a model',()=>{
 const expiry=now+30*DAY,rows=[{instrument:'c',expiry,side:'call',strike:100,oi:2,iv:50,underlying:100},{instrument:'p',expiry,side:'put',strike:110,oi:1,iv:50,underlying:100}];
 assert.equal(M.optionSummary(rows).maxPain,null);assert.equal(M.optionSummary(rows,expiry).maxPain,100);assert.equal(M.optionSummary(rows).pcr,.5);
 const s=M.optionScenario(rows,expiry,{now});assert.equal(s.coverage,2);assert.equal(s.skew,null);assert.equal(s.gex.length,81);assert(s.rows[0].scenarioGEX>0);assert(s.rows[1].scenarioGEX<0);
 assert.deepEqual(M.optionScenario([],expiry,{now}).gex,[]);
});
test('DCA accounts for fees and dated FX without treating missing FX as parity',()=>{
 const p=[{time:now,value:10},{time:now+7*DAY,value:20}],fx=[{time:now,value:2},{time:now+7*DAY,value:2}];const r=M.dca(p,{amount:100,every:7,feePct:1,fx,currency:'TRY'});
 assert.equal(r.paid,200);assert.equal(r.fees,2);assert(Math.abs(r.units-7.425)<1e-12);assert(Math.abs(r.value-297)<1e-9);assert.equal(r.lumpValue,396);
 assert.throws(()=>M.dca(p,{amount:0}));assert.throws(()=>M.dca(p,{currency:'TRY',fx:[{time:now-8*DAY,value:2}]}));assert.throws(()=>M.dca(p,{currency:'TRY',fx:[{time:now,value:0}]}));assert.throws(()=>M.dca(p,{currency:'TRY'}));
});
test('risk and treasury do not confuse gross assets with net asset value',()=>{
 const r=M.riskSize({capital:10000,riskPct:1,entry:100,stop:90,feePct:0});assert.equal(r.quantity,10);assert.equal(r.notional,1000);
 const t=M.treasury({holdings:2,btcPrice:100,cost:150,cash:10,debt:80,preferred:30,marketCap:200,annualObligations:20,years:1});assert.equal(t.net,100);assert.equal(t.mnav,2);assert.equal(t.btcToSell,.1);assert.equal(t.pnl,50);
 assert.throws(()=>M.riskSize({capital:100,riskPct:1,entry:10,stop:10}));
});
test('order book enforces snapshot sequence, duplicate tolerance, deletion and gaps',()=>{
 const b=createBook();b.snapshot({lastUpdateId:10,bids:[['100','2']],asks:[['101','3']]});assert(b.update({U:9,u:10,b:[],a:[]}));assert(b.update({U:10,u:11,b:[['100','0'],['99','4']],a:[]}));assert.deepEqual(b.view().bids,[[99,4]]);
 assert.equal(b.update({U:13,u:14,b:[],a:[]}),false);assert.equal(b.view().valid,false);assert.equal(b.update({U:11,u:12,b:[],a:[]}),false);
 b.snapshot({lastUpdateId:20,bids:[['100','2']],asks:[['101','3']]});assert.equal(b.update({U:21,u:21,b:[['100','bad']],a:[]}),false);assert.equal(b.view().valid,false);
});
test('SEC XML keeps dollars, shares, weights, classes and amendments separate',()=>{
 const table=(shares,value)=>'<ns:infoTable><ns:nameOfIssuer>A &amp; B</ns:nameOfIssuer><ns:titleOfClass>COM</ns:titleOfClass><ns:cusip>123456789</ns:cusip><ns:value>'+value+'</ns:value><ns:sshPrnamt>'+shares+'</ns:sshPrnamt><ns:sshPrnamtType>SH</ns:sshPrnamtType></ns:infoTable>';
 const opts={filingDate:'2026-08-14',reportDate:'2026-06-30'},old=holdings(table(2,200),opts),current=holdings(table(3,300)+table(1,100),opts);
 assert.equal(current[0].issuer,'A & B');assert.equal(current[0].value,400);assert.equal(current[0].shares,4);assert.equal(current[0].weight,100);assert.equal(compare(current,old)[0].delta,2);assert.match(compare([],old)[0].change,/no longer disclosed/);
 assert.throws(()=>holdings(table(1,1),{filingDate:'2022-01-01'}));assert.throws(()=>holdings('<!DOCTYPE a>'+table(1,1),opts));assert.throws(()=>holdings(table('',1),opts));
});
test('catalogue has unique documented feature and widget IDs with strict saved layouts',()=>{
 assert.equal(FEATURES.length,44);assert.equal(WIDGETS.length,38);assert.equal(new Set(FEATURES.map(x=>x.id)).size,44);
 const d=defaultDesk();assert.deepEqual(validateDesk(d),d);assert.throws(()=>validateDesk({...d,layouts:[...d.layouts,d.layouts[0]]}));assert.throws(()=>validateDesk({...d,layouts:[{...d.layouts[0],desktop:[{id:'made-up',width:1}]}]}));
});
test('lab rejects caller URLs and unsupported address, date and pool parameters',async()=>{
 assert.throws(()=>selection({asset:'https://example.com'}));assert.throws(()=>selection({addresses:['secret']}));assert.throws(()=>selection({pool:'../../api'}));assert.throws(()=>selection({period:'forever'}));
 await assert.rejects(createLab().query('https://example.com'));assert.throws(()=>selection({minUSD:''}));
});
test('unconfigured paid data makes no network requests; reserves never turns into Mayer',async()=>{
 let calls=0;const lab=createLab({fetcher:()=>{calls++;throw Error('Should not fetch')},now:()=>now});for(const kind of ['reserves','utxo','unlocks','bridges','sectors','calendar','treasuries','geopolitical','burn'])assert.equal((await lab.query(kind)).state,'configuration',kind);assert.equal(calls,0);
});
test('category fee tables do not show the all-category aggregate and cutoff remains unknown',async()=>{
 const lab=createLab({now:()=>now,fetcher:async()=>json({protocols:[{name:'Chain',category:'Chain',total24h:1},{name:'Lender',category:'Lending',total24h:2}],total24h:3,totalDataChart:[[now/1000,3]]})});
 const d=(await lab.query('chainfees')).data;assert.equal(d.rows.length,1);assert.equal(d.value,null);assert.equal(d.at,null);assert.equal(d.series.length,0);assert.equal((await lab.query('fees')).data.value,3);
});
test('lab coalesces public queries, backs off 429 and marks cached failures stale',async()=>{
 let at=now,calls=0,mode='ok';const lab=createLab({now:()=>at,fetcher:async()=>{calls++;if(mode==='rate')return new Response('{}',{status:429,headers:{'retry-after':'120'}});return json({data:[{timestamp:String(Math.floor(at/1000)),value:'60'}]})}});
 const [a,b]=await Promise.all([lab.query('sentiment'),lab.query('sentiment')]);assert.equal(calls,1);assert.deepEqual(a,b);
 mode='rate';at+=3600001;let r=await lab.query('sentiment');assert.equal(r.state,'stale');assert.equal(r.data.value,60);assert.equal(calls,2);r=await lab.query('sentiment');assert.equal(calls,2);assert.match(r.message,/paused/);
 at+=121000;mode='ok';assert.equal((await lab.query('sentiment')).state,'ready');assert.equal(calls,3);
});
test('clearing credentials cannot repopulate the cache from an older in-flight query',async()=>{
 let resolve,calls=0;const lab=createLab({now:()=>now,fetcher:async()=>{const call=++calls;if(call===1)await new Promise(r=>resolve=r);return json({data:[{timestamp:String(now/1000),value:String(call===1?20:60)}]})}});
 const first=lab.query('sentiment');lab.clear();await lab.query('sentiment');resolve();await first;assert.equal((await lab.query('sentiment')).data.value,60);assert.equal(calls,2);
});
test('chart layouts preserve independent saved snapshots, synchronization and restart',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createAnalysis}=require('../electron/analysis.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'he-lab-layout-')),safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>b.toString()};
 let a=createAnalysis({dir,safeStorage,notify:()=>{}});a.mutate('layout',{mode:'8',sync:{symbol:true,interval:true}});assert.equal(a.view().panels.length,8);
 a.mutate('saveLayout','Eight');a.mutate('layout',{mode:'1'});a.mutate('loadLayout','Eight');assert.equal(a.view().panels.length,8);a=createAnalysis({dir,safeStorage,notify:()=>{}});assert.equal(a.view().savedLayouts[0].panels.length,8);
 const {changePanel}=require('../electron/research-layout.cjs'),panels=a.view().panels,next={...panels[0],asset:'ETH',interval:'4h'};assert(changePanel(panels,0,next,{symbol:true,interval:true}).every(p=>p.asset==='ETH'&&p.interval==='4h'));assert.throws(()=>a.mutate('layout',{mode:'99'}));
});
test('paid failures redact secrets, malformed trades cannot become zero-valued observations',async()=>{
 const secret='fake-personal-key-123456',lab=createLab({now:()=>now,fetcher:async()=>new Response('secret '+secret,{status:403})});assert(!JSON.stringify(await lab.query('macro',{}, {fred:secret})).includes(secret));
 const f=createLab({now:()=>now,fetcher:async()=>json([{a:1,T:now,p:null,q:'2',m:false},{a:2,T:now,p:'10',q:'2',m:true}])});const r=await f.query('trades',{minUSD:0});assert.equal(r.data.rows.length,1);assert.equal(r.data.rows[0].notional,20);assert.equal(r.data.value,-2);
});
test('new metric alerts validate bounded units and reject stale intraday samples',()=>{
 const a={metric:'breadth',asset:'BTC',period:'7d',condition:'above',threshold:101,cooldownMinutes:5};assert.throws(()=>validateAlert(a));assert.equal(validateAlert({...a,threshold:0}).threshold,0);assert.throws(()=>validateAlert({...a,metric:'optionPCR',asset:'SOL',threshold:1}));
 const r={state:'ready',data:{value:1,at:now-4*60000}};assert.equal(alertValue(r,'premium',now),null);assert.equal(alertValue(r,'optionPCR',now),null);assert.equal(alertValue(r,'mayer',now).value,1);
});
test('public position threshold excludes smaller and unknown notionals without inventing balances',async()=>{
 const lab=createLab({now:()=>now,fetcher:async(url,options)=>JSON.parse(options.body).type==='perpDexs'?json([]):json({assetPositions:[2000000,10,null].map((value,i)=>({position:{coin:'COIN'+i,positionValue:value,szi:'1'}}))})});
 const r=await lab.query('hyperliquid',{addresses:['0x'+'1'.repeat(40)],minUSD:1000000});assert.equal(r.data.rows.length,1);assert.equal(r.data.rows[0].asset,'COIN0');assert.match(r.data.coverage,/1 \/ 3/);
});
