const {test}=require('node:test'),assert=require('node:assert/strict');
const {coins,globalData,stablecoins,protocols,createResearch}=require('../electron/research.cjs');
const {tinyAssetGroups}=require('../electron/balance-display.cjs');
const {executions,markers}=require('../electron/trade-markers.cjs');
const {linkedHoldings}=require('../electron/connections-view.cjs');
const {widgetURL}=require('../electron/research-widget-url.cjs');
const {researchLink}=require('../electron/research-links.cjs');
test('Public research keeps unknown metrics unknown and never coerces missing prices to zero',()=>{
 const rows=coins([{id:'bitcoin',symbol:'btc',name:'Bitcoin',current_price:100,market_cap:null,price_change_percentage_24h:null,sparkline_in_7d:{price:[99,null,100,Infinity]}},{id:'missing',symbol:'x',current_price:null}]);
 assert.equal(rows.length,1);assert.equal(rows[0].cap,null);assert.equal(rows[0].change,null);assert.deepEqual(rows[0].spark,[99,100]);
 assert.throws(()=>globalData({data:{total_market_cap:{usd:null}}}));
 assert.deepEqual(globalData({data:{total_market_cap:{usd:100},market_cap_percentage:{btc:60,bad:101}}}).dominance,[{asset:'BTC',value:60}]);
});
test('USD stablecoin supply excludes other pegs and missing historical supply is not a false monthly return',()=>{
 const d=stablecoins({peggedAssets:[{id:1,symbol:'USD1',pegType:'peggedUSD',circulating:{peggedUSD:100},circulatingPrevMonth:{peggedUSD:80}},{id:2,symbol:'USD2',pegType:'peggedUSD',circulating:{peggedUSD:25}},{id:3,pegType:'peggedEUR',circulating:{peggedUSD:1000}}]});
 assert.equal(d.cap,125);assert.equal(d.change,null);assert.equal(d.rows.length,2);
});
test('Protocol TVL rankings do not rank centralised exchanges as DeFi protocols',()=>{
 const rows=protocols([{slug:'a',name:'Protocol',category:'Lending',tvl:100},{slug:'b',category:'CEX',tvl:1000},{slug:'c',category:'Chain',tvl:1000}]);assert.deepEqual(rows.map(r=>r.id),['a']);
});
test('Research cache coalesces requests and preserves only dated old values when a source fails',async()=>{
 let now=1e12,fail=false,calls=0;const research=createResearch({now:()=>now,requester:async url=>{calls++;if(fail)throw Error('offline');if(url.endsWith('/global'))return{data:{total_market_cap:{usd:123}}};if(url.includes('/coins/markets'))return[{id:'btc',symbol:'btc',current_price:100}];if(url.includes('/trending'))return{coins:[]};if(url.includes('/stablecoins'))return{peggedAssets:[{id:1,pegType:'peggedUSD',circulating:{peggedUSD:100}}]};return[];}});
 const [a,b]=await Promise.all([research.overview(),research.overview()]);assert.equal(calls,5);assert.equal(a.global.data.cap,123);assert.deepEqual(a,b);now+=1000;await research.overview();assert.equal(calls,5);
 now+=300000;fail=true;const stale=await research.overview();assert(stale.global.stale);assert.equal(stale.global.at,a.global.at);assert.equal(stale.global.data.cap,123);assert(stale.coins.stale);
});
test('Small balance display groups by account without changing totals or hiding unknown-price assets',()=>{
 const rows=[{id:'1',connectionId:'a',asset:'BABY',type:'crypto',value:.1,connected:true},{id:'2',connectionId:'a',asset:'BABY',type:'crypto',value:.2,connected:true},{id:'3',connectionId:'b',asset:'BABY',type:'crypto',value:10,connected:true},{id:'4',asset:'XAU',type:'metal',value:.1,connected:false},{id:'5',asset:'NEW',type:'crypto',value:null,connected:true}],copy=structuredClone(rows);
 const small=tinyAssetGroups(rows,.75);assert.equal(small.length,1);assert.deepEqual(small[0].rows.map(r=>r.id),['1','2']);assert.deepEqual(rows,copy);assert.equal(tinyAssetGroups(rows,NaN).length,0);
});
test('Removed or zero Kraken balances cannot reappear from old purchase history',()=>{
 const c={id:'fixture',kind:'kraken',label:'Kraken',included:true,history:{events:[{id:'buy',base:'BABY',quote:'USD',side:'BUY',time:Date.now(),quantity:2,paid:10,fee:0}],movements:[]},balances:[]};assert.deepEqual(linkedHoldings([c]),[]);
 c.balances=[{id:'BABY',asset:'BABY',type:'crypto',quantity:0,available:0}];assert.deepEqual(linkedHoldings([c]),[]);
 c.balances[0].quantity=.25;c.balances[0].available=.25;assert(Math.abs(linkedHoldings([c]).reduce((n,r)=>n+r.quantity,0)-.25)<1e-12);
});
test('Execution popups preserve original price, settlement currency and every fee, including a conversion leg',()=>{
 const time=Date.now(),rows=executions([{id:'k',label:'Kraken',history:{events:[{id:'c',source:'Convert',side:'BUY',base:'ONDO',quote:'BTC',quantity:25,paid:.0002,time,fees:[{asset:'BTC',amount:.000001}]}]}}]);
 const incoming=rows.find(r=>r.asset==='ONDO'),outgoing=rows.find(r=>r.asset==='BTC');assert.equal(incoming.total,.0002);assert.equal(incoming.price,.0002/25);assert.equal(outgoing.side,'SELL');assert.equal(outgoing.price,25/.0002);assert.equal(incoming.fees[0].amount,.000001);
 const broker=executions([{id:'b',label:'Broker',history:{events:[{id:'f',side:'BUY',assetType:'stock',base:'AAPL',quote:'GBP',quantity:2,paid:160,executionPrice:100,executionCurrency:'USD',time,fees:[]}]}}])[0];assert.equal(broker.total,200);assert.equal(broker.payment,160);assert.equal(broker.paymentCurrency,'GBP');
 const grouped=markers([incoming,{...incoming,id:'another'}],'ONDO','crypto',[{time:Math.floor(time/1000)-1},{time:Math.floor(time/1000)+60}]);assert.equal(grouped[0].rows.length,2);
});
test('Every public embed is pinned to the provider origin and has no private payload or arbitrary URL option',()=>{
 for(const kind of ['chart','news','macro','volatility','heatmap','crypto','stocks','forex','calendar','technical']){const url=new URL(widgetURL({kind,apiKey:'must-not-leave',portfolio:[123]}));assert.equal(url.origin,'https://www.tradingview-widget.com');const options=JSON.parse(decodeURIComponent(url.hash.slice(1)));assert(!('apiKey'in options));assert(!('portfolio'in options));assert.equal(options.utm_source,'hardearner.com');}
 assert.throws(()=>widgetURL({kind:'chart',symbol:'javascript:alert(1)'}));assert.throws(()=>widgetURL({kind:'__proto__'}));assert.throws(()=>researchLink('https://attacker.invalid'));assert.throws(()=>researchLink('__proto__'));
});
test('All four metals have real deduplicated gram history with no synthetic weekend bars',async()=>{
 const original=global.fetch;global.fetch=async url=>{assert.match(url,/api.frankfurter.dev\/v2\/rates/);return{ok:true,json:async()=>[{date:'2026-09-25',rate:3100},{date:'2026-09-28',rate:3200},{date:'2026-09-28',rate:3210}]}};
 try{for(const asset of ['XAU','XAG','XPT','XPD']){const d=await require('../electron/market.cjs').history(asset,'metal',365,'USD');assert.equal(d.points.length,2);assert(Math.abs(d.points[1].value-3210/31.1034768)<1e-9);assert.equal(d.unit,'pure gram');}}finally{global.fetch=original}
});
