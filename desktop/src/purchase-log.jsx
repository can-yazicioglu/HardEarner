import {CapitalTrail} from './capital-trail';
import React,{useState} from 'react';
import {api,price,digits,stamp} from './shared';
import {t as tr,dateLabel,getLocale} from './i18n';
import {activity,supported} from '../electron/purchase-tracking.cjs';
import {fees,flow,isConversion} from '../electron/transaction-ledger.cjs';
export function PurchaseLog({lots,connection:c,hidden,onUpdate,onAcquisition}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[limit,setLimit]=useState(30);
 const asset=lots[0].asset,log=c?activity(c,asset):null,automatic=c&&supported(c.kind);
 const amount=(q,currency)=>hidden?'••••':digits(q)+' '+currency;
 async function sync(){setBusy(true);setError('');try{onUpdate(await api.syncAccount(c.id))}catch{setError('History could not be refreshed. Saved records are kept.')}finally{setBusy(false)}}
 function rows(events){return <div className="table-wrap"><table className="purchase-log-table"><thead><tr><th>{tr('Date / time')}</th><th>{tr('Transaction')}</th><th>{tr('Quantity')}</th><th>{tr('Paid / received')}</th><th>{tr('Purchase / sale fee')}</th></tr></thead><tbody>{events.slice().reverse().slice(0,limit).map(e=>{const f=e.movement?{credit:Math.max(0,e.delta),debit:Math.max(0,-e.delta),incoming:e.delta>0?asset:null}:flow(e),incoming=f.incoming===asset;return <tr key={e.id}><td>{new Date(e.time).toLocaleString(getLocale(),{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</td><td><strong className={incoming?'up':'down'}>{tr(e.movement?e.source:isConversion(e)?'Conversion':lots[0].type==='cash'?(incoming?'Received':'Spent'):(incoming?'Buy':'Sell'))}</strong>{!e.movement&&isConversion(e)&&<small className="conversion-route">{f.outgoing} → {f.incoming}</small>}<small>{e.source} · {c.label}</small></td><td>{amount(incoming?f.credit:f.debit,asset)}</td><td>{e.movement?'—':amount(e.base===asset?e.paid:e.quantity,e.base===asset?e.quote:e.base)}</td><td>{!e.movement&&fees(e).length?fees(e).map((f,i)=><span className="log-fee" key={i}>{amount(f.amount,f.asset)}</span>):'—'}</td></tr>})}</tbody></table>{events.length>limit&&<button className="text-button" onClick={()=>setLimit(limit+30)}>{tr('Show more transactions')}</button>}</div>}
 return <section className="asset-purchase-log" aria-label={tr('Purchase log')+' '+asset}><div className="purchase-log-heading"><div><h3>{tr('Purchase log')} · {asset}{c?' ('+c.label+')':''}</h3><p>{tr(c?'Actual account records. Purchases stay separate; these logs do not add to your balance.':'Each manual purchase is listed separately.')}</p></div>{automatic&&<button className="button" disabled={busy||c.syncing} onClick={sync}>{tr(busy||c.syncing?'Syncing…':'Fetch from exchange')}</button>}</div>
 {error&&<p role="alert">{tr(error)}</p>}
 {!c?<div className="table-wrap"><table><thead><tr><th>{tr('Purchase date')}</th><th>{tr('Quantity')}</th><th>{tr('Total paid')}</th></tr></thead><tbody>{lots.slice().sort((a,b)=>(b.purchaseDate||'').localeCompare(a.purchaseDate||'')).map(h=><tr key={h.id}><td>{dateLabel(h.purchaseDate)}</td><td>{amount(h.quantity,h.asset)}</td><td>{hidden?'••••':price(h.cost==null?null:h.cost+(h.purchaseFee||0),h.costCurrency)}</td></tr>)}</tbody></table></div>:<>
 {automatic&&<p className="log-status">{tr('Automatic tracking is on while HardEarner is running. Updates every five minutes; use Fetch from exchange to check now.')}{c.tracking?.at?' '+tr('Tracking started: ')+stamp(c.tracking.at):''}</p>}
 {!automatic&&<p className="log-status">{tr('This provider currently returns balances only. Purchase history cannot be imported yet.')}</p>}
 {c.history?.issues?.map(issue=><p className="log-status down" key={issue}>{tr(issue)}</p>)}
 <h4>{tr(log.matched?'Current holding period':'Available transaction records')}</h4>
 {log.opening&&<p className="log-status">{tr('Balance present when tracking started; purchase date and cost are unknown.')}</p>}
 {log.current.length?rows(log.current):<p>{tr('No purchase records returned yet. Existing coins may predate tracking or have arrived by transfer. Future supported trades are imported automatically.')}</p>}
 {!log.matched&&log.current.length>0&&<p className="log-status">{tr('These transactions do not yet fully explain the balance. Costs remain incomplete until the records reconcile.')}</p>}
 {log.closed.length>0&&<details className="closed-periods"><summary>{tr('Previous holding periods')} ({log.closed.length})</summary>{log.closed.slice().reverse().map((period,i)=><div className="closed-period" key={i}><h4>{tr('Position closed')} · {stamp(period.closedAt)}</h4>{period.opening&&<p>{tr('Opening balance cost was unknown.')}</p>}{rows(period.events)}</div>)}</details>}
 <CapitalTrail lots={lots} hidden={hidden}/>
 {log.archived.length>0&&<details className="closed-periods"><summary>{tr('Records before tracking started')} ({log.archived.length})</summary>{rows(log.archived)}</details>}
 <p className="log-status">{tr('A fully closed position starts a fresh period on the next purchase. Earlier logs remain in history. Partial sales reduce the oldest remaining lots first.')}</p>
 {lots.some(h=>h.cost==null)&&lots[0].type==='crypto'&&<details className="manual-cost-fallback"><summary>{tr('Missing old purchase details?')}</summary><p>{tr('Manual details are optional. New imported purchases are tracked even when the opening balance cost is unknown.')}</p><button className="text-button" onClick={()=>onAcquisition(lots[0])}>{tr('Add purchase details')}</button></details>}
 </>}
 </section>;
}
