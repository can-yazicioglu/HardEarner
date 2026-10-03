// Keep the last known quotes on partial failures, with the original quote times.
export function mergeMarket(previous,next){
 const merged={...previous,...next,crypto:{...previous.crypto,...next.crypto},metals:{...previous.metals,...next.metals},status:{...previous.status,...next.status}};
 if(next.status?.fx?.ok===false){merged.fx=previous.fx||next.fx;merged.fxDate=previous.fxDate;merged.fxFetched=previous.fxFetched;}
 if(next.status?.crypto?.ok===false){merged.usdtUSD=previous.usdtUSD;merged.usdtSource=previous.usdtSource;merged.cryptoCatalog=previous.cryptoCatalog;}
 for(const [name,status] of Object.entries(merged.status))if(!status.ok&&!status.at)merged.status[name]={...status,at:previous.status?.[name]?.at};
 return merged;
}
export function failedMarket(previous,error){return {...previous,status:Object.fromEntries([...new Set(['fx','crypto','XAU','XAG','XPT','XPD',...Object.keys(previous.status||{})])].map(name=>[name,{...previous.status?.[name],ok:false,error}]))};}
export function performanceMarket(market){
 const result=structuredClone(market);
 if(result.status?.crypto?.ok===false)result.crypto={};
 if(result.status?.fx?.ok===false)result.fx={USD:1};
 for(const asset of ['XAU','XAG','XPT','XPD'])if(result.status?.[asset]?.ok===false)delete result.metals?.[asset];
 return result;
}
