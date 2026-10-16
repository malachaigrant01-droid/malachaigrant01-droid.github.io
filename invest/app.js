(function () {
  "use strict";

  const MIN_PER_ASSET = 2; // A$
  const CG_POLL_MS = 30000;
  const FX_POLL_MS = 600000;
  const FH_GAP_MS = 1100; // Finnhub free tier: 60 req/min
  const FH_WS_MAX = 50;
  const BAR_MS = 300000; // signals run on 5-minute closing prices
  const BAR_CAP = 300;
  const AUTO_MS = 15000;
  const TRADABLE_MS = 15 * 60000; // last trade must be this recent, so closed markets aren't traded

  const Sig = window.InvestSignals;
  const AT = window.InvestAutoTrader;

  // ---------- storage ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem("abz-invest:" + k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem("abz-invest:" + k, JSON.stringify(v)); } catch (_) { /* private mode or full */ } },
    del(k) { try { localStorage.removeItem("abz-invest:" + k); } catch (_) { /* ignore */ } },
  };

  // ---------- universe ----------
  const CATS = window.INVEST_CATEGORIES;
  const byKey = new Map();
  CATS.forEach((c) => c.assets.forEach((a) => {
    a.key = a.src + ":" + a.sym;
    a.cat = c.id;
    a.catName = c.name;
    byKey.set(a.key, a);
  }));
  const ALL = { id: "all", name: "Top picks", blurb: "Every category in one list. Recommended only shows the most popular assets across the whole app.", assets: [...byKey.values()] };
  const catById = (id) => (id === "all" ? ALL : CATS.find((c) => c.id === id));

  // ---------- state ----------
  const quotes = new Map(); // key -> {px, ccy, chg, volAud, at (fetched), tt (last trade)}
  const bars = new Map(); // key -> {b: [5-minute bucket], c: [close in A$]}
  const sigCache = new Map();
  let usdAud = null;
  let current = null; // category object
  const selected = new Set(store.get("selected", []).filter((k) => byKey.has(k)));
  let holdings = store.get("holdings", []);
  let finnhubKey = store.get("finnhubKey", "");
  let brokerUrl = store.get("brokerUrl", "");
  let trader = loadTrader();
  let alerts = store.get("alerts", []);
  const alertMemo = store.get("alertMemo", {});
  let notifyOn = store.get("notify", false);

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const rowId = (key) => "r_" + key.replace(/[^a-z0-9]/gi, "_");
  const idToKey = new Map([...byKey.keys()].map((k) => [rowId(k), k]));
  const audFmt = (n, dp) => n == null || !isFinite(n) ? "—" : n.toLocaleString("en-AU", { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const priceFmt = (n) => n == null ? "—" : n >= 1000 ? audFmt(n, 0) : n >= 1 ? audFmt(n, 2) : n >= 0.01 ? audFmt(n, 4) : n.toPrecision(3);
  const money = (n) => (n <= -0.005 ? "-A$" : "A$") + audFmt(Math.abs(n), 2);
  const compact = (n) => n == null ? "—" : n.toLocaleString("en-AU", { notation: "compact", maximumFractionDigits: 1 });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const timeFmt = (t) => {
    const d = new Date(t);
    const hm = d.toLocaleTimeString("en-AU", { hour12: false, hour: "2-digit", minute: "2-digit" });
    return d.toDateString() === new Date().toDateString() ? hm : d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }) + " " + hm;
  };

  function audPrice(key) {
    const q = quotes.get(key);
    if (!q || q.px == null) return null;
    if (q.ccy === "AUD") return q.px;
    return usdAud ? q.px * usdAud : null;
  }

  function isStale(key) {
    const q = quotes.get(key);
    if (!q) return true;
    const a = byKey.get(key);
    return Date.now() - q.at > (a.src === "crypto" ? 120000 : 900000);
  }

  // A live price whose last trade is recent: crypto any time, shares only while their market is open.
  function tradable(key) {
    const q = quotes.get(key);
    return !!q && audPrice(key) != null && Date.now() - (q.tt || 0) < TRADABLE_MS;
  }

  // Popularity: curated rank, lifted by live 24h volume rank inside the asset's category.
  function score(a) {
    const q = quotes.get(a.key);
    if (!q || q.volAud == null) return a.pop;
    const peers = catById(a.cat).assets.map((p) => quotes.get(p.key)).filter((x) => x && x.volAud != null).map((x) => x.volAud).sort((x, y) => x - y);
    if (peers.length < 3) return a.pop;
    const pct = peers.indexOf(q.volAud) / (peers.length - 1);
    return Math.max(a.pop, Math.round(1 + 4 * pct));
  }
  const isPopular = (a) => score(a) >= 4;

  function setQuote(key, patch) {
    const prev = quotes.get(key);
    const before = audPrice(key);
    quotes.set(key, Object.assign({}, prev, patch, { at: Date.now() }));
    const after = audPrice(key);
    if (patch.px != null && after != null) addTick(key, after, patch.tt || Date.now());
    scheduleRow(key, before != null && after != null ? Math.sign(after - before) : 0);
  }

  // ---------- price history (5-minute bars) ----------
  function addTick(key, aud, ts) {
    const bucket = Math.floor(ts / BAR_MS);
    let s = bars.get(key);
    if (!s) bars.set(key, (s = { b: [], c: [] }));
    const n = s.b.length;
    if (n && s.b[n - 1] === bucket) s.c[n - 1] = aud;
    else if (!n || bucket > s.b[n - 1]) {
      s.b.push(bucket);
      s.c.push(aud);
      if (s.b.length > BAR_CAP) { s.b.splice(0, s.b.length - BAR_CAP); s.c.splice(0, s.c.length - BAR_CAP); }
    }
  }

  // History from an API fills in older bars; bars already built from live prices win.
  function mergeBars(key, points) {
    const m = new Map();
    points.forEach((p) => { if (p[1] > 0) m.set(Math.floor(p[0] / BAR_MS), p[1]); });
    const s = bars.get(key);
    if (s) s.b.forEach((b, i) => m.set(b, s.c[i]));
    const b = [...m.keys()].sort((x, y) => x - y).slice(-BAR_CAP);
    bars.set(key, { b, c: b.map((x) => m.get(x)) });
  }

  // Signal from completed bars only, so it can't flip back and forth inside a bar.
  function signal(key) {
    const s = bars.get(key);
    let n = s ? s.b.length : 0;
    if (n && s.b[n - 1] >= Math.floor(Date.now() / BAR_MS)) n--;
    const stamp = n ? s.b[n - 1] + ":" + n + ":" + s.c[n - 1] : "0";
    const hit = sigCache.get(key);
    if (hit && hit.stamp === stamp) return hit.sig;
    const sig = Sig.evaluate(n ? s.c.slice(0, n) : []);
    sigCache.set(key, { stamp, sig });
    return sig;
  }

  function sigLabel(s) {
    if (s.action === "buy") return "BUY " + s.strength;
    if (s.action === "sell") return s.kind === "peak" ? "PEAK" : "FALLING";
    return s.action === "wait" ? "…" : "HOLD";
  }
  function paintSig(cell, key) {
    const s = signal(key);
    cell.textContent = sigLabel(s);
    cell.className = "sig sig-" + s.action + (cell.classList.contains("hide-sm") ? " hide-sm" : "");
    cell.title = s.reason + (s.ceiling ? " · 2σ ceiling A$" + priceFmt(s.ceiling) : "");
  }

  // Crypto starts with ~29 h of 5-minute history; shares keep what this browser has seen.
  // Coinbase allows quick calls; CoinGecko's free tier rate-limits hard, so its few coins go slowly.
  async function seedHistory() {
    for (const a of cryptoAssets.filter((x) => x.cb)) {
      if (!usdAud) break;
      try {
        const r = await fetch("https://api.exchange.coinbase.com/products/" + a.cb + "/candles?granularity=300", { cache: "no-store" });
        if (r.ok) { const rows = await r.json(); if (Array.isArray(rows)) mergeBars(a.key, rows.map((k) => [k[0] * 1000, k[4] * usdAud])); }
      } catch (_) { /* this asset warms up from live prices instead */ }
      scheduleRow(a.key, 0);
      await sleep(150);
    }
    let queue = cryptoAssets.filter((x) => !x.cb).map((a) => ({ a, tries: 0 }));
    while (queue.length) {
      const job = queue.shift();
      let limited = false;
      try {
        const r = await fetch("https://api.coingecko.com/api/v3/coins/" + encodeURIComponent(job.a.cg) + "/market_chart?vs_currency=aud&days=1", { cache: "no-store" });
        if (r.status === 429) limited = true;
        else if (r.ok) { const j = await r.json(); if (j && Array.isArray(j.prices)) mergeBars(job.a.key, j.prices); }
      } catch (_) { /* warms up from live prices instead */ }
      if (limited && ++job.tries < 2) queue.push(job);
      scheduleRow(job.a.key, 0);
      await sleep(limited ? 90000 : 20000);
    }
  }

  function loadStockBars() {
    const saved = store.get("bars", {});
    Object.keys(saved).forEach((k) => {
      const v = saved[k];
      if (byKey.has(k) && Array.isArray(v) && Array.isArray(v[0]) && v[0].length === v[1].length) bars.set(k, { b: v[0].slice(-BAR_CAP), c: v[1].slice(-BAR_CAP) });
    });
  }
  function saveStockBars() {
    const out = {};
    bars.forEach((s, k) => { if (!k.startsWith("crypto:") && s.b.length) out[k] = [s.b, s.c.map((x) => +x.toPrecision(7))]; });
    store.set("bars", out);
  }

  // ---------- render batching ----------
  const dirty = new Map();
  let frame = 0;
  function scheduleRow(key, dir) {
    dirty.set(key, dirty.get(key) || dir);
    if (!frame) frame = requestAnimationFrame(flush);
  }
  function flush() {
    frame = 0;
    dirty.forEach((dir, key) => paintRow(key, dir));
    dirty.clear();
  }

  // ---------- feeds: FX ----------
  async function pollFx() {
    try {
      const r = await fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" });
      const j = await r.json();
      if (j && j.rates && j.rates.AUD) {
        usdAud = j.rates.AUD;
        pill("feed-fx", "on", "FX 1 USD = A$" + usdAud.toFixed(4) + " · daily");
        byKey.forEach((a) => scheduleRow(a.key, 0));
      } else throw new Error("no AUD");
    } catch (e) {
      pill("feed-fx", usdAud ? "wait" : "off", usdAud ? "FX cached" : "FX offline");
    }
  }

  // ---------- feeds: crypto (CoinGecko poll + Coinbase stream) ----------
  const cryptoAssets = [...byKey.values()].filter((a) => a.src === "crypto");
  let cbLive = false, cgLoaded = false;

  async function pollCoinGecko() {
    const ids = cryptoAssets.map((a) => a.cg).join(",");
    try {
      const r = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=aud&per_page=250&ids=" + encodeURIComponent(ids), { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      const rows = await r.json();
      const byCg = new Map(rows.map((x) => [x.id, x]));
      cryptoAssets.forEach((a) => {
        const x = byCg.get(a.cg);
        if (!x) return;
        // Volume always comes from here (global, all exchanges) so popularity ranks like with like.
        // Price and 24h change come from the Coinbase stream while it is fresh.
        const q = quotes.get(a.key);
        const streamFresh = q && q.ccy === "USD" && Date.now() - q.at < 60000;
        const patch = { volAud: x.total_volume };
        if (!streamFresh) Object.assign(patch, { px: x.current_price, ccy: "AUD", chg: x.price_change_percentage_24h, tt: Date.parse(x.last_updated) || Date.now() });
        setQuote(a.key, patch);
      });
      if (!cbLive) pill("feed-crypto", "on", "Crypto live · 30s");
      // First volume data can change which assets count as popular; refresh an open list once.
      if (!cgLoaded) { cgLoaded = true; if (current) renderRows(); }
    } catch (e) {
      if (!cbLive) pill("feed-crypto", "wait", "Crypto retrying");
    }
  }

  let cbBackoff = 1000;
  function connectCoinbase() {
    let ws;
    try { ws = new WebSocket("wss://ws-feed.exchange.coinbase.com"); } catch (_) { return; }
    const byProduct = new Map(cryptoAssets.filter((a) => a.cb).map((a) => [a.cb, a]));
    ws.onopen = () => {
      cbBackoff = 1000;
      // One product per message so an unlisted product can't sink the rest.
      byProduct.forEach((_, pid) => ws.send(JSON.stringify({ type: "subscribe", product_ids: [pid], channels: ["ticker"] })));
    };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m.type !== "ticker") return;
      const a = byProduct.get(m.product_id);
      if (!a) return;
      const px = +m.price, open = +m.open_24h;
      if (!(px > 0)) return;
      if (!cbLive) { cbLive = true; pill("feed-crypto", "on", "Crypto streaming"); }
      const patch = { px, ccy: "USD", tt: Date.parse(m.time) || Date.now() };
      if (open > 0) patch.chg = ((px - open) / open) * 100;
      setQuote(a.key, patch);
    };
    ws.onclose = () => {
      cbLive = false;
      pill("feed-crypto", "wait", "Crypto polling");
      setTimeout(connectCoinbase, cbBackoff);
      cbBackoff = Math.min(cbBackoff * 2, 60000);
    };
    ws.onerror = () => { try { ws.close(); } catch (_) { /* ignore */ } };
  }

  // ---------- feeds: stocks (Finnhub) ----------
  const stockAssets = [...byKey.values()].filter((a) => a.src !== "crypto");
  let fhTimer = 0, fhIdx = 0, fhAsxBlocked = false, fhWs = null, fhWsSyms = new Set(), fhWsBackoff = 1000, fhGen = 0;
  const fhSym = (a) => (a.src === "asx" ? a.sym + ".AX" : a.sym);

  function fhQueue() {
    // Current category first, then everything else; skip ASX if the plan doesn't cover it.
    const pri = current ? current.assets.filter((a) => a.src !== "crypto") : [];
    const rest = stockAssets.filter((a) => !pri.includes(a));
    return pri.concat(rest).filter((a) => !(fhAsxBlocked && a.src === "asx"));
  }

  async function fhTick(gen) {
    if (gen !== fhGen || !finnhubKey) return;
    const q = fhQueue();
    if (!q.length) return;
    const a = q[fhIdx++ % q.length];
    let wait = FH_GAP_MS;
    try {
      const r = await fetch("https://finnhub.io/api/v1/quote?symbol=" + encodeURIComponent(fhSym(a)) + "&token=" + encodeURIComponent(finnhubKey), { cache: "no-store" });
      if (r.status === 401) { pill("feed-stocks", "off", "Stocks: key rejected"); return; }
      if (r.status === 429) wait = 15000;
      else if (r.status === 403) { if (a.src === "asx") fhAsxBlocked = true; }
      else if (r.ok) {
        const j = await r.json();
        if (j && j.c > 0) {
          // Bars are keyed on the quote's own trade time, so a closed market adds no new bars.
          setQuote(a.key, { px: j.c, ccy: a.src === "asx" ? "AUD" : "USD", chg: j.dp, pc: j.pc, tt: j.t ? j.t * 1000 : Date.now() });
          pill("feed-stocks", "on", fhWs && fhWs.readyState === 1 ? "Stocks streaming" : "Stocks live");
        } else if (a.src === "asx") fhAsxBlocked = true;
      }
    } catch (_) { wait = 5000; }
    if (gen === fhGen) fhTimer = setTimeout(() => fhTick(gen), wait);
  }

  function fhWsTargets() {
    const list = (current ? current.assets : ALL.assets).filter((a) => a.src === "us");
    list.sort((x, y) => (selected.has(y.key) - selected.has(x.key)) || (score(y) - score(x)));
    return new Set(list.slice(0, FH_WS_MAX).map((a) => a.sym));
  }

  function fhWsSync() {
    if (!fhWs || fhWs.readyState !== 1) return;
    const want = fhWsTargets();
    fhWsSyms.forEach((s) => { if (!want.has(s)) fhWs.send(JSON.stringify({ type: "unsubscribe", symbol: s })); });
    want.forEach((s) => { if (!fhWsSyms.has(s)) fhWs.send(JSON.stringify({ type: "subscribe", symbol: s })); });
    fhWsSyms = want;
  }

  function connectFinnhubWs(gen) {
    if (gen !== fhGen || !finnhubKey) return;
    const ws = new WebSocket("wss://ws.finnhub.io?token=" + encodeURIComponent(finnhubKey));
    fhWs = ws;
    fhWsSyms = new Set();
    ws.onopen = () => { fhWsBackoff = 1000; fhWsSync(); pill("feed-stocks", "on", "Stocks streaming"); };
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m.type !== "trade" || !Array.isArray(m.data)) return;
      const last = new Map();
      m.data.forEach((t) => last.set(t.s, t));
      last.forEach((t, s) => {
        const key = "us:" + s;
        if (!byKey.has(key)) return;
        const q = quotes.get(key);
        const patch = { px: t.p, ccy: "USD", tt: t.t || Date.now() };
        if (q && q.pc > 0) patch.chg = ((t.p - q.pc) / q.pc) * 100;
        setQuote(key, patch);
      });
    };
    ws.onclose = () => {
      if (gen !== fhGen) return;
      setTimeout(() => connectFinnhubWs(gen), fhWsBackoff);
      fhWsBackoff = Math.min(fhWsBackoff * 2, 60000);
    };
    ws.onerror = () => { try { ws.close(); } catch (_) { /* ignore */ } };
  }

  function startFinnhub() {
    fhGen++;
    clearTimeout(fhTimer);
    if (fhWs) { try { fhWs.close(); } catch (_) { /* ignore */ } fhWs = null; }
    fhAsxBlocked = false;
    if (!finnhubKey) { pill("feed-stocks", "wait", "Stocks: add key in Settings"); return; }
    pill("feed-stocks", "wait", "Stocks connecting");
    const gen = fhGen;
    fhTick(gen);
    connectFinnhubWs(gen);
  }

  function pill(id, state, text) {
    const p = $(id);
    p.className = "pill " + (state || "");
    p.textContent = text;
  }

  // ---------- categories view ----------
  function renderCats() {
    const box = $("categories");
    box.textContent = "";
    [ALL].concat(CATS).forEach((c) => {
      const b = el("button", "cat");
      b.type = "button";
      b.dataset.cat = c.id;
      const badge = el("span", "badge", "Recommended");
      badge.style.alignSelf = "flex-start";
      b.append(badge, el("h3", null, c.name), el("div", "meta count"), el("div", "move"), el("div", "meta", c.blurb));
      b.addEventListener("click", () => openCat(c.id));
      box.append(b);
    });
    refreshCats();
  }

  // Updates card text in place so keyboard focus survives the live refresh.
  function refreshCats() {
    // Only the two categories with the highest share of popular assets get the badge.
    const share = (c) => c.assets.filter(isPopular).length / c.assets.length;
    const top = new Set(CATS.slice().sort((x, y) => share(y) - share(x)).slice(0, 2).map((c) => c.id));
    document.querySelectorAll("#categories .cat").forEach((b) => {
      const c = catById(b.dataset.cat);
      const pop = c.assets.filter(isPopular);
      const moves = pop.map((a) => quotes.get(a.key)).filter((q) => q && q.chg != null).map((q) => q.chg);
      const avg = moves.length ? moves.reduce((s, x) => s + x, 0) / moves.length : null;
      const buys = pop.filter((a) => signal(a.key).action === "buy").length;
      b.querySelector(".count").textContent = c.assets.length + " assets · " + pop.length + " recommended · " + buys + " buy signal" + (buys === 1 ? "" : "s");
      const move = b.querySelector(".move");
      move.className = "move " + (avg == null ? "muted" : avg >= 0 ? "up" : "down");
      move.textContent = avg == null ? "awaiting prices" : (avg >= 0 ? "+" : "") + avg.toFixed(2) + "% 24h (recommended avg)";
      b.querySelector(".badge").hidden = !top.has(c.id);
    });
  }

  function openCat(id) {
    current = catById(id);
    $("categories").hidden = true;
    $("category").hidden = false;
    $("cat-title").textContent = current.name + " · " + current.assets.length + " assets";
    $("cat-blurb").textContent = current.blurb;
    $("search").value = "";
    renderRows();
    fhWsSync();
    fhIdx = 0;
    window.scrollTo(0, 0);
  }

  function closeCat() {
    current = null;
    $("category").hidden = true;
    $("categories").hidden = false;
    refreshCats();
    fhWsSync();
  }

  function visibleAssets() {
    const q = $("search").value.trim().toLowerCase();
    const popOnly = $("popular-only").checked;
    return current.assets
      .filter((a) => !popOnly || isPopular(a) || selected.has(a.key))
      .filter((a) => !q || a.sym.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
      .sort((x, y) => (score(y) - score(x)) || x.sym.localeCompare(y.sym));
  }

  function renderRows() {
    const tb = $("rows");
    tb.textContent = "";
    const list = visibleAssets();
    if (!list.length) {
      const tr = el("tr"); const td = el("td", "muted", "No matches."); td.colSpan = 7; tr.append(td); tb.append(tr);
      return;
    }
    list.forEach((a) => {
      const tr = el("tr");
      tr.id = rowId(a.key);
      const cb = el("input");
      cb.type = "checkbox";
      cb.checked = selected.has(a.key);
      cb.setAttribute("aria-label", "Select " + a.sym);
      cb.addEventListener("change", () => { toggle(a.key, cb.checked); });
      const c0 = el("td"); c0.append(cb);
      const c1 = el("td");
      const tk = el("span", "tk", a.sym);
      const kind = el("span", "kind", a.src === "crypto" ? "CRYPTO" : (a.src === "asx" ? "ASX " : "US ") + (a.kind === "ETF" ? "ETF" : ""));
      c1.append(tk, kind);
      if (isPopular(a)) { c1.append(" "); c1.append(el("span", "badge", "Recommended")); }
      if (current.id === "all") c1.append(el("span", "nm", a.name + " · " + a.catName));
      else c1.append(el("span", "nm", a.name));
      const c2 = el("td", "r px");
      const c3 = el("td", "r chg");
      const c4 = el("td", "r vol hide-sm");
      const c5 = el("td", "dots hide-sm");
      const c6 = el("td", "sig");
      tr.append(c0, c1, c2, c3, c4, c5, c6);
      if (selected.has(a.key)) tr.classList.add("sel");
      tb.append(tr);
      paintRow(a.key, 0);
    });
  }

  function paintRow(key, dir) {
    const tr = document.getElementById(rowId(key));
    if (!tr) return;
    const a = byKey.get(key);
    const q = quotes.get(key);
    const px = audPrice(key);
    const pxCell = tr.querySelector(".px");
    pxCell.textContent = px == null ? (a.src === "crypto" ? "…" : finnhubKey ? (fhAsxBlocked && a.src === "asx" ? "plan" : "…") : "key") : priceFmt(px);
    pxCell.title = px == null && a.src !== "crypto" && !finnhubKey ? "Add a Finnhub key in Settings for live stock prices" : px == null && a.src === "asx" && fhAsxBlocked ? "Your Finnhub plan does not include ASX quotes" : "";
    pxCell.classList.toggle("stale", px != null && isStale(key));
    if (dir) {
      pxCell.classList.remove("flash-up", "flash-down");
      void pxCell.offsetWidth;
      pxCell.classList.add(dir > 0 ? "flash-up" : "flash-down");
    }
    const chg = q && q.chg != null ? q.chg : null;
    const chgCell = tr.querySelector(".chg");
    chgCell.textContent = chg == null ? "—" : (chg >= 0 ? "+" : "") + chg.toFixed(2) + "%";
    chgCell.className = "r chg " + (chg == null ? "" : chg >= 0 ? "up" : "down");
    tr.querySelector(".vol").textContent = q && q.volAud != null ? "A$" + compact(q.volAud) : "—";
    const s = score(a);
    tr.querySelector(".dots").textContent = "●".repeat(s) + "○".repeat(5 - s);
    paintSig(tr.querySelector(".sig"), key);
  }

  // ---------- selection & order ----------
  function toggle(key, on) {
    if (on) selected.add(key); else selected.delete(key);
    store.set("selected", [...selected]);
    const tr = document.getElementById(rowId(key));
    if (tr) tr.classList.toggle("sel", on);
    updateOrderBar();
    fhWsSync();
  }

  function selectMany(list, on) {
    list.forEach((a) => { if (on) selected.add(a.key); else selected.delete(a.key); });
    store.set("selected", [...selected]);
    if (current) renderRows();
    updateOrderBar();
    fhWsSync();
  }

  function updateOrderBar() {
    const n = selected.size;
    $("orderbar").hidden = n === 0 || view !== "markets";
    $("ob-count").textContent = n;
    const min = n * MIN_PER_ASSET;
    $("ob-min").textContent = "A$" + min;
    const amt = $("amount");
    amt.min = min;
    if (!amt.value || +amt.value < min) amt.value = Math.max(min, +amt.value || 0);
  }

  // Splits total across selected assets; every asset gets at least A$2.
  function allocate(total, mode) {
    const list = [...selected].map((k) => byKey.get(k));
    const w = new Map(list.map((a) => [a.key, mode === "popular" ? score(a) : 1]));
    const out = new Map();
    let pool = list.slice(), remaining = total;
    for (;;) {
      const wsum = pool.reduce((s, a) => s + w.get(a.key), 0);
      const under = pool.filter((a) => (remaining * w.get(a.key)) / wsum < MIN_PER_ASSET);
      if (!under.length) { pool.forEach((a) => out.set(a.key, (remaining * w.get(a.key)) / wsum)); break; }
      under.forEach((a) => { out.set(a.key, MIN_PER_ASSET); remaining -= MIN_PER_ASSET; });
      pool = pool.filter((a) => !under.includes(a));
      if (!pool.length) break;
    }
    // Round to cents; put the rounding residue on the largest line.
    let cents = 0, big = null;
    out.forEach((v, k) => { const r = Math.floor(v * 100) / 100; out.set(k, r); cents += r; if (!big || r > out.get(big)) big = k; });
    if (big) out.set(big, Math.round((out.get(big) + (total - cents)) * 100) / 100);
    return list.map((a) => {
      const amt = out.get(a.key);
      const px = audPrice(a.key);
      return { a, amt, px, units: px ? amt / px : null };
    });
  }

  let lastOrder = [];
  function review() {
    const n = selected.size;
    const total = Math.round((+$("amount").value || 0) * 100) / 100;
    if (total < n * MIN_PER_ASSET) { alert("Minimum is A$" + MIN_PER_ASSET + " per asset: A$" + n * MIN_PER_ASSET + " for " + n + " assets."); return; }
    lastOrder = allocate(total, $("weighting").value);
    const tb = $("rv-rows");
    tb.textContent = "";
    lastOrder.forEach((o) => {
      const tr = el("tr");
      const c1 = el("td"); c1.append(el("span", "tk", o.a.sym), el("span", "nm", o.a.name));
      const sc = el("td", "sig"); paintSig(sc, o.a.key);
      tr.append(c1, el("td", "r", audFmt(o.amt, 2)), el("td", "r", priceFmt(o.px)), el("td", "r", o.units == null ? "—" : o.units.toPrecision(4)), sc);
      tb.append(tr);
    });
    const missing = lastOrder.filter((o) => o.px == null).length;
    $("rv-note").textContent = n + " assets · " + money(total) + " · prices as of " + new Date().toLocaleTimeString("en-AU") + (missing ? " · " + missing + " without a live price (order by dollar amount)" : "");
    $("rv-broker").disabled = !brokerUrl;
    $("rv-broker").title = brokerUrl ? "" : "Add your broker's order page in Settings";
    $("review-dlg").showModal();
  }

  const exch = (a) => (a.src === "crypto" ? "CRYPTO" : a.src === "asx" ? "ASX" : "US");
  const csvCell = (v) => { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function download(name, rows) {
    const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = el("a"); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function orderCsv() {
    const rows = [["Ticker", "Exchange", "Name", "Category", "AmountAUD", "PriceAUD", "EstUnits"]];
    lastOrder.forEach((o) => rows.push([o.a.sym, exch(o.a), o.a.name, o.a.catName, o.amt.toFixed(2), o.px == null ? "" : o.px.toFixed(6), o.units == null ? "" : o.units.toFixed(8)]));
    download("order-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".csv", rows);
  }

  function recordFill() {
    if (!confirm("Record only after your broker confirms the order filled. Record " + lastOrder.length + " holdings now?")) return;
    const now = Date.now();
    lastOrder.forEach((o) => {
      const h = holdings.find((x) => x.key === o.a.key);
      if (h) { h.cost += o.amt; h.units = h.units == null || o.units == null ? null : h.units + o.units; }
      else holdings.push({ key: o.a.key, cost: o.amt, units: o.units, at: now, high: o.px });
    });
    store.set("holdings", holdings);
    $("review-dlg").close();
    selectMany(lastOrder.map((o) => o.a), false);
    show("portfolio");
  }

  // ---------- portfolio ----------
  function renderPortfolio() {
    const tb = $("pf-rows");
    tb.textContent = "";
    let cost = 0, value = 0, valued = 0;
    holdings.forEach((h, i) => {
      const a = byKey.get(h.key);
      if (!a) return;
      const px = audPrice(h.key);
      const v = px != null && h.units != null ? h.units * px : null;
      cost += h.cost;
      if (v != null) { value += v; valued += h.cost; }
      const pl = v == null ? null : v - h.cost;
      const tr = el("tr");
      const c1 = el("td"); c1.append(el("span", "tk", a.sym), el("span", "nm", a.name));
      const plCell = el("td", "r " + (pl == null ? "" : pl >= 0 ? "up" : "down"), pl == null ? "—" : money(pl) + " (" + ((pl / h.cost) * 100).toFixed(1) + "%)");
      const sc = el("td", "sig"); paintSig(sc, h.key);
      const rm = el("button", "x", "✕"); rm.type = "button"; rm.title = "Remove holding";
      rm.addEventListener("click", () => { if (confirm("Remove " + a.sym + " from this tracker?")) { holdings.splice(i, 1); store.set("holdings", holdings); renderPortfolio(); } });
      const c7 = el("td"); c7.append(rm);
      tr.append(c1, el("td", "r hide-sm", h.units == null ? "—" : h.units.toPrecision(5)), el("td", "r", audFmt(h.cost, 2)), el("td", "r", v == null ? "—" : audFmt(v, 2)), plCell, sc, c7);
      tb.append(tr);
    });
    if (!holdings.length) { const tr = el("tr"); const td = el("td", "muted", "No holdings yet."); td.colSpan = 7; tr.append(td); tb.append(tr); }
    $("pf-cost").textContent = money(cost);
    $("pf-value").textContent = valued ? money(value + (cost - valued)) : money(cost);
    const pl = value - valued;
    $("pf-pl").textContent = valued ? money(pl) : "—";
    $("pf-pl").className = !valued || Math.abs(pl) < 0.005 ? "" : pl > 0 ? "up" : "down";
  }

  // ---------- auto-trader (paper) ----------
  function loadTrader() {
    const t = store.get("auto", null);
    if (!t || !t.cfg || !t.positions) return AT.create({});
    t.cfg = Object.assign({}, AT.DEFAULTS, t.cfg);
    return t;
  }
  const saveTrader = () => store.set("auto", trader);

  function autoCandidates() {
    const sc = trader.cfg.scope;
    if (sc === "all") return [...byKey.keys()];
    const pool = sc.indexOf("cat:") === 0 ? (catById(sc.slice(4)) || ALL).assets : ALL.assets;
    return pool.filter(isPopular).map((a) => a.key);
  }

  // Only one open tab runs the trader; the others mirror its saved state.
  const TAB_ID = Math.random().toString(36).slice(2);
  function holdLock() {
    const l = store.get("autoLock", null);
    const now = Date.now();
    if (l && l.id !== TAB_ID && now - l.at < 45000) return false;
    store.set("autoLock", { id: TAB_ID, at: now });
    return true;
  }

  let lastStep = 0, autoNote = "";
  function autoTick() {
    trackHoldingHighs();
    checkAlerts();
    if (!trader.on) { autoNote = ""; paintAutoStatus(); return; }
    if (!holdLock()) { autoNote = "Paused: running in another tab"; paintAutoStatus(); return; }
    const done = AT.step(trader, { now: Date.now(), candidates: autoCandidates(), price: audPrice, tradable, signal });
    saveTrader();
    lastStep = Date.now();
    autoNote = "";
    if (done.length) {
      const b = done.filter((t) => t.side === "BUY").length, s = done.length - b;
      toast("Auto-trader (paper): " + [b ? "bought " + b : "", s ? "sold " + s : ""].filter(Boolean).join(", "), s ? "sell" : "buy");
    }
    paintAutoStatus();
    if (view === "auto") renderAuto(done.length > 0);
  }

  function paintAutoStatus() {
    const btn = $("au-toggle");
    btn.textContent = trader.on ? "Pause auto-trader" : "Start auto-trader";
    btn.className = trader.on ? "btn ghost" : "btn";
    if (!trader.on) pill("au-status", "", "Stopped");
    else if (autoNote) pill("au-status", "wait", autoNote);
    else pill("au-status", "on", "Running · watching " + autoCandidates().length + " assets" + (lastStep ? " · checked " + new Date(lastStep).toLocaleTimeString("en-AU", { hour12: false }) : ""));
  }

  function startStop() {
    trader.on = !trader.on;
    if (trader.on) {
      trader.startedAt = trader.startedAt || Date.now();
      if (!Object.keys(trader.bench).length) autoCandidates().forEach((k) => { const px = audPrice(k); if (px != null) trader.bench[k] = px; });
    }
    saveTrader();
    autoTick();
    renderAuto(true);
  }

  const CFG_FIELDS = [
    ["au-per", "perTrade", 2, 100000], ["au-max", "maxPositions", 1, 236], ["au-peak", "peakMinPct", 0, 100],
    ["au-trail", "trailPct", 0.5, 50], ["au-stop", "stopPct", 0.5, 90], ["au-fee", "feePct", 0, 10], ["au-flat", "flatFee", 0, 50],
  ];

  function fillAutoForm(keepStart) {
    if (!keepStart) $("au-start").value = trader.cfg.startCash;
    CFG_FIELDS.forEach(([id, k]) => { $(id).value = trader.cfg[k]; });
    const sel = $("au-scope");
    if (!sel.options.length) {
      sel.append(new Option("Recommended, all categories", "recommended"));
      CATS.forEach((c) => sel.append(new Option("Recommended in " + c.name, "cat:" + c.id)));
      sel.append(new Option("Every asset (" + byKey.size + ")", "all"));
    }
    sel.value = trader.cfg.scope;
  }

  function readField(id, lo, hi, fallback) {
    const v = parseFloat($(id).value);
    if (!isFinite(v)) return fallback;
    return Math.min(hi, Math.max(lo, v));
  }

  function applyAutoForm() {
    CFG_FIELDS.forEach(([id, k, lo, hi]) => { trader.cfg[k] = readField(id, lo, hi, trader.cfg[k]); });
    trader.cfg.maxPositions = Math.round(trader.cfg.maxPositions);
    trader.cfg.scope = $("au-scope").value;
    const start = readField("au-start", 10, 1e9, trader.cfg.startCash);
    const fresh = !trader.trades.length && !Object.keys(trader.positions).length;
    if (fresh) { trader.cfg.startCash = start; trader.cash = start; trader.bench = {}; }
    const pending = !fresh && start !== trader.cfg.startCash;
    $("au-start-note").textContent = pending ? "New starting cash applies after a reset." : "";
    saveTrader();
    fillAutoForm(pending); // keep a typed-in starting cash until the reset uses it
    renderAuto(true);
  }

  function resetAuto() {
    if (!confirm("Reset the paper account? Positions and trade history are cleared.")) return;
    const cfg = Object.assign({}, trader.cfg, { startCash: readField("au-start", 10, 1e9, trader.cfg.startCash) });
    trader = AT.create(cfg);
    saveTrader();
    $("au-start-note").textContent = "";
    fillAutoForm();
    autoTick();
    renderAuto(true);
  }

  let shownTrades = -1;
  function renderAuto(full) {
    const sum = AT.summary(trader, audPrice);
    const bench = AT.benchMove(trader, audPrice);
    const pct = (x) => (x >= 0 ? "+" : "") + (x * 100).toFixed(2) + "%";
    $("au-equity").textContent = money(sum.equity);
    $("au-cash").textContent = money(sum.cash);
    const setPl = (id, v) => { $(id).textContent = money(v); $(id).className = v > 0 ? "up" : v < 0 ? "down" : ""; };
    setPl("au-open", sum.openPl);
    setPl("au-real", sum.realised);
    const ret = sum.equity / trader.cfg.startCash - 1;
    $("au-ret").textContent = pct(ret);
    $("au-ret").className = Math.abs(ret) < 0.00005 ? "" : ret > 0 ? "up" : "down";
    $("au-win").textContent = sum.winRate == null ? "—" : Math.round(sum.winRate * 100) + "% of " + sum.sells;
    $("au-bench").textContent = bench == null ? "—" : pct(bench);
    $("au-bench").className = bench == null || Math.abs(bench) < 0.00005 ? "" : bench > 0 ? "up" : "down";
    $("au-fees").textContent = money(sum.fees);

    const tb = $("au-pos");
    tb.textContent = "";
    const keys = Object.keys(trader.positions);
    keys.forEach((k) => {
      const a = byKey.get(k);
      const p = trader.positions[k];
      const px = audPrice(k);
      const v = px == null ? null : p.units * px;
      const pl = v == null ? null : v - p.cost;
      const stop = AT.stopFor(trader, p);
      const s = signal(k);
      const tr = el("tr");
      const c1 = el("td"); c1.append(el("span", "tk", a ? a.sym : k), el("span", "nm", (a ? a.name : "") + " · since " + timeFmt(p.at)));
      tr.append(c1,
        el("td", "r", audFmt(p.cost, 2)),
        el("td", "r", v == null ? "—" : audFmt(v, 2)),
        el("td", "r " + (pl == null ? "" : pl >= 0 ? "up" : "down"), pl == null ? "—" : money(pl)),
        el("td", "r hide-sm", priceFmt(stop.px) + (stop.kind === "trail" ? " trail" : " stop")),
        el("td", "r hide-sm", s.ceiling ? priceFmt(s.ceiling) : "—"));
      tb.append(tr);
    });
    if (!keys.length) { const tr = el("tr"); const td = el("td", "muted", trader.on ? "No open positions. Waiting for buy signals." : "No open positions."); td.colSpan = 6; tr.append(td); tb.append(tr); }

    if (full || shownTrades !== trader.trades.length || (trader.trades[0] && trader.trades[0].t !== renderAuto.lastT)) {
      shownTrades = trader.trades.length;
      renderAuto.lastT = trader.trades[0] && trader.trades[0].t;
      const lb = $("au-log");
      lb.textContent = "";
      trader.trades.slice(0, 100).forEach((t) => {
        const a = byKey.get(t.key);
        const tr = el("tr");
        tr.append(el("td", "mono", timeFmt(t.t)), el("td", t.side === "BUY" ? "up" : "down", t.side), el("td", "tk", a ? a.sym : t.key),
          el("td", "r", audFmt(t.amt, 2)), el("td", "r hide-sm", priceFmt(t.px)),
          el("td", "r " + (t.pl == null ? "" : t.pl >= 0 ? "up" : "down"), t.pl == null ? "" : money(t.pl)), el("td", "why", t.reason));
        lb.append(tr);
      });
      if (!trader.trades.length) { const tr = el("tr"); const td = el("td", "muted", "No trades yet."); td.colSpan = 7; tr.append(td); lb.append(tr); }
    }
    paintAutoStatus();
    renderAlerts();
  }

  // ---------- alerts ----------
  let holdingsDirty = false;
  function trackHoldingHighs() {
    holdings.forEach((h) => {
      const px = audPrice(h.key);
      if (px == null || h.units == null) return;
      const entry = h.cost / h.units;
      const high = Math.max(h.high || entry, px);
      if (high !== h.high) { h.high = high; holdingsDirty = true; }
    });
  }

  function pushAlert(id, text, kind, holdMs) {
    const now = Date.now();
    if (alertMemo[id] > now) return false;
    alertMemo[id] = now + holdMs;
    Object.keys(alertMemo).forEach((k) => { if (alertMemo[k] <= now) delete alertMemo[k]; });
    store.set("alertMemo", alertMemo);
    alerts.unshift({ t: now, text, kind });
    if (alerts.length > 100) alerts.length = 100;
    store.set("alerts", alerts);
    toast(text, kind);
    if (notifyOn && "Notification" in window && Notification.permission === "granted") {
      try { new Notification("ABiZmuth Invest", { body: text, tag: id }); } catch (_) { /* some phone browsers only allow service-worker notifications */ }
    }
    if (view === "auto") renderAlerts();
    return true;
  }

  // Same rules and settings as the auto-trader, applied to holdings you recorded for real.
  function checkAlerts() {
    const SIX_H = 6 * 3600000;
    holdings.forEach((h) => {
      const a = byKey.get(h.key);
      const px = audPrice(h.key);
      if (!a || px == null || h.units == null || !tradable(h.key)) return;
      const entry = h.cost / h.units;
      const stop = AT.stopFor(trader, { entry, high: Math.max(h.high || entry, px) });
      if (px <= stop.px) {
        pushAlert("stop:" + h.key, a.sym + ": " + (stop.kind === "trail" ? "trailing stop hit" : "stop-loss hit") + " at A$" + priceFmt(px) + ". Consider selling at your broker.", "sell", SIX_H);
        return;
      }
      const s = signal(h.key);
      const gain = px / entry - 1;
      if (s.action === "sell" && s.kind === "peak" && gain >= trader.cfg.peakMinPct / 100) {
        pushAlert("peak:" + h.key, a.sym + ": likely peak, up " + (gain * 100).toFixed(1) + "%. Consider taking profit at your broker.", "sell", SIX_H);
      }
    });
    // Strong buy signals on recommended assets: at most 3 an hour, once per asset per 6 hours.
    let recent = alerts.filter((x) => x.kind === "buy" && x.t > Date.now() - 3600000).length;
    ALL.assets.filter(isPopular).forEach((a) => {
      if (recent >= 3) return;
      const s = signal(a.key);
      if (s.action === "buy" && s.strength >= 80 && tradable(a.key) && pushAlert("buy:" + a.key, a.sym + ": strong buy signal (" + s.strength + "). " + s.reason + ".", "buy", SIX_H)) recent++;
    });
    if (holdingsDirty) { holdingsDirty = false; store.set("holdings", holdings); }
  }

  function renderAlerts() {
    const ul = $("al-log");
    ul.textContent = "";
    alerts.slice(0, 30).forEach((x) => {
      const li = el("li", "al-" + x.kind);
      li.append(el("span", "mono muted", timeFmt(x.t) + " "), document.createTextNode(x.text));
      ul.append(li);
    });
    if (!alerts.length) ul.append(el("li", "muted", "No alerts yet."));
  }

  function toast(text, kind) {
    const t = el("div", "toast " + (kind || ""), text);
    $("toasts").append(t);
    setTimeout(() => t.remove(), 7000);
  }

  function paintNotifyNote() {
    const box = $("al-notify");
    box.checked = notifyOn;
    let note = "Alerts show on this page while it's open.";
    if (!("Notification" in window)) { note += " This browser doesn't support notifications."; box.disabled = true; }
    else if (Notification.permission === "denied") note += " Notifications are blocked for this site in your browser settings.";
    else if (notifyOn) note += " Device notifications are on.";
    $("al-note").textContent = note;
  }

  // ---------- views ----------
  let view = "markets";
  function show(v) {
    view = v;
    document.querySelectorAll(".tab").forEach((t) => { const on = t.dataset.view === v; t.classList.toggle("on", on); t.setAttribute("aria-selected", on); });
    ["markets", "auto", "portfolio", "settings"].forEach((x) => { $("view-" + x).hidden = x !== v; });
    $("orderbar").hidden = v !== "markets" || selected.size === 0;
    if (v === "portfolio") renderPortfolio();
    if (v === "auto") renderAuto(true);
  }

  // ---------- wiring ----------
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => show(t.dataset.view)));
  $("back").addEventListener("click", closeCat);
  $("search").addEventListener("input", renderRows);
  $("popular-only").addEventListener("change", renderRows);
  $("sel-popular").addEventListener("click", () => selectMany(current.assets.filter(isPopular), true));
  $("sel-all").addEventListener("click", () => selectMany(current.assets, true));
  $("sel-none").addEventListener("click", () => selectMany(current.assets, false));
  $("review").addEventListener("click", review);
  $("rv-csv").addEventListener("click", orderCsv);
  $("rv-copy").addEventListener("click", async () => {
    const text = lastOrder.map((o) => "BUY " + money(o.amt) + " " + o.a.sym + " (" + exch(o.a) + ")").join("\n");
    try { await navigator.clipboard.writeText(text); $("rv-copy").textContent = "Copied"; setTimeout(() => { $("rv-copy").textContent = "Copy order"; }, 1500); }
    catch (_) { prompt("Copy this order:", text); }
  });
  $("rv-broker").addEventListener("click", () => { if (brokerUrl) window.open(brokerUrl, "_blank", "noopener"); });
  $("rv-record").addEventListener("click", recordFill);
  $("pf-export").addEventListener("click", () => {
    const rows = [["Ticker", "Exchange", "Name", "Units", "CostAUD", "ValueAUD"]];
    holdings.forEach((h) => { const a = byKey.get(h.key); if (!a) return; const px = audPrice(h.key); rows.push([a.sym, exch(a), a.name, h.units == null ? "" : h.units, h.cost.toFixed(2), px != null && h.units != null ? (h.units * px).toFixed(2) : ""]); });
    download("portfolio.csv", rows);
  });

  $("au-toggle").addEventListener("click", startStop);
  $("au-reset").addEventListener("click", resetAuto);
  ["au-start", "au-scope"].concat(CFG_FIELDS.map((f) => f[0])).forEach((id) => $(id).addEventListener("change", applyAutoForm));
  $("au-export").addEventListener("click", () => {
    const rows = [["Time", "Side", "Ticker", "AmountAUD", "PriceAUD", "Units", "FeeAUD", "PLAUD", "Reason"]];
    trader.trades.slice().reverse().forEach((t) => { const a = byKey.get(t.key); rows.push([new Date(t.t).toISOString(), t.side, a ? a.sym : t.key, t.amt.toFixed(2), t.px, t.units, t.fee.toFixed(4), t.pl == null ? "" : t.pl.toFixed(2), t.reason]); });
    download("paper-trades.csv", rows);
  });
  $("al-notify").addEventListener("change", async () => {
    notifyOn = $("al-notify").checked;
    if (notifyOn && "Notification" in window && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch (_) { /* ignore */ }
    }
    if (!("Notification" in window) || Notification.permission !== "granted") notifyOn = false;
    store.set("notify", notifyOn);
    paintNotifyNote();
  });
  // Another tab ran the trader: show its latest state here.
  window.addEventListener("storage", (e) => {
    if (e.key !== "abz-invest:auto" || !e.newValue) return;
    try { const t = JSON.parse(e.newValue); if (t && t.cfg && t.positions) { trader = t; if (view === "auto") renderAuto(true); } } catch (_) { /* ignore */ }
  });

  $("finnhub-key").value = finnhubKey;
  $("save-key").addEventListener("click", () => { finnhubKey = $("finnhub-key").value.trim(); store.set("finnhubKey", finnhubKey); startFinnhub(); show("markets"); });
  $("clear-key").addEventListener("click", () => { finnhubKey = ""; $("finnhub-key").value = ""; store.del("finnhubKey"); startFinnhub(); });
  $("broker-url").value = brokerUrl;
  $("save-broker").addEventListener("click", () => {
    const v = $("broker-url").value.trim();
    if (v && !/^https:\/\//i.test(v)) { alert("Use an https:// address."); return; }
    brokerUrl = v; store.set("brokerUrl", v); $("save-broker").textContent = "Saved";
    setTimeout(() => { $("save-broker").textContent = "Save broker"; }, 1500);
  });

  // Clock, stale markers, category + portfolio + auto refresh.
  setInterval(() => {
    $("clock").textContent = new Date().toLocaleTimeString("en-AU", { hour12: false });
    if (view === "markets" && !current) refreshCats();
    if (view === "markets" && current) document.querySelectorAll("#rows .px").forEach((c) => {
      const key = idToKey.get(c.parentElement.id);
      if (key) c.classList.toggle("stale", audPrice(key) != null && isStale(key));
    });
    if (view === "portfolio") renderPortfolio();
    if (view === "auto") renderAuto(false);
  }, 2000);

  // ---------- boot ----------
  loadStockBars();
  renderCats();
  updateOrderBar();
  $("orderbar").hidden = selected.size === 0;
  fillAutoForm();
  paintNotifyNote();
  paintAutoStatus();
  pollFx().then(() => { pollCoinGecko(); connectCoinbase(); seedHistory(); });
  setInterval(pollFx, FX_POLL_MS);
  setInterval(pollCoinGecko, CG_POLL_MS);
  setInterval(saveStockBars, 60000);
  setInterval(autoTick, AUTO_MS);
  startFinnhub();
})();
