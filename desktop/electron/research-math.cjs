const DAY=86400000;
const number=v=>v===null||v===undefined||typeof v==='boolean'||!['number','string'].includes(typeof v)||typeof v==='string'&&!v.trim()?null:Number.isFinite(Number(v))?Number(v):null;
const ratio=(a,b)=>number(a)!==null&&number(b)>0?Number(a)/Number(b):null;
const change=(a,b)=>ratio(a,b)===null?null:(a/b-1)*100;
function points(values){return [...new Map(values.filter(p=>number(p.time)>0&&number(p.value)!==null).map(p=>[Number(p.time),{...p,time:Number(p.time),value:Number(p.value)}])).values()].sort((a,b)=>a.time-b.time)}
function sma(input,n){let sum=0;return points(input).flatMap((p,i,a)=>{sum+=p.value;if(i>=n)sum-=a[i-n].value;return i<n-1||p.time-a[i-n+1].time>(n-1)*DAY+1000?[]:[{time:p.time,value:sum/n}]})}
function cycleBands(input){const p=points(input),bands={price:p};for(const n of [111,200,350,730])bands['sma'+n]=sma(p,n);bands.piUpper=bands.sma350.map(p=>({...p,value:p.value*2}));for(const k of [1.6,2,3,5,8,13,21])bands['golden'+k]=bands.sma350.map(p=>({...p,value:p.value*k}));bands.twoYearUpper=bands.sma730.map(p=>({...p,value:p.value*5}));const ma=new Map(bands.sma200.map(p=>[p.time,p.value]));bands.mayer=p.flatMap(p=>ma.has(p.time)?[{time:p.time,value:p.value/ma.get(p.time)}]:[]);return bands}
function relative(alt,btc){return number(alt)!==null&&number(btc)!==null&&btc>-100?((1+alt/100)/(1+btc/100)-1)*100:null}
function breadth(rows){const valid=rows.filter(r=>number(r.relative)!==null&&number(r.return)!==null);return{universe:rows.length,covered:valid.length,missing:rows.length-valid.length,outperform:valid.length?100*valid.filter(r=>r.relative>0).length/valid.length:null,positive:valid.length?100*valid.filter(r=>r.return>0).length/valid.length:null,weighting:'equal weight',methodVersion:'relative-1'}}
function periodReturns(input,now=Date.now()){
 const p=points(input),groups=new Map();
 for(let i=1;i<p.length;i++){const d=new Date(p[i].time),key=d.toISOString().slice(0,7);if(!groups.has(key))groups.set(key,{period:key,first:p[i-1],last:p[i],count:0});const g=groups.get(key);g.last=p[i];g.count++;}
 return [...groups.values()].map(g=>{const [y,m]=g.period.split('-').map(Number),start=Date.UTC(y,m-1,1),end=Date.UTC(y,m,1),complete=g.first.time===start-DAY&&g.last.time===end-DAY&&g.count===(end-start)/DAY;return{period:g.period,return:change(g.last.value,g.first.value),start:g.first.time,end:g.last.time,incomplete:!complete||end>now}})
}
function compound(values){return values.length&&values.every(v=>number(v)!==null)?(values.reduce((n,v)=>n*(1+v/100),1)-1)*100:null}
function aggregateReturns(months,mode='quarter'){
 if(!['quarter','year'].includes(mode))throw Error('Choose quarter or year.');
 const groups=new Map();for(const row of months){const [year,month]=row.period.split('-').map(Number),key=mode==='year'?String(year):year+' Q'+Math.ceil(month/3);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 return [...groups].map(([period,rows])=>({period,return:compound(rows.map(r=>r.return)),incomplete:rows.length!==(mode==='year'?12:3)||rows.some(r=>r.incomplete),start:rows[0].start,end:rows.at(-1).end}));
}
function correlation(left,right){const a=points(left),b=new Map(points(right).map(p=>[p.time,p.value]));const matched=a.filter(p=>b.has(p.time));const returns=matched.slice(1).flatMap((p,i)=>{const old=matched[i];if(p.time-old.time>8*DAY)return[];const x=ratio(p.value,old.value),y=ratio(b.get(p.time),b.get(old.time));return x>0&&y>0?[[Math.log(x),Math.log(y)]]:[]});if(returns.length<3)return{value:null,samples:returns.length};const mx=returns.reduce((s,p)=>s+p[0],0)/returns.length,my=returns.reduce((s,p)=>s+p[1],0)/returns.length;let xy=0,xx=0,yy=0;for(const[x,y]of returns){xy+=(x-mx)*(y-my);xx+=(x-mx)**2;yy+=(y-my)**2}return{value:xx&&yy?xy/Math.sqrt(xx*yy):null,samples:returns.length,start:matched[0]?.time,end:matched.at(-1)?.time}}
function cdf(x){const t=1/(1+.2316419*Math.abs(x)),d=.3989422804014327*Math.exp(-x*x/2);const p=1-d*t*(.319381530+t*(-.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));return x>=0?p:1-p}
function macroCorrelation(prices,macro){
 const p=new Map(points(prices).map(p=>[p.time,p.value])),matched=points(macro).filter(r=>p.has(r.time));
 const rows=matched.slice(1).flatMap((r,i)=>{const old=matched[i];if(r.time-old.time>45*DAY||p.get(old.time)<=0||p.get(r.time)<=0)return[];return[{time:r.time,btcReturn:Math.log(p.get(r.time)/p.get(old.time))*100,macroChange:r.value-old.value,from:old.time}]});
 const pearson=rows=>{if(rows.length<6)return null;const x=rows.reduce((s,r)=>s+r.btcReturn,0)/rows.length,y=rows.reduce((s,r)=>s+r.macroChange,0)/rows.length;let xy=0,xx=0,yy=0;for(const r of rows){const a=r.btcReturn-x,b=r.macroChange-y;xy+=a*b;xx+=a*a;yy+=b*b;}return xx&&yy?xy/Math.sqrt(xx*yy):null};
 return{rows,value:pearson(rows),samples:rows.length,rolling:rows.flatMap((r,i)=>{const value=pearson(rows.slice(Math.max(0,i-29),i+1));return value===null?[]:[{time:r.time,value}]})};
}
function blackScholes({spot,strike,years,volatility,rate=0,dividend=0,type='call'}){
 for(const v of [spot,strike,years,volatility,rate,dividend])if(!Number.isFinite(v))throw Error('Enter finite option inputs.');
 if(spot<=0||strike<=0||years<=0||volatility<=0||!['call','put'].includes(type))throw Error('Price, time and volatility must be positive.');
 const s=volatility*Math.sqrt(years),d1=(Math.log(spot/strike)+(rate-dividend+volatility**2/2)*years)/s,d2=d1-s,disc=Math.exp(-rate*years),q=Math.exp(-dividend*years),density=Math.exp(-d1*d1/2)/Math.sqrt(2*Math.PI),call=type==='call';
 return{price:call?spot*q*cdf(d1)-strike*disc*cdf(d2):strike*disc*cdf(-d2)-spot*q*cdf(-d1),delta:q*(call?cdf(d1):cdf(d1)-1),gamma:q*density/(spot*s),vega:spot*q*density*Math.sqrt(years)/100,theta:(-spot*q*density*volatility/(2*Math.sqrt(years))+(call?-rate*strike*disc*cdf(d2)+dividend*spot*q*cdf(d1):rate*strike*disc*cdf(-d2)-dividend*spot*q*cdf(-d1)))/365,rho:(call?1:-1)*strike*years*disc*cdf(call?d2:-d2)/100};
}
function optionSummary(rows,expiry){
 const r=rows.filter(r=>(!expiry||r.expiry===expiry)&&number(r.oi)!==null&&r.oi>=0&&r.strike>0),strikes=[...new Set(r.map(r=>r.strike))].sort((a,b)=>a-b);
 const call=r.filter(r=>r.side==='call').reduce((s,r)=>s+r.oi,0),put=r.filter(r=>r.side==='put').reduce((s,r)=>s+r.oi,0);
 // OI is already in underlying units; do not multiply by contract size again.
 const payouts=strikes.map(k=>({strike:k,payout:r.reduce((s,r)=>s+r.oi*Math.max(0,r.side==='call'?k-r.strike:r.strike-k),0)}));
 return{callOI:r.length?call:null,putOI:r.length?put:null,pcr:ratio(put,call),maxPain:expiry&&payouts.length?payouts.reduce((a,b)=>a.payout<=b.payout?a:b).strike:null,payouts,contracts:r.length};
}
function optionScenario(rows,expiry,{now=Date.now(),rate=0,dividend=0}={}){
 const selected=rows.filter(r=>r.expiry===expiry&&r.oi>=0&&r.iv>0&&r.underlying>0&&['call','put'].includes(r.side)),tenor=(expiry-now)/(365*DAY);
 if(!selected.length||tenor<=0)return{rows:[],skew:null,gammaFlip:null,gex:[],coverage:0};
 const spot=selected.map(r=>r.underlying).sort((a,b)=>a-b)[Math.floor(selected.length/2)];
 const calculate=(r,s)=>blackScholes({spot:s,strike:r.strike,years:tenor,volatility:r.iv/100,rate,dividend,type:r.side});
 const out=selected.map(r=>{const g=calculate(r,spot);return{...r,delta:g.delta,gamma:g.gamma,vega:g.vega,theta:g.theta,scenarioGEX:g.gamma*r.oi*spot*spot*.01*(r.side==='call'?1:-1)}});
 const near=(side,target)=>out.filter(r=>r.side===side&&Math.abs(r.delta-target)<=.10).sort((a,b)=>Math.abs(a.delta-target)-Math.abs(b.delta-target))[0];
 const call=near('call',.25),put=near('put',-.25),gex=Array.from({length:81},(_,i)=>{const s=spot*(.6+i*.01);return{spot:s,value:selected.reduce((n,r)=>n+calculate(r,s).gamma*r.oi*s*s*.01*(r.side==='call'?1:-1),0)}});
 const flips=gex.slice(1).flatMap((p,i)=>{const prev=gex[i];return p.value*prev.value<0?[prev.spot+(p.spot-prev.spot)*(-prev.value)/(p.value-prev.value)]:[];});
 return{rows:out,spot,skew:call&&put?put.iv-call.iv:null,skewContracts:call&&put?[put.instrument,call.instrument]:[],gex,gammaFlip:flips.length===1?flips[0]:null,flipCount:flips.length,coverage:out.length,excluded:rows.filter(r=>r.expiry===expiry).length-out.length};
}
function dca(input,{amount=100,every=7,start,end,feePct=0,fx=[],currency='USD'}={}){
 if(!Number.isFinite(amount)||amount<=0||![1,7,14,30].includes(every)||!Number.isFinite(feePct)||feePct<0||feePct>=100)throw Error('Choose positive contribution, supported frequency and fees below 100%.');
 const all=points(input),from=Number(start??all[0]?.time),to=Number(end??all.at(-1)?.time);if(!Number.isFinite(from)||!Number.isFinite(to)||from>to)throw Error('Choose a valid date range.');
 const data=all.filter(p=>p.time>=from&&p.time<=to);if(!data.length)throw Error('No prices for this period.');
 if(!['USD','TRY','EUR'].includes(currency))throw Error('Choose USD, TRY or EUR.');
 const rates=points(fx);if(currency!=='USD'&&!rates.length)throw Error('Dated exchange rates are missing.');
 const price=p=>{if(currency==='USD')return p.value;const f=rates.filter(x=>x.time<=p.time).at(-1);if(!f||f.value<=0||p.time-f.time>7*DAY)throw Error('Dated exchange rates are missing.');return p.value*f.value};
 let next=from,units=0,paid=0,fees=0;const purchases=[];
 for(const p of data){if(p.time<next)continue;const cost=price(p);if(cost<=0)continue;const fee=amount*feePct/100,qty=(amount-fee)/cost;units+=qty;paid+=amount;fees+=fee;purchases.push({time:p.time,price:cost,amount,fee,quantity:qty});next=p.time+every*DAY;}
 const last=price(data.at(-1)),lumpUnits=paid*(1-feePct/100)/price(data[0]);return{paid,units,fees,value:units*last,gain:units*last-paid,return:change(units*last,paid),lumpValue:lumpUnits*last,purchases,start:data[0].time,end:data.at(-1).time};
}
function riskSize({capital,riskPct,entry,stop,feePct=0,winRate=.5,payoff=1,fraction=.25,lot=1}){if([capital,riskPct,entry,stop,feePct,winRate,payoff,fraction,lot].some(v=>!Number.isFinite(v))||capital<=0||riskPct<=0||riskPct>100||entry<=0||stop<=0||entry===stop||feePct<0||winRate<0||winRate>1||payoff<=0||fraction<=0||fraction>1||lot<=0)throw Error('Check the risk inputs.');const budget=capital*riskPct/100,unitRisk=Math.abs(entry-stop)+(entry+stop)*feePct/100,kelly=Math.max(0,winRate-(1-winRate)/payoff);return{budget,quantity:budget/unitRisk,notional:budget/unitRisk*entry,kellyPct:kelly*100,allocated:capital*kelly*fraction,lotLoss:lot*unitRisk};}
function treasury({holdings,btcPrice,cost,cash,debt,preferred,marketCap,annualObligations,years=1}){if([holdings,btcPrice,cost,cash,debt,preferred,marketCap,annualObligations,years].some(v=>!Number.isFinite(v)||v<0)||btcPrice<=0)throw Error('Enter non-negative scenario values and a positive BTC price.');const gross=holdings*btcPrice,net=gross+cash-debt-preferred,gap=Math.max(0,annualObligations*years-cash);return{gross,net,pnl:gross-cost,mnav:net>0?marketCap/net:null,btcToSell:Math.min(holdings,gap/btcPrice),unfunded:Math.max(0,gap-gross)};}
module.exports={DAY,number,ratio,change,points,sma,cycleBands,relative,breadth,periodReturns,aggregateReturns,compound,correlation,macroCorrelation,blackScholes,optionSummary,optionScenario,dca,riskSize,treasury};
