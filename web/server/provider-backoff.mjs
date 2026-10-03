import kraken from '../../desktop/electron/kraken-auth.cjs';

// Provider/cooldown metadata only. Never persist credentials or balances here.
export function providerFor(input){
  if(!['connectExchange','replaceExchangeKey','replaceKrakenKey','syncAccount','importOlderHistory'].includes(input?.op))return null;
  if(input.op==='connectExchange')return input.args?.[0];
  return input.connections?.connections?.find(c=>c.id===input.args?.[0])?.kind;
}
export function createProviderBackoff(storage){
  const sql=storage.sql;
  sql.exec('CREATE TABLE IF NOT EXISTS provider_backoff (provider TEXT PRIMARY KEY, code TEXT NOT NULL, not_before INTEGER NOT NULL, paused INTEGER NOT NULL)');
  const read=provider=>sql.exec('SELECT code,not_before,paused FROM provider_backoff WHERE provider = ?',provider).toArray()[0];
  function remember(provider,retry){
    if(provider!=='kraken'||!kraken.responseError([retry?.code])||!Number.isSafeInteger(retry.notBefore))return;
    sql.exec('INSERT OR REPLACE INTO provider_backoff VALUES (?,?,?,?)',provider,retry.code,retry.notBefore,retry.paused?1:0);
  }
  function failure(provider,error,now=Date.now()){
    const c={kind:provider};if(!kraken.recordFailure(c,error,now))return null;
    remember(provider,c.retry);return c.retry;
  }
  function blocked(provider,automatic=false,now=Date.now()){
    if(provider!=='kraken')return null;const row=read(provider);
    if(!row||row.not_before<=now&&(!automatic||!row.paused))return null;
    return {error:row.paused?'Kraken automatic requests are paused after an authentication error. Review the key before one manual retry.':kraken.responseError([row.code]).message,code:row.code,status:429,retryAt:row.not_before};
  }
  const clear=provider=>{if(provider==='kraken')sql.exec('DELETE FROM provider_backoff WHERE provider = ?',provider);};
  return{remember,failure,blocked,clear};
}
