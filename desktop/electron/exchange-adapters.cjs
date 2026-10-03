const crypto = require('node:crypto');
const {validAssetSymbol} = require('./asset-symbol.cjs');
const FIAT = new Set(['TRY','GBP','USD','EUR','CHF','CAD','AUD','JPY','NZD','PLN','SEK','NOK','DKK']);
const PROVIDERS = ['binancetr','btcturk','paribu','kraken','coinbase','okx'];
async function request(url, options={}) {
 let r; try { r=await fetch(url,{...options,redirect:'error',signal:AbortSignal.timeout(20000)}); } catch { throw Error('Provider unavailable. Check your connection and retry.'); }
 if(!r.ok) throw Error(r.status===429?'Provider rate limit reached. Retry later.':'Provider refused the request. Check the key, read permissions, IP restrictions and account region.');
 try{return await r.json()}catch{throw Error('Provider returned unreadable data. Previous balances were kept.')}
}
function amount(v, signed=false){if(!((typeof v==='string'&&/^-?\d+(?:\.\d+)?$/.test(v))||typeof v==='number')||!Number.isFinite(Number(v))||(!signed&&Number(v)<0))throw Error('Provider returned an invalid balance amount. Previous balances were kept.');return Number(v)}
function row(asset,total,available,wallet,id=asset){total=amount(total,true);available=amount(available,true);if(!validAssetSymbol(asset)||!Number.isFinite(total-available))throw Error('Provider returned an invalid asset.');return{id:wallet+':'+id,asset,name:asset,quantity:total,available:Math.max(0,Math.min(Math.max(total,0),available)),locked:Math.max(0,total-Math.max(0,available)),wallet,type:FIAT.has(asset)?'cash':'crypto'}}
function unique(rows){const ids=new Set();return rows.filter(r=>{if(ids.has(r.id))throw Error('Provider returned duplicate balances.');ids.add(r.id);return r.quantity!==0})}
function credentials(kind,input){if(!PROVIDERS.includes(kind))throw Error('Unsupported provider.');if(typeof input?.apiKey!=='string'||input.apiKey.length<8||input.apiKey.length>300||/[\r\n]/.test(input.apiKey)||typeof input.apiSecret!=='string'||input.apiSecret.length<8||input.apiSecret.length>3000)throw Error('Enter a valid API key and secret.');const c={apiKey:input.apiKey,apiSecret:input.apiSecret};if(kind==='okx'){if(typeof input.passphrase!=='string'||input.passphrase.length<6||input.passphrase.length>100||/[\r\n]/.test(input.passphrase))throw Error('Enter your OKX API passphrase.');c.passphrase=input.passphrase;c.region=input.region==='eea'?'eea':'global'}if(kind==='coinbase'){try{const k=crypto.createPrivateKey(c.apiSecret.replace(/\\n/g,'\n'));if(k.asymmetricKeyType!=='ec'||k.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error()}catch{throw Error('Use an ECDSA / ES256 Coinbase CDP private key in PEM format.')}}return c}
function base64Secret(s){if(!/^[A-Za-z0-9+/]+={0,2}$/.test(s))throw Error('The API secret must be base64 encoded.');return Buffer.from(s,'base64')}
let nonce=0;function nextNonce(){nonce=Math.max(Date.now()*1000,nonce+1);return String(nonce)}
async function fetchExchange(kind,input){const c=credentials(kind,input);let rows=[];
 if(kind==='binancetr'){
  const q=new URLSearchParams({timestamp:String(Date.now()),recvWindow:'20000'}).toString();const sig=crypto.createHmac('sha256',c.apiSecret).update(q).digest('hex');const d=await request('https://www.binance.tr/open/v1/account/spot?'+q+'&signature='+sig,{headers:{'X-MBX-APIKEY':c.apiKey}});
  if(d.code!==0||!Array.isArray(d.data?.accountAssets))throw Error('Binance TR refused balance access. Check the key and Windows clock.');
  rows=d.data.accountAssets.map(b=>row(b.asset,amount(b.free)+amount(b.locked),b.free,'Spot'));
 }
 if(kind==='btcturk'){
  const stamp=String(Date.now());const sig=crypto.createHmac('sha256',base64Secret(c.apiSecret)).update(c.apiKey+stamp).digest('base64');const d=await request('https://api.btcturk.com/api/v1/users/balances',{headers:{'X-PCK':c.apiKey,'X-Stamp':stamp,'X-Signature':sig}});
  if(d.success!==true||!Array.isArray(d.data))throw Error('BtcTurk refused balance access. Check the key permissions.');rows=d.data.map(b=>{const r=row(b.asset,b.balance,b.free,'Spot');if(Math.abs(amount(b.free)+amount(b.locked)-r.quantity)>Math.max(1e-10,Math.abs(r.quantity)*1e-10))throw Error('BtcTurk returned inconsistent balances.');return r});
 }
 if(kind==='paribu'){
  const timestamp=String(Date.now()),signature=crypto.createHmac('sha256',c.apiSecret).update(timestamp).digest('base64');const data=await request('https://api.paribu.com/user/assets',{headers:{Authorization:c.apiKey,'X-Timestamp':timestamp,'X-Signature':signature}});if(!Array.isArray(data))throw Error('Paribu returned incomplete balances. Check asset:get permission and your Windows clock.');rows=data.map(b=>{if(typeof b.symbol!=='string')throw Error('Paribu returned an invalid asset.');const symbol=b.symbol.toUpperCase(),asset=symbol==='TL'?'TRY':symbol;const r=row(asset,b.total,b.available,'Spot');if(Math.abs(amount(b.available)+amount(b.locked)-r.quantity)>Math.max(1e-10,Math.abs(r.quantity)*1e-10))throw Error('Paribu returned inconsistent balances.');return r});
 }
 if(kind==='kraken'){
  const call=async p=>{const n=nextNonce(),body=new URLSearchParams({nonce:n}).toString();base64Secret(c.apiSecret);const sign=require('./kraken-auth.cjs').sign(p,n,body,c.apiSecret);const d=await request('https://api.kraken.com'+p,{method:'POST',headers:{'API-Key':c.apiKey,'API-Sign':sign,'Content-Type':'application/x-www-form-urlencoded'},body});const error=require('./kraken-auth.cjs').responseError(d.error);if(error)throw error;if(!Array.isArray(d.error)||d.error.length||!d.result)throw Error('Kraken refused the request. Check read permissions, key restrictions and nonce settings.');return d.result};
  const info=await call('/0/private/GetApiKeyInfo');if(!Array.isArray(info.permissions)||!info.permissions.includes('query-funds')||info.permissions.some(p=>!['query-funds','query-open-trades','query-closed-trades','query-ledger','export-data','create-ws-token','get-websockets-token','create-report'].includes(p)))throw Error('Use a Kraken key with Query Funds and read permissions only.');
  const balances=await call('/0/private/BalanceEx');const metadata=await request('https://api.kraken.com/0/public/Assets');if(!metadata.result)throw Error('Kraken asset catalogue unavailable.');
  rows=Object.entries(balances).map(([id,b])=>{const suffix=/\.(B|F|S|M)$/.exec(id),asset=require('./kraken-assets.cjs').assetSymbol(id,metadata.result);if(amount(b.credit_used??'0')>0)throw Error('Kraken borrowed balances require a separate liability model and are not supported.');const total=amount(b.balance,true),available=suffix&&suffix[1]!=='F'?0:total-amount(b.hold_trade??'0');return row(asset,total,available,suffix?(suffix[1]==='F'?'Auto Earn':'Earn / rewards'):'Spot',id)});
 }
 if(kind==='coinbase'){
  const call=async p=>{const now=Math.floor(Date.now()/1000),enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const body=enc({alg:'ES256',typ:'JWT',kid:c.apiKey,nonce:crypto.randomBytes(16).toString('hex')})+'.'+enc({iss:'cdp',sub:c.apiKey,nbf:now,exp:now+120,uri:'GET api.coinbase.com'+p.split('?')[0]});const sig=crypto.sign('sha256',Buffer.from(body),{key:c.apiSecret.replace(/\\n/g,'\n'),dsaEncoding:'ieee-p1363'}).toString('base64url');return request('https://api.coinbase.com'+p,{headers:{Authorization:'Bearer '+body+'.'+sig}})};
  const perm=await call('/api/v3/brokerage/key_permissions');if(perm.can_view!==true||perm.can_trade!==false||perm.can_transfer!==false)throw Error('Use a Coinbase key with View enabled and Trade / Transfer disabled.');
  let cursor='';const seen=new Set();for(let page=0;page<100;page++){const d=await call('/api/v3/brokerage/accounts?limit=250'+(cursor?'&cursor='+encodeURIComponent(cursor):''));if(!Array.isArray(d.accounts))throw Error('Coinbase returned incomplete accounts.');for(const b of d.accounts){if(b.available_balance?.currency!==b.currency||b.hold?.currency!==b.currency)throw Error('Coinbase returned mismatched currencies.');rows.push(row(b.currency,amount(b.available_balance.value)+amount(b.hold.value),b.available_balance.value,'Accessible portfolio',b.uuid))}if(!d.has_next)break;if(!d.cursor||seen.has(d.cursor)||page===99)throw Error('Coinbase pagination was incomplete.');cursor=d.cursor;seen.add(cursor)}
 }
 if(kind==='okx'){
  const host=c.region==='eea'?'https://eea.okx.com':'https://www.okx.com';const call=async p=>{const ts=new Date().toISOString();const sign=crypto.createHmac('sha256',c.apiSecret).update(ts+'GET'+p).digest('base64');const d=await request(host+p,{headers:{'OK-ACCESS-KEY':c.apiKey,'OK-ACCESS-PASSPHRASE':c.passphrase,'OK-ACCESS-TIMESTAMP':ts,'OK-ACCESS-SIGN':sign}});if(d.code!=='0'||!Array.isArray(d.data))throw Error('OKX refused access. Check Read permission, passphrase and region.');return d.data};
  const config=(await call('/api/v5/account/config'))[0];if(config?.perm!=='read_only')throw Error('Use an OKX key with only Read permission.');
  // Derivatives equity and liabilities cannot be treated as ordinary spendable coins.
  if(String(config.acctLv)!=='1')throw Error('This connector supports OKX Spot mode only. Margin and derivatives accounts are not valued as cash.');
  const trading=await call('/api/v5/account/balance'),funding=await call('/api/v5/asset/balances');if(!Array.isArray(trading[0]?.details))throw Error('OKX returned incomplete balances.');
  rows=[...trading[0].details.map(b=>row(b.ccy,b.cashBal,b.availBal,'Trading')),...funding.map(b=>row(b.ccy,b.bal,b.availBal,'Funding'))];
 }
 return unique(rows);
}
module.exports={PROVIDERS,request,amount,row,unique,credentials,fetchExchange,nextNonce};
