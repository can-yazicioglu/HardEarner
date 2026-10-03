// Workers supports manual/follow redirects, whereas the desktop uses redirect:error.
// Preserve the desktop's no-redirect guarantee without forwarding credentials elsewhere.
export async function fetch(input, options={}) {
  const url=new URL(input instanceof Request?input.url:String(input));
  // Binance documents this base endpoint for deployments where its primary host fails.
  if(url.hostname==='api.binance.com')url.hostname='api-gcp.binance.com';
  const target=input instanceof Request?new Request(url,input):url.toString();
  const response=await globalThis.fetch(target,{...options,redirect:'manual'});
  if(response.status>=300&&response.status<400){await response.body?.cancel();throw Error('Provider redirects are refused to protect account credentials.');}
  return response;
}
