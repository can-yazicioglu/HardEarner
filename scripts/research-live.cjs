// Opt-in public-data smoke checks. Never reads account profiles or credentials.
const fs=require('node:fs'),path=require('node:path');
const {createLab}=require('../desktop/electron/research-lab.cjs');
const service=createLab(),results=[];
(async()=>{for(const kind of process.argv.slice(2).length?process.argv.slice(2):['sentiment','radar','cycles','returns','fees','chainfees','yield','defi','stablecoins','options','ratios','derivatives','premium','hypermarkets','trades','filings','secHoldings']){
 const r=await service.query(kind,{asset:'BTC',period:'1y'});const entry={kind,state:r.state,source:r.data?.source,unit:r.data?.unit,at:r.data?.at,fetchedAt:r.fetchedAt,rows:r.data?.rows?.length,series:r.data?.series?.map(s=>({name:s.name,points:s.points.length})),message:r.message||r.required};results.push(entry);console.log(JSON.stringify(entry));}
 const dir=path.join(__dirname,'../.artifacts');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'research-lab-live.json'),JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));})();
