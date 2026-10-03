import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteRequest,securitiesData} from '../server/securities-data.mjs';
const key='FIXTURE_ONLY_NOT_A_REAL_KEY';
const input={endpoint:'/quote',parameters:{symbol:'AAPL',exchange:'NASDAQ',apikey:key}};
test('investment relay restricts requests to documented read-only provider endpoints',()=>{
 assert.equal(new URL(quoteRequest(input)).hostname,'api.twelvedata.com');
 for(const endpoint of ['https://evil.invalid/quote','/orders','/quote/../order','/quote?x=1'])assert.throws(()=>quoteRequest({...input,endpoint}));
 for(const parameters of [{...input.parameters,url:'https://evil.invalid'},{...input.parameters,symbol:'AAPL&apikey=other'},{...input.parameters,exchange:'../secret'},{...input.parameters,apikey:'bad'}])assert.throws(()=>quoteRequest({...input,parameters}));
});
test('daily histories and searches have bounded sizes and explicit split adjustment',()=>{
 const h={endpoint:'/time_series',parameters:{...input.parameters,interval:'1day',outputsize:'271',timezone:'UTC',adjust:'splits'}};
 assert.equal(new URL(quoteRequest(h)).searchParams.get('adjust'),'splits');
 for(const parameters of [{...h.parameters,outputsize:'1001'},{...h.parameters,interval:'1s'},{...h.parameters,adjust:'none'},{...h.parameters,timezone:'local'}])assert.throws(()=>quoteRequest({...h,parameters}));
 assert(quoteRequest({endpoint:'/symbol_search',parameters:{symbol:'Apple Inc',outputsize:'30',apikey:key}}));
 assert.throws(()=>quoteRequest({endpoint:'/symbol_search',parameters:{symbol:'a',outputsize:'300',apikey:key}}));
});
test('relay blocks redirects and keeps credentials out of network errors',async()=>{
 let observed;
 assert.deepEqual(await securitiesData(input,{fetcher:async(url,options)=>{observed={url,options};return {ok:true,json:async()=>({close:100})}}}),{close:100});
 assert.equal(observed.options.method,'GET');assert.equal(observed.options.redirect,'error');assert(observed.options.signal);
 await assert.rejects(securitiesData(input,{fetcher:async()=>{throw Error(key)}}),e=>e.status===502&&!e.message.includes(key));
 await assert.rejects(securitiesData(input,{fetcher:async()=>({ok:false,status:429})}),e=>e.status===429);
 await assert.rejects(securitiesData(input,{fetcher:async()=>({ok:true,json:async()=>{throw Error(key)}})}),e=>!e.message.includes(key));
});
