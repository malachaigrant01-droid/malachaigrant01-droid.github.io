#!/usr/bin/env node
/**
 * Load every page of a static site in phone viewports and report layout problems.
 *
 * Usage:
 *     node phone_harness.mjs <site-root>
 *     node phone_harness.mjs . --viewports iphone-se,galaxy-fold --pages index.html,legal/
 *     node phone_harness.mjs . --out /tmp/phone --no-screenshots
 *
 * Exit 0 if no FAIL. Exit 1 on FAIL. Exit 2 if the harness itself cannot run.
 * Chromium emulation only: a pass here is not a pass on a real iPhone (WebKit).
 */

import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const VIEWPORTS = {
  "iphone-se": { width: 375, height: 667, deviceScaleFactor: 2 },
  "iphone-15": { width: 393, height: 852, deviceScaleFactor: 3 },
  "pixel-7": { width: 412, height: 915, deviceScaleFactor: 2.625 },
  "galaxy-fold": { width: 280, height: 653, deviceScaleFactor: 3 },
};
const DEFAULT_VIEWPORTS = ["iphone-se", "iphone-15", "pixel-7", "galaxy-fold"];
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36";
const MIN_TARGET_PX = 24; // WCAG 2.2 SC 2.5.8 Target Size (Minimum)
const MIN_FONT_PX = 12;
const SKIP_DIRS = new Set([".git", "node_modules", ".wrangler", ".phone-harness"]);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function parseArgs(argv) {
  const args = { root: ".", out: null, viewports: DEFAULT_VIEWPORTS, pages: null, screenshots: true };
  const rest = [...argv];
  while (rest.length) {
    const a = rest.shift();
    if (a === "--out") args.out = rest.shift();
    else if (a === "--viewports") args.viewports = rest.shift().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--pages") args.pages = rest.shift().split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--no-screenshots") args.screenshots = false;
    else if (a === "-h" || a === "--help") {
      console.log("usage: node phone_harness.mjs <site-root> [--out DIR] [--viewports a,b] [--pages p,q] [--no-screenshots]");
      console.log(`viewports: ${Object.keys(VIEWPORTS).join(", ")}`);
      process.exit(0);
    } else if (a.startsWith("--")) throw new Error(`unknown flag ${a}`);
    else args.root = a;
  }
  for (const v of args.viewports) {
    if (!VIEWPORTS[v]) throw new Error(`unknown viewport '${v}' (have: ${Object.keys(VIEWPORTS).join(", ")})`);
  }
  return args;
}

// ESM ignores NODE_PATH, so try the script dir, the cwd, then the global npm root.
function loadPlaywright() {
  const candidates = [
    () => createRequire(import.meta.url)("playwright"),
    () => createRequire(path.join(process.cwd(), "noop.js"))("playwright"),
    () => {
      const globalRoot = execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      return createRequire(path.join(globalRoot, "noop.js"))(path.join(globalRoot, "playwright"));
    },
  ];
  for (const load of candidates) {
    try {
      return load();
    } catch {}
  }
  return null;
}

function findPages(root) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name));
      } else if (entry.name.endsWith(".html")) {
        found.push(path.relative(root, path.join(dir, entry.name)).split(path.sep).join("/"));
      }
    }
  };
  walk(root);
  return found.sort();
}

