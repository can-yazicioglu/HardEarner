// Watch-only addresses. No wallet signatures, seeds, private keys or transactions.
const NETWORKS={bitcoin:{name:'Bitcoin',asset:'BTC',host:'https://mempool.space'},ethereum:{name:'Ethereum',asset:'ETH',host:'https://eth.blockscout.com'},base:{name:'Base',asset:'ETH',host:'https://base.blockscout.com'},arbitrum:{name:'Arbitrum One',asset:'ETH',host:'https://arbitrum.blockscout.com'},optimism:{name:'OP Mainnet',asset:'ETH',host:'https://explorer.optimism.io'},polygon:{name:'Polygon PoS',asset:'POL',host:'https://polygon.blockscout.com'}};
// Issuer contract registry: Circle USDC contract addresses; Tether supported protocols.
const USDC={ethereum:'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',base:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',arbitrum:'0xaf88d065e77c8cc2239327c5edb3a432268e5831',optimism:'0x0b2c639c533813f4aa9d7837caf62653d097ff85',polygon:'0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'};
function credentials(input){
 const network=input?.network,address=String(input?.address||'').trim(),label=String(input?.label||'Wallet').trim();
 if(!Object.hasOwn(NETWORKS,network))throw Error('Choose a supported network.');
 if(network==='bitcoin'?!/^(?:bc1[a-zA-HJ-NP-Z0-9]{11,87}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(address):!/^0x[0-9a-fA-F]{40}$/.test(address))throw Error('Enter a public receive address for the selected network. Never enter a recovery phrase or private key.');
 if(!label||label.length>50||/[\x00-\x1f]/.test(label))throw Error('Wallet name must be 1–50 characters.');
 return{network,address:network==='bitcoin'&&!address.startsWith('bc1')?address:address.toLowerCase(),label:label+' · '+NETWORKS[network].name};
}
function units(v,d){if(!/^\d+$/.test(String(v))||!Number.isInteger(d)||d<0||d>36)throw Error('Invalid on-chain amount.');const n=Number(v)/10**d;if(!Number.isFinite(n)||n>1e15)throw Error('On-chain amount is outside the supported range.');return n;}
function tokenIdentity(network,t){
 const address=String(t.address_hash||'').toLowerCase();if(!/^0x[0-9a-f]{40}$/.test(address)||t.type!=='ERC-20')return null;
 const asset=address===USDC[network]?'USDC':network==='ethereum'&&address==='0xdac17f958d2ee523a2206206994597c13d831ec7'?'USDT':null;
 const decimals=Number(t.decimals);if(!Number.isInteger(decimals)||decimals<0||decimals>36)return null;
 if(asset&&decimals!==6)throw Error('Token decimals do not match the issuer contract.');
 return{asset:asset||'TOKEN.'+network+'.'+address.slice(2),name:asset||String(t.symbol||'Token').slice(0,20)+' · '+address.slice(0,8)+'… (unpriced)',decimals,contract:address,verified:!!asset};
}
const balance=(asset,quantity,name=asset)=>({id:asset,asset,name,quantity,available:quantity,locked:0,type:'crypto'});
function evmMovement(c,r,type){
 const n=NETWORKS[c.network],own=c.address.toLowerCase(),from=r.from?.hash?.toLowerCase()===own,to=r.to?.hash?.toLowerCase()===own;
 const time=Date.parse(r.timestamp);if(!Number.isFinite(time)||(!from&&!to))return[];
 const txid=r.transaction_hash||r.hash;if(!/^0x[0-9a-f]{64}$/i.test(txid||''))throw Error('Invalid on-chain transaction hash.');
 const token=type==='token'?tokenIdentity(c.network,r.token||{}):null;if(type==='token'&&!token)return[];
 const asset=token?.asset||n.asset,quantity=units(type==='token'?r.total?.value:r.value,token?.decimals??18),out=[];
 const fee=type==='normal'&&from?units(r.fee?.value||'0',18):0;
 const success=type==='token'||type==='internal'?!r.error:r.status==='ok';
 const delta=(success?(to?quantity:0)-(from?quantity:0):0)-fee;
 if(delta)out.push({id:'chain:'+txid+':'+type+':'+(r.log_index??r.index??0),asset,delta,fee,time,txid,network:c.network,netQuantity:delta>0?delta:(success&&!to&&from?quantity:Math.max(0,-delta-fee)),source:delta>0?'Deposit':quantity&&success&&!to?'Withdrawal':'Fee',contract:token?.contract});
 return out;
}
function btcMovement(address,tx){
 if(!tx.status?.confirmed)return null;const incoming=(tx.vout||[]).filter(v=>v.scriptpubkey_address===address).reduce((s,v)=>s+units(v.value,8),0),inputs=(tx.vin||[]).filter(v=>v.prevout?.scriptpubkey_address===address),spent=inputs.reduce((s,v)=>s+units(v.prevout.value,8),0),delta=incoming-spent;
 if(!delta)return null;if(!/^[a-f0-9]{64}$/.test(tx.txid)||!Number.isFinite(tx.status.block_time))throw Error('Invalid Bitcoin transaction.');
 const allInputsOwned=inputs.length===(tx.vin||[]).length,fee=delta<0&&allInputsOwned?units(tx.fee,8):0;
 return{id:'chain:'+tx.txid,txid:tx.txid,network:'bitcoin',asset:'BTC',delta,fee,netQuantity:delta>0?delta:Math.max(0,-delta-fee),time:tx.status.block_time*1000,source:delta>0?'Deposit':'Withdrawal',sharedInputs:delta<0&&!allInputsOwned};
}
async function fetchWallet(c,{fetcher=fetch,pageBudget=4,now=Date.now()}={}){
 const config=credentials({network:c.network,address:c.address,label:'Wallet'}),n=NETWORKS[config.network],old=c.history||{},h=structuredClone({events:[],movements:[],fx:{},usdPrices:{},...old});h.accountingVersion=2;h.issues=[];h.walletPages||={};
 const records=new Map((h.movements||[]).map(m=>[m.id,m]));const previousIds=new Set(records.keys());let blocked=false;
 async function get(route,query){if(blocked)throw Error('Wallet provider rate limit. Saved balances are kept.');const url=n.host+route+(query?'?'+new URLSearchParams(query):'');let r;try{r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(12000)})}catch{throw Error('Wallet provider is unavailable. Saved balances are kept.')}
 if(r.status===429){blocked=true;throw Error('Wallet provider rate limit. Saved balances are kept.')}if(!r.ok)throw Error('Wallet address or network data is unavailable.');return r.json();}
 const merge=rows=>{for(const m of rows.filter(Boolean))records.set(m.id,m);if(records.size>100000)throw Error('Wallet history storage limit reached.');};
 let balances=[],coverage=[],addressPath='/api/v2/addresses/'+config.address;
 if(config.network==='bitcoin'){
  const d=await get('/api/address/'+config.address),s=d.chain_stats;if(!s)throw Error('Bitcoin balance is incomplete.');const quantity=units(s.funded_txo_sum,8)-units(s.spent_txo_sum,8);if(quantity<0)throw Error('Invalid Bitcoin balance.');if(quantity)balances.push(balance('BTC',quantity));
  coverage=[{wallet:'Confirmed BTC · one address',ok:true,at:new Date(now).toISOString()}];h.pendingTransactions=d.mempool_stats?.tx_count||0;
  try{let cursor=null;const state=h.walletPages.bitcoin||{},latest=await get('/api/address/'+config.address+'/txs/chain');if(!Array.isArray(latest))throw Error('Bitcoin history is incomplete.');const head=latest.map(t=>btcMovement(config.address,t)).filter(Boolean),overlap=head.some(m=>previousIds.has(m.id));merge(head);cursor=overlap&&state.complete?null:(!overlap&&previousIds.size?latest.at(-1)?.txid:state.cursor)||(latest.length===25?latest.at(-1).txid:null);
   let complete=overlap&&state.complete||latest.length<25;for(let i=0;cursor&&i<pageBudget;i++){const rows=await get('/api/address/'+config.address+'/txs/chain/'+cursor);if(!Array.isArray(rows))throw Error('Bitcoin history is incomplete.');const pageRows=rows.map(t=>btcMovement(config.address,t)).filter(Boolean),joined=state.complete&&pageRows.some(m=>previousIds.has(m.id));merge(pageRows);if(joined||rows.length<25){cursor=null;complete=true;break}const next=rows.at(-1).txid;if(next===cursor)throw Error('Bitcoin history pagination did not advance.');cursor=next;}
   h.walletPages.bitcoin={cursor,complete};h.complete=!!complete;if(!complete)h.issues.push('Older wallet history will continue on the next sync.');
  }catch(e){h.complete=false;h.issues.push(e.message)}
 }else{
  const d=await get(addressPath);if(d.coin_balance==null)throw Error('This address has no indexed balance yet. Check the network and try a previously used address.');const q=units(d.coin_balance,18);if(q)balances.push(balance(n.asset,q));coverage.push({wallet:n.name+' native balance',ok:true,at:new Date(now).toISOString()});
  try{let cursor,complete=false,skipped=0;const seenTokens=new Set();for(let page=0;page<20;page++){const d=await get(addressPath+'/tokens',{type:'ERC-20',...cursor});if(!Array.isArray(d.items))throw Error('Token balances are incomplete.');for(const row of d.items){const t=tokenIdentity(c.network,row.token||{});if(t){if(seenTokens.has(t.contract))throw Error('Duplicate token balance. Saved balances are kept.');seenTokens.add(t.contract);let q;try{q=units(row.value,t.decimals)}catch(e){if(t.verified)throw e;skipped++;continue}if(q)balances.push({...balance(t.asset,q,t.name),contract:t.contract})}}if(!d.next_page_params){complete=true;break}if(JSON.stringify(cursor)===JSON.stringify(d.next_page_params))throw Error('Token pagination did not advance.');cursor=d.next_page_params;}if(!complete)throw Error('Token balances exceed the current import limit.');coverage.push({wallet:'ERC-20 balances · NFTs excluded',ok:skipped===0,at:new Date(now).toISOString()});if(skipped)h.issues.push(skipped+' unrecognised token balances were omitted because their amounts exceed the supported range. Other returned balances were kept.');}
  catch(e){const native=n.asset;balances=[...balances.filter(b=>b.asset===native),...(c.balances||[]).filter(b=>b.asset!==native)];coverage.push({wallet:'ERC-20 balances · NFTs excluded',ok:false,cached:true});h.issues.push(e.message);}
  for(const [type,suffix]of [['normal','transactions'],['internal','internal-transactions'],['token','token-transfers']])try{
   const state=h.walletPages[type]||{},query=type==='token'?{type:'ERC-20'}:{},first=await get(addressPath+'/'+suffix,query);if(!Array.isArray(first.items))throw Error('Wallet history is incomplete.');const head=first.items.flatMap(r=>evmMovement(c,r,type)),overlap=head.some(m=>previousIds.has(m.id));merge(head);
   let cursor=overlap&&state.complete?null:!overlap&&previousIds.size?first.next_page_params:state.cursor||first.next_page_params,complete=overlap&&state.complete||!first.next_page_params;
   for(let i=0;cursor&&i<pageBudget;i++){const d=await get(addressPath+'/'+suffix,{...query,...cursor});if(!Array.isArray(d.items))throw Error('Wallet history is incomplete.');const pageRows=d.items.flatMap(r=>evmMovement(c,r,type)),joined=state.complete&&pageRows.some(m=>previousIds.has(m.id));merge(pageRows);if(joined||!d.next_page_params){cursor=null;complete=true;break}if(JSON.stringify(cursor)===JSON.stringify(d.next_page_params))throw Error('Wallet pagination did not advance.');cursor=d.next_page_params;}
   h.walletPages[type]={cursor,complete};if(!complete)h.issues.push('Older wallet history will continue on the next sync.');
  }catch(e){h.walletPages[type]={...(h.walletPages[type]||{}),complete:false};h.issues.push(e.message)}
  h.complete=Object.values(h.walletPages).every(p=>p.complete)&&!h.issues.length;
 }
 h.movements=[...records.values()].sort((a,b)=>a.time-b.time);h.updatedAt=new Date(now).toISOString();h.issues=[...new Set(h.issues)];
 if(h.movements.some(m=>m.sharedInputs)){h.complete=false;h.issues.push('Shared-input Bitcoin transactions need review; ownership and fees cannot be inferred.');}
 return{balances,coverage,history:h};
}
module.exports={NETWORKS,credentials,units,tokenIdentity,evmMovement,btcMovement,fetchWallet};
