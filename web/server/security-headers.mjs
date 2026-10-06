export const appPolicy="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' wss://data-stream.binance.vision wss://ws.okx.com:8443 wss://stream.bybit.com; frame-src https://www.tradingview-widget.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";
export function assetHeaders(headers,pathname){
 headers.set('Content-Security-Policy',appPolicy);
 headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');
 return headers;
}
