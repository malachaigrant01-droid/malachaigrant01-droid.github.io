---
description: "The four phone viewports phone-harness emulates, what each catches, and how to add one."
connections: [checks]
---

# Viewports

All run with `isMobile`, `hasTouch` and an Android Chrome user agent.

| Name | CSS px | DPR | Why it is here |
|---|---|---|---|
| `iphone-se` | 375 × 667 | 2 | Smallest common iPhone. The usual "phone width" baseline |
| `iphone-15` | 393 × 852 | 3 | Current mainstream iPhone width |
| `pixel-7` | 412 × 915 | 2.625 | Common Android width |
| `galaxy-fold` | 280 × 653 | 3 | Folded cover screen. Stress test: most overflow bugs show here first |

## Not covered

- **WebKit / iOS Safari.** Safari differs on `100vh`, safe-area insets, form zoom on inputs under 16px, and `position:fixed` with the keyboard open. Check those on a real iPhone or with Playwright's WebKit build where it is available.
- **Landscape.** Add a viewport with width and height swapped if it matters.
- **Tablets.** Out of scope. This is a phone harness.

## Adding a viewport

Add an entry to `VIEWPORTS` in `scripts/phone_harness.mjs`, then run with `--viewports <name>`. Keep `DEFAULT_VIEWPORTS` short. Each one multiplies the run time.
