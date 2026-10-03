import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetch as platformFetch} from '../server/platform-fetch.mjs';
test('cloud requests use documented Binance base and never follow credential redirects',async()=>{
 const original=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response('{}')};
  await platformFetch('https://api.binance.com/api/v3/account?signature=fixture',{redirect:'error',headers:{'X-MBX-APIKEY':'test-only'}});
  assert.equal(calls[0].url,'https://api-gcp.binance.com/api/v3/account?signature=fixture');assert.equal(calls[0].options.redirect,'manual');
  globalThis.fetch=async()=>new Response(null,{status:302,headers:{Location:'https://attacker.invalid'}});
  await assert.rejects(()=>platformFetch('https://api.kraken.com/0/private/Balance',{headers:{'API-Key':'fixture'}}),/redirects are refused/);
 }finally{globalThis.fetch=original}
});
