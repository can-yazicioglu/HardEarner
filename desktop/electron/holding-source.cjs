const labels={trading212:'Trading 212',binance:'Binance.com',binancetr:'Binance TR',btcturk:'BtcTurk',paribu:'Paribu',kraken:'Kraken',coinbase:'Coinbase',okx:'OKX',monzo:'Monzo',starling:'Starling Bank',truelayer:'UK bank'};
function holdingSource(h){
 if(h.connected)return labels[h.sourceKind]||h.sourceLabel||h.location||'Connected account';
 if(h.storageType==='physical')return 'Physical';
 if(h.location?.trim())return h.location.trim();
 if(h.storageType)return{bank:'Bank',exchange:'Exchange',wallet:'Personal wallet',other:'Other location'}[h.storageType]||'Manual';
 return h.type==='metal'?'Physical':'Manual';
}
function sourceKey(h){return h.connected?'account:'+h.connectionId:'manual:'+holdingSource(h).toLowerCase();}
module.exports={holdingSource,sourceKey};
