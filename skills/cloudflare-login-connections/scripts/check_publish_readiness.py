#!/usr/bin/env python3
"""Check a repo is wired for Cloudflare Pages before the dashboard login.

Usage:
    python3 check_publish_readiness.py <repo-root>
    python3 check_publish_readiness.py . --expect-name abizmuth --expect-output site

Exit 0 if files are ready. Exit 1 on FAIL. Dashboard login is never claimed done.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def parse_wrangler(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        out[key.strip()] = value.strip().strip('"').strip("'")
    return out


def check(root: Path, expect_name: str | None, expect_output: str | None) -> int:
    fails: list[str] = []
    warns: list[str] = []
    oks: list[str] = []

    wrangler = root / "wrangler.toml"
    if not wrangler.is_file():
        fails.append("missing wrangler.toml")
        data: dict[str, str] = {}
    else:
        data = parse_wrangler(wrangler.read_text(encoding="utf-8"))
        oks.append(f"wrangler.toml present ({wrangler})")

    name = data.get("name", "")
    output = data.get("pages_build_output_dir", "")
    if not name:
        fails.append("wrangler.toml missing name")
    elif expect_name and name != expect_name:
        fails.append(f"project name is '{name}', expected '{expect_name}'")
    else:
        oks.append(f"project name = {name}")

    if not output:
        fails.append("wrangler.toml missing pages_build_output_dir")
    elif expect_output and output != expect_output:
        fails.append(f"output dir is '{output}', expected '{expect_output}'")
    else:
        oks.append(f"pages_build_output_dir = {output}")

    out_dir = root if output in ("", ".", "./") else root / output
    index = out_dir / "index.html"
    if index.is_file():
        oks.append(f"index.html at {index.relative_to(root)}")
    else:
        fails.append(f"no index.html under output dir ({out_dir})")

    headers = out_dir / "_headers"
    if headers.is_file():
        oks.append(f"_headers at {headers.relative_to(root)}")
    else:
        warns.append(f"no _headers in output dir ({out_dir})")

    workflow = root / ".github" / "workflows" / "cloudflare-pages.yml"
    if workflow.is_file():
        text = workflow.read_text(encoding="utf-8")
        oks.append("GitHub Action .github/workflows/cloudflare-pages.yml present")
        if "CLOUDFLARE_API_TOKEN" in text:
            warns.append(
                "wrangler-action needs GitHub secrets CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID; "
                "Connect to Git does not"
            )
    else:
        warns.append("no wrangler GitHub Action (optional if dashboard Connect to Git is used)")

    print(f"root: {root}")
    for line in oks:
        print(f"OK   {line}")
    for line in warns:
        print(f"WARN {line}")
    for line in fails:
        print(f"FAIL {line}")

    print()
    print("Dashboard (cannot be completed without a Cloudflare login):")
    print("  1. https://dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git")
    print("  2. Authorize Cloudflare Workers & Pages GitHub App on the target repo")
    print(f"  3. Production branch main · build command empty · output '{output or '.'}'")
    print("  4. Save and Deploy → expect https://<project>.pages.dev")
    print("  5. Custom domains → Set up a domain (see references/custom-domain.md)")
    print("  6. Zero Trust → Integrations → Identity providers (see references/access-idp.md)")
    print()
    print("BLOCKED: Cloudflare session / API token not assumed. Files ready ≠ domain live.")
    return 1 if fails else 0


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("root", nargs="?", default=".", help="repository root")
    p.add_argument("--expect-name", default=None)
    p.add_argument("--expect-output", default=None)
    args = p.parse_args()
    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"FAIL repo root is not a directory: {root}")
        return 1
    return check(root, args.expect_name, args.expect_output)


if __name__ == "__main__":
    sys.exit(main())
