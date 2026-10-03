import {securitiesData} from './securities-data.mjs';
import {authenticate} from './access.mjs';
import {boundedJson,requireSameOrigin,json,HttpError} from './http.mjs';
import {MAX_CIPHERTEXT} from '../shared/envelope.mjs';
import market from '../../desktop/electron/market.cjs';
import analysis from '../../desktop/electron/analysis.cjs';
import metals from '../../desktop/electron/metal-session.cjs';
import {validAssetSymbol} from '../../desktop/electron/asset-symbol.cjs';
export {UserVault} from './user-vault.mjs';
export async function handle(request,env,identity){
  const url=new URL(request.url);
  if(url.pathname.startsWith('/api/')&&url.search)throw new HttpError(400,'Parameters belong in the request body.');
  if(url.pathname==='/api/session'&&request.method==='GET')return json({...identity,version:'2.13.1-web',closedBrowserAlerts:false});
  const vault=env.VAULTS.getByName(identity.id);
  if(url.pathname==='/api/vault'&&request.method==='GET')return json(vault?await vault.read():null);
  if(!url.pathname.startsWith('/api/')){
    if(request.method!=='GET'&&request.method!=='HEAD')throw new HttpError(405,'Method not allowed.');
    const response=await env.ASSETS.fetch(request),headers=new Headers(response.headers);
    // All routes, including static files and alternate hosts, require verified Access identity.
    headers.set('Cache-Control','private, no-store');headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
    return new Response(response.body,{status:response.status,headers});
  }
  if(!['POST','PUT'].includes(request.method))throw new HttpError(405,'Method not allowed.');
  requireSameOrigin(request);
  const input=await boundedJson(request,url.pathname==='/api/securities-data'?16384:url.pathname==='/api/market'?100000:MAX_CIPHERTEXT+8192);
  if(url.pathname==='/api/vault'&&request.method==='PUT'){
    const result=await vault.write(input);return json(result,result.conflict?409:200);
  }
  if(url.pathname==='/api/accounts'&&request.method==='POST'){
    const result=await vault.account(input);return json(result,result.status||200);
  }
  if(url.pathname==='/api/securities-data'&&request.method==='POST')return json(await securitiesData(input));
  if(url.pathname==='/api/market'&&request.method==='POST'){
    if(!input||!Array.isArray(input.args)||input.args.length>4)throw new HttpError(400,'Invalid market request.');
    const args=input.args;let value;
    switch(input.op){
      case 'refresh':{const assets=args[0]||[];if(!Array.isArray(assets)||assets.length>200||assets.some(a=>!validAssetSymbol(a)))throw new HttpError(400,'Invalid market selection.');value=await market.refresh({},assets,true);break;}
      case 'history':value=await market.history(...args);break;
      case 'activity':value=await market.activity(...args);break;
      case 'costRates':value=await market.costRates(...args);break;
      case 'analysisHistory':value=await analysis.history(...args);break;
      case 'quote':value=await analysis.quote(...args);break;
      case 'metalSession':value=await metals.sample(...args);break;
      default:throw new HttpError(400,'Unsupported market operation.');
    }
    return json(value);
  }
  throw new HttpError(404,'Unknown endpoint.');
}
export default {async fetch(request,env){
  try{return await handle(request,env,await authenticate(request,env));}
  catch(error){return json({error:error instanceof HttpError?error.message:'The request could not be completed. Your saved vault was not reset.'},error instanceof HttpError?error.status:400);}
}};
