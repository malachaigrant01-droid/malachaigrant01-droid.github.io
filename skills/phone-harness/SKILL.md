---
name: phone-harness
description: "Load every page of a static site in phone viewports (iPhone SE, iPhone 15, Pixel 7, Galaxy Fold) with headless Chromium and report horizontal scroll, missing viewport meta, blocked zoom, small tap targets, tiny text, 404s and JS errors, with full-page screenshots. Use when checking the hub or ABiZmuth site on mobile, before publishing, or after a layout change."
type: workflow
lifecycle: active
---

# Phone Harness — phone-viewport checks for static sites

Serve a static site locally, open each `.html` page at four phone widths, and report what breaks. Use when the user asks whether the site works on a phone, wants mobile screenshots, or is about to publish a layout change.

## Honesty gate

- This is **Chromium emulation**. It is not iOS Safari (WebKit) and not a real device. Never say "works on iPhone" from this alone. Say "passes Chromium phone emulation at 280–412px".
- The harness tests the **local files**, not the live `*.github.io` or `*.pages.dev` URL. A pass does not prove the deployed copy matches.
- Only claim a finding is fixed after a re-run shows the line gone.

## Choose the surface

| Surface | Repo | Site root |
|---|---|---|
| Public hub | `malachaigrant01-droid/malachaigrant01-droid.github.io` | `.` (repo root) |
| Archive + legal mesh | `malachaigrant01-droid/ABiZmuth` (private) | `site` |

## Workflow

1. Run `node scripts/phone_harness.mjs <site-root> --out <scratch-dir>`. Keep `--out` outside the repo so screenshots are not committed.
2. Read the output. Exit `0` means no FAIL, `1` means at least one FAIL, `2` means the harness could not run (bad flag, Playwright or Chromium missing).
3. Fix every `FAIL` first. Then decide on `WARN` with the user, since they are style calls (see [[checks]]).
4. Open the screenshots for any page the user cares about, `<out>/<viewport>/<page>.png`, and look at them. Numbers miss things the eye catches.
5. Re-run until the lines you fixed are gone. Report the before and after counts.

Useful flags:

```bash
node scripts/phone_harness.mjs . --viewports galaxy-fold          # narrowest only
node scripts/phone_harness.mjs . --pages index.html,legal/terms.html
node scripts/phone_harness.mjs . --no-screenshots                  # faster
PHONE_HARNESS_CHROMIUM=/opt/pw-browsers/chromium node scripts/phone_harness.mjs .
```

## Requirements

- Node 18+ and `playwright` (local `node_modules` or global npm root). The script finds either.
- A Chromium build Playwright can launch. Do **not** run `playwright install` in a sandbox that ships browsers. Point `PHONE_HARNESS_CHROMIUM` at the binary instead.

## Knowledge Graph

Start at `references/INDEX.md`.

- [[checks]]: what each FAIL / WARN means and the usual CSS fix
- [[viewports]]: the four sizes and why each is there

## Common Issues

| Problem | Fix |
|---|---|
| `FAIL playwright not found` | `npm i -D playwright` in the repo, or run where a global Playwright is installed |
| `FAIL chromium did not launch` | Set `PHONE_HARNESS_CHROMIUM` to an existing Chromium binary |
| Horizontal scroll only at `galaxy-fold 280px` | Something has a fixed width or a long unbroken string. Fix with `max-width:100%`, `overflow-wrap:anywhere`, or wrap tables in `overflow-x:auto` |
| Tap-target WARN on every nav link | `nav a` is text height only. Add `display:inline-block; padding:.35rem 0` or `min-height:24px` |
| Tap-target WARN on a link inside a sentence | Shouldn't happen. Inline links in `p`/`li`/`td` with surrounding text are exempt (WCAG 2.5.8). If one shows up, the parent has too little text around it |
| `404 /favicon.svg` on a sub-page | Root-relative paths need the site served from its root. Pass the site root, not a subfolder |
| Screenshots land in the repo | Pass `--out` to a scratch directory |
