// Fan out a single public subscription per venue/asset/interval to its panels.
function sharedStreams(factory,{emit,...options}){
 const members=new Map(),groups=new Map();let sequence=0;
 const raw=factory({...options,emit:(id,value)=>{const g=groups.get(id);if(!g)return;g.latest=value;for(const member of g.members)emit(member,value)}});
 function stop(id){const group=members.get(id);if(!group)return;members.delete(id);const g=groups.get(group);g.members.delete(id);if(!g.members.size){raw.stop(group);groups.delete(group)}}
 function start(id,input){
  if(typeof id!=='string'||!/^[a-z0-9-]{1,80}$/i.test(id))throw Error('Invalid stream identifier.');
  const c=require('./analysis.cjs').config(input),key=[c.venue,c.asset,c.interval,c.type,c.quote].join(':');
  stop(id);if(members.size>=32)throw Error('Too many chart subscribers.');
  let g=[...groups.values()].find(g=>g.key===key);
  if(g){members.set(id,g.id);g.members.add(id);if(g.latest)emit(id,g.latest);return true}
  g={id:'shared-'+(++sequence),key,members:new Set([id]),latest:null};groups.set(g.id,g);members.set(id,g.id);
  try{return raw.start(g.id,c)}catch(e){stop(id);throw e}
 }
 return{start,stop,stopAll(){for(const id of [...members.keys()])stop(id)}};
}
module.exports={sharedStreams};
