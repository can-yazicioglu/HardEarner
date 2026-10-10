// A one-use handoff to the exact same-origin window opened by the unlocked app.
// The password, decrypted records and keys are never placed in URLs or storage.
// CryptoKey is non-extractable; the child decrypts its own authenticated envelope.
export function researchSession({win=window,getSession,acceptSession,onLock,now=()=>Date.now()}){
 const pending=new Map();let disposed=false;
 const receive=async event=>{
  if(disposed||event.origin!==win.location.origin||event.data?.type!=='hardearner-research-handoff')return;
  const entry=pending.get(event.data.token);
  if(!entry||entry.child!==event.source||entry.until<now()||!event.ports?.[0])return;
  pending.delete(event.data.token);
  const port=event.ports[0];try{const session=await getSession();if(session&&entry.until>=now())port.postMessage(session);else port.postMessage(null);}catch{port.postMessage(null)}finally{port.close()}
 };
 win.addEventListener('message',receive);
 function open(){
  for(const [token,e] of pending)if(e.until<now()||e.child.closed)pending.delete(token);
  const token=win.crypto.randomUUID(),child=win.open(win.location.origin+'/#research?handoff='+token,'_blank');
  if(!child)throw Error('Allow HardEarner to open the Research window.');
  pending.set(token,{child,until:now()+15000});return true;
 }
 async function accept(){
  const match=win.location.hash.match(/^#research\?handoff=([0-9a-f-]{36})$/);
  if(!match||!win.opener)return false;
  const opener=win.opener;win.history.replaceState(null,'','#research');
  const session=await new Promise(resolve=>{
   const channel=new MessageChannel();let finished=false;
   const end=value=>{if(finished)return;finished=true;clearTimeout(timer);channel.port1.close();resolve(value)};
   const timer=setTimeout(()=>end(null),15000);
   channel.port1.onmessage=e=>end(e.data);
   opener.postMessage({type:'hardearner-research-handoff',token:match[1]},win.location.origin,[channel.port2]);
  });
  win.opener=null;
  if(!session)return false;
  try{await acceptSession(session);return true}catch{return false}
 }
 let locks=null;
 function bind(identity){locks?.close();locks=new BroadcastChannel('hardearner-lock-'+identity);locks.onmessage=e=>{if(e.data==='lock'){pending.clear();onLock()}}}
 return{open,accept,bind,lock(){pending.clear();locks?.postMessage('lock')},dispose(){disposed=true;pending.clear();locks?.close();win.removeEventListener('message',receive)}};
}
