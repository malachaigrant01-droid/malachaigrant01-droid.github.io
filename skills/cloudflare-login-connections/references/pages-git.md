---
description: "Connect GitHub to Cloudflare Pages via the Workers & Pages GitHub App. Read when the user wants the first deploy or Connect to Git."
connections: [custom-domain, access-idp]
---

# Pages Git connection

Preferred publish path: dashboard **Connect to Git**. Wrangler Action is fallback and needs secrets.

## First-time GitHub login (Pages)

1. Open [Workers & Pages](https://dash.cloudflare.com) → **Create application** → **Pages** → **Connect to Git**.
2. Sign in with GitHub. Install **Cloudflare Workers & Pages** ([GitHub App](https://github.com/apps/cloudflare-workers-and-pages)).
3. Repository access: include the target repo (`malachaigrant01-droid.github.io` and/or private `ABiZmuth`).
4. **Install & Authorize** → **Begin setup**.
5. Pick the repository.

If the UI returns to **Connect GitHub** with an empty repo list, the App install did not grant the repo. Fix it on GitHub, do not create a second Pages project.

## Set up builds and deployments

| Field | Hub `malachaigrant01-droid.github.io` | Archive `ABiZmuth` |
|---|---|---|
| **Project name** | `abizmuth-hub` | `abizmuth` |
| **Production branch** | `main` | `main` |
| **Framework preset** | None / Direct Upload equivalent (static) | same |
| **Build command** | empty | empty |
| **Build output directory** | `/` or `.` | `site` |
| **Root directory (advanced)** | empty | empty |

Then **Save and Deploy**. Success = `https://abizmuth-hub.pages.dev` or `https://abizmuth.pages.dev`.

Preview deployments: any non-`main` branch. Production: `main` only.

After that URL loads, attach the domain with [[custom-domain]]. Access login is separate ([[access-idp]]) and optional for a public legal hub.

## Wrangler fallback (no Connect to Git)

Only if the user has already created the Pages project **and** stored GitHub secrets:

- `CLOUDFLARE_API_TOKEN` — permission **Cloudflare Pages — Edit**
- `CLOUDFLARE_ACCOUNT_ID` — from the dashboard URL `dash.cloudflare.com/<ACCOUNT_ID>/pages`

Hub:

```text
npx wrangler pages deploy . --project-name abizmuth-hub
```

ABiZmuth:

```text
npx wrangler pages deploy site --project-name abizmuth
```

Do not run these without the token. A missing token is a stop, not a retry loop.

## Private repo note

`ABiZmuth` is private. Pages supports private repos. The GitHub App must list it under **Only select repositories**. The public hub can stay on GitHub Pages (`https://malachaigrant01-droid.github.io`) until Connect to Git succeeds; do not delete GitHub Pages until Cloudflare serves the same `index.html`.
