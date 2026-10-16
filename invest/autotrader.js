// Paper auto-trader: virtual cash only. Buys on "buy" signals. Sells at a "likely peak" once
// the position is up by a set %, or when a trailing stop or stop-loss is hit. It never sells on
// the short-term "downtrend" signal: in testing on real 5-minute data that only churned fees.
(function (root) {
  "use strict";

  const DEFAULTS = { startCash: 1000, perTrade: 10, maxPositions: 20, trailPct: 4, stopPct: 6, peakMinPct: 2, feePct: 0.5, flatFee: 0, scope: "recommended", cooldownMin: 60 };
  const LOG_CAP = 500;

  function create(cfg) {
    const c = Object.assign({}, DEFAULTS, cfg);
    return { on: false, cfg: c, cash: c.startCash, startedAt: null, positions: {}, trades: [], cooldown: {}, bench: {}, realised: 0, sells: 0, wins: 0, fees: 0 };
  }

  const feeOn = (st, amt) => (amt * st.cfg.feePct) / 100 + st.cfg.flatFee;

  function record(st, t) {
    st.trades.unshift(t);
    if (st.trades.length > LOG_CAP) st.trades.length = LOG_CAP;
    st.fees += t.fee;
    return t;
  }

  function buy(st, key, px, now, reason) {
    const amt = st.cfg.perTrade;
    const fee = feeOn(st, amt);
    if (!(px > 0) || amt < 2 || st.cash < amt || fee >= amt) return null;
    const units = (amt - fee) / px;
    st.cash -= amt;
    st.positions[key] = { units, cost: amt, entry: px, high: px, at: now };
    return record(st, { t: now, key, side: "BUY", amt, px, units, fee, reason });
  }

  function sell(st, key, px, now, reason) {
    const p = st.positions[key];
    if (!p || !(px > 0)) return null;
    const gross = p.units * px;
    const fee = Math.min(gross, feeOn(st, gross));
    const net = gross - fee;
    const pl = net - p.cost;
    st.cash += net;
    st.realised += pl;
    st.sells += 1;
    if (pl > 0) st.wins += 1;
    delete st.positions[key];
    st.cooldown[key] = now + st.cfg.cooldownMin * 60000;
    return record(st, { t: now, key, side: "SELL", amt: net, px, units: p.units, fee, reason, pl });
  }

  // Until the price has risen by the trail %, only the stop-loss under the buy price applies.
  // After that the trailing stop follows the high, so gains are locked in instead of round-tripping.
  function stopFor(st, p) {
    const loss = p.entry * (1 - st.cfg.stopPct / 100);
    const armed = p.high >= p.entry * (1 + st.cfg.trailPct / 100);
    const trail = p.high * (1 - st.cfg.trailPct / 100);
    return armed && trail >= loss ? { px: trail, kind: "trail" } : { px: loss, kind: "loss" };
  }

  const pctTxt = (x) => (x * 100).toFixed(1) + "%";

  // ctx: { now, candidates: [key], price(key) → A$ | null, tradable(key) → bool, signal(key) → {action, strength, reason} }
  function step(st, ctx) {
    const now = ctx.now;
    const done = [];
    Object.keys(st.cooldown).forEach((k) => { if (st.cooldown[k] <= now) delete st.cooldown[k]; });

    Object.keys(st.positions).forEach((key) => {
      const px = ctx.price(key);
      if (px == null || !ctx.tradable(key)) return;
      const p = st.positions[key];
      if (px > p.high) p.high = px;
      const stop = stopFor(st, p);
      if (px <= stop.px) {
        const why = stop.kind === "trail"
          ? "Trailing stop: " + pctTxt(1 - px / p.high) + " below the high since buying"
          : "Stop-loss: " + pctTxt(1 - px / p.entry) + " below the buy price";
        done.push(sell(st, key, px, now, why));
        return;
      }
      const s = ctx.signal(key);
      const gain = px / p.entry - 1;
      if (s && s.action === "sell" && s.kind === "peak" && gain >= st.cfg.peakMinPct / 100) {
        done.push(sell(st, key, px, now, s.reason + " · up " + pctTxt(gain)));
      }
    });

    let slots = st.cfg.maxPositions - Object.keys(st.positions).length;
    if (slots > 0 && st.cash >= st.cfg.perTrade) {
      const picks = ctx.candidates
        .filter((k) => !st.positions[k] && !st.cooldown[k] && ctx.tradable(k) && ctx.price(k) != null)
        .map((k) => ({ k, s: ctx.signal(k) }))
        .filter((x) => x.s && x.s.action === "buy")
        .sort((a, b) => b.s.strength - a.s.strength);
      for (const x of picks) {
        if (slots <= 0 || st.cash < st.cfg.perTrade) break;
        const t = buy(st, x.k, ctx.price(x.k), now, x.s.reason + " · strength " + x.s.strength);
        if (t) { done.push(t); slots--; }
      }
    }
    return done.filter(Boolean);
  }

  // Unpriced positions count at cost so a dropped feed doesn't look like a loss.
  function summary(st, price) {
    let value = 0, cost = 0;
    Object.keys(st.positions).forEach((k) => {
      const p = st.positions[k];
      const px = price(k);
      value += px == null ? p.cost : p.units * px;
      cost += p.cost;
    });
    return { equity: st.cash + value, cash: st.cash, value, openPl: value - cost, realised: st.realised, fees: st.fees, sells: st.sells, winRate: st.sells ? st.wins / st.sells : null };
  }

  // Average move of the assets the trader could pick from, since it started — the "just hold them" yardstick.
  function benchMove(st, price) {
    const moves = Object.keys(st.bench).map((k) => { const px = price(k); return px == null ? null : px / st.bench[k] - 1; }).filter((x) => x != null);
    return moves.length ? moves.reduce((s, x) => s + x, 0) / moves.length : null;
  }

  const api = { DEFAULTS, create, step, buy, sell, stopFor, summary, benchMove };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.InvestAutoTrader = api;
})(typeof window !== "undefined" ? window : globalThis);
