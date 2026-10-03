// Public market data only. No account credentials ever enter this service.
const {config,candles}=require('./analysis.cjs');
const intervalName=c=>({'1h':'1H','4h':'4H','1d':'1Dutc'}[c.interval]||c.interval);
function endpoint(c){const symbol=c.asset.toLowerCase()+'usdt';return c.venue==='binance'?`wss://data-stream.binance.vision/stream?streams=${symbol}@kline_${c.interval}/${symbol}@aggTrade`:'wss://ws.okx.com:8443/ws/v5/business'}
function parse(c,text,now=Date.now()){
 const raw=JSON.parse(text),d=raw.data&&raw.stream?raw.data:raw;let rows;
 if(c.venue==='binance'){
  if(d.e!=='kline'||d.s!==c.asset+'USDT'||d.k?.i!==c.interval)return[];
  if(!Number.isFinite(d.E)||Math.abs(now-d.E)>60000)return[];
  const k=d.k;rows=[[k.t,k.o,k.h,k.l,k.c,k.v]];
 }else{
  if(d.event==='error')throw Error('Market stream unavailable.');
  if(d.arg?.instId!==c.asset+'-USDT'||d.arg?.channel!=='candle'+intervalName(c)||!d.data)return[];
  rows=d.data;
 }
 return candles(rows).filter(b=>b.time*1000<=now+60000);
}
function trade(c,text,now=Date.now()){
 if(c.venue!=='binance')return null;
 const raw=JSON.parse(text),d=raw.stream?raw.data:raw;
 if(d.e!=='aggTrade'||d.s!==c.asset+'USDT')return null;
 const price=Number(d.p),at=Number(d.T),id=Number(d.a);
 if(!Number.isFinite(price)||price<=0||!Number.isSafeInteger(at)||Math.abs(now-at)>60000||!Number.isSafeInteger(id)||id<0)return null;
 const seconds=require('./chart-ranges.cjs').SECONDS[c.interval];
 return{price,at,id,barTime:Math.floor(at/1000/seconds)*seconds};
}
function overlayTrade(bar,tick){if(!tick||tick.barTime!==bar.time)return bar;return{...bar,close:tick.price,high:Math.max(bar.high,tick.price),low:Math.min(bar.low,tick.price)}}
function createChartStreams({emit,Socket=globalThis.WebSocket,now=Date.now,timers=globalThis,metalSample=require('./metal-session.cjs').sample}){
 const streams=new Map();
 function stop(id){const s=streams.get(id);if(!s)return;streams.delete(id);s.closed=true;timers.clearTimeout(s.retry);timers.clearInterval(s.watch);s.socket?.close()}
 function start(id,input){
  if(typeof id!=='string'||!/^[a-z0-9-]{1,80}$/i.test(id))throw Error('Invalid stream identifier.');
  const c=config(input);if(c.venue==='reference')throw Error('Daily reference charts do not provide live streams.');
  stop(id);if(streams.size>=4)throw Error('Too many live charts.');
  const s={closed:false,socket:null,retry:null,watch:null,attempt:0,last:0,packet:0,opened:0,latest:0,bar:null,trade:null};streams.set(id,s);
  const send=v=>{if(!s.closed)emit(id,v)};
  if(c.venue==='goldapi'){
   let busy=false;const poll=async()=>{if(busy||s.closed)return;busy=true;try{const d=await metalSample(c.asset);send({status:d.stale?'delayed':'live',bar:d.bars.at(-1),mode:'polled',receivedAt:d.fetchedAt,quotedAt:d.quotedAt})}catch{send({status:'delayed'})}finally{busy=false}};
   send({status:'connecting'});poll();s.watch=timers.setInterval(poll,30000);s.watch?.unref?.();return true;
  }
  function connect(){
   if(s.closed)return;send({status:'connecting'});s.opened=now();s.last=0;
   let socket;try{socket=new Socket(endpoint(c));s.socket=socket}catch{retry();return}
   socket.addEventListener('open',()=>{if(s.closed||s.socket!==socket)return;s.opened=now();if(c.venue==='okx')socket.send(JSON.stringify({op:'subscribe',args:[{channel:'candle'+intervalName(c),instId:c.asset+'-USDT'}]}));send({status:'connected'})});
   socket.addEventListener('message',event=>{
    if(s.closed||s.socket!==socket)return;s.packet=now();if(event.data==='pong')return;
    try{
     const tick=trade(c,event.data,now());
     if(tick){if(s.trade&&(tick.id<=s.trade.id||tick.at<s.trade.at))return;s.trade=tick;s.last=now();s.attempt=0;
      const bar=s.bar?.time===tick.barTime?overlayTrade(s.bar,tick):null;if(bar)s.bar=bar;
      send({status:'live',...(bar?{bar}:{}),tick,mode:'trades',receivedAt:s.last});return;
     }
     const bars=parse(c,event.data,now());for(let bar of bars){if(bar.time<s.latest)continue;
      // Trades arrive more frequently than kline snapshots. Preserve the newest trade
      // and real extrema without counting its volume twice.
      if(s.bar?.time===bar.time)bar={...bar,high:Math.max(bar.high,s.bar.high),low:Math.min(bar.low,s.bar.low)};
      const raw=JSON.parse(event.data),stamp=Number((raw.stream?raw.data:raw).E);if(s.trade&&s.trade.at>=stamp)bar=overlayTrade(bar,s.trade);
      s.bar=bar;s.latest=bar.time;s.last=now();s.attempt=0;send({status:'live',bar,mode:c.venue==='binance'&&s.trade?'trades':'candles',receivedAt:s.last});
     }
    }catch{send({status:'reconnecting'});socket.close()}
   });
   socket.addEventListener('error',()=>{if(s.socket===socket)socket.close()});
   socket.addEventListener('close',()=>{if(s.socket===socket)retry()});
  }
  function retry(){if(s.closed||s.retry)return;send({status:'reconnecting'});s.retry=timers.setTimeout(()=>{s.retry=null;connect()},Math.min(30000,1000*2**Math.min(s.attempt++,5)));s.retry?.unref?.()}
  s.watch=timers.setInterval(()=>{if(s.closed)return;const age=now()-(s.last||s.opened);if(age>15000)send({status:'delayed'});if(now()-Math.max(s.packet,s.last,s.opened)>30000){s.socket?.close();retry()}else if(c.venue==='okx'&&s.socket?.readyState===1)s.socket.send('ping')},10000);s.watch?.unref?.();connect();return true;
 }
 return{start,stop,stopAll:()=>[...streams.keys()].forEach(stop)};
}
module.exports={createChartStreams,parse,trade,overlayTrade,endpoint,intervalName};
