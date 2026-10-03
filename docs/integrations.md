# Integration scope

This matrix describes the checked-in implementation, not an endorsement of a provider or a guarantee of regional availability. Provider APIs, permissions, history windows and cloud IP policies can change. All connections are for reading data; no trading or payment action is exposed.

## Exchanges and investments

| Provider | Implemented account scope | Purchase / transaction evidence |
| --- | --- | --- |
| Kraken | Spot and Earn/reward balances returned by BalanceEx | Ledger-based acquisition and conversion history; requires Query ledger entries. |
| Binance.com | Spot, Funding and Simple Earn | Supported spot trades and conversion/transfer history, subject to endpoint permissions and history windows. Excludes derivatives and other unsupported products. |
| Binance TR | Spot, TRY and locked balances | Supported API trades/transfers plus evidence import for records such as conversions not returned by the API. New web connections are hidden because the cloud relay is blocked. |
| BtcTurk | Available and locked fiat/crypto balances | Balance access; a complete automatic cost history is not supplied. |
| Paribu | Spot balances | Balance access; a complete automatic cost history is not supplied. |
| Coinbase | Advanced Trade accounts accessible to a view-only CDP key | Balance access; a complete automatic cost history is not supplied. |
| OKX | Trading and Funding wallets in supported Spot mode | Balance access; excludes margin, derivatives and Earn. Region-specific API hosts apply. |
| Trading 212 | Invest / Stocks ISA positions, cash and uninvested Pie cash | Supported fills, dividends and reported charges; older history may require several syncs. No CFDs. |

A provider returning a balance does not prove the app knows how the asset was acquired. The UI distinguishes known cost, incomplete evidence and estimates. Never fill a gap by silently treating it as zero.

## Banks

| Provider | What is implemented | Prerequisite |
| --- | --- | --- |
| Monzo | Personal/joint balances and Pots | Personal developer access token; renewal may be required within hours. |
| Starling | Effective balance including Spaces/savings goals | Personal token limited to account and balance read access. |
| Lloyds, İşbank, HSBC Türkiye and broad bank aggregation | No generally usable connection in this preview | Appropriate supported aggregation service, production access and customer authorisation are still needed. |

The app does not collect bank passwords. Unsupported bank names are not presented as working automatic integrations.

## Public wallets

Supported address tracking includes **Bitcoin, Ethereum, Base, Arbitrum One, Optimism and Polygon**. Hardware wallet brands such as Ledger or Trezor can hold addresses on these networks; the connection is to an address, not to the hardware device itself.

Only supported address/network combinations and exposed token balances can be tracked. This is not universal wallet discovery, xpub account scanning or full DeFi/NFT coverage. Never provide recovery phrases, private keys or signing permissions. Imported transfer evidence may be necessary to explain costs.

## Market data

- **Crypto:** exchange quotes, trade/candle history and public streams where available; connection fallbacks and provider delays remain visible.
- **Metals:** sampled provider prices and session charts. These are not a physical dealer's guaranteed buyback quote.
- **FX:** provider rates and available historical conversion evidence.
- **Stocks, ETFs and funds:** Twelve Data with a personal market-data key and suitable exchange coverage. Listing facts can also be entered with source information. Entitlement, delay and instrument coverage depend on the provider plan; a fund's NAV is not necessarily live.

For connecting accounts, the in-app **Learn FAST** and provider dialogs explain the required permissions. Use a dedicated read-only key. Not every provider exposes an API for independently checking the key's permissions.
