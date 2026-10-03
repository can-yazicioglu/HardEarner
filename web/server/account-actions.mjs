import connections from '../../desktop/electron/connections.cjs';
import domain from '../../desktop/electron/domain.cjs';
import {withSnapshot} from './snapshot-store.cjs';
const methods = Object.freeze({
  connections:'view', connectExchange:'connectExchange', connectWallet:'connectWallet',
  replaceExchangeKey:'replaceExchangeKey', replaceKrakenKey:'replaceKrakenKey',
  syncAccount:'sync', includeAccount:'include', disconnectAccount:'disconnect',
  setAcquisition:'setAcquisition', importOlderHistory:'importOlder',
  importConversions:'importConversions', undoConversions:'undoConversions',
  readNotifications:'readNotifications', setMovementNotifications:'setMovementNotifications'
});
export async function accountAction(input) {
  if (!input || !Object.hasOwn(methods,input.op) || !Array.isArray(input.args) || input.args.length>3) throw Error('Unsupported account operation.');
  const portfolio=domain.validateState(input.portfolio);
  const data=input.connections;
  if (!data || !Array.isArray(data.connections) || data.connections.length>150 || data.connections.some(c=>!c || typeof c.id!=='string' || !['wallet','binance','binancetr','kraken','btcturk','paribu','coinbase','okx','monzo','starling','trading212'].includes(c.kind))) throw Error('Invalid connection snapshot.');
  const response=await withSnapshot({'connections.encrypted':data},async()=>{
    const service=connections.createConnections({dir:'/',safeStorage:{isEncryptionAvailable:()=>true},getHoldings:()=>portfolio.holdings,openExternal:()=>{throw Error('Use the provider setup page.');}});
    return service[methods[input.op]](...input.args);
  });
  return {view:response.result,connections:response.files['connections.encrypted']};
}
