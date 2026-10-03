// Authenticated, same-origin relay. Never accepts an arbitrary URL or trading request.
import {HttpError} from './http.mjs';
const token=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,45}$/.test(v);
export function quoteRequest(input){
  const p=input?.parameters,endpoint=input?.endpoint;
  if(!p||typeof p!=='object'||!['/quote','/symbol_search','/time_series'].includes(endpoint)||typeof p.apikey!=='string'||!(/^[A-Za-z0-9_-]{16,160}$/.test(p.apikey)))throw new HttpError(400,'Invalid investment data request.');
  const allowed=endpoint==='/quote'?['symbol','exchange','apikey']:endpoint==='/symbol_search'?['symbol','outputsize','apikey']:['symbol','exchange','interval','outputsize','timezone','adjust','apikey'];
  if(Object.keys(p).some(k=>!allowed.includes(k)))throw new HttpError(400,'Unsupported investment data parameter.');
  if(endpoint==='/symbol_search'){
    if(typeof p.symbol!=='string'||p.symbol.trim().length<2||p.symbol.length>80||p.outputsize!=='30')throw new HttpError(400,'Invalid investment search.');
  }else if(!token(p.symbol)||!token(p.exchange))throw new HttpError(400,'Invalid investment listing.');
  if(endpoint==='/time_series'&&(p.interval!=='1day'||p.timezone!=='UTC'||p.adjust!=='splits'||!/^\d{1,4}$/.test(p.outputsize)||Number(p.outputsize)<1||Number(p.outputsize)>1000))throw new HttpError(400,'Invalid investment history request.');
  return 'https://api.twelvedata.com'+endpoint+'?'+new URLSearchParams(p);
}
export async function securitiesData(input,{fetcher=fetch}={}){
  const url=quoteRequest(input);let r;
  try{r=await fetcher(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000)})}catch{throw new HttpError(502,'Investment data is unavailable. Saved quotes were kept.');}
  if(!r.ok)throw new HttpError(r.status===429?429:502,'Investment data access or request limit failed. Check your key and plan.');
  try{return await r.json()}catch{throw new HttpError(502,'Invalid investment data response.');}
}
