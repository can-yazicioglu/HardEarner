// Binance identifiers include single-letter and UTF-8 symbols. Keep the exact
// identifier for quotes; never strip characters or merge different assets.
const RESERVED=new Set(['__proto__','prototype','constructor']);
function validAssetSymbol(value){return typeof value==='string'&&/^[\p{L}\p{N}][\p{L}\p{M}\p{N}._-]{0,63}$/u.test(value)&&!RESERVED.has(value);}
module.exports={validAssetSymbol};
