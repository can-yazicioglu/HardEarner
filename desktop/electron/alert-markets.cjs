const {validAssetSymbol}=require('./asset-symbol.cjs');
const {assetSymbol}=require('./kraken-assets.cjs');
function usdConfig(v){
 if(v?.venue!=='kraken'||v.type!=='crypto'||v.quote!=='USD'||!validAssetSymbol(v.asset))throw Error('Choose a supported USD alert market.');
 return{venue:'kraken',type:'crypto',asset:v.asset,quote:'USD',interval:'1m',style:'line'};
}
function createUsdQuotes(request){
 let catalogue,quotes,pending;
 async function load(){
  if(quotes&&Date.now()-quotes.at<20000)return quotes;
  if(pending)return pending;
  pending=(async()=>{
   if(!catalogue||Date.now()-catalogue.at>3600000){const d=await request('https://api.kraken.com/0/public/AssetPairs');if(!Array.isArray(d.error)||d.error.length||!d.result)throw Error('Kraken USD markets are unavailable.');
    const pairs={};for(const [id,p]of Object.entries(d.result)){if(p.wsname?.endsWith('/USD')&&p.status==='online'&&!id.endsWith('.d')){const asset=assetSymbol(p.wsname.split('/')[0]);pairs[asset]=id;}}catalogue={at:Date.now(),pairs};}
   const d=await request('https://api.kraken.com/0/public/Ticker');if(!Array.isArray(d.error)||d.error.length||!d.result)throw Error('Kraken USD prices are unavailable.');
   quotes={at:Date.now(),result:d.result};return quotes;
  })();try{return await pending}finally{pending=null}
 }
 return async input=>{const c=usdConfig(input),q=await load(),id=catalogue.pairs[c.asset],value=Number(q.result[id]?.c?.[0]);if(!id||!Number.isFinite(value)||value<=0)throw Error('This asset has no available Kraken USD spot market.');return{value,at:q.at,source:'Kraken',quote:'USD',timestampKind:'observed'};};
}
function parseAlertTable(text){
 if(typeof text!=='string'||text.length>20000)throw Error('Paste a table with Asset, Buy below and Sell above columns.');
 const lines=text.trim().split(/\r?\n/).filter(x=>x.trim()),out=[];
 for(const [i,line]of lines.entries()){
  const cells=line.trim().split(/[\t,;]/).map(s=>s.trim());
  if(i===0&&/^(coin|asset)$/i.test(cells[0]))continue;
  const [asset,buy,sell]=cells;if(cells.length<2||cells.length>3||!validAssetSymbol(asset)||asset!==asset.toUpperCase())throw Error('Use uppercase asset symbols and two or three columns.');
  for(const [v,intent,condition]of [[buy,'BUY','below'],[sell,'SELL','above']]){if(!v||['—','-'].includes(v))continue;if(!/^\d+(?:\.\d+)?$/.test(v)||!Number.isFinite(Number(v))||Number(v)<=0)throw Error('Enter prices without thousands separators, for example 82000 or 0.00000395.');out.push({config:{venue:'kraken',type:'crypto',asset,quote:'USD'},price:Number(v),intent,condition});}
 }
 if(!out.length||out.length>100)throw Error('Choose between 1 and 100 price alerts.');
 const keys=out.map(a=>[a.config.asset,a.intent,a.condition,a.price].join(':'));if(new Set(keys).size!==keys.length)throw Error('The table contains duplicate alerts.');return out;
}
module.exports={usdConfig,createUsdQuotes,parseAlertTable};
