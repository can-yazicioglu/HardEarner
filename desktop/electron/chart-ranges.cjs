const RANGES={'1W':{label:'1 week',days:7,interval:'1h'},'2W':{label:'2 weeks',days:14,interval:'1h'},'1M':{label:'1 month',months:1,interval:'4h'},'3M':{label:'3 months',months:3,interval:'1d'},'6M':{label:'6 months',months:6,interval:'1d'},'1Y':{label:'1 year',months:12,interval:'1d'}};
const SECONDS={'1s':1,'5s':5,'1m':60,'5m':300,'15m':900,'1h':3600,'4h':14400,'1d':86400};
function rangeStart(range,now=Date.now()){
 const r=RANGES[range];if(!r)return null;
 if(r.days)return Math.floor((now-r.days*86400000)/1000);
 const date=new Date(now),day=date.getUTCDate();date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()-r.months);
 const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,last));
 return Math.floor(date.getTime()/1000);
}
module.exports={RANGES,SECONDS,rangeStart};
