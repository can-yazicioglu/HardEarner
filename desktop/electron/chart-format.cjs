const precision=value=>Math.max(2,Math.min(10,Math.ceil(-Math.log10(value))+3));
function chartPrice(value,locale='en-GB'){return Number.isFinite(value)&&value>0?new Intl.NumberFormat(locale,{maximumFractionDigits:precision(value)}).format(value):'—'}
function asDate(time){return typeof time==='number'?new Date(time*1000):typeof time==='string'?new Date(time+'T00:00:00Z'):new Date(Date.UTC(time.year,time.month-1,time.day))}
function axisTime(time,type,locale='en-GB',timeZone){const options=type===0?{year:'numeric'}:type===1?{month:'short'}:type===2?{day:'numeric',month:'short'}:{hour:'2-digit',minute:'2-digit',hourCycle:'h23',...(type===4?{second:'2-digit'}:{})};return new Intl.DateTimeFormat(locale,{...options,...(timeZone?{timeZone}:{})}).format(asDate(time))}
function crosshairTime(time,locale='en-GB',timeZone){return new Intl.DateTimeFormat(locale,{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'short',...(timeZone?{timeZone}:{})}).format(asDate(time))}
module.exports={precision,chartPrice,axisTime,crosshairTime};
