const {finite,positive}=require('./research-insights.cjs');
function liquidationEvents(message,asset){
 if(message?.topic!=='allLiquidation.'+asset+'USDT'||!Array.isArray(message.data))return[];
 return message.data.flatMap(r=>{
  const time=positive(r.T),quantity=positive(r.v),bankruptcyPrice=positive(r.p);
  if(r.s!==asset+'USDT'||!time||!quantity||!bankruptcyPrice||!['Buy','Sell'].includes(r.S))return[];
  // Bybit's S describes the liquidated position, not a forced order direction.
  return[{id:[r.T,r.s,r.S,r.v,r.p].join(':'),time,side:r.S==='Buy'?'long':'short',quantity,bankruptcyPrice,value:quantity*bankruptcyPrice}];
 });
}
function createLiquidations(asset,{Socket=globalThis.WebSocket,now=()=>Date.now(),timer=setTimeout,cancel=clearTimeout}={}){
 if(!/^[A-Z0-9]{1,16}$/.test(asset))throw Error('Invalid liquidation market.');
 let ws,closed=false,reconnect,heartbeat,status='connecting',startedAt=null,lastMessage=null,gaps=0,attempt=0,retained=[],long=0,short=0,count=0,discarded=0;
 const seen=new Set();
 function connect(){
  if(closed)return;status=startedAt?'reconnecting':'connecting';
  try{ws=new Socket('wss://stream.bybit.com/v5/public/linear');}catch{status='unavailable';return;}
  ws.onopen=()=>{lastMessage=now();ws.send(JSON.stringify({op:'subscribe',args:['allLiquidation.'+asset+'USDT']}));ping();};
  function ping(){if(closed||ws.readyState!==1)return;if(lastMessage&&now()-lastMessage>=60000){status='reconnecting';ws.close();return;}ws.send(JSON.stringify({op:'ping'}));heartbeat=timer(ping,20000);heartbeat?.unref?.();}
  ws.onmessage=e=>{let d;try{d=JSON.parse(String(e.data))}catch{return;}
   if(d.op==='subscribe'&&d.success===false){status='unsupported';closed=true;cancel(heartbeat);ws.close();return;}
   if(d.op==='subscribe'&&d.success===true){attempt=0;status='observing';startedAt??=now();lastMessage=now();}
   if(d.op==='pong'||d.ret_msg==='pong')lastMessage=now();
   for(const r of liquidationEvents(d,asset)){if(seen.has(r.id)||r.time>now()+60000)continue;seen.add(r.id);lastMessage=now();retained.push(r);count++;if(r.side==='long')long+=r.value;else short+=r.value;}
   if(retained.length>2000){const cut=retained.splice(0,retained.length-2000);discarded+=cut.length;for(const r of cut)seen.delete(r.id);}
  };
  ws.onerror=()=>{status='reconnecting';ws.close();};
  ws.onclose=()=>{cancel(heartbeat);if(closed)return;if(startedAt)gaps++;status='reconnecting';reconnect=timer(connect,Math.min(60000,1000*2**Math.min(attempt++,6)));reconnect?.unref?.();};
 }
 connect();
 return{view(){const healthy=status==='observing'&&lastMessage&&now()-lastMessage<60000;return{state:healthy?'ready':status,stale:!healthy,source:'Bybit · allLiquidation',asset,unit:'USDT · bankruptcy-price estimate',coverage:'Observed session only · '+asset+'USDT · Bybit',startedAt,lastMessage,gaps,count:startedAt?count:null,discarded,long:startedAt?long:null,short:startedAt?short:null,events:retained.slice(-100).reverse(),definition:'Amounts use bankruptcy price, not execution price. Totals include only events received since observation began. Disconnections create gaps; this is not an all-exchange liquidation total.'};},stop(){closed=true;cancel(reconnect);cancel(heartbeat);try{ws?.close()}catch{}}};
}
module.exports={liquidationEvents,createLiquidations};
