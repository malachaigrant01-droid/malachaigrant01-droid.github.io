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

Agent skills:

- [`skills/cloudflare-login-connections/`](./skills/cloudflare-login-connections/)
- [`skills/phone-harness/`](./skills/phone-harness/): phone-viewport checks. `node skills/phone-harness/scripts/phone_harness.mjs . --out /tmp/phone`
