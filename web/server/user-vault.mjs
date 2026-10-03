import {DurableObject} from 'cloudflare:workers';
import {createVaultRepository} from './vault-repository.mjs';
import {accountAction} from './account-actions.mjs';
import {createProviderBackoff,providerFor} from './provider-backoff.mjs';
export class UserVault extends DurableObject {
  constructor(ctx,env){super(ctx,env);this.repository=createVaultRepository(ctx.storage);this.backoff=createProviderBackoff(ctx.storage);this.accountBusy=false;this.pauseUntil=Date.parse(env.KRAKEN_PAUSE_UNTIL||'')||0;}
  read(){return this.repository.read();}
  write(input){return this.repository.write(input);}
  async account(input){
    if(this.accountBusy)return {error:'An account is already syncing on another device. Try again shortly.',status:409};
    if(input.revision!==this.repository.read().revision)return {error:'Your portfolio changed on another device. Reload it before syncing.',status:409};
    const provider=providerFor(input),automatic=input.op==='syncAccount'&&input.args?.[1]?.automatic===true;
    if(provider==='kraken'&&Date.now()<this.pauseUntil)return {error:'Kraken requests are paused after the reported temporary lockout. No provider request was sent.',status:429,retryAt:this.pauseUntil};
    const blocked=this.backoff.blocked(provider,automatic);if(blocked)return blocked;
    this.accountBusy=true;
    try{
      const result=await accountAction(input);
      if(provider==='kraken'){
        const connection=result.connections.connections.find(c=>c.kind===provider);
        if(connection?.retry)this.backoff.remember(provider,connection.retry);
        else if(connection&&!connection.error)this.backoff.clear(provider);
      }
      return result;
    }
    catch(e){const retry=this.backoff.failure(provider,e);return {error:String(e.message||'The provider could not be read.').slice(0,350),status:retry?429:400,...(retry?{code:retry.code,retryAt:retry.notBefore}:{})};}
    finally{this.accountBusy=false;}
  }
}
