# Research data integrations · 2.15

Checked against official provider documentation on 6 October 2026. This is an
incremental part of the existing Research workspace, shared by Windows and the
private web app. Market intelligence is below the existing Overview/Charts
content; its six switches control which panels are requested. No portfolio,
acquisition-cost, transfer-matching or currency calculations are replaced.

## Available integrations

| Panel | Source and coverage | Access | Refresh / limits |
|---|---|---|---|
| Funding | Bybit linear USDT perpetuals; current indicative rate, settled history, instrument funding interval and next settlement | Public API | 60s cache; up to 200 settled observations per selection |
| Open interest | Bybit linear USDT perpetuals; base-asset units, consistent single-side or both-side basis; USDT notional kept separate | Public API | 60s cache; up to 200 history observations, selectable 1h/24h/7d/30d/90d/1y |
| Observed liquidations | Bybit `allLiquidation.{symbol}` public stream | Public WebSocket | Exchange pushes every 500ms; UI reads observed snapshots every 5s; heartbeat every 20s |
| Estimated liquidation heatmap | CoinGlass v4 Model 1, Bybit pair | CoinGlass **Professional API or higher** | Explicit load, 5-minute cache; model exposure is never counted as observed liquidation |
| Large transfers | CoinGlass v4 whale-transfer; provider minimum **$10M**, supported chains | CoinGlass **Startup API or higher** | 5-minute cache; configurable minimum can filter upward but cannot expand provider coverage |
| Exchange inflows/outflows | CoinGlass v4 exchange on-chain transactions, **Ethereum ERC-20 only**, provider labels | CoinGlass **Hobbyist API or higher** | Latest 100 provider records; filters are applied to this received sample, never presented as a complete market total |
| Public positions | Hyperliquid `clearinghouseState`, up to five watched public addresses; **main perpetual DEX only** | Public API; user supplies public addresses | 60s cache; position-size differences between observations, first snapshot is a baseline |
| ETF flows | CoinGlass US spot BTC/ETH daily flows and per-fund breakdown | CoinGlass **Hobbyist API or higher** | Hourly cache; reported dates, partial totals and observed revisions retained |
| MVRV / NUPL / SOPR | Glassnode daily unadjusted series for BTC/ETH where the user's plan covers that metric/asset | Glassnode **API entitlement required** | Hourly cache; unsupported assets/metrics fail individually, no substitute values |

These are research-only connections. They do not enable orders, withdrawals,
wallet signing, account permissions or financial transactions.

## Definitions and interpretation

- Funding is shown in **percent per settlement**, not basis points or an implied
  annual yield. Positive rates mean longs pay shorts; negative means the reverse.
  The displayed interval is the current instrument interval; historical intervals
  can change. The current indicative rate may change before settlement.
- Open interest is displayed in the base coin. Bybit's newer response includes
  `singleOpenInterest` alongside `openInterest` (both-side sum). A series only uses
  single-side data if **every** history row and the current ticker have it; it
  otherwise uses the both-side fields consistently. The percentage change uses an
  actual sample close to the requested start; insufficient history produces “—”.
  Quote notional is **USDT, not USD**. Available history dates expose provider caps.
- Bybit liquidation `S=Buy` means a **long position was liquidated**, `Sell` a
  short position. Notional here is size × **bankruptcy price**, an estimate rather
  than actual execution proceeds. Totals cover only messages received since this
  session started. Disconnects, browser suspension, a locked web vault or closing
  the view can interrupt coverage. Up to 2,000 event identities are retained and
  the most recent 100 are returned; lifetime observed totals include older events.
- Heatmap cells show modelled potential exposure at a price/time coordinate. They
  are not completed liquidations or a prediction. Dense displays may sample cells;
  no cell sum is presented as a market total.
- A blockchain transfer is **not a buy or sell**. Exchange classification is used
  only from the provider's explicit exchange endpoint, including internal transfers.
  Public explorer links are constructed from validated hashes and named chains.
  Unsupported explorer mappings have no fabricated evidence link. Hyperliquid
  size changes can miss changes between polls and exclude spot and other DEXs.
- ETF flows are net creations/redemptions, **not volume**. Aggregate USD and each
  fund's USD value remain separate; absent or unreconciled fund sums are marked
  incomplete. A reconciled sum is only “provider-reported”, never assumed final.
  A changed report after an earlier saved observation is marked revised. Changes
  before first observation cannot be identified. Missing days are not zero-filled.
  The NYSE holiday calendar is verified for 2026–2028, with later years explicitly
  unverified; extraordinary closures are not inferred.
- MVRV = market value / realized value. NUPL = net unrealized P/L / market value
  (a ratio, not a percent). SOPR compares value at spending with value at creation.
  NUPL uses Glassnode's account-based endpoint for ETH. The provider controls asset
  availability and historical definitions. These are not personal cost bases.
- The optional evidence notebook states metrics, source scope and horizons; it
  explains counterpoints and conflicting ETF/participation observations without a
  composite trade score or guaranteed direction.

