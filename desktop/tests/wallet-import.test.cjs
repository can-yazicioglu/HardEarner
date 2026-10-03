const {test}=require('node:test'),assert=require('node:assert/strict');
const w=require('../electron/public-wallets.cjs'),csv=require('../electron/statement-import.cjs');
const address='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40),txid='0x'+'a'.repeat(64),time='2026-09-01T10:00:00Z';
const mapping={date:0,fromAsset:1,fromAmount:2,toAsset:3,toAmount:4};
test('Statement import supports Excel paste, decimal comma and explicit Turkish timezone',()=>{
 const text='Date\tFrom\tPaid\tTo\tReceived\n22/09/2026 15:30:00\tTRY\t21.185,00\tUSDT\t430,682865';
 const rows=csv.preview({text,mapping,decimal:',',format:'dmy',offset:'+03:00'});assert.equal(rows[0].paid,21185);assert.equal(rows[0].quantity,430.682865);assert.equal(rows[0].time,Date.parse('2026-09-22T12:30:00Z'));
 assert.throws(()=>csv.preview({text,mapping,decimal:'.',format:'iso'}),/Row 2/);
});
test('Statement parser rejects ambiguous/malformed dates, formulas, invalid symbols and duplicate column mappings',()=>{
 const input={text:'Date,From,Paid,To,Received\n2026-09-22 15:30:00,TRY,20000,USDT,400',mapping};assert.equal(csv.preview(input).length,1);
 for(const [a,b]of [['2026-09-22','2026-02-30'],['20000','=20000'],['USDT','__proto__'],['400','-400']])assert.throws(()=>csv.preview({...input,text:input.text.replace(a,b)}));
 assert.throws(()=>csv.preview({...input,mapping:{...mapping,toAmount:2}}));assert.throws(()=>csv.table('a,b\n"unfinished,2'));
});
test('Wallet input rejects secrets and unimplemented networks; EVM addresses have a canonical duplicate key',()=>{
 assert.throws(()=>w.credentials({network:'solana',address:'abc',label:'Test'}),/supported/);assert.throws(()=>w.credentials({network:'ethereum',address:'word '.repeat(12),label:'Ledger'}),/public/);
 assert.equal(w.credentials({network:'ethereum',address:'0x'+'A'.repeat(40),label:'Ledger'}).address,'0x'+'a'.repeat(40));assert.throws(()=>w.credentials({network:'__proto__',address,label:'x'}));
});
test('Scam token symbols never inherit the price or identity of a real asset',()=>{
 const fake=w.tokenIdentity('ethereum',{address_hash:other,type:'ERC-20',decimals:'18',symbol:'USDT'});assert.notEqual(fake.asset,'USDT');assert.equal(fake.verified,false);
 const real=w.tokenIdentity('ethereum',{address_hash:'0xdac17f958d2ee523a2206206994597c13d831ec7',type:'ERC-20',decimals:'6'});assert.equal(real.asset,'USDT');assert.throws(()=>w.tokenIdentity('ethereum',{...real,address_hash:real.contract,type:'ERC-20',decimals:'18'}));
});
test('EVM transfers count native gas once, ignore pending value and retain failed transaction fees',()=>{
 const c={network:'ethereum',address},row={hash:txid,from:{hash:address},to:{hash:other},value:'1000000000000000000',fee:{value:'1000000000000000'},status:'ok',timestamp:time};
 let m=w.evmMovement(c,row,'normal')[0];assert.equal(m.delta,-1.001);assert.equal(m.netQuantity,1);assert.equal(m.fee,.001);
 m=w.evmMovement(c,{...row,status:'error'},'normal')[0];assert.equal(m.delta,-.001);assert.equal(m.source,'Fee');assert.equal(w.evmMovement(c,{...row,timestamp:null},'normal').length,0);
});
test('Bitcoin change is netted and a shared-input transaction is not silently assigned the whole fee',()=>{
 const a='btc-address',tx={txid:'a'.repeat(64),status:{confirmed:true,block_time:Date.parse(time)/1000},vin:[{prevout:{scriptpubkey_address:a,value:100000000}}],vout:[{scriptpubkey_address:a,value:20000000},{scriptpubkey_address:'other',value:79900000}],fee:100000};
 let m=w.btcMovement(a,tx);assert.equal(m.delta,-.8);assert.equal(m.netQuantity,.799);assert.equal(m.fee,.001);assert.equal(m.sharedInputs,false);
 tx.vin.push({prevout:{scriptpubkey_address:'other',value:100000000}});m=w.btcMovement(a,tx);assert.equal(m.sharedInputs,true);assert.equal(m.fee,0);assert.equal(w.btcMovement(a,{...tx,status:{confirmed:false}}),null);
});
test('Wallet sync paginates histories, preserves token cache on failure and uses allowlisted hosts',async()=>{
 const c={network:'ethereum',address,label:'Ledger',balances:[{asset:'USDC',quantity:4}]},calls=[];
 const fetcher=async u=>{const url=new URL(u);calls.push(url);assert.equal(url.origin,'https://eth.blockscout.com');const path=url.pathname;
 if(path.endsWith('/tokens'))return{ok:false,status:503};if(path===`/api/v2/addresses/${address}`)return{ok:true,json:async()=>({coin_balance:'1000000000000000000'})};return{ok:true,json:async()=>({items:[],next_page_params:null})};};
 const r=await w.fetchWallet(c,{fetcher});assert.equal(r.balances[0].quantity,1);assert.equal(r.balances[1].quantity,4);assert.equal(r.coverage[1].ok,false);assert.equal(r.history.complete,false);assert(calls.length>=5);
});
test('Successful confirmed Bitcoin snapshot and cursor backfill are idempotent',async()=>{
 const a='1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',tx={txid:'a'.repeat(64),status:{confirmed:true,block_time:Date.parse(time)/1000},vin:[],vout:[{scriptpubkey_address:a,value:100000000}],fee:0};
 const fetcher=async u=>({ok:true,json:async()=>u.includes('/txs/')?[tx]:{chain_stats:{funded_txo_sum:100000000,spent_txo_sum:0},mempool_stats:{tx_count:1}}});
 const c={network:'bitcoin',address:a,label:'Ledger'},first=await w.fetchWallet(c,{fetcher}),second=await w.fetchWallet({...c,...first},{fetcher});assert.equal(first.balances[0].quantity,1);assert.equal(second.history.movements.length,1);assert.equal(second.history.complete,true);assert.equal(second.history.pendingTransactions,1);
});

