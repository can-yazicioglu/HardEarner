# HardEarner Research

Self Analysis opens a dedicated Research window on Windows and a separate tab on the private website. It has six sections: Overview, Charts, Screener, News, Ideas & notes, and Price alerts. Returning to the portfolio does not replace its data. A new web tab needs its own vault unlock; encryption keys are not copied between tabs.

## Charts and exact executions

**My chart** holds HardEarner drawings, freehand strokes, notes, alerts and transaction markers. Hover, focus or tap a B/S marker to see the recorded quantity, execution price, trade value, separately reported fees, source and time. A daily candle can group multiple executions. The popup retains each execution's original currency and venue; a USD execution must not be relabelled as a USDT trade. Manually entered dates remain labelled date-only.

**Market chart** embeds TradingView's public advanced chart, including symbol search, drawing tools and indicators. Its drawings are controlled by TradingView and are not saved into the HardEarner vault. Use My chart for saved work and portfolio markers. The risk calculator estimates units from a planned stop and fee allowance; it does not include slippage, gaps or borrowing costs.

| Data | Source and behaviour |
| --- | --- |
| Crypto personal charts | Binance / OKX historical candles and public exchange WebSockets. Candles update when actual trades arrive; no artificial movement. |
| Gold, silver, platinum, palladium history | [Frankfurter](https://frankfurter.dev/) daily reference observations, divided by 31.1034768 for USD per pure gram. Dates with no observation are not fabricated. |
| Metal spot sessions | [Gold API](https://gold-api.com/docs/) observations, checked every 30 seconds to match the free endpoint's cache. A new session can initially have only one point. |
| Intraday metal market charts | TradingView's OANDA XAUUSD, XAGUSD, XPTUSD and XPDUSD listings, quoted per troy ounce. These are venue quotes, not physical dealer buy/sell prices. Market closures and provider availability apply. |
| Rankings, market totals, dominance, search trends | [CoinGecko](https://docs.coingecko.com/reference/coins-markets), with five-minute caching. Movers are restricted to the fetched top 100, not every coin. |
| DeFi TVL and stablecoins | [DefiLlama](https://api-docs.defillama.com/). The stablecoin number is USD-pegged circulating supply, not an exact traded market cap. CEX/chain categories are excluded from protocol TVL. |
| Heatmaps, screeners, macro/Volmex charts, calendar and news | [TradingView widgets](https://www.tradingview.com/widget-docs/). Availability, language, refresh and delays are provider-controlled. Some symbols do not provide technical summaries. |

The overview retains timestamps and marks previously fetched values stale when a provider fails. Unknown values stay unknown. Specialist collections and community ideas open at TradingView rather than copying its community content. Attribution remains visible.

## Small connected balances

Holdings groups connected asset balances worth less than USD 1 behind a reversible display toggle. Their value remains in totals, export and favourites. Unpriced assets are not hidden by this filter. Holdings derive from current provider balances; an old purchase log cannot revive an asset with a zero current balance. A tiny balance after sync may be a provider-reported residual or reward; the filter is not evidence that the provider balance is wrong.

## Isolation and privacy

Only public symbols and display options are passed to cross-origin TradingView frames. Portfolio data, transaction details and account keys stay outside them. The parent renderer only runs bundled scripts; its CSP limits frame origins. Electron rejects iframe IPC, unexpected navigation, webviews and arbitrary popup destinations. Streams are owned by their opening window, and app lock hides both native windows. Loading an embedded frame cannot stop the native chart stream.

TradingView receives ordinary browser/IP information and may use its own storage. See its [privacy policy](https://www.tradingview.com/privacy-policy/). Public-data requests and chart widgets are external dependencies; a passing fixture suite does not guarantee their future availability.

## Verification

The 2.14 regression suites cover four-metal history and spot switching, exact marker popups, visible horizontal/freehand drawings, streamed candles, encrypted restart, alerts, iframe separation and phone-to-desktop layouts. Live public checks also loaded all four daily metal histories and all four OANDA intraday charts. Connected-account tests use synthetic credentials; no customer financial records belong in repository screenshots.
