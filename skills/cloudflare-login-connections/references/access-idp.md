---
description: "Cloudflare Access identity providers: GitHub, Google, one-time PIN. Read when the user wants Cloudflare login connections or SSO on the domain."
connections: [pages-git, custom-domain]
---

# Access identity providers

Login methods live in **Zero Trust**, not in the Pages project. Pages can stay public; Access is only if the user wants a gate.

Team name is under Zero Trust → **Settings** → **Team name and domain** → **Team name**. Substitute it everywhere below as `<team>`.

Callback, always:

```text
https://<team>.cloudflareaccess.com/cdn-cgi/access/callback
```

Homepage / JavaScript origin:

```text
https://<team>.cloudflareaccess.com
```

## GitHub (OAuth App, not the Pages GitHub App)

The Pages GitHub App ([[pages-git]]) deploys code. Access GitHub login is a **separate GitHub OAuth App**.

1. GitHub → Settings → Developer settings → **OAuth Apps** → **New OAuth App**.
2. **Homepage URL**: `https://<team>.cloudflareaccess.com`
3. **Authorization callback URL**: `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`
4. Create. Copy **Client ID** and generate a **Client secret**.
5. Cloudflare dashboard → **Zero Trust** → **Integrations** → **Identity providers** → **Add new identity provider** → **GitHub**.
6. **App ID** = GitHub Client ID. **Client secret** = GitHub Client secret.
7. Save. Click **Test**. If GitHub 2FA is on, sign into GitHub first, then retry.

## Google (no Workspace required)

Any Google account can sign in if the Access policy allows it.

1. Google Cloud Console → APIs & Services → Credentials → **Create credentials** → **OAuth client ID**.
2. **Application type**: **Web application**.
3. **Authorized JavaScript origins**: `https://<team>.cloudflareaccess.com`
4. **Authorized redirect URIs**: `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`
5. Zero Trust → **Integrations** → **Identity providers** → **Add new identity provider** → **Google**.
6. **App ID** = Google Client ID. **Client secret** = Google Client secret.
7. Save. **Test**.

## One-time PIN

OTP is **not** added automatically on new Zero Trust orgs (default is the Cloudflare IdP).

1. Zero Trust → **Integrations** → **Identity providers** → **Add new identity provider** → **One-time PIN**.
2. Put the user's email in an Access **policy** (Access will not send a PIN otherwise).
3. User visits the protected app → enters email → PIN from `noreply@notify.cloudflare.com` (10 minutes, single use).
4. If the PIN is already used, a mail scanner clicked it. Allowlist that sender and request a fresh PIN.

## Bind login to the domain

Identity providers do nothing until an Access application points at the hostname.

1. Zero Trust → **Access** → **Applications** → **Add an application** → **Self-hosted**.
2. Application domain: the custom domain from [[custom-domain]] or `<project>.pages.dev`.
3. Policy include: emails / GitHub / Google as requested.
4. Authentication tab: enable GitHub, Google, OTP. Public legal hub usually stays **ungated** — only add Access if the user asked to lock it.

Do not put OAuth secrets in the GitHub repo or in `wrangler.toml`.
