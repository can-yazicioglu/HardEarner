const {number:n}=require('./research-math.cjs');
const decode=s=>String(s||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").trim();
function tag(xml,name){return decode(xml.match(new RegExp('<(?:[\\w-]+:)?'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?'+name+'>','i'))?.[1]?.replace(/<[^>]*>/g,''))}
function holdings(xml,{filingDate,reportDate,evidence}={}){
 if(typeof xml!=='string'||xml.length>12000000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Unsupported SEC XML.');
 // Only modern filings use dollar values. Older filings need their own schema adapter.
 if(!filingDate||filingDate<'2023-01-03')throw Error('Legacy thousand-dollar filings are not supported by this comparison.');
 const blocks=[...xml.matchAll(/<(?:[\w-]+:)?infoTable(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w-]+:)?infoTable>/gi)];
 if(!blocks.length)throw Error('SEC information table was not found.');
 const map=new Map();for(const[,b]of blocks){const cusip=tag(b,'cusip'),issuer=tag(b,'nameOfIssuer'),className=tag(b,'titleOfClass'),putCall=tag(b,'putCall'),shares=n(tag(b,'sshPrnamt')),value=n(tag(b,'value')),shareType=tag(b,'sshPrnamtType');if(!cusip||shares===null||value===null||shares<0||value<0)throw Error('Invalid SEC holding value.');const id=[cusip,className,putCall,shareType].join(':');const previous=map.get(id);map.set(id,{id,cusip,issuer,className,putCall,shareType,shares:shares+(previous?.shares||0),value:value+(previous?.value||0),filingDate,reportDate,evidence});}
 const rows=[...map.values()],total=rows.reduce((s,r)=>s+r.value,0);return rows.map(r=>({...r,weight:total>0?r.value/total*100:null}));
}
function compare(current,previous){const old=new Map(previous.map(r=>[r.id,r])),seen=new Set();return[...current.map(r=>{seen.add(r.id);const p=old.get(r.id),delta=p?r.shares-p.shares:null;return{...r,previousShares:p?.shares??null,change:!p?'new disclosure':delta>0?'increase (check splits)':delta<0?'decrease (check splits)':'unchanged',delta,previousWeight:p?.weight??null}}),...previous.filter(r=>!seen.has(r.id)).map(r=>({...r,shares:0,value:0,weight:0,previousShares:r.shares,delta:-r.shares,change:'no longer disclosed'}))]}
async function load13F(c,get){
 const d=await get('https://data.sec.gov/submissions/CIK'+c.cik+'.json'),f=d.filings?.recent;if(!Array.isArray(f?.form))throw Error('SEC submissions unavailable.');
 const reports=[];for(let i=0;i<f.form.length&&reports.length<2;i++){if(f.form[i]!=='13F-HR'||!f.reportDate[i]||reports.some(r=>r.reportDate===f.reportDate[i]))continue;reports.push({filingDate:f.filingDate[i],reportDate:f.reportDate[i],accession:f.accessionNumber[i]});}
 if(!reports.length)throw Error('No recent 13F report for this manager.');
 const parsed=[];for(const r of reports){if(!/^\d{10}-\d{2}-\d{6}$/.test(r.accession))throw Error('Invalid SEC accession.');const base='https://www.sec.gov/Archives/edgar/data/'+Number(c.cik)+'/'+r.accession.replaceAll('-','')+'/';const index=await get(base+'index.json');const candidates=(index.directory?.item||[]).filter(f=>/^[\w.-]+\.xml$/i.test(f.name)&&!/^primary_doc/i.test(f.name)).slice(0,4);let rows=null;for(const file of candidates){try{rows=holdings(await get(base+file.name,{text:true}),{...r,evidence:base+file.name});break}catch{}}if(!rows)throw Error('Compatible 13F holdings XML is unavailable. The filing links remain available.');parsed.push(rows);}
 return{rows:parsed[1]?compare(parsed[0],parsed[1]):parsed[0],reports,name:d.name,amendments:f.form.filter((form,i)=>form==='13F-HR/A'&&reports.some(r=>r.reportDate===f.reportDate[i])).length};
}
module.exports={holdings,compare,load13F};
