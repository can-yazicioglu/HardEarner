// Public symbols and display options only. Remote code runs in a cross-origin
// iframe, never in the privileged renderer or the web vault's origin.
function widgetURL({kind,symbol='BINANCE:BTCUSDT',market='crypto',locale='en'}={}){
 if(!/^[A-Z0-9_]{1,20}:[A-Z0-9_.-]{1,45}$/.test(symbol))throw Error('Choose an exchange-qualified market symbol.');
 locale=['en','tr','de_DE','fr','es','ru'].includes(locale)?locale:'en';
 const common={colorTheme:'dark',theme:'dark',locale,isTransparent:false,width:'100%',height:'100%'};
 const definitions={
  news:['timeline',{...common,locale:'en',feedMode:'all_symbols',market:['crypto','stock','forex'].includes(market)?market:'crypto',displayMode:'regular'}],
  chart:['advanced-chart',{autosize:true,symbol,interval:'60',theme:'dark',locale,timezone:'Etc/UTC',style:'1',allow_symbol_change:true,hide_side_toolbar:false,withdateranges:true,save_image:true,calendar:false,details:false,backgroundColor:'#1f1417',gridColor:'rgba(111,139,177,0.07)',studies:[],support_host:'https://www.tradingview.com'}],
  heatmap:['crypto-coins-heatmap',{...common,dataSource:'Crypto',blockSize:'market_cap_calc',blockColor:'change',hasTopBar:true,isDataSetEnabled:true,isZoomEnabled:true,hasSymbolTooltip:true}],
  stocks:['screener',{...common,defaultColumn:'overview',defaultScreen:'most_capitalized',market:'america',showToolbar:true,enableScrolling:true}],
  crypto:['screener',{...common,defaultColumn:'overview',defaultScreen:'general',market:'crypto',showToolbar:true,enableScrolling:true}],
  forex:['forex-cross-rates',{...common,currencies:['EUR','USD','GBP','TRY','CHF','JPY']}],
  calendar:['events',{...common,importanceFilter:'0,1',countryFilter:'us,gb,tr,at,eu'}],
  technical:['technical-analysis',{...common,symbol,interval:'1h',showIntervalTabs:true,displayMode:'multiple'}],
  macro:['symbol-overview',{...common,symbols:[['Total','CRYPTOCAP:TOTAL|1D'],['Excluding BTC','CRYPTOCAP:TOTAL2|1D'],['Altcoins','CRYPTOCAP:TOTAL3|1D']],chartType:'area',dateRanges:['1m|1D','3m|1D','12m|1D'],showVolume:false,changeMode:'price-and-percent',lineWidth:2}],
  volatility:['symbol-overview',{...common,symbols:[['Bitcoin implied volatility','VOLMEX:BVIV|1D'],['Ethereum implied volatility','VOLMEX:EVIV|1D']],chartType:'line',dateRanges:['1m|1D','3m|1D','12m|1D'],showVolume:false,changeMode:'price-and-percent'}]
 };
 if(!Object.hasOwn(definitions,kind))throw Error('Unknown research widget.');
 const [name,options]=definitions[kind],url=new URL('https://www.tradingview-widget.com/embed-widget/'+name+'/');
 url.searchParams.set('locale',options.locale);if(kind==='news')url.searchParams.set('market',options.market);
 url.hash=encodeURIComponent(JSON.stringify({...options,utm_source:'hardearner.com',utm_medium:'widget_new',utm_campaign:name}));return url.href;
}
module.exports={widgetURL};
