import {test} from 'node:test';
import assert from 'node:assert/strict';
import {researchSession} from '../client/research-session.mjs';
function windowMock(){const handlers=new Map(),children=[];return{location:{origin:'https://private.example',hash:''},crypto,handlers,children,addEventListener:(n,f)=>handlers.set(n,f),removeEventListener:n=>handlers.delete(n),open(url){const child={url,closed:false};children.push(child);return child;}}}
test('Research handoff is exact-origin, exact-child, one-use and time limited',async()=>{
 const w=windowMock();let clock=10,calls=0;const s=researchSession({win:w,now:()=>clock,getSession:async()=>{calls++;return{opaque:'test-session'}},onLock(){}});s.open();const child=w.children[0],token=child.url.split('handoff=')[1],outputs=[];const event={origin:w.location.origin,source:child,data:{type:'hardearner-research-handoff',token},ports:[{postMessage:v=>outputs.push(v),close(){}}]},receive=w.handlers.get('message');
 await receive({...event,origin:'https://evil.example'});await receive({...event,source:{}});await receive({...event,data:{...event.data,token:'wrong'}});assert.equal(calls,0);
 await receive(event);assert.equal(calls,1);assert.deepEqual(outputs,[{opaque:'test-session'}]);await receive(event);assert.equal(calls,1);
 s.open();const late=w.children[1];clock+=15001;await receive({...event,source:late,data:{...event.data,token:late.url.split('handoff=')[1]}});assert.equal(calls,1);s.dispose();assert.equal(w.handlers.size,0);
});
test('child gets a nonextractable key through a port, cleans URL and detaches opener',async()=>{
 const k=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),w=windowMock();w.location.hash='#research?handoff='+crypto.randomUUID();w.history={replaceState(a,b,hash){w.location.hash=hash}};
 w.opener={postMessage(d,origin,ports){assert.equal(origin,w.location.origin);assert.equal(d.type,'hardearner-research-handoff');ports[0].postMessage({key:k,identity:'test'});ports[0].close()}};
 let received;const s=researchSession({win:w,getSession(){},acceptSession:v=>{received=v},onLock(){}});assert.equal(await s.accept(),true);assert.equal(w.location.hash,'#research');assert.equal(w.opener,null);assert.equal(received.key.extractable,false);assert.equal(received.key.algorithm.name,'AES-GCM');await assert.rejects(crypto.subtle.exportKey('raw',received.key));s.dispose();
});
test('explicit lock cancels pending handoffs and propagates only within the bound identity',async()=>{
 const w=windowMock();let calls=0,otherLocked=false,resolve;const signal=new Promise(r=>{resolve=r});const a=researchSession({win:w,getSession:()=>{calls++},onLock(){}}),b=researchSession({win:windowMock(),onLock:resolve}),c=researchSession({win:windowMock(),onLock:()=>{otherLocked=true}});
 a.bind('session-test-a');b.bind('session-test-a');c.bind('session-test-b');a.open();const child=w.children[0];a.lock();await w.handlers.get('message')({origin:w.location.origin,source:child,data:{type:'hardearner-research-handoff',token:child.url.split('handoff=')[1]},ports:[{postMessage(){},close(){}}]});assert.equal(calls,0);
 await signal;assert.equal(otherLocked,false);a.dispose();b.dispose();c.dispose();
});
