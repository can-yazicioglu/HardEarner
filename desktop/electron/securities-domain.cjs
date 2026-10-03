const TYPES=['stock','etf','fund'];
const CURRENCIES=['USD','TRY','GBP','EUR','CHF','CAD','AUD','JPY','GBX'];
const isSecurity=t=>TYPES.includes(t);
const token=s=>typeof s==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,45}$/.test(s)&&!['__proto__','constructor','prototype'].includes(s);
function instrument(v){
 if(!v||!TYPES.includes(v.type)||!token(v.symbol)||!token(v.exchange)||!CURRENCIES.includes(v.currency))throw Error('Choose a stock, ETF or fund with its exact exchange and currency.');
 if(v.isin&&!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(v.isin))throw Error('Invalid ISIN.');
 const id=[v.exchange,v.symbol,v.currency].join('__');if(id.length>64)throw Error('Listing identifier is too long.');
 return{...(v.facts?{facts:issuerFacts(v.facts)}:{}),id,type:v.type,symbol:v.symbol,exchange:v.exchange,currency:v.currency,name:String(v.name||v.symbol).slice(0,120),isin:v.isin||'',country:String(v.country||'').slice(0,60),mic:String(v.mic||'').slice(0,10)};
}
function quoteUSD(q,fx){if(!q||!Number.isFinite(q.price)||q.price<=0)return null;const c=q.currency==='GBX'?'GBP':q.currency,scale=q.currency==='GBX'?100:1;return fx?.[c]>0?q.price/scale/fx[c]:c==='USD'?q.price:null}
function parseQuote(d,i,now=Date.now()){
 const value=Number(d.close),at=Number(d.last_quote_at??d.timestamp)*1000;
 if(d.status==='error'||!(value>0)||!Number.isFinite(value)||!Number.isFinite(at)||at<=0||at>now+60000)throw Error('The data provider did not return a valid dated quote.');
 if(d.symbol!==i.symbol||d.currency!==i.currency||d.exchange!==i.exchange&&!(i.mic&&d.mic_code===i.mic))throw Error('The quote does not match this listing. Check exchange and currency.');
 const optional=k=>d[k]==null||d[k]===''?null:Number.isFinite(Number(d[k]))?Number(d[k]):null;
 return{price:value,currency:i.currency,at:new Date(at).toISOString(),source:'Twelve Data',change:optional('percent_change'),volume:optional('volume'),high:optional('high'),low:optional('low'),previousClose:optional('previous_close'),isMarketOpen:typeof d.is_market_open==='boolean'?d.is_market_open:null,quality:i.type==='fund'?'NAV / daily':'Provider quote',fetchedAt:now};
}
function bars(d,i){
 if(!Array.isArray(d?.values)||!d.values.length||d.meta?.symbol!==i.symbol||d.meta?.currency!==i.currency||d.meta.exchange!==i.exchange&&!(i.mic&&d.meta.mic_code===i.mic))throw Error('No matching price history is available for this listing.');
 const result=d.values.map(r=>{const time=Date.parse(r.datetime.length===10?r.datetime+'T00:00:00Z':r.datetime.replace(' ','T')+'Z')/1000,close=Number(r.close),open=Number(r.open),high=Number(r.high),low=Number(r.low),volume=Number(r.volume||0);if(!Number.isInteger(time)||time<=0||![open,high,low,close].every(x=>Number.isFinite(x)&&x>0)||high<Math.max(open,low,close)||low>Math.min(open,high,close)||!Number.isFinite(volume)||volume<0)throw Error('Inconsistent price history.');return{time,open,high,low,close,volume}}).sort((a,b)=>a.time-b.time);
 if(new Set(result.map(b=>b.time)).size!==result.length)throw Error('Duplicate historical prices.');return result;
}
function metrics(rows){if(rows.length<2)return{};const first=rows[0].close,last=rows.at(-1).close;let peak=first,drawdown=0;const returns=[];for(let i=0;i<rows.length;i++){peak=Math.max(peak,rows[i].close);drawdown=Math.min(drawdown,rows[i].close/peak-1);if(i)returns.push(Math.log(rows[i].close/rows[i-1].close))}const avg=returns.reduce((s,x)=>s+x,0)/returns.length,variance=returns.length>1?returns.reduce((s,x)=>s+(x-avg)**2,0)/(returns.length-1):null;return{priceReturn:(last/first-1)*100,maxDrawdown:drawdown*100,volatility:variance==null?null:Math.sqrt(variance*252)*100,sma50:rows.length<50?null:rows.slice(-50).reduce((s,x)=>s+x.close,0)/50,sma200:rows.length<200?null:rows.slice(-200).reduce((s,x)=>s+x.close,0)/200,observations:rows.length}};
function issuerFacts(v){if(!v||typeof v.source!=='string'||!v.source.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(v.date||'')||!Number.isFinite(Date.parse(v.date))||new Date(v.date).toISOString().slice(0,10)!==v.date||v.date>new Date().toISOString().slice(0,10))throw Error('Add the source document and a valid document date.');const ter=v.ter===''||v.ter==null?null:Number(v.ter),risk=v.risk===''||v.risk==null?null:Number(v.risk);if(ter!=null&&(!Number.isFinite(ter)||ter<0||ter>100)||risk!=null&&(!Number.isInteger(risk)||risk<1||risk>7))throw Error('Enter a valid expense percentage and risk indicator (1–7).');return{ter,risk,source:v.source.slice(0,200),date:v.date,benchmark:String(v.benchmark||'').slice(0,100),domicile:String(v.domicile||'').slice(0,60),replication:String(v.replication||'').slice(0,100),distribution:['Accumulating','Distributing'].includes(v.distribution)?v.distribution:''}}
module.exports={issuerFacts,TYPES,CURRENCIES,isSecurity,instrument,quoteUSD,parseQuote,bars,metrics};
