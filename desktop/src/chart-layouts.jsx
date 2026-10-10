import React,{useState,useEffect,useRef} from 'react';
import {t as tr} from './i18n';
import {LAYOUTS} from '../electron/research-layout.cjs';
export function ChartLayouts({workspace,mutate}){
 const[name,setName]=useState('');const l=workspace.layout||{mode:workspace.panels.length===2?'2h':'1',sync:{}};
 return <div className="chart-layout-controls"><label>{tr('Layout')} <select aria-label={tr('Chart layout')} value={l.mode} onChange={e=>mutate('layout',{...l,mode:e.target.value})}>{Object.keys(LAYOUTS).map(id=><option key={id} value={id}>{id==='2h'?tr('2 · side by side'):id==='2v'?tr('2 · stacked'):id+' '+tr('charts')}</option>)}</select></label>{['symbol','interval','range'].map(k=><label className="check-label" key={k}><input type="checkbox" checked={!!l.sync[k]} onChange={e=>mutate('layout',{...l,sync:{...l.sync,[k]:e.target.checked}})}/>{tr('Sync '+k)}</label>)}<input aria-label={tr('Layout name')} maxLength={48} value={name} onChange={e=>setName(e.target.value)} placeholder={tr('Layout name')}/><button className="button" disabled={!name.trim()} onClick={()=>mutate('saveLayout',name).then(ok=>{if(ok)setName('')})}>{tr('Save layout')}</button>{workspace.savedLayouts?.length>0&&<select aria-label={tr('Saved layouts')} value="" onChange={e=>mutate('loadLayout',e.target.value)}><option value="">{tr('Saved layouts')}</option>{workspace.savedLayouts.map(x=><option key={x.name}>{x.name}</option>)}</select>}</div>
}
export function VisiblePanel({children}){
 const host=useRef(),body=useRef(),height=useRef(510),[visible,setVisible]=useState(true);
 useEffect(()=>{if(!globalThis.IntersectionObserver)return;const o=new IntersectionObserver(([e])=>setVisible(e.isIntersecting),{rootMargin:'500px'});o.observe(host.current);return()=>o.disconnect()},[]);
 useEffect(()=>{if(!visible||!body.current)return;const o=new ResizeObserver(()=>{height.current=Math.max(510,body.current?.getBoundingClientRect().height||510)});o.observe(body.current);return()=>o.disconnect()},[visible]);
 return <div ref={host} style={{minHeight:visible?undefined:height.current}}>{visible?<div ref={body}>{children}</div>:<div className="research-empty">{tr('Chart paused outside the visible workspace.')}</div>}</div>
}