test('Wallet pagination resumes through a burst larger than a sync budget without hiding the gap',async()=>{
 const rows=Array.from({length:10},(_,i)=>({hash:'0x'+String(i+1).padStart(64,'0'),from:{hash:other},to:{hash:address},timestamp:new Date(Date.parse(time)+i*60000).toISOString(),value:'1000000000000000000',status:'ok'})).reverse();
 let c={network:'ethereum',address,label:'Test',history:{events:[],movements:rows.slice(-2).flatMap(r=>w.evmMovement({network:'ethereum',address},r,'normal')),walletPages:{normal:{complete:true},internal:{complete:true},token:{complete:true}}}};
 const fetcher=async u=>{const url=new URL(u);let data;if(url.pathname.endsWith('/transactions')){const start=Number(url.searchParams.get('index')||0);data={items:rows.slice(start,start+2),next_page_params:start+2<rows.length?{index:start+2}:null}}else if(url.pathname.endsWith(address))data={coin_balance:'10000000000000000000'};else data={items:[],next_page_params:null};return{ok:true,json:async()=>data}};
 let r=await w.fetchWallet(c,{fetcher,pageBudget:1});assert.equal(r.history.complete,false);assert.equal(r.history.movements.length,6);
 for(let i=0;i<3;i++){c={...c,...r};r=await w.fetchWallet(c,{fetcher,pageBudget:1})}assert.equal(r.history.complete,true);assert.equal(r.history.movements.length,10);
});

test('An unindexed balance is unavailable, never silently changed into a zero balance',async()=>{
 await assert.rejects(()=>w.fetchWallet({network:'ethereum',address,label:'Test'},{fetcher:async()=>({ok:true,json:async()=>({coin_balance:null})})}),/no indexed balance/);
});

test('An absurd unrecognised token balance cannot discard valid USDC or native balances',async()=>{
 const fetcher=async u=>({ok:true,json:async()=>u.endsWith(address)?{coin_balance:'1000000000000000000'}:u.includes('/tokens?')?{items:[{value:'1000000',token:{address_hash:'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',type:'ERC-20',decimals:'6'}},{value:'1'+'0'.repeat(60),token:{address_hash:other,type:'ERC-20',decimals:'0',symbol:'SPAM'}}]}:{items:[]}});
 const r=await w.fetchWallet({network:'ethereum',address,label:'Test'},{fetcher});assert.equal(r.balances.length,2);assert.equal(r.balances[1].asset,'USDC');assert.equal(r.balances[1].quantity,1);assert.equal(r.coverage[1].ok,false);assert(r.history.issues.some(s=>s.includes('omitted')));
});
