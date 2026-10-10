// Public catalogue IDs are an allowlist, never provider URLs supplied by a client.
const definitions=[
 ['dashboard','My dashboard','Panom','workspace','local'],
 ['feed','Unified event feed','Birleşik olay akışı','flows','events'],
 ['charts','Multi charts','Çoklu grafik','workspace','existing'],
 ['terminal','Asset terminal','Varlık terminali','markets','terminal'],
 ['hyperliquid','Hyperliquid tracker','Hyperliquid takibi','flows','hyperliquid'],
 ['etf','ETF terminal','ETF terminali','institutional','etf'],
 ['onchain','On-chain valuation','Zincir üstü değerleme','onchain','onchain'],
 ['watch','Address watch','Adres izleme','flows','transfers'],
 ['radar','ALT / BTC radar','ALT / BTC radarı','markets','radar'],
 ['momentum','Altcoin momentum','Altcoin momentumu','markets','radar'],
 ['assetflow','AssetFlow · derivatives','Varlık akışı · türevler','derivatives','hypermarkets'],
 ['bulletin','Daily research bulletin','Günlük araştırma bülteni','workspace','bulletin'],
 ['defi','DeFi health','DeFi sağlığı','defi','defi'],
 ['geopolitical','Geopolitical events','Jeopolitik olaylar','macro','geopolitical'],
 ['13f','Fund manager filings · 13F','Fon yöneticisi bildirimleri · 13F','institutional','secHoldings'],
 ['burn','Burns & buybacks','Yakımlar ve geri alımlar','onchain','burn'],
 ['confluence','Evidence confluence','Kanıtların birleşimi','markets','confluence'],
 ['cycle','Cycle & depth','Döngü ve derinlik','onchain','cycles'],
 ['options','Options laboratory','Opsiyon laboratuvarı','derivatives','options'],
 ['smartmoney','Long / short positioning','Long / short dağılımı','derivatives','ratios'],
 ['13dg','Ownership filings · 13D/G','Ortaklık bildirimleri · 13D/G','institutional','filings'],
 ['utxo','UTXO cost bands','UTXO maliyet bantları','onchain','utxo'],
 ['calendar','Economic calendar','Ekonomik takvim','macro','calendar'],
 ['premium','Coinbase premium','Coinbase primi','markets','premium'],
 ['reserves','Exchange reserves','Borsa rezervleri','flows','reserves'],
 ['macro','Fed & macro liquidity','Fed ve makro likidite','macro','macro'],
 ['fees','Fees & revenues','Ücretler ve gelirler','defi','fees'],
 ['projects','Project research journal','Proje araştırma günlüğü','workspace','local'],
 ['liquidations','Observed liquidations','Gözlenen tasfiyeler','derivatives','existing'],
 ['heatmap','Estimated liquidation map','Tahmini tasfiye haritası','derivatives','existing'],
 ['returns','Monthly returns','Aylık getiriler','markets','returns'],
 ['yield','Yield explorer','Getiri gezgini','defi','yield'],
 ['oi','Multi-venue derivatives','Çoklu borsa türevleri','derivatives','derivatives'],
 ['orderbook','Order-book heatmap','Emir defteri ısı haritası','derivatives','orderbook'],
 ['stablecoins','Stablecoin monitor','Stablecoin izleme','flows','stablecoins'],
 ['strategy','Treasury scenario studio','Hazine senaryo stüdyosu','institutional','local'],
 ['unlocks','Token unlocks','Token kilit açılışları','flows','unlocks'],
 ['tools','DCA, risk & learning','DCA, risk ve eğitim','workspace','local'],
 ['crossasset','Cross-asset watch','Varlık sınıfları izleme','markets','existing'],
 ['treasuries','Corporate & public treasuries','Şirket ve kamu hazineleri','institutional','treasuries'],
 ['whales','Large executed trades','Büyük gerçekleşmiş işlemler','flows','trades'],
 ['settings','Research settings & access','Araştırma ayarları ve erişim','workspace','local'],
 ['feedback','Feedback notebook','Geri bildirim defteri','workspace','local'],
 ['tour','Research starter guide','Araştırmaya başlangıç','workspace','local']
];
const FEATURES=definitions.map(([id,title,tr,group,query],i)=>({id,title,tr,group,query,number:i+1}));
const widgets=[
 ['overview','Overview','Piyasa özeti','sentiment'],['events','Upcoming events','Yaklaşan olaylar','calendar'],['funding','Funding rates','Fonlama oranları','funding'],['interest','Open interest','Açık pozisyon','interest'],['ratios','Long / short ratios','Long / short oranları','ratios'],['hl','Hyperliquid sample','Hyperliquid örneklemi','hyperliquid'],['anomaly','Position changes','Pozisyon değişimleri','hyperliquid'],['hip3','HIP-3 markets','HIP-3 piyasaları','hypermarkets'],['heatmap','Liquidation model','Tasfiye modeli','heatmap'],['volume','Volume radar','Hacim radarı','volume'],['maxpain','Options max pain','Opsiyon max pain','options'],['perpdex','Perpetual DEX volumes','Perpetual DEX hacimleri','perpdex'],['cex','CEX volumes','Merkezi borsa hacimleri','cex'],['smartmoney','Positioning','Pozisyon dağılımı','ratios'],['direction','Relative performance','Göreli performans','radar'],['cryptoetf','Crypto ETF flows','Kripto ETF akışları','etf'],['indexetf','Index ETF flows','Endeks ETF akışları','indexetf'],['cvd','Spot CVD','Spot CVD','trades'],['sectors','Sector rotation','Sektör rotasyonu','sectors'],['btclevels','BTC cycle levels','BTC döngü seviyeleri','cycles'],['confluence','Evidence summary','Kanıt özeti','confluence'],['onchain','On-chain compass','Zincir üstü pusula','onchain'],['risk','Market risk context','Piyasa risk bağlamı','confluence'],['geopolitical','Geopolitical context','Jeopolitik bağlam','geopolitical'],['correlation','Macro correlation','Makro korelasyon','macroCorrelation'],['sectorflows','US sector ETF flows','ABD sektör ETF akışları','sectorflows'],['insiders','Form 4 filings','Form 4 bildirimleri','filings'],['13f','Fund managers','Fon yöneticileri','secHoldings'],['13dg','Ownership filings','Ortaklık bildirimleri','filings'],['chainfees','Chain fees','Zincir ücretleri','chainfees'],['dexrevenue','DEX revenue','DEX gelirleri','dexrevenue'],['earnings','Protocol revenue','Protokol gelirleri','revenue'],['holderrevenue','Holder revenue','Sahiplere dağıtılan gelir','holderrevenue'],['defi','DeFi lending','DeFi borç piyasası','defi'],['bridges','Bridge anomalies','Köprü anomalileri','bridges'],['yield','Yield opportunities','Getiri havuzları','yield'],['burn','Burns & buybacks','Yakımlar ve geri alımlar','burn'],['activity','Chain activity','Zincir etkinliği','activity']
].map(([id,title,tr,query],i)=>({id,title,tr,query,number:i+1}));
const TEMPLATES={minimal:['overview','funding','btclevels'],derivatives:['funding','interest','ratios','maxpain','cvd'],flows:['cryptoetf','cvd','hl','sectorflows'],macro:['events','correlation','geopolitical'],defi:['chainfees','defi','yield','holderrevenue'],stocks:['13f','13dg','insiders','indexetf'],full:widgets.map(w=>w.id)};
const ACCESS={
 redistribution:{provider:'licensing',required:'Provider display and redistribution permission before commercial or public release',why:'Free API access does not automatically grant rights to republish or resell data. DefiLlama, CoinGecko, exchange, news and fund providers must be reviewed for the intended audience.'},
 etf:{provider:'coinglass',required:'CoinGlass ETF API entitlement',why:'Dated fund reports, revisions and incomplete sessions require licensed fund-flow data.'},
 heatmap:{provider:'coinglass',required:'CoinGlass Model 1 entitlement',why:'Estimated liquidation levels are a provider model, not observed order-book liquidity.'},
 addresses:{provider:'coinglass',required:'CoinGlass chain transfer entitlement',why:'Public wallet labels and observed transfers do not establish trades.'},
 onchain:{provider:'glassnode',required:'Glassnode metric-specific API plan',why:'Cohort SOPR, MVRV, NUPL and supply metrics need the relevant dataset entitlement.'},
 utxo:{provider:'glassnode',required:'Glassnode realized-price cohort access',why:'Network cost bands are distinct from the purchase cost of your holdings.'},
 reserves:{provider:'glassnode',required:'Glassnode exchange balance/netflow access',why:'Wallet attribution is incomplete and reserves alone do not prove solvency.'},
 macroCorrelation:{provider:'fred',required:'A free personal FRED API key',why:'Matched dated macro changes and BTC returns; at least six observations are required.'},
 macro:{provider:'fred',required:'A free personal FRED API key',why:'Source frequency and observation dates are retained; this is not a real-time market feed.'},
 calendar:{provider:'fmp',required:'Financial Modeling Prep calendar plan and redistribution permission',why:'Forecast, previous, actual and publication time require a licensed structured calendar.'},
 indexetf:{provider:'fmp',required:'A licensed daily ETF net-flow dataset',why:'Trading volume and AUM cannot substitute for net subscriptions/redemptions.'},
 sectorflows:{provider:'fmp',required:'A licensed US sector ETF net-flow dataset',why:'Sector prices are not fund flows. Endpoint and entitlement must be confirmed before activation.'},
 unlocks:{provider:'defillama',required:'DefiLlama Pro emissions access',why:'Schedules can change; vesting categories and circulating supply must be available.'},
 burn:{provider:'defillama',required:'Project-specific verified burn/buyback event feed',why:'Holder revenue is not automatically a buyback or token burn.'},
 bridges:{provider:'defillama',required:'DefiLlama Pro bridge history',why:'Anomaly detection needs a consistent baseline and bridge coverage.'},
 sectors:{provider:'defillama',required:'DefiLlama Pro narrative performance',why:'Sector membership and market-cap weights come from the provider.'},
 treasuries:{provider:'defillama',required:'DefiLlama Pro DAT entitlement',why:'Reported holdings are disclosure snapshots, not real-time balances.'},
 geopolitical:{provider:'news',required:'A licensed event/news provider and editorial scoring rules',why:'No verified probability or 0–100 risk score is invented from headlines.'},
 bulletin:{provider:'llm',required:'An approved LLM provider, personal API key and explicit per-request consent',why:'Template bulletins are labelled as rules-based. Your holdings and keys are never automatically sent.'}
};
const LAB_QUERIES=[...new Set([...FEATURES.map(x=>x.query),...widgets.map(x=>x.query),'daily','sentiment','filings','onchainMetric','defiHistory','yieldHistory','secHoldings'].filter(x=>!['local','existing','funding','interest','transfers'].includes(x)))];
function defaultDesk(){return{version:1,active:'minimal',layouts:[{id:'minimal',name:'Minimal',desktop:TEMPLATES.minimal.map(id=>({id,width:1})),mobile:TEMPLATES.minimal.map(id=>({id,width:1}))}],projects:[],feedback:[],bulletins:[],addresses:[],tour:0,shortcuts:['radar','options','tools']}}
function validateDesk(v){
 if(!v||v.version!==1||!Array.isArray(v.layouts)||v.layouts.length>20||!v.layouts.length)throw Error('Invalid research desk.');
 const known=new Set(widgets.map(w=>w.id));
 if(new Set(v.layouts.map(l=>l.id)).size!==v.layouts.length)throw Error('Dashboard identifiers must be unique.');
 for(const l of v.layouts){if(typeof l.id!=='string'||l.id.length>80||typeof l.name!=='string'||!l.name.trim()||l.name.length>60)throw Error('Invalid dashboard name.');for(const size of ['desktop','mobile'])if(!Array.isArray(l[size])||l[size].length>38||new Set(l[size].map(c=>c.id)).size!==l[size].length||l[size].some(c=>!known.has(c.id)||![1,2,3].includes(c.width)))throw Error('Invalid dashboard widgets.');}
 if(!v.layouts.some(l=>l.id===v.active))throw Error('Choose a saved dashboard.');
 for(const key of ['projects','feedback','bulletins','addresses'])if(!Array.isArray(v[key])||v[key].length>100)throw Error('Research notebook is full.');
 for(const key of ['projects','feedback','bulletins']){if(new Set(v[key].map(r=>r.id)).size!==v[key].length)throw Error('Duplicate notebook record.');for(const r of v[key]){if(!r||typeof r.id!=='string'||r.id.length>80||typeof r.title!=='string'||!r.title.trim()||r.title.length>120||typeof r.body!=='string'||!r.body.trim()||r.body.length>5000||!Number.isFinite(r.at)||r.at<=0||!['open','reviewed'].includes(r.status)||!['research','data','interface','connection','idea'].includes(r.category))throw Error('Invalid notebook record.');if(r.url){let u;try{u=new URL(r.url)}catch{throw Error('Invalid evidence URL.')}if(r.url.length>500||u.protocol!=='https:'||u.username||u.password)throw Error('Use a public HTTPS evidence URL.');}}}
 if(v.addresses.length>5||v.addresses.some(r=>!/^0x[0-9a-f]{40}$/.test(r.address)||typeof r.label!=='string'||r.label.length>80||r.provenance!=='user label'))throw Error('Invalid public watchlist.');
 if(!Number.isInteger(v.tour)||v.tour<0||v.tour>7||!Array.isArray(v.shortcuts)||v.shortcuts.length>44||v.shortcuts.some(id=>!FEATURES.some(f=>f.id===id)))throw Error('Invalid Research preferences.');
 if(JSON.stringify(v).length>250000)throw Error('Research notebook exceeds its size limit.');
 return structuredClone(v);
}
module.exports={FEATURES,WIDGETS:widgets,TEMPLATES,ACCESS,LAB_QUERIES,defaultDesk,validateDesk};
