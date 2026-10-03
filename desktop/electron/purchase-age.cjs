function ageParts(date,now=new Date()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;
 const start=new Date(date+'T00:00:00Z');if(!Number.isFinite(+start)||start.toISOString().slice(0,10)!==date)return null;
 const end=new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()));if(start>end)return null;
 const days=Math.floor((end-start)/86400000);let years=end.getUTCFullYear()-start.getUTCFullYear();if(end.getUTCMonth()<start.getUTCMonth()||(end.getUTCMonth()===start.getUTCMonth()&&end.getUTCDate()<start.getUTCDate()))years--;
 let months=(end.getUTCFullYear()-start.getUTCFullYear())*12+end.getUTCMonth()-start.getUTCMonth();if(end.getUTCDate()<start.getUTCDate())months--;
 return {days,years,months};
}
module.exports={ageParts};
