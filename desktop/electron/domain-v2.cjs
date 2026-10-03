const OZ=31.1034768;
const METALS={XAU:{name:'Gold',symbol:'Au',color:'#d5b776'},XAG:{name:'Silver',symbol:'Ag',color:'#a8b9d2'},XPT:{name:'Platinum',symbol:'Pt',color:'#79a6bf'},XPD:{name:'Palladium',symbol:'Pd',color:'#a6a0d1'}};
const DEFAULT={version:2,holdings:[],goals:[],snapshots:[],settings:{currency:'TRY',hideBalances:false,buyPremium:2,sellDiscount:2,watchlist:['crypto:BTC','crypto:ETH','metal:XAU','cash:USD']}};
const positive=n=>Number.isFinite(n)&&n>0;
const nonnegative=n=>Number.isFinite(n)&&n>=0;
const dateValid=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
function validateState(input){
 if(!input||![1,2].includes(input.version)||!Array.isArray(input.holdings)||input.holdings.length>10000)throw Error('This is not a supported HardEarner backup.');
 const ids=new Set();const holdings=input.holdings.map(h=>{
  if(!h||typeof h.id!=='string'||!h.id||h.id.length>100||ids.has(h.id))throw Error('Invalid or duplicate holding ID.');ids.add(h.id);
  if(!['cash','crypto','metal','custom'].includes(h.type)||!positive(h.quantity)||h.quantity>1e15)throw Error('Enter a positive quantity.');
  if(typeof h.asset!=='string'||!/^[A-Z0-9]{2,20}$/.test(h.asset))throw Error('Invalid asset symbol.');
  if(h.type==='metal'&&(!METALS[h.asset]||!positive(h.purity)||h.purity>1))throw Error('Metal purity must be between 0 and 100%.');
  if(h.type==='custom'&&(!positive(h.manualPrice)||!['USD','GBP','TRY','EUR'].includes(h.manualCurrency)))throw Error('Other assets need a positive unit value and currency.');
  if(h.cost!=null&&(!nonnegative(h.cost)||!['TRY','USD','GBP','EUR'].includes(h.costCurrency)))throw Error('Invalid purchase cost.');
  if(!nonnegative(h.purchaseFee??0)||!nonnegative(h.saleFee??0)||!nonnegative(h.saleFeePct??0)||(h.saleFeePct??0)>100)throw Error('Fees must be nonnegative; percentage must not exceed 100.');
  if(h.saleFee&&!['TRY','USD','GBP','EUR'].includes(h.saleFeeCurrency))throw Error('Invalid sale fee currency.');
  if(h.purchaseDate&&!dateValid(h.purchaseDate))throw Error('Invalid purchase date.');
  for(const k of ['dealerBuy','dealerSell'])if(h[k]!=null&&(!positive(h[k])||!['TRY','USD','GBP','EUR'].includes(h.dealerCurrency)))throw Error('Unit quotes must be positive.');
  const purchaseFx={};for(const [k,v]of Object.entries(h.purchaseFx||{}))if(['USD','GBP','TRY','EUR'].includes(k)&&positive(v))purchaseFx[k]=v;
  return {id:h.id,type:h.type,asset:h.asset,quantity:h.quantity,name:String(h.name||h.asset).slice(0,100),location:String(h.location||'').slice(0,100),notes:String(h.notes||'').slice(0,1000),purity:h.type==='metal'?h.purity:1,manualPrice:h.manualPrice??null,manualCurrency:h.manualCurrency||'TRY',cost:h.cost??null,costCurrency:h.costCurrency||'TRY',purchaseFee:h.purchaseFee||0,purchaseDate:h.purchaseDate||'',purchaseFx,purchaseFxDate:String(h.purchaseFxDate||'').slice(0,10),saleFee:h.saleFee||0,saleFeePct:h.saleFeePct||0,saleFeeCurrency:h.saleFeeCurrency||'TRY',dealerBuy:h.dealerBuy??null,dealerSell:h.dealerSell??null,dealerCurrency:h.dealerCurrency||'TRY',quoteDate:String(h.quoteDate||'').slice(0,10),createdAt:String(h.createdAt||new Date().toISOString()).slice(0,40)};
 });
 const s=input.settings||{};if(!['TRY','GBP','USD'].includes(s.currency))throw Error('Invalid display currency.');
 for(const k of ['buyPremium','sellDiscount'])if(!Number.isFinite(s[k])||s[k]<0||s[k]>50)throw Error('Dealer spread must be between 0% and 50%.');
 if(input.goals!=null&&!Array.isArray(input.goals))throw Error('Invalid goals.');
 const goals=(input.goals||[]).slice(0,30).map(g=>{if(!positive(g.target)||!['TRY','GBP','USD'].includes(g.currency))throw Error('Invalid goal.');return{id:String(g.id).slice(0,100),name:String(g.name||'Savings goal').slice(0,80),target:g.target,currency:g.currency};});
 const snapshots=(Array.isArray(input.snapshots)?input.snapshots:[]).filter(p=>p&&nonnegative(p.usd)&&Number.isFinite(Date.parse(p.date))).slice(-730);
 const watchlist=[...new Set((Array.isArray(s.watchlist)?s.watchlist:DEFAULT.settings.watchlist).filter(x=>typeof x==='string'&&/^(crypto|metal|cash):[A-Z0-9]{2,16}$/.test(x)))].slice(0,100);
 return{version:2,holdings,goals,snapshots,settings:{currency:s.currency,hideBalances:!!s.hideBalances,buyPremium:s.buyPremium,sellDiscount:s.sellDiscount,watchlist}};
}
function unitUSD(h,m){if(h.type==='cash')return positive(m.fx?.[h.asset])?1/m.fx[h.asset]:null;if(h.type==='crypto')return positive(m.crypto?.[h.asset]?.usd)?m.crypto[h.asset].usd:null;if(h.type==='metal')return positive(m.metals?.[h.asset]?.usd)?m.metals[h.asset].usd/OZ*h.purity:null;if(h.type==='custom')return positive(m.fx?.[h.manualCurrency])?h.manualPrice/m.fx[h.manualCurrency]:null;return null;}
function costIn(h,m,currency){
 if(h.cost==null)return{costBasis:null,costEstimated:false};
 const amount=h.cost+(h.purchaseFee||0);
 if(h.costCurrency===currency)return{costBasis:amount,costEstimated:false};
 if(positive(h.purchaseFx?.[currency]))return{costBasis:amount*h.purchaseFx[currency],costEstimated:false};
 if(h.purchaseDate)return{costBasis:null,costEstimated:false};
 const rate=(m.fx?.[currency]??(currency==='USD'?1:null))/m.fx?.[h.costCurrency];
 return{costBasis:positive(rate)?amount*rate:null,costEstimated:true};
}
function valueHolding(h,m,settings,currency='USD'){
 const fx=m.fx?.[currency]??(currency==='USD'?1:null),unitUSDValue=unitUSD(h,m),valueUSD=unitUSDValue==null?null:unitUSDValue*h.quantity;
 let grossUSD=valueUSD,buyUSD=valueUSD,saleMethod=h.type==='cash'?'FX reference':h.type==='custom'?'Manual valuation':'Last price estimate';
 if(h.type==='metal'){grossUSD=valueUSD==null?null:valueUSD*(1-settings.sellDiscount/100);buyUSD=valueUSD==null?null:valueUSD*(1+settings.buyPremium/100);saleMethod='Estimated metal spread';}
 if(h.type==='crypto'&&positive(m.crypto?.[h.asset]?.bidUSD)){grossUSD=m.crypto[h.asset].bidUSD*h.quantity;saleMethod='Binance best bid';if(positive(m.crypto[h.asset].askUSD))buyUSD=m.crypto[h.asset].askUSD*h.quantity;}
 if(h.dealerBuy!=null){grossUSD=positive(m.fx?.[h.dealerCurrency])?h.dealerBuy/m.fx[h.dealerCurrency]*h.quantity:null;saleMethod='Your sell quote';}
 if(h.dealerSell!=null)buyUSD=positive(m.fx?.[h.dealerCurrency])?h.dealerSell/m.fx[h.dealerCurrency]*h.quantity:null;
 const feeUSD=h.saleFee?(positive(m.fx?.[h.saleFeeCurrency])?h.saleFee/m.fx[h.saleFeeCurrency]:null):0;
 const saleCostsUSD=grossUSD==null||feeUSD==null?null:grossUSD*(h.saleFeePct||0)/100+feeUSD;
 const sellUSD=grossUSD==null||saleCostsUSD==null?null:grossUSD-saleCostsUSD;
 const cv=n=>n==null||!positive(fx)?null:n*fx;
 const {costBasis,costEstimated}=costIn(h,m,currency);const value=cv(valueUSD),sell=cv(sellUSD);
 const gain=value==null||costBasis==null?null:value-costBasis;
 const saleGain=sell==null||costBasis==null?null:sell-costBasis;
 return{unit:cv(unitUSDValue),value,valueUSD,sell,sellUSD,grossSale:cv(grossUSD),saleCosts:cv(saleCostsUSD),buy:cv(buyUSD),costBasis,costEstimated,gain,saleGain,returnPct:costBasis>0&&saleGain!=null?saleGain/costBasis*100:null,averageCost:costBasis==null?null:costBasis/h.quantity,breakEven:costBasis==null||feeUSD==null||!positive(fx)||(h.saleFeePct||0)>=100?null:(costBasis+cv(feeUSD))/(1-(h.saleFeePct||0)/100)/h.quantity,saleMethod};
}
function portfolio(holdings,m,settings,currency='USD'){
 const rows=holdings.map(h=>({...h,...valueHolding(h,m,settings,currency)}));const sum=key=>rows.reduce((s,h)=>s+(h[key]??0),0);const comparable=rows.filter(h=>h.saleGain!=null);const matchedCost=comparable.reduce((s,h)=>s+h.costBasis,0);
 return{rows,total:sum('value'),totalUSD:sum('valueUSD'),missing:rows.filter(h=>h.value==null).length,sell:sum('sell'),sellUSD:sum('sellUSD'),missingSale:rows.filter(h=>h.sell==null).length,cost:sum('costBasis'),missingCost:rows.filter(h=>h.costBasis==null).length,gain:sum('gain'),saleGain:sum('saleGain'),saleCosts:sum('saleCosts'),costed:rows.filter(h=>h.gain!=null).length,comparable:comparable.length,estimatedCosts:rows.filter(h=>h.costEstimated&&h.costBasis!=null).length,returnPct:matchedCost>0?sum('saleGain')/matchedCost*100:null};
}
module.exports={OZ,METALS,DEFAULT,positive,validateState,unitUSD,costIn,valueHolding,portfolio};
