const{test}=require('node:test'),assert=require('node:assert/strict');
const{normalizeBinance,linkedHoldings}=require('../electron/connections.cjs');
const{validAssetSymbol}=require('../electron/asset-symbol.cjs');
const{DEFAULT,validateState,portfolio}=require('../electron/domain.cjs');
const{refresh,history,activity}=require('../electron/market.cjs');
test('Real Binance symbol formats do not block balances, including zero legacy entries',()=>{
 const balances=normalizeBinance({balances:[{asset:'S',free:'1.5',locked:'0.25'},{asset:'T',free:'0',locked:'0'},{asset:'币安人生',free:'12',locked:'0'},{asset:'牛来',free:'0',locked:'2'},{asset:'OLD(LEGACY)',free:'0',locked:'0'}]});
 assert.deepEqual(balances.map(b=>[b.asset,b.quantity]),[['S',1.75],['币安人生',12],['牛来',2]]);
 const p=portfolio(linkedHoldings([{id:'binance',included:true,balances}]),{fx:{USD:1},crypto:{S:{usd:2,bidUSD:1.9},币安人生:{usd:.5,bidUSD:.4}}},DEFAULT.settings);
 assert.equal(p.total,9.5);assert.equal(p.missing,1);assert(Math.abs(p.sell-7.65)<1e-10);
});
test('Malformed nonzero balances fail safely instead of silently losing holdings',()=>{
 for(const v of [null,undefined,'',true,[],{},'NaN','Infinity',-1])assert.throws(()=>normalizeBinance({balances:[{asset:'S',free:v,locked:'0'}]}),/invalid balance amount/);
 assert.throws(()=>normalizeBinance({balances:[{asset:'BTC',free:1e308,locked:1e308}]}),/invalid balance amount/);
 assert.throws(()=>normalizeBinance({balances:[{asset:'BTC?bad',free:'1',locked:'0'}]}),/unsupported asset identifier/);
 assert.throws(()=>normalizeBinance({balances:[{asset:'S',free:'1',locked:'0'},{asset:'S',free:'2',locked:'0'}]}),/duplicate/);
 for(const s of ['../BTC','A&B','constructor','__proto__','B\nTC','BTC USDT','',null])assert.equal(validAssetSymbol(s),false);
});
test('Single-letter and UTF-8 holdings and watchlists survive saving',()=>{
 const saved=validateState({...DEFAULT,holdings:['S','币安人生'].map(asset=>({id:asset,asset,type:'crypto',quantity:1})),settings:{...DEFAULT.settings,watchlist:['crypto:S','crypto:币安人生','crypto:BTC?bad']}});
 assert.deepEqual(saved.holdings.map(h=>h.asset),['S','币安人生']);assert.deepEqual(saved.settings.watchlist,['crypto:S','crypto:币安人生']);
});
test('Prices, chart requests and trade flow support exact UTF-8 and single-letter symbols',async t=>{
 const requested=[];t.mock.method(global,'fetch',async url=>{requested.push(String(url));const u=new URL(url);let data;
 if(u.pathname.endsWith('/klines'))data=[[Date.now(),0,0,0,'2']];
 else if(u.pathname.endsWith('/aggTrades'))data=[{a:1,p:'2',q:'3',T:Date.now(),m:false}];
 else if(u.hostname==='api.kraken.com')data={result:{USDTUSD:{a:['1'],b:['1']}}};
 else if(u.pathname.endsWith('/ticker/24hr'))data=['S','币安人生'].map(asset=>({symbol:asset+'USDT',count:10,lastPrice:'2',bidPrice:'1.9',askPrice:'2.1',closeTime:Date.now()}));
 else if(u.hostname==='api.frankfurter.dev')data=[{quote:'GBP',rate:.8,date:'2026-09-17'},{quote:'TRY',rate:40,date:'2026-09-17'}];
 else data={price:3000,updatedAt:new Date().toISOString()};return{ok:true,json:async()=>data};});
 const m=await refresh();assert.equal(m.crypto.S.usd,2);assert.equal(m.crypto['币安人生'].usd,2);
 for(const asset of ['S','币安人生']){assert.equal((await history(asset,'crypto',7)).points[0].value,2);assert.equal((await activity(asset)).buy,6);}
 for(const url of requested.filter(u=>u.includes('symbol='))){assert(['SUSDT','币安人生USDT'].includes(new URL(url).searchParams.get('symbol')));assert(!url.includes('币安人生'));}
});
