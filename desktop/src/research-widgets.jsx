import React,{useState,useEffect} from 'react';
import {RefreshCw,ExternalLink} from 'lucide-react';
import {api} from './shared';
import {t as tr} from './i18n';
import {widgetURL} from '../electron/research-widget-url.cjs';
export function ResearchWidget({kind,symbol='BINANCE:BTCUSDT',market='crypto',title,height=480}){
 const [revision,setRevision]=useState(0),[loaded,setLoaded]=useState(false);
 const locale=document.documentElement.lang==='de'?'de_DE':document.documentElement.lang||'en';
 const url=widgetURL({kind,symbol,market,locale});
 useEffect(()=>setLoaded(false),[url]);
 return <section className="research-widget research-card"><div className="research-section-head"><h3>{tr(title)}{kind==='technical'?' · '+symbol:''}</h3><button className="icon-button" aria-label={tr('Reload widget')} onClick={()=>{setLoaded(false);setRevision(n=>n+1)}}><RefreshCw size={14}/></button></div><div className="widget-frame" style={{height}}>{!loaded&&<span className="widget-loading">{tr('Loading public market widget…')}</span>}<iframe style={{background:'#171218',colorScheme:'dark',opacity:loaded?1:0}} key={url+revision} title={tr(title)} src={url} sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" loading="lazy" onLoad={()=>setLoaded(true)}/></div><div className="widget-foot"><small>{tr('TradingView data · availability and delays depend on the market.')}</small><button className="text-button" onClick={()=>api.researchLink(kind==='news'?'news':'tradingview')}><ExternalLink size={12}/>{tr('Market data by TradingView')}</button></div></section>;
}
