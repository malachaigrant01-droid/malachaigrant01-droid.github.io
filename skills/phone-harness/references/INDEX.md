---
description: "Knowledge graph index for phone-harness. Start here, then open only the node that matches the ask."
connections: [checks, viewports]
---

# Phone Harness Knowledge Graph

Two nodes. Load [[checks]] when fixing findings, [[viewports]] when the user asks which phones are covered or wants another size.

## Core

- [[checks]]: Every FAIL and WARN the harness prints, why it matters on a phone, and the usual fix. Use this when the user asks why something failed or how to fix it.
- [[viewports]]: iPhone SE 375, iPhone 15 393, Pixel 7 412, Galaxy Fold 280. What each one catches and how to add one. Use this when the user asks which phones are tested.

Typical order: run the script → [[checks]] for each FAIL → re-run → [[viewports]] only if coverage is questioned.
