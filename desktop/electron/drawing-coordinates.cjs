// Freehand points use fractional market time so they stay anchored through pan/zoom
// and retain detail between candles, including across weekends in reference charts.
function logicalToTime(logical,bars,step){
 if(!Number.isFinite(logical)||!bars.length)return null;
 const i=Math.floor(logical),fraction=logical-i;
 if(i<0)return bars[0].time+logical*step;
 if(i>=bars.length-1)return bars.at(-1).time+(logical-bars.length+1)*step;
 return bars[i].time+fraction*(bars[i+1].time-bars[i].time);
}
function timeToLogical(time,bars,step){
 if(!Number.isFinite(time)||!bars.length)return null;
 if(time<=bars[0].time)return (time-bars[0].time)/step;
 if(time>=bars.at(-1).time)return bars.length-1+(time-bars.at(-1).time)/step;
 let lo=0,hi=bars.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(bars[mid].time<=time)lo=mid;else hi=mid;}
 return lo+(time-bars[lo].time)/(bars[hi].time-bars[lo].time);
}
module.exports={logicalToTime,timeToLogical};
