const unavailable=()=>{throw Error('This native operation is unavailable in a browser.');};
module.exports={randomUUID:()=>globalThis.crypto.randomUUID(),join:(...parts)=>parts.join('/'),createHmac:unavailable,createHash:unavailable,createPrivateKey:unavailable,createSign:unavailable,randomBytes:unavailable,createServer:unavailable};