function serve(root) {
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.resolve(root, "." + rel);
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// Runs inside the page. Keep it self-contained.
function inspectPage({ minTarget, minFont }) {
  const vw = window.innerWidth;
  const out = { viewportMeta: null, scrollWidth: 0, innerWidth: vw, overflow: [], smallTargets: [], smallText: [] };
  const meta = document.querySelector('meta[name="viewport"]');
  out.viewportMeta = meta ? meta.getAttribute("content") || "" : null;
  out.scrollWidth = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);

  const label = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    else if (el.classList.length) s += "." + [...el.classList].slice(0, 2).join(".");
    const text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40);
    return text ? `${s} "${text}"` : s;
  };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const clipped = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true;
    }
    return false;
  };

  // Overflow: keep the deepest offenders so the report names the real culprit.
  const wide = [...document.body.querySelectorAll("*")].filter(
    (el) => visible(el) && !clipped(el) && el.getBoundingClientRect().right > vw + 1
  );
  const deepest = wide.filter((el) => !wide.some((o) => o !== el && el.contains(o)));
  out.overflow = deepest.slice(0, 5).map((el) => ({ el: label(el), right: Math.round(el.getBoundingClientRect().right) }));

  const targets = document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [onclick]');
  for (const el of targets) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= minTarget && r.height >= minTarget) continue;
    // WCAG 2.5.8 inline exception: a link inside a sentence of text.
    if (el.tagName === "A") {
      const parent = el.parentElement;
      const own = (el.textContent || "").trim().length;
      const around = parent ? (parent.textContent || "").trim().length : own;
      const blockParent = parent && /^(P|LI|TD|DD|BLOCKQUOTE|FIGCAPTION|SPAN|EM|STRONG)$/.test(parent.tagName);
      if (blockParent && around - own > 20) continue;
    }
    out.smallTargets.push({ el: label(el), w: Math.round(r.width), h: Math.round(r.height) });
  }

  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || seen.has(el) || !visible(el)) continue;
    seen.add(el);
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < minFont) out.smallText.push({ el: label(el), px: Math.round(size * 10) / 10 });
  }
  return out;
}

