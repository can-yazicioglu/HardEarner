// A display filter only. Tiny balances still contribute to wealth and exports.
function tinyAssetGroups(rows,fx=1){
 const groups=new Map();for(const h of rows){const k=[h.connectionId||'manual',h.type,h.asset].join(':');const g=groups.get(k)||{key:k,rows:[],value:0,known:true,connected:true};g.rows.push(h);g.connected&&=!!h.connected;g.known&&=h.value!=null&&Number.isFinite(h.value);g.value+=h.value||0;groups.set(k,g);}
 return [...groups.values()].filter(g=>g.connected&&g.known&&Number.isFinite(fx)&&fx>0&&g.value>=0&&g.value/fx<1);
}
module.exports={tinyAssetGroups};
