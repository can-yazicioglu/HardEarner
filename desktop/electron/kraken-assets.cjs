const {validAssetSymbol}=require('./asset-symbol.cjs');
const aliases={XBT:'BTC',XXBT:'BTC',XDG:'DOGE',XXDG:'DOGE',XETH:'ETH',ZUSD:'USD',ZGBP:'GBP',ZEUR:'EUR',ZCAD:'CAD',ZJPY:'JPY',ZCHF:'CHF',ZAUD:'AUD'};
function assetSymbol(raw,assets={}){
 if(typeof raw!=='string')throw Error('Invalid Kraken asset.');
 const suffix=/\.(B|F|S|M)$/.exec(raw),base=suffix?raw.slice(0,-2):raw;
 const mapped=(assets[base]?.altname||base).replace(/\.(B|F|S|M)$/,'');
 const asset=aliases[mapped]||mapped;
 if(!validAssetSymbol(asset)||/\.T$/.test(asset))throw Error('Some Kraken transactions use an unsupported ledger asset.');
 return asset;
}
module.exports={assetSymbol};
