const {test}=require('node:test'),assert=require('node:assert/strict');
const {parse,endpoint,createChartStreams}=require('../electron/chart-stream.cjs');
const c={venue:'binance',type:'crypto',asset:'BTC',interval:'1m',style:'candles'},now=1800000000000;
const message=(extra={})=>JSON.stringify({e:'kline',s:'BTCUSDT',E:now,k:{i:'1m',t:now-60000,o:'100',h:'105',l:'99',c:'102',v:'4'},...extra});
test('Stream parser preserves real OHLC and rejects wrong markets, stale events and malformed prices',()=>{
 assert.equal(parse(c,message(),now)[0].close,102);
 assert.deepEqual(parse(c,message({s:'ETHUSDT'}),now),[]);
 assert.deepEqual(parse(c,message({E:now-61000}),now),[]);
 assert.throws(()=>parse(c,message({k:{i:'1m',t:now,o:'100',h:'99',l:'98',c:'103',v:'4'}}),now));
 assert.equal(endpoint(c),'wss://data-stream.binance.vision/stream?streams=btcusdt@kline_1m/btcusdt@aggTrade');
 assert.equal(parse({...c,venue:'okx'},JSON.stringify({arg:{instId:'BTC-USDT',channel:'candle1m'},data:[[now-60000,'100','105','99','102','4']]}),now)[0].close,102);
 assert.deepEqual(parse({...c,venue:'okx'},JSON.stringify({arg:{instId:'ETH-USDT',channel:'candle1m'},data:[]}),now),[]);
});
function harness(){let time=now;const sockets=[],events=[],timeouts=new Set(),intervals=new Set();class Socket{constructor(url){this.url=url;this.listeners={};this.readyState=0;sockets.push(this)}addEventListener(k,f){this.listeners[k]=f}send(v){this.sent=v}close(){this.readyState=3;this.listeners.close?.()}fire(k,v){if(k==='open')this.readyState=1;this.listeners[k]?.(v)}}
 const timers={setTimeout:f=>{timeouts.add(f);return f},clearTimeout:f=>timeouts.delete(f),setInterval:f=>{intervals.add(f);return f},clearInterval:f=>intervals.delete(f)};
 const service=createChartStreams({emit:(id,value)=>events.push({id,...value}),Socket,now:()=>time,timers});
 return{service,sockets,events,timeouts,intervals,advance:n=>time+=n,retry:()=>{const jobs=[...timeouts];timeouts.clear();jobs.forEach(f=>f())}};
}
test('Live streams signal data only after a candle, reject older candles and reconnect without leaking on stop',()=>{
 const h=harness();h.service.start('one',c);const s=h.sockets[0];s.fire('open');assert.equal(h.events.at(-1).status,'connected');s.fire('message',{data:message()});assert.equal(h.events.at(-1).status,'live');const count=h.events.length;s.fire('message',{data:message({k:{i:'1m',t:now-120000,o:'100',h:'105',l:'99',c:'102',v:'4'}})});assert.equal(h.events.length,count);
 s.close();assert.equal(h.events.at(-1).status,'reconnecting');assert.equal(h.timeouts.size,1);h.retry();assert.equal(h.sockets.length,2);h.service.stopAll();assert.equal(h.timeouts.size,0);assert.equal(h.intervals.size,0);h.sockets[1].fire('message',{data:message()});assert.equal(h.events.at(-1).status,'connecting');
});
test('Heartbeat detects stalled data, sends OKX ping and closes abandoned connections',()=>{
 const h=harness();h.service.start('two',{...c,venue:'okx'});const s=h.sockets[0];s.fire('open');assert.equal(JSON.parse(s.sent).args[0].channel,'candle1m');h.advance(10000);[...h.intervals][0]();assert.equal(s.sent,'ping');h.advance(10000);[...h.intervals][0]();assert.equal(h.events.at(-1).status,'delayed');h.advance(20000);[...h.intervals][0]();assert.equal(h.timeouts.size,1);h.service.stop('two');assert.equal(h.timeouts.size,0);
});
test('Stream subscriptions reject reference feeds, arbitrary identifiers and excess consumers',()=>{
 const h=harness();assert.throws(()=>h.service.start('../evil',c));assert.throws(()=>h.service.start('fx',{...c,venue:'reference',type:'cash',asset:'GBP'}));for(let i=0;i<4;i++)h.service.start('chart-'+i,c);assert.throws(()=>h.service.start('fifth',c));h.service.stopAll();assert.equal(h.intervals.size,0);
});

test('Trade stream changes the candle between kline snapshots, rejects duplicate trades and preserves volume',()=>{
 const h=harness();h.service.start('fast',c);const socket=h.sockets[0];socket.fire('open');
 const start=Math.floor(now/60000)*60000;
 socket.fire('message',{data:message({k:{i:'1m',t:start,o:'100',h:'105',l:'99',c:'102',v:'4'}})});
 const tick=(id,p,at=now)=>JSON.stringify({stream:'btcusdt@aggTrade',data:{e:'aggTrade',s:'BTCUSDT',a:id,p:String(p),T:at}});
 socket.fire('message',{data:tick(1,107)});assert.equal(h.events.at(-1).bar.close,107);assert.equal(h.events.at(-1).bar.high,107);assert.equal(h.events.at(-1).bar.volume,4);assert.equal(h.events.at(-1).mode,'trades');
 const count=h.events.length;socket.fire('message',{data:tick(1,90)});assert.equal(h.events.length,count);
 socket.fire('message',{data:message({E:now-1,k:{i:'1m',t:start,o:'100',h:'105',l:'99',c:'102',v:'5'}})});assert.equal(h.events.at(-1).bar.close,107);assert.equal(h.events.at(-1).bar.volume,5);
 h.advance(61000);socket.fire('message',{data:tick(2,110,now+61000)});assert.equal(h.events.at(-1).bar,undefined);assert.equal(h.events.at(-1).tick.price,110);h.service.stopAll();
});
