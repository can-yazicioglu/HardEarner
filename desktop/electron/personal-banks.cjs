// Personal developer access only. Fixed HTTPS endpoints and GET requests only.
const SUPPORTED=['monzo','starling'];
function credentials(kind,input){if(!SUPPORTED.includes(kind)||typeof input?.accessToken!=='string'||!/^\S{16,8192}$/.test(input.accessToken)||/[^\x21-\x7e]/.test(input.accessToken))throw Error('Enter a valid personal access token.');return{accessToken:input.accessToken}}
async function get(url,token){let r;try{r=await fetch(url,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json','User-Agent':'HardEarner/2.4'},redirect:'error',signal:AbortSignal.timeout(20000)})}catch{throw Error('Bank unavailable. Check your connection. Saved balances were kept.')}
 if(!r.ok)throw Error(r.status===401?'Bank access expired or was refused. Renew access with a new token.':r.status===403?'Approve access in your bank app and check token permissions.':r.status===429?'Bank rate limit reached. Please retry later.':'The bank could not return balances. Saved balances were kept.');try{return await r.json()}catch{throw Error('The bank returned unreadable data. Saved balances were kept.')}
}
function minor(n){if(!Number.isSafeInteger(n))throw Error('The bank returned an invalid balance. Saved balances were kept.');return n/100}
function currency(c){if(!['GBP','EUR','USD'].includes(c))throw Error('This bank currency is not supported. Saved balances were kept.');return c}
function row(id,asset,total,available,name){return{id,asset:currency(asset),quantity:minor(total),available:Math.max(0,Math.min(minor(total),minor(available))),locked:0,name,type:'cash',at:new Date().toISOString()}}
async function fetchBank(kind,input){const {accessToken}=credentials(kind,input),rows=[],seen=new Set();
 if(kind==='monzo'){
  const identity=await get('https://api.monzo.com/ping/whoami',accessToken);if(identity.authenticated!==true)throw Error('Approve access in the Monzo app first.');
  const d=await get('https://api.monzo.com/accounts',accessToken);if(!Array.isArray(d.accounts))throw Error('Monzo returned incomplete accounts.');
  for(const a of d.accounts){if(a.closed===true||a.type&&!['uk_retail','uk_retail_joint'].includes(a.type))continue;if(typeof a.id!=='string'||!/^acc_[a-zA-Z0-9]+$/.test(a.id)||seen.has(a.id))throw Error('Monzo returned an invalid account.');seen.add(a.id);
   const b=await get('https://api.monzo.com/balance?'+new URLSearchParams({account_id:a.id}),accessToken);
   // total_balance already includes Pots. Never add the pots again or include an overdraft limit.
   rows.push(row(a.id,b.currency,b.total_balance,b.balance,'Monzo · '+(a.type==='uk_retail_joint'?'Joint account + Pots':'Current account + Pots')));
  }
 }else{
  const base='https://api.starlingbank.com/api/v2',identity=await get(base+'/identity/token',accessToken);
  if(identity.authenticated!==true||!Array.isArray(identity.scopes)||!['account:read','balance:read'].every(s=>identity.scopes.includes(s))||identity.scopes.some(s=>typeof s!=='string'||!s.endsWith(':read')))throw Error('Use a read-only Starling token with account:read and balance:read.');
  const d=await get(base+'/accounts',accessToken);if(!Array.isArray(d.accounts))throw Error('Starling returned incomplete accounts.');
  for(const a of d.accounts){if(typeof a.accountUid!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(a.accountUid)||seen.has(a.accountUid))throw Error('Starling returned an invalid account.');seen.add(a.accountUid);
   const b=await get(base+'/accounts/'+a.accountUid+'/balance',accessToken),total=b.totalEffectiveBalance,main=b.effectiveBalance;
   if(!total||!main||total.currency!==a.currency||main.currency!==a.currency)throw Error('Starling returned an incomplete total balance. Saved balances were kept.');
   rows.push(row(a.accountUid,a.currency,total.minorUnits,main.minorUnits,'Starling · Account + Spaces'));
  }
 }
 if(!rows.length)throw Error('No supported personal bank accounts were returned. Approve access for your personal account.');
 return rows;
}
module.exports={SUPPORTED,credentials,fetchBank,minor};
