import React,{useSyncExternalStore} from 'react';
import {Moon,Sun} from 'lucide-react';
const listeners=new Set();
let theme='dark';
try{theme=localStorage.getItem('hardearner-theme')==='light'?'light':'dark'}catch{}
function apply(){window.hardearner?.setTheme?.(theme)?.catch(()=>{});document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='light'?'#f6f7f9':'#09090b');}
apply();
function publish(value){theme=value==='light'?'light':'dark';apply();for(const f of listeners)f();window.dispatchEvent(new CustomEvent('hardearner-theme',{detail:theme}));}
window.addEventListener('storage',e=>{if(e.key==='hardearner-theme')publish(e.newValue)});
export function useTheme(){return useSyncExternalStore(f=>{listeners.add(f);return()=>listeners.delete(f)},()=>theme)}
export function ThemeToggle(){const value=useTheme(),tr=document.documentElement.lang==='tr';return <button className="icon-button theme-toggle" aria-label={tr?(value==='dark'?'Açık temaya geç':'Koyu temaya geç'):(value==='dark'?'Switch to light theme':'Switch to dark theme')} title={tr?'Görünüm':'Appearance'} onClick={()=>{const next=value==='dark'?'light':'dark';try{localStorage.setItem('hardearner-theme',next)}catch{}publish(next)}}>{value==='dark'?<Sun size={17}/>:<Moon size={17}/>}</button>}
export function chartTheme(value){return value==='light'?{background:'#ffffff',text:'#3f4654',grid:'#edf0f4',border:'#d9dee7'}:{background:'#111115',text:'#b6b7c4',grid:'#24242b',border:'#34343f'}}
