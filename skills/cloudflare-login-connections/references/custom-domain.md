---
description: "Attach a custom domain to a Cloudflare Pages project. Read when the user says publish domain, nameservers, apex, or www."
connections: [pages-git, access-idp]
---

# Custom domain on Pages

Do this only after [[pages-git]] produced a working `https://<project>.pages.dev` URL.

## Dashboard

1. [Workers & Pages](https://dash.cloudflare.com) → the Pages project (`abizmuth-hub` or `abizmuth`).
2. **Custom domains** → **Set up a domain**.
3. Enter the hostname → **Continue**.
4. Confirm the DNS record Cloudflare proposes.

## DNS Cloudflare creates

If the zone is already on this Cloudflare account, Pages adds the CNAME.

| Type | Name | Content |
|---|---|---|
| CNAME | `www` (or host) | `<project>.pages.dev` |

Apex (`example.com`): the domain **must** be a zone on the same Cloudflare account (nameservers at Cloudflare). Pages then CNAME-flattens the apex. A domain parked at another DNS host cannot be an apex on Pages until nameservers move.

Subdomain (`desk.example.com`): CNAME to `<project>.pages.dev`. The parent zone does not have to live on Cloudflare.

## GitHub Pages vs Cloudflare Pages

| Want | DNS target |
|---|---|
| Publish **inside Cloudflare** (this skill) | `<project>.pages.dev` (orange-cloud / proxied is fine) |
| Keep hosting on **GitHub Pages** | `malachaigrant01-droid.github.io`, DNS **grey-cloud** until GitHub issues the cert |

Do not mix. Proxied (orange) GitHub Pages breaks GitHub's HTTP certificate. For this skill, move hosting to Pages, then point the domain at Pages.

Until the user names a domain, stop after `*.pages.dev` and say the attach step is waiting on the hostname.

## SSL / CAA

Pages issues the cert. If issuance stalls, check CAA on the zone and allow `letsencrypt.org`. Do not toggle the DNS target away from Pages and back — that marks the custom domain inactive; use a redirect or origin rule for temporary cutovers.

## After the domain is live

Optional gate: [[access-idp]]. Public ABiZmuth legal hub should stay reachable without Access unless the user asked to lock it.
