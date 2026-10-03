import {validateEnvelope} from '../shared/envelope.mjs';
import {deriveKey,open,seal} from './crypto.mjs';
import {holdingSource} from '../../desktop/electron/holding-source.cjs';

export const WEB_VERSION='2.14.0';
export const BACKUP_FORMAT='hardearner-vault-backup-v1';
export async function encryptedBackup(data,key,salt,identity){
  return {format:BACKUP_FORMAT,identity,createdAt:new Date().toISOString(),version:WEB_VERSION,envelope:await seal(data,key,salt,identity)};
}
export async function readBackup(backup,password,identity){
  if(backup?.format!==BACKUP_FORMAT||backup.identity!==identity)throw Error('Choose a full vault backup made by this private account.');
  validateEnvelope(backup.envelope);
  const candidate=await deriveKey(password,backup.envelope.salt);
  const data=await open(backup.envelope,candidate,identity);
  if(data?.version!==1||!Array.isArray(data.connections?.connections)||data.connections.connections.length>150)throw Error('This backup has an unsupported vault format.');
  return data;
}
export function backupSummary(data){
  return {holdings:data.portfolio?.holdings?.length||0,accounts:data.connections.connections.length,
    drawings:Object.values(data.analysis?.drawings||{}).reduce((n,rows)=>n+(Array.isArray(rows)?rows.length:0),0),
    alerts:data.analysis?.alerts?.length||0,goals:data.portfolio?.goals?.length||0};
}
export function holdingsCSV(rows,currency){
  const amount=v=>v==null?'':Number(v).toFixed(2);
  const esc=v=>'"'+String(v??'').replace(/^[\s]*[=+@-]/,"'$&").replaceAll('"','""')+'"';
  return '\uFEFF'+[['Name','Type','Asset','Quantity','Purity','Purchase date','Purchase cost original','Buy fee original','Original cost currency','Historical FX date','Report currency','Total paid','Spot value','Gross sale estimate','Sale costs','Net sale estimate','Spot P/L','Sale P/L','Sale return %','Sale method','Source','Location'],
    ...rows.map(h=>[h.name,h.type,h.asset,h.quantity,h.purity,h.purchaseDate,h.cost,h.purchaseFee,h.costCurrency,h.purchaseFxDate,currency,amount(h.costBasis),amount(h.value),amount(h.grossSale),amount(h.saleCosts),amount(h.sell),amount(h.gain),amount(h.saleGain),amount(h.returnPct),h.saleMethod,holdingSource(h),h.location])]
    .map(row=>row.map(esc).join(',')).join('\r\n');
}
