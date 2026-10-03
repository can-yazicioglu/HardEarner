const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const esbuild=require('../desktop/node_modules/esbuild');
const root=__dirname;process.chdir(root);fs.mkdirSync('dist',{recursive:true});fs.mkdirSync('build',{recursive:true});
const resolveLocal=file=>path.resolve(root,file);
const webCopy=JSON.parse(fs.readFileSync(resolveLocal('client/web-copy.json'),'utf8'));
const guidance=JSON.parse(fs.readFileSync(resolveLocal('client/web-guidance.json'),'utf8'));
const vaultTranslations=Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(resolveLocal('client/vault-translations.json'),'utf8'))).map(([en,tr])=>[en,{tr}]));
for(const [en,tr] of [...Object.values(guidance.questions),...Object.values(guidance.lessons)])vaultTranslations[en]={tr};
for(const [title,body,,,trTitle,trBody] of guidance.extra){vaultTranslations[title]={tr:trTitle};vaultTranslations[body]={tr:trBody};}
function adapters(browser){return{name:'desktop-platform-adapters',setup(build){
  build.onResolve({filter:/^(node:)?fs$/},()=>({path:resolveLocal(browser?'client/snapshot-store.cjs':'server/snapshot-store.cjs')}));
  build.onResolve({filter:/encrypted-(read|file)\.cjs$/},()=>({path:resolveLocal(browser?'client/snapshot-store.cjs':'server/snapshot-store.cjs')}));
  if(!browser){
    build.onResolve({filter:/^node:(crypto|path|http|async_hooks)$/},args=>args.namespace==='built-in'?{path:args.path,external:true}:{path:args.path,namespace:'built-in'});
    build.onLoad({filter:/.*/,namespace:'built-in'},args=>({contents:`export * from '${args.path}'; import * as native from '${args.path}'; export default native;`,loader:'js'}));
    build.onLoad({filter:/[\\/]desktop[\\/]electron[\\/]connections\.cjs$/},args=>({contents:fs.readFileSync(args.path,'utf8').replace("require(c.kind==='kraken'?'./kraken-history.cjs':c.kind==='binancetr'?'./binancetr-history.cjs':'./binance-history.cjs')","(c.kind==='kraken'?require('./kraken-history.cjs'):c.kind==='binancetr'?require('./binancetr-history.cjs'):require('./binance-history.cjs'))"),loader:'js',resolveDir:path.dirname(args.path)}));
  }
  if(browser){
    build.onResolve({filter:/^(node:)?(crypto|path|http)$/},()=>({path:resolveLocal('client/node-shim.cjs')}));
    build.onResolve({filter:/^\.\/app-lock$/},()=>({path:resolveLocal('client/app-lock.jsx')}));
    build.onResolve({filter:/^\.\/help$/},()=>({path:resolveLocal('client/private-help.jsx')}));
    build.onLoad({filter:/[\\/]desktop[\\/]src[\\/]translations\.json$/},args=>({contents:JSON.stringify({...JSON.parse(fs.readFileSync(args.path,'utf8')),...JSON.parse(fs.readFileSync(resolveLocal('client/translations.json'),'utf8')),...Object.fromEntries(webCopy.map(x=>[x.to,{tr:x.tr}])),...vaultTranslations}),loader:'json'}));
    build.onLoad({filter:/[\\/]desktop[\\/]src[\\/].*\.jsx$/},args=>{
      let source=fs.readFileSync(args.path,'utf8');
      source=source.replaceAll('Sync runs every five minutes, including in the Windows tray.','Sync runs every five minutes while this browser is open and unlocked.').replaceAll('Stored on this device','Encrypted cloud vault').replaceAll('in the Windows tray','while the browser is open').replaceAll('Keep running in the Windows tray','Keep the browser open for alerts');
      for(const copy of webCopy)source=source.replaceAll(copy.from,copy.to);
      if(path.basename(args.path)==='accounts.jsx')source=source.replace('providers.filter(p=>!p.bank)','providers.filter(p=>!p.bank&&p.id!=="binancetr")');
      if(path.basename(args.path)==='analysis.jsx'){
        const trayControl=/<label className="check-label"><input type="checkbox" checked=\{ws\.tray\}[\s\S]*?<\/label>/;
        if(!trayControl.test(source))throw Error('Desktop tray settings changed; review private-web alert controls.');
        source=source.replace(trayControl,'')
          .replaceAll('Checks every 30 seconds while this computer is awake and online. Quit from the tray to stop. Windows notification settings apply.','Checks every 30 seconds while this browser is visible, online and the vault is unlocked. Closing it stops alerts.')
          .replaceAll('Test notification requested. Check Windows notification settings if it does not appear.','A test message is shown inside HardEarner. Device notifications also depend on browser support and permission.')
          .replaceAll('HardEarner drawings, notes and alerts are stored locally.','HardEarner drawings, notes and alerts are encrypted and synced to your private cloud vault.');
      }
      if(path.basename(args.path)==='hardearner.jsx'){
        source=source.replaceAll('TRY, USD, or GBP','TRY, USD, GBP, or EUR');
        const localPanel=/<section className="panel settings-panel"><div className="section-icon"><ShieldCheck[\s\S]*?<\/section>/;
        if(!localPanel.test(source))throw Error('Desktop storage panel changed; review private-web storage wording.');
        source=source.replace(localPanel,'');
      }
      return{contents:source,loader:'jsx',resolveDir:path.dirname(args.path)};
    });
  }
}}}
async function main(){
 const common={bundle:true,nodePaths:[resolveLocal('../desktop/node_modules'),resolveLocal('node_modules')],logLevel:'warning'};
 await esbuild.build({...common,entryPoints:['client/entry.jsx'],platform:'browser',target:['safari16.4'],outfile:'dist/app.js',minify:true,define:{'process.env.NODE_ENV':'"production"'},plugins:[adapters(true)]});
 await esbuild.build({...common,entryPoints:['server/worker.mjs'],platform:'node',target:'es2022',format:'esm',outfile:'build/worker.mjs',external:['node:*','cloudflare:workers'],inject:['server/platform-fetch.mjs'],plugins:[adapters(false)]});
 for(const name of ['icon-192.png','icon-512.png','apple-touch-icon.png'])fs.copyFileSync('public/'+name,'dist/'+name);
 const version=crypto.createHash('sha256').update(fs.readFileSync('dist/app.js')).digest('hex').slice(0,12);
 fs.writeFileSync('dist/index.html',`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#0b1528"><link rel="icon" href="/icon-192.png"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest"><link rel="stylesheet" href="/app.css?v=${version}"><title>HardEarner · Private</title></head><body><div id="root"></div><noscript>JavaScript is required for your encrypted private vault.</noscript><script src="/app.js?v=${version}"></script></body></html>`);
 fs.writeFileSync('dist/manifest.webmanifest',JSON.stringify({name:'HardEarner Private',short_name:'HardEarner',start_url:'/',display:'standalone',theme_color:'#0b1528',background_color:'#080f20',icons:[{src:'/icon-192.png',sizes:'192x192',type:'image/png'},{src:'/icon-512.png',sizes:'512x512',type:'image/png'}]}));
 fs.writeFileSync('dist/_headers',"/*\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' wss://data-stream.binance.vision wss://ws.okx.com:8443; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Robots-Tag: noindex, nofollow\n");
 fs.copyFileSync('client/privacy.html','dist/privacy.html');
 console.log('Built HardEarner web 2.13.1 from the shared desktop 2.13 UI and accounting core.');
}
module.exports={adapters,main};
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