## Credentials, privacy and failure handling

Open Market intelligence → gear to enter **your own** provider key. The renderer
never receives a saved key back: it receives only a configured flag. Windows uses
the existing safeStorage encrypted-file/key-envelope model in `research.encrypted`;
upgrade backups include it. The private website includes the research record in
its existing client-encrypted cloud vault and encrypted exports. Only the key for
the requested provider is sent to the same-origin authenticated relay, which uses
fixed read-only provider endpoints. No arbitrary URLs, redirects or caller-chosen
API paths are accepted. Paid results and keys are not cached across users. Raw
provider error bodies and secret-bearing URLs never enter UI errors or app logs.

Each user needs their own entitlement. No plan is purchased or activated by this
release. CoinGlass personal plans do not authorize commercial redistribution;
its Professional tier is needed for this heatmap endpoint. Glassnode personal
access also does not grant redistribution. Bybit's public API availability is not
a commercial data licence. Obtain appropriate provider permission before a wider
commercial launch or redistributing one subscriber's data to other users.

Current rate limits from official documentation: Bybit HTTP defaults to 600
requests per 5 seconds per IP; HardEarner is far below that and caches queries.
CoinGlass plan limits start at 30/minute and vary by tier. Glassnode standard calls
default to 600/minute but entitlement can differ. Hyperliquid allows 1,200 request
weight/minute per IP; clearinghouseState is weight 2. Limits may change.
HTTP 429 responses pause that provider and honor Retry-After (bounded at one hour).
Missing keys, regional refusals, empty responses, malformed numbers and stale
observations stay explicit. A previous successful observation may be shown as
stale; it cannot trigger an alert. No unavailable measurement becomes zero.

## Metric alerts

Use **Metric alert** next to the panel period buttons, or the existing Price alerts
tab. Select a metric, cryptoasset, threshold, at-or-above/below condition and a
cooldown from 5 minutes to 7 days. Equal active alerts are rejected. A condition
triggers on first entry and must become false before another entry can notify;
crossings inside the cooldown are suppressed. Saved alert history preserves the
observed value and its timestamp. Transfers use the largest received qualifying
transfer in the last hour, not net buying. Missing, stale and incomplete reports
cannot fire. Disabling a display panel does not pause its saved alerts.

Checks run every 30 seconds but provider caches keep their own cadence. Windows
requires the app running (including its tray) and an awake, online computer. The
private web app requires a visible unlocked tab; no claim of closed-browser push
is made. Existing price alerts remain unchanged.

## Official references

- [Bybit funding history](https://bybit-exchange.github.io/docs/v5/market/history-fund-rate),
  [open interest](https://bybit-exchange.github.io/docs/v5/market/open-interest),
  [instruments](https://bybit-exchange.github.io/docs/v5/market/instrument),
  [tickers](https://bybit-exchange.github.io/docs/v5/market/tickers),
  [all liquidations](https://bybit-exchange.github.io/docs/v5/websocket/public/all-liquidation),
  [limits](https://bybit-exchange.github.io/docs/v5/rate-limit),
  [API terms](https://www.bybit.com/en/help-center/article/API-Terms).
- CoinGlass: [BTC flows](https://docs.coinglass.com/reference/etf-flows-history),
  [ETH flows](https://docs.coinglass.com/reference/ethereum-etf-flows-history),
  [whale transfers](https://docs.coinglass.com/reference/whale-transfer),
  [exchange ERC-20 transfers](https://docs.coinglass.com/reference/exchange-onchain-transfers),
  [heatmap Model 1](https://docs.coinglass.com/reference/liquidation-heatmap),
  [plans](https://www.coinglass.com/pricing), [terms](https://www.coinglass.com/terms).
- Glassnode: [market metrics](https://docs.glassnode.com/basic-api/endpoints/market),
  [indicators](https://docs.glassnode.com/basic-api/endpoints/indicators),
  [limits](https://docs.glassnode.com/basic-api/api-credits),
  [licensing](https://studio.glassnode.com/terms-and-conditions).
- Hyperliquid: [public info](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals),
  [limits](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits).
- [NYSE holidays](https://www.nyse.com/trade/hours-calendars).

Glassnode personal terms also restrict API access by IP (currently one IP per 24 hours). Moving a key between desktop and a cloud relay can therefore fail even with a valid key. Confirm a plan permitting your deployment and devices before enabling it. Provider plans and terms can change. Hyperliquid changes retain the latest 20 observed changes per watched address for up to seven days; changes between polls can be missed.

## Verification boundaries

Automated tests cover units, side basis, duplicates, missing values, cooldowns,
revisions, malformed payloads, key redaction, reload persistence and mobile UI.
Synthetic fixtures are explicitly identified and never shipped as market values.
Live Bybit REST/WebSocket and Hyperliquid public API probes are recorded separately
in release evidence. Paid CoinGlass/Glassnode data requires a real permitted key;
successful fixture/schema tests must not be reported as live paid-data verification.
