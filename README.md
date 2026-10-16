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
| open.er-api.com | USD→AUD | None |
| Finnhub REST + WebSocket | US stocks/ETFs/REITs live; ASX if the plan allows | Free key in Settings (kept in browser storage) |

The page holds no money and places no trades. After review, it gives you an order CSV, a copyable order and a link to your own broker. Once the broker fills the order, the portfolio tracker records it and values it live. In-app Apple Pay funding needs a regulated broker partner with an embedded-investing API, merchant-domain verification and, for anyone but yourself, an AFS licence. The Settings tab explains this.
