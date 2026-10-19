# Changelog

## 2026-10-19
- Initial skill creation
- `scripts/phone_harness.mjs`: local static server + Playwright Chromium at iPhone SE / iPhone 15 / Pixel 7 / Galaxy Fold
- Checks: viewport meta, horizontal overflow (names the culprit), blocked zoom, tap targets < 24px (WCAG 2.5.8, inline links exempt), text < 12px, local 404s, JS/console errors
- Full-page screenshots and `report.json` per run
