// Read-only funding records. Transaction hashes link ownership transfers across accounts.
const crypto=require('node:crypto');
const {parseJSON}=require('./binance-history.cjs');
const {assetSymbol}=require('./kraken-assets.cjs');
const {validAssetSymbol}=require('./asset-symbol.cjs');
const DAY=86400000;
function amount(v){const n=Number(v);if(!['number','string'].includes(typeof v)||String(v).trim()===''||!Number.isFinite(n)||n<0)throw Error('Invalid funding amount.');return n;}
function when(v){const n=typeof v==='string'&&v.includes('-')?Date.parse(v.replace(' ','T')+(/Z$|[+-]\d\d:\d\d$/.test(v)?'':'Z')):Number(v);if(!Number.isSafeInteger(n)||n<1483228800000||n>Date.now()+DAY)throw Error('Invalid funding date.');return n;}
function text(v){return typeof v==='string'?v.slice(0,250):v==null?'':String(v).slice(0,250);}
function normalize(kind,row,direction,fiat=false){
 const deposit=direction==='deposit';
 if(kind==='kraken'){
  if(!['Success','Settled'].includes(row.status))return null;
  return{refid:text(row.refid),asset:assetSymbol(row.asset,{}),txid:text(row.txid),network:text(row.method),address:text(row.info),time:when(Number(row.time)*1000),quantity:amount(row.amount),fee:amount(row.fee||0),direction};
 }
 const tr=kind==='binancetr';
 if(Number(row.status)!==(tr?(fiat?10:deposit?1:10):deposit?1:6))return null;
 const asset=row.asset||row.coin;if(!validAssetSymbol(asset))throw Error('Invalid funding asset.');
 const q=amount(deposit&&fiat?row.fillAmount??row.amount:row.amount),fee=amount(row.fee??row.transactionFee??0);
 if(!q)return null;
 const id=text(row.id);if(!/^[\w:.-]{1,150}$/.test(id))throw Error('Invalid funding reference.');
 return{id:kind+':funding:'+(fiat?'fiat:':'')+direction+':'+id,refid:id,asset,txid:text(row.txId),network:text(row.network),address:text(row.address),time:when(row.insertTime??row.completeTime??row.applyTime??row.createTime),quantity:q,fee,direction,
  // Binance withdrawal amount is delivered quantity; Binance TR amount includes its fee.
  delta:deposit?q:-(tr?q:q+fee),netQuantity:deposit?q:tr?Math.max(0,q-fee):q,source:deposit?'Deposit':'Withdrawal'};
}
async function fetchFunding(c,{fetcher=fetch,now=Date.now()}={}){
 const h=structuredClone(c.funding||{records:[],complete:false});h.version=1;
 if(h.retryAt>now)return h;h.issues=[];let offset=0,calls=0,blocked=false;
 async function request(endpoint,params={},signed=true){
  if(blocked||++calls>24)throw Error('Funding history will continue on the next sync.');
  let url,options={redirect:'error',signal:AbortSignal.timeout(15000)};
  if(c.kind==='kraken'){
   const {nextNonce}=require('./exchange-adapters.cjs'),n=nextNonce(),body=new URLSearchParams({nonce:n,...params}).toString();
   url='https://api.kraken.com'+endpoint;options={...options,method:'POST',headers:{'API-Key':c.apiKey,'API-Sign':require('./kraken-auth.cjs').sign(endpoint,n,body,c.apiSecret),'Content-Type':'application/x-www-form-urlencoded'},body};
  }else{
   const q=new URLSearchParams(params);if(signed){q.set('timestamp',String(Date.now()+offset));q.set('recvWindow','20000');q.set('signature',crypto.createHmac('sha256',c.apiSecret).update(q.toString()).digest('hex'));}
   url=(c.kind==='binancetr'?'https://www.binance.tr':'https://api.binance.com')+endpoint+(q.size?'?'+q:'');options.headers=signed?{'X-MBX-APIKEY':c.apiKey}:{};
  }
  let r;try{r=await fetcher(url,options)}catch{throw Error('Funding history is unavailable. Saved records are kept.');}
  if([418,429].includes(r.status)){blocked=true;h.retryAt=now+Math.max(300,Number(r.headers?.get('retry-after'))||0)*1000;throw Error('Funding history rate limit reached. Retry later.');}
  if(!r.ok)throw Error('Funding history access was refused. Saved records are kept.');
  const d=r.text?parseJSON(await r.text()):await r.json();
  if(c.kind==='kraken'){
   if(d.error?.length){if(d.error.some(x=>/limit|Throttled|lockout/i.test(x))){blocked=true;h.retryAt=now+900000;}throw Error('Kraken funding references are unavailable. Check Query funds and Query ledger entries permissions.');}return d.result;
  }
  if(c.kind==='binancetr'&&d.code!==0||c.kind==='binance'&&Number(d.code)<0)throw Error('Funding history could not be read. Saved records are kept.');return d;
 }
 const records=new Map((h.records||[]).map(r=>[(r.direction||'')+':'+(r.id||r.refid),r]));
 function merge(rows,direction,fiat){for(const row of rows){const r=normalize(c.kind,row,direction,fiat);if(r)records.set(direction+':'+(r.id||r.refid),r);}if(records.size>100000)throw Error('Funding storage limit reached.');}
 try{
  if(c.kind==='kraken'){
   for(const direction of ['deposit','withdrawal']){let cursor;for(let page=0;page<8;page++){
    const d=await request('/0/private/'+(direction==='deposit'?'DepositStatus':'WithdrawStatus'),{limit:'25',cursor:cursor||'true'});
    const rows=Array.isArray(d)?d:d?.[direction==='deposit'?'deposits':'withdrawals'];if(!Array.isArray(rows))throw Error('Incomplete Kraken funding history.');merge(rows,direction,false);
    const next=d?.next_cursor;if(!next){if(Array.isArray(d)&&rows.length>=25)throw Error('Kraken funding history may be truncated.');break;}if(next===cursor||page===7)throw Error('Kraken funding pagination is incomplete.');cursor=next;
   }}
  }else{
   const tr=c.kind==='binancetr',clock=await request(tr?'/open/v1/common/time':'/api/v3/time',{},false);offset=Number(tr?clock.timestamp:clock.serverTime)-Date.now();if(!Number.isFinite(offset))throw Error('Exchange time is unavailable.');
   const since=Math.max(c.history?.since||now-89*DAY,now-89*DAY);
   for(const fiat of tr?[false,true]:[false])for(const direction of ['deposit','withdrawal']){
    const endpoint=tr?'/open/v1/'+(fiat?'fiat/':'')+(direction==='deposit'?'deposits':'withdraws'):'/sapi/v1/capital/'+(direction==='deposit'?'deposit/hisrec':'withdraw/history');
    let cursor,offsetPage=0;
    for(let page=0;page<5;page++){
     const params={startTime:String(since),endTime:String(now),...(tr?(cursor?{fromId:cursor,direct:'next'}:{}):{limit:'1000',offset:String(offsetPage)})};
     const d=await request(endpoint,params),rows=tr?d.data?.list:d;if(!Array.isArray(rows))throw Error('Incomplete funding history.');merge(rows,direction,fiat);
     if(tr){
      if(!rows.length)break;
      const ids=rows.map(r=>String(r.id));if(ids.some(x=>!/^\d+$/.test(x)))throw Error('Funding pagination identifiers are unavailable.');
      const min=ids.map(BigInt).reduce((a,b)=>a<b?a:b);if(cursor&&min>=BigInt(cursor))throw Error('Funding pagination did not advance. Saved records are kept.');if(min<=1n)break;cursor=String(min-1n);
     }else{if(rows.length<1000)break;offsetPage+=rows.length;}
     if(page===4)throw Error('Funding history may be truncated. Saved records are kept.');
    }
   }
  }
  h.complete=true;
 }catch(e){h.complete=false;h.issues=[e.message];}
 h.records=[...records.values()].sort((a,b)=>a.time-b.time);h.updatedAt=new Date(now).toISOString();return h;
}
function withFunding(c,history){
 const h=structuredClone(history),records=c.funding?.records||[];
 if(c.kind==='kraken')h.movements=(h.movements||[]).map(m=>{const r=records.find(r=>r.refid===(m.refid||m.id.split(':')[1])&&r.asset===m.asset);return r?{...m,txid:r.txid,network:r.network,address:r.address,netQuantity:m.delta>0?m.delta:Math.max(0,-m.delta-(m.fee||0))}:m;});
 else h.movements=records.map(r=>({...r}));
 h.accountingVersion=2;return h;
}
module.exports={fetchFunding,normalize,withFunding};
