---
description: "What each phone-harness FAIL and WARN means and the usual CSS/HTML fix."
connections: [viewports]
---

# Checks

## FAIL (exit 1)

| Line | Meaning | Usual fix |
|---|---|---|
| `no <meta name=viewport>` | Phones lay the page out at 980px and shrink it. Everything is tiny | `<meta name="viewport" content="width=device-width, initial-scale=1" />` in `<head>` |
| `viewport meta lacks width=device-width` | Same problem with a fixed width set | Use `width=device-width` |
| `horizontal scroll: page is Npx wide in a Wpx screen (el → right)` | Something sticks out past the right edge, so the page side-scrolls. The listed elements are the deepest offenders | Fixed `width` → `max-width:100%`. Long URLs/emails → `overflow-wrap:anywhere`. Wide tables → wrap in a `div` with `overflow-x:auto` (the harness ignores elements inside a scroll container) |
| `404 /path` | A local file the page asks for does not exist | Fix the path. Root-relative `/x` resolves to the site root |
| `request failed /path` | A local request died without a response | Usually a bad path or a blocked scheme |
| `js error: …` / `console: …` | Uncaught exception or `console.error` on load | Fix the script. A page that errors on phones usually errors on desktop too |
| `page did not load` | Navigation timed out (15s) or crashed | Check for an infinite loop or a request that never finishes |

External URLs (fonts, CDNs) are not counted as 404s. The harness has no reason to trust the network in a sandbox.

## WARN (exit unaffected)

| Line | Meaning | Usual fix |
|---|---|---|
| `viewport meta blocks pinch-zoom` | `user-scalable=no` stops low-vision users zooming | Remove it |
| `viewport meta caps zoom at maximum-scale=N` | Zoom capped below 2× | Remove `maximum-scale` |
| `N tap target(s) under 24px` | Links/buttons smaller than 24×24 CSS px (WCAG 2.2 SC 2.5.8 minimum). Links inside a sentence are exempt | `display:inline-block; padding:.35rem 0` on nav and list links, or `min-height:24px`. Apple and Google suggest 44/48px for primary buttons |
| `N text element(s) under 12px` | Computed font size below 12px. Readable on desktop, hard on a phone | Raise to `.75rem` (12px) or more. Small-caps kickers are a judgement call |

WARNs are style calls. Ask before changing a deliberate design choice such as a small kicker label.
