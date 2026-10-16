# ABiZmuth — public legal hub

Live (GitHub Pages): https://malachaigrant01-droid.github.io

Source of truth: private repo `malachaigrant01-droid/ABiZmuth` (`site/`).

## Cloudflare Pages

Project name: `abizmuth-hub`. Output directory: `.` (this repo root). Build command: empty.

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git.
2. Sign in with GitHub. Install the Cloudflare Workers & Pages GitHub App on this repo.
3. Production branch `main`. Save and Deploy → `https://abizmuth-hub.pages.dev`.
4. Custom domains → Set up a domain (after first deploy).
5. Optional Access login: Zero Trust → Integrations → Identity providers (GitHub, Google, one-time PIN).

Wrangler Action (`.github/workflows/cloudflare-pages.yml`) is `workflow_dispatch` only. It needs GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Prefer Connect to Git so those secrets stay out of GitHub.

Agent skill: [`skills/cloudflare-login-connections/`](./skills/cloudflare-login-connections/).

## Invest (`/invest/`)

Static app with 236 assets in five categories: Property, AI, Stocks, Shares & ETFs, and Crypto. Prices are in AUD and update live. You can build orders with at least A$2 per asset. "Recommended" means popular: curated popularity, raised by live 24h volume. It is not personal advice.

| Feed | Covers | Setup |
|---|---|---|
| CoinGecko (30 s poll) + Coinbase Exchange WebSocket | Crypto price, 24h change, volume | None |
| open.er-api.com | USD→AUD (daily reference rate) | None |
| Finnhub REST + WebSocket | US stocks/ETFs/REITs live; ASX if the plan allows | Free key in Settings (kept in browser storage) |

The page holds no money and places no trades. After review, it gives you an order CSV, a copyable order and a link to your own broker. Once the broker fills the order, the portfolio tracker records it and values it live.

### Signals and the paper auto-trader

- `invest/signals.js` turns completed 5-minute closes into buy / sell / hold signals. Buy: EMA 12 is above EMA 26, the MACD histogram is positive and rising, and RSI is 50–70. Likely peak: RSI 70+ or a close above the upper 2σ Bollinger band, then momentum fading. Downtrend: EMA 12 is below EMA 26 and momentum is falling. These are rules, not forecasts.
- Crypto history is seeded from Coinbase 5-minute candles (about 29 h), or from the CoinGecko 1-day chart for coins not on Coinbase. Share history is built from live Finnhub prices and kept in browser storage (300 bars per asset).
- `invest/autotrader.js` trades **virtual money only**. How it works:
  - It buys the strongest buy signals among recommended assets, A$10 per buy by default (minimum A$2).
  - It takes profit at a likely peak once a position is up 2%.
  - The 6% stop-loss applies until the price is up 4%. After that, a 4% trailing stop follows the high.
  - It never exits on the short-term downtrend signal.
  - It waits 60 minutes before re-buying an asset it sold.
  - It counts percentage and flat fees.
  - It only trades assets whose last trade is under 15 minutes old.
  - The Auto tab compares its return with the average move of the assets it could have bought.
- The same rules raise alerts (on the page, plus device notifications where supported) for holdings recorded in Portfolio. They also flag strong buy signals (80+) on recommended assets.
- The trader runs only while a tab is open, and only one tab runs it at a time.
- Real-money automation would need a broker API, a server holding the keys around the clock, and user-set limits. None of that exists here.

On real Coinbase candles (16 coins, October 2026):
- Last ~1 day, 5-minute bars: +A$2.48 on A$1,000. Simply holding averaged +2.17% per coin.
- Last ~3 days, 15-minute bars: −A$10.68, mostly from stop-losses.

That's too little data to claim the rules work, and the UI says so.

Tests: `node --test invest/tests/*.test.js` In-app Apple Pay funding needs a regulated broker partner with an embedded-investing API, merchant-domain verification and, for anyone but yourself, an AFS licence. The Settings tab explains this.
