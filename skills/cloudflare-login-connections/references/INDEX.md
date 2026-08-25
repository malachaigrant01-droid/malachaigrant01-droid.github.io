---
description: "Knowledge graph index for cloudflare-login-connections. Start here, then open only the node that matches the ask."
connections: [pages-git, access-idp, custom-domain]
---

# Cloudflare Login Connections Knowledge Graph

Three jobs, three nodes. Do not load all three unless the user asked for the full publish.

## Core

- [[pages-git]] — First deploy. Workers & Pages → Connect to Git → GitHub App → project name, branch, empty build, output dir. Use this when the user says connect GitHub, publish the repo, or Pages deploy.
- [[access-idp]] — Login methods. Zero Trust identity providers: GitHub OAuth App, Google web client, one-time PIN. Use this when the user says Cloudflare login, Access, SSO, GitHub/Google/OTP.
- [[custom-domain]] — Domain attach. Pages Custom domains, CNAME to `<project>.pages.dev`, apex vs www, CAA. Use this when the user says publish domain, attach domain, nameservers.

Typical order: [[pages-git]] until `*.pages.dev` exists → [[custom-domain]] → [[access-idp]] if the hub should sit behind Access.
