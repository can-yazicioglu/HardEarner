import React,{useEffect,useState} from 'react';
import {Mail,ArrowLeft,ShieldCheck} from 'lucide-react';
import {t as tr} from '../../desktop/src/i18n';
const api=window.hardearner;
export function PasswordReset({email,onCancel}){
 const [status,setStatus]=useState(null),[challenge,setChallenge]=useState(null),[code,setCode]=useState(''),[password,setPassword]=useState(''),[again,setAgain]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false),[clock,setClock]=useState(Date.now());
 useEffect(()=>{let alive=true;api.resetStatus().then(s=>alive&&setStatus(s)).catch(e=>alive&&setError(e.message));const timer=setInterval(()=>setClock(Date.now()),1000);return()=>{alive=false;clearInterval(timer)}},[]);
 const wait=Math.max(0,Math.ceil(((challenge?.resendAt||0)-clock)/1000));
 async function send(){setBusy(true);setError('');try{setChallenge(await api.startPasswordReset());setCode('')}catch(e){setError(e.message)}finally{setBusy(false)}}
 if(done)return <section className="password-reset" aria-label={tr('Password reset complete')}><ShieldCheck size={28}/><h1>{tr('Your new vault is ready')}</h1><p role="status">{tr('Sign in with your new vault password. Your previous encrypted vault is archived in Settings.')}</p><button className="button primary" onClick={onCancel}>{tr('Return to sign in')}</button></section>;
 return <section className="password-reset" aria-label={tr('Forgot vault password')}><button className="button subtle" disabled={busy} onClick={onCancel}><ArrowLeft size={16}/>{tr('Back to sign in')}</button><div className="app-lock-symbol"><Mail size={28}/></div><h1>{tr('Forgot your password?')}</h1><p>{tr('A one-time code will be sent only to your verified email.')}</p><small className="private-email">{email}</small>
 <div className="reset-warning"><strong>{tr('Start again with an empty vault')}</strong><p>{tr('Email verification cannot decrypt your old vault. Its holdings, connections, drawings and alerts will not move to the new vault. An encrypted archive is kept; restoring it still requires the old password.')}</p><p>{tr('If another device is still unlocked, keep it open and export your records before continuing.')}</p></div>
 {!challenge?<><label className="check-label reset-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>{tr('I understand that I will start with an empty vault.')}</span></label>{status&&!status.available&&<p role="status">{tr('Email reset is not available yet. Your vault has not changed.')}</p>}<button className="button primary" disabled={busy||!status?.available||!consent} onClick={send}>{tr(busy?'Please wait…':'Send reset code')}</button></>:<>
 <p role="status">{tr('Code sent. Check your inbox and spam folder. It expires in 10 minutes.')}</p>
 <form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await api.completePasswordReset(challenge,code,password,again);setCode('');setPassword('');setAgain('');setDone(true)}catch(e){setError(e.message)}finally{setBusy(false)}}}>
 <label>{tr('Email code')}<input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} required value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} disabled={busy}/></label>
 <label>{tr('New vault password')}<input type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={password} onChange={e=>setPassword(e.target.value)} disabled={busy}/></label>
 <label>{tr('Confirm vault password')}<input type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={again} onChange={e=>setAgain(e.target.value)} disabled={busy}/></label>
 <button className="button primary" disabled={busy||clock>=challenge.expiresAt}>{tr(busy?'Please wait…':'Verify code and create empty vault')}</button></form>
 {clock>=challenge.expiresAt&&<p role="status">{tr('This code has expired. Request a new code.')}</p>}<button className="button subtle" disabled={busy||wait>0} onClick={send}>{tr('Resend code')}{wait>0?` (${wait}s)`:''}</button></>}
 {error&&<p role="alert" className="inline-error">{tr(error)}</p>}</section>;
}
export function ResetArchives(){
 const [items,setItems]=useState([]),[error,setError]=useState('');
 useEffect(()=>{api.resetArchives().then(setItems).catch(e=>setError(e.message))},[]);
 if(!items.length&&!error)return null;
 return <details className="password-change"><summary>{tr('Encrypted archives from password resets')}</summary><p>{tr('These archives still require their original password. Download one and use Restore encrypted vault if you remember that password.')}</p>{items.map(item=><button className="button" key={item.id} onClick={()=>api.downloadResetArchive(item.id).catch(e=>setError(e.message))}>{tr('Download encrypted archive')} · {new Date(item.savedAt).toLocaleString()}</button>)}{error&&<p role="alert">{tr(error)}</p>}</details>;
}
