---
name: cloudflare-login-connections
description: "Connect GitHub to Cloudflare Pages, attach a custom domain, and wire Cloudflare Access login methods (GitHub, Google, one-time PIN). Use when publishing a domain on Cloudflare, connecting a GitHub repo to Pages, or adding Access identity providers."
type: workflow
lifecycle: active
---

# Cloudflare Login Connections — Pages Git + Access + domain

Publish a GitHub repo to Cloudflare Pages, attach a custom domain, and add Access login methods. Use when the user asks to publish a domain on Cloudflare, Connect to Git, or add GitHub / Google / OTP login.

## Honesty gate

- Cloudflare is **not** a connected tool. There is no dashboard session and no API token unless the user just provided one.
- **Never** claim Pages is live, a custom domain is attached, or Access login works until a `*.pages.dev` URL or zone DNS record is verified.
- **Never** invent `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID`.
- **GitHub Pages** (`*.github.io`) is a different host. A GitHub Pages CNAME to GitHub is **not** this skill.

## Choose the surface

| Surface | Repo | Pages project | Output dir | Build command |
|---|---|---|---|---|
| Public hub | `malachaigrant01-droid/malachaigrant01-droid.github.io` | `abizmuth-hub` | `.` (repo root) | empty |
| Archive + legal mesh | `malachaigrant01-droid/ABiZmuth` (private) | `abizmuth` | `site` | empty |

Both are static. Do not run a Node build for either.

## Workflow

1. Confirm which surface (hub vs ABiZmuth). If ambiguous, do **both** — hub is public, ABiZmuth is source of truth.
2. Run `python3 scripts/check_publish_readiness.py <repo-root>`. Fix any `FAIL` before touching the dashboard.
3. Load `references/INDEX.md`, then only the node that matches the ask:
   - Connect Git / first deploy → [[pages-git]]
   - Access login (GitHub, Google, OTP) → [[access-idp]]
   - Custom domain / nameservers → [[custom-domain]]
4. Push repo wiring (`wrangler.toml`, `_headers`, `.github/workflows/cloudflare-pages.yml`) if missing.
5. **Stop at the dashboard.** Give the exact clicks. Do not pretend Connect to Git, Access OAuth, or domain attach completed.

## Repo wiring (commit these)

**Hub** (`malachaigrant01-droid.github.io`):

```toml
name = "abizmuth-hub"
compatibility_date = "2026-08-25"
pages_build_output_dir = "."
```

**ABiZmuth**:

```toml
name = "abizmuth"
compatibility_date = "2026-08-25"
pages_build_output_dir = "site"
```

Wrangler Action is `workflow_dispatch` only until `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` exist as GitHub secrets. Preferred auto-deploy is dashboard **Connect to Git** (no token in GitHub).

## Knowledge Graph

Start at `references/INDEX.md`.

- [[pages-git]] — Workers & Pages → Connect to Git → GitHub App
- [[access-idp]] — Zero Trust identity providers
- [[custom-domain]] — Pages Custom domains + DNS

## Common Issues

| Problem | Fix |
|---|---|
| Connect GitHub loops back to the same screen | Re-install [Cloudflare Workers & Pages GitHub App](https://github.com/apps/cloudflare-workers-and-pages); grant the `malachaigrant01-droid` account and the target repo |
| Private ABiZmuth missing from the repo list | GitHub App → Repository access → Only select repositories → include `ABiZmuth` |
| Action fails `Authentication error` | Secrets missing. Use Connect to Git instead of wrangler-action |
| OTP PIN already used | Mail scanners consume it. Allowlist `noreply@notify.cloudflare.com`; OTP is **not** auto-added on new Zero Trust orgs |
| GitHub Access login with 2FA fails | Sign into GitHub first, then retry Access |
| Custom domain inactive after DNS flip | Do not yank the Pages CNAME; use a redirect/origin rule for temporary moves |
| CAA blocks the cert | Allow `letsencrypt.org` (and Cloudflare) on the zone |
| Agent treats GitHub Pages as Cloudflare | Wrong host. This skill publishes **Pages**, then points the domain at `<project>.pages.dev` |