function slug(page) {
  return page.replace(/\/$/, "/index").replace(/\.html$/, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "index";
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.log(`FAIL ${e.message}`);
    return 2;
  }
  const root = path.resolve(args.root);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    console.log(`FAIL site root is not a directory: ${root}`);
    return 2;
  }
  const pw = loadPlaywright();
  if (!pw) {
    console.log("FAIL playwright not found (npm i -D playwright, or a global install on NODE_PATH)");
    return 2;
  }
  const pages = args.pages || findPages(root);
  if (!pages.length) {
    console.log(`FAIL no .html pages under ${root}`);
    return 2;
  }
  const outDir = path.resolve(args.out || path.join(os.tmpdir(), "phone-harness"));
  fs.mkdirSync(outDir, { recursive: true });

  const server = await serve(root);
  const base = `http://127.0.0.1:${server.address().port}/`;
  const launch = { headless: true };
  if (process.env.PHONE_HARNESS_CHROMIUM) launch.executablePath = process.env.PHONE_HARNESS_CHROMIUM;
  let browser;
  try {
    browser = await pw.chromium.launch(launch);
  } catch (e) {
    server.close();
    console.log(`FAIL chromium did not launch: ${e.message.split("\n")[0]}`);
    console.log("     set PHONE_HARNESS_CHROMIUM=/path/to/chromium if the bundled build is missing");
    return 2;
  }

  const report = { root, base, outDir, viewports: args.viewports, results: [] };
  let fails = 0;
  let warns = 0;

  console.log(`root: ${root}`);
  console.log(`pages: ${pages.length} · viewports: ${args.viewports.join(", ")}`);
  console.log();

  for (const vpName of args.viewports) {
    const vp = VIEWPORTS[vpName];
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.deviceScaleFactor,
      isMobile: true,
      hasTouch: true,
      userAgent: MOBILE_UA,
    });
    for (const page of pages) {
      const tab = await context.newPage();
      const errors = [];
      tab.on("pageerror", (e) => errors.push(`js error: ${e.message.split("\n")[0]}`));
      // A local 404 also fires a console error and requestfailed; report it once.
      const bad = new Set();
      tab.on("console", (m) => {
        if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(`console: ${m.text().slice(0, 120)}`);
      });
      tab.on("response", (r) => {
        if (r.status() >= 400 && r.url().startsWith(base)) {
          bad.add(r.url());
          errors.push(`${r.status()} ${r.url().slice(base.length - 1)}`);
        }
      });
      tab.on("requestfailed", (r) => {
        if (r.url().startsWith(base) && !bad.has(r.url())) errors.push(`request failed ${r.url().slice(base.length - 1)}`);
      });

      const findings = { fail: [], warn: [] };
      try {
        await tab.goto(base + page, { waitUntil: "networkidle", timeout: 15000 });
        const r = await tab.evaluate(inspectPage, { minTarget: MIN_TARGET_PX, minFont: MIN_FONT_PX });

        if (r.viewportMeta === null) findings.fail.push("no <meta name=viewport> (phones render at 980px and zoom out)");
        else {
          if (!/width\s*=\s*device-width/.test(r.viewportMeta)) findings.fail.push(`viewport meta lacks width=device-width ("${r.viewportMeta}")`);
          if (/user-scalable\s*=\s*(no|0)/.test(r.viewportMeta)) findings.warn.push("viewport meta blocks pinch-zoom (user-scalable=no)");
          const max = r.viewportMeta.match(/maximum-scale\s*=\s*([\d.]+)/);
          if (max && parseFloat(max[1]) < 2) findings.warn.push(`viewport meta caps zoom at maximum-scale=${max[1]}`);
        }
        if (r.scrollWidth > r.innerWidth + 1) {
          const who = r.overflow.map((o) => `${o.el} → ${o.right}px`).join("; ") || "unknown element";
          findings.fail.push(`horizontal scroll: page is ${r.scrollWidth}px wide in a ${r.innerWidth}px screen (${who})`);
        }
        if (r.smallTargets.length) {
          const list = r.smallTargets.slice(0, 4).map((t) => `${t.el} ${t.w}×${t.h}`).join("; ");
          findings.warn.push(`${r.smallTargets.length} tap target(s) under ${MIN_TARGET_PX}px: ${list}${r.smallTargets.length > 4 ? "; …" : ""}`);
        }
        if (r.smallText.length) {
          const list = r.smallText.slice(0, 3).map((t) => `${t.el} ${t.px}px`).join("; ");
          findings.warn.push(`${r.smallText.length} text element(s) under ${MIN_FONT_PX}px: ${list}${r.smallText.length > 3 ? "; …" : ""}`);
        }
        for (const e of [...new Set(errors)]) findings.fail.push(e);

        if (args.screenshots) {
          const shot = path.join(outDir, vpName, `${slug(page)}.png`);
          fs.mkdirSync(path.dirname(shot), { recursive: true });
          await tab.screenshot({ path: shot, fullPage: true });
          findings.screenshot = shot;
        }
      } catch (e) {
        findings.fail.push(`page did not load: ${e.message.split("\n")[0]}`);
      }
      await tab.close();

      fails += findings.fail.length;
      warns += findings.warn.length;
      report.results.push({ page, viewport: vpName, width: vp.width, ...findings });
    }
    await context.close();
  }
  await browser.close();
  server.close();

  // One line per page + finding; name the viewports only when it is not all of them.
  for (const page of pages) {
    const rows = report.results.filter((r) => r.page === page);
    const lines = new Map();
    for (const r of rows) {
      for (const [level, list] of [["FAIL", r.fail], ["WARN", r.warn]]) {
        for (const msg of list) {
          const key = `${level}\u0000${msg}`;
          if (!lines.has(key)) lines.set(key, []);
          lines.get(key).push(`${r.viewport} ${r.width}px`);
        }
      }
    }
    if (!lines.size) {
      console.log(`OK   ${page}`);
      continue;
    }
    for (const [key, vps] of [...lines].sort()) {
      const [level, msg] = key.split("\u0000");
      const where = vps.length === rows.length ? "all viewports" : vps.join(", ");
      console.log(`${level} ${page} @ ${where}: ${msg}`);
    }
  }

  report.summary = { fails, warns, checked: pages.length * args.viewports.length };
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log();
  console.log(`checked ${report.summary.checked} page×viewport · ${fails} FAIL · ${warns} WARN`);
  console.log(`report: ${path.join(outDir, "report.json")}`);
  if (args.screenshots) console.log(`screenshots: ${outDir}/<viewport>/<page>.png`);
  console.log("Chromium phone emulation only. WebKit / iOS Safari and real-device checks are not covered.");
  return fails ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.log(`FAIL harness crashed: ${e.stack || e}`);
    process.exit(2);
  }
);
