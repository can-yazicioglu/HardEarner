import React,{useEffect,useState} from 'react';
import {LockKeyhole,ShieldCheck,ArrowRight} from 'lucide-react';
import {api} from './shared';
import {t as tr,setLanguage} from './i18n';
import './app-lock.css';
const message=e=>e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/,'');
export function AppGate({children}){
 const [status,setStatus]=useState(null),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[clock,setClock]=useState(Date.now());
 useEffect(()=>{let alive=true;const update=s=>{if(alive){if(s.language)setLanguage(s.language);setStatus(s);setPassword('');setConfirmation('');setError('')}};const stop=api.onAuthState(update);api.authStatus().then(update).catch(e=>setError(message(e)));return()=>{alive=false;stop()}},[]);
 useEffect(()=>{if(!status?.locked)return;const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer)},[status?.locked]);
 if(status&&!status.locked)return children;
 const setup=status?.setupRequired,wait=Math.max(0,Math.ceil(((status?.retryAt||0)-clock)/1000));
 return <main className="app-lock-screen"><section className="app-lock-card"><div className="app-lock-brand"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><rect width="40" height="40" rx="11" fill="#172e59"/><path d="M10 29V11h5v7h10v-7h5v18h-5v-7H15v7z" fill="#cedfff"/><path d="M21 11h9v9" stroke="#719fff" strokeWidth="3"/><path d="m19 22 10-10" stroke="#719fff" strokeWidth="3"/></svg><strong>HardEarner</strong></div><div className="app-lock-symbol"><LockKeyhole size={28}/></div><h1>{tr(setup?'Protect your HardEarner':'Welcome back')}</h1><p>{tr(setup?'Create a password to open this desktop app.':'Enter your password to see your money and accounts.')}</p>
 {status&&!status.error&&<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{setStatus(await (setup?api.authSetup(password,confirmation):api.authUnlock(password)));setPassword('');setConfirmation('')}catch(e){setError(message(e));try{setStatus(await api.authStatus())}catch{}}finally{setBusy(false)}}}>
 <label>{tr(setup?'New password':'Password')}<input aria-label={tr('Password')} type="password" autoFocus autoComplete={setup?'new-password':'current-password'} minLength={setup?10:undefined} maxLength={256} value={password} required disabled={busy||wait>0} onChange={e=>setPassword(e.target.value)}/></label>
 {setup&&<label>{tr('Confirm password')}<input aria-label={tr('Confirm password')} type="password" autoComplete="new-password" minLength={10} maxLength={256} required value={confirmation} disabled={busy} onChange={e=>setConfirmation(e.target.value)}/></label>}
 {setup&&<small>{tr('Use at least 10 characters. Keep your password safe: there is no online password reset.')}</small>}
 {wait>0&&<p role="status">{tr('Try again in')} {wait} s</p>}
 <button className="button primary" disabled={busy||wait>0}>{tr(busy?'Please wait…':setup?'Set password & open':'Unlock HardEarner')}<ArrowRight size={17}/></button></form>}
 {(error||status?.error)&&<p className="inline-error" role="alert">{tr(error||status.error)}</p>}
 <p className="app-lock-foot"><ShieldCheck size={16}/>{tr('App access is password protected. Saved data and API keys use your Windows account encryption.')}</p>
 {!setup&&<small>{tr('Closing to the tray locks the window. Account sync and alerts continue while this computer is awake.')}</small>}
 </section><small className="app-lock-credit">Can Yazicioglu · Hard-Earned Money needs attention.</small></main>;
}
export function PasswordSettings(){
 const [current,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 return <section className="panel settings-panel"><h2><LockKeyhole size={20}/> {tr('App password')}</h2><p>{tr('HardEarner locks when you close to the tray, lock Windows, or put this computer to sleep.')}</p><button className="button" onClick={()=>api.authLock().catch(e=>setNotice(message(e)))}>{tr('Lock now')}</button><details className="password-change"><summary>{tr('Change password')}</summary><form onSubmit={async e=>{e.preventDefault();setBusy(true);setNotice('');try{await api.authChange(current,password,confirmation);setCurrent('');setPassword('');setConfirmation('');setNotice('Password changed.')}catch(e){setNotice(message(e))}finally{setBusy(false)}}}><div className="form-grid"><label>{tr('Current password')}<input type="password" autoComplete="current-password" maxLength={256} required value={current} onChange={e=>setCurrent(e.target.value)}/></label><label>{tr('New password')}<input type="password" autoComplete="new-password" minLength={10} maxLength={256} required value={password} onChange={e=>setPassword(e.target.value)}/></label><label>{tr('Confirm password')}<input type="password" autoComplete="new-password" minLength={10} maxLength={256} required value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label></div><button className="button primary" disabled={busy}>{tr('Change password')}</button></form></details>{notice&&<p role="status">{tr(notice)}</p>}<small>{tr('This password protects app access on this Windows account. It does not password-encrypt exports or protect against someone who can modify the app files.')}</small></section>;
}
