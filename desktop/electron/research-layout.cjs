const LAYOUTS={'1':1,'2h':2,'2v':2,'3':3,'4':4,'6':6,'8':8};
function layout(input={}){
 const mode=input.mode||'1';if(!Object.hasOwn(LAYOUTS,mode))throw Error('Choose a supported chart layout.');
 const sync={symbol:input.sync?.symbol===true,interval:input.sync?.interval===true,range:input.sync?.range===true};
 return{mode,sync,widths:Array.from({length:LAYOUTS[mode]},(_,i)=>!['1','2v'].includes(mode)&&input.widths?.[i]===2?2:1)};
}
function changePanel(panels,index,next,sync={}){return panels.map((p,i)=>i===index?next:{...p,...(sync.symbol?{asset:next.asset,type:next.type,venue:next.venue,quote:next.quote}:{}),...(sync.interval?{interval:next.interval,range:next.range}:{})})}
module.exports={LAYOUTS,layout,changePanel};
