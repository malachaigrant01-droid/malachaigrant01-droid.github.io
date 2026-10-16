// Run: node --test invest/tests/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../signals.js");
const T = require("../autotrader.js");

const BUY = { action: "buy", kind: "uptrend", strength: 80, reason: "test buy" };
const PEAK = { action: "sell", kind: "peak", strength: 80, reason: "Likely peak" };
const DOWN = { action: "sell", kind: "downtrend", strength: 80, reason: "Downtrend" };
const HOLD = { action: "hold", kind: "none", strength: 0, reason: "hold" };

function ctx(now, prices, signals, candidates) {
  return { now, candidates: candidates || Object.keys(prices), price: (k) => (k in prices ? prices[k] : null), tradable: () => true, signal: (k) => (signals[k] || HOLD) };
}

// Equity must always equal start cash + realised P/L + open P/L.
function assertBooks(st, prices) {
  const s = T.summary(st, (k) => prices[k]);
  assert.ok(Math.abs(s.equity - (st.cfg.startCash + s.realised + s.openPl)) < 1e-9, "books balance");
}

test("buys on a buy signal, net of fees", () => {
  const st = T.create({ perTrade: 10, feePct: 1 });
  const done = T.step(st, ctx(0, { A: 2 }, { A: BUY }));
  assert.equal(done.length, 1);
  assert.equal(st.cash, 990);
  assert.ok(Math.abs(st.positions.A.units - 9.9 / 2) < 1e-12);
  assertBooks(st, { A: 2 });
});

test("will not buy when fees eat the whole trade, or below A$2", () => {
  const st = T.create({ perTrade: 2, flatFee: 3 });
  assert.equal(T.step(st, ctx(0, { A: 1 }, { A: BUY })).length, 0);
  const st2 = T.create({ perTrade: 1.5 });
  assert.equal(T.step(st2, ctx(0, { A: 1 }, { A: BUY })).length, 0);
});

test("stop-loss applies until the trailing stop arms", () => {
  const st = T.create({ trailPct: 4, stopPct: 6 });
  T.step(st, ctx(0, { A: 100 }, { A: BUY }));
  // Down 5%: above the 6% stop-loss, trailing stop not armed yet → keep.
  assert.equal(T.step(st, ctx(1, { A: 95 }, {})).length, 0);
  // Down 6%: stop-loss.
  const out = T.step(st, ctx(2, { A: 94 }, {}));
  assert.equal(out.length, 1);
  assert.match(out[0].reason, /Stop-loss/);
  assert.ok(out[0].pl < 0);
});

test("trailing stop locks in gains once armed", () => {
  const st = T.create({ trailPct: 4, stopPct: 6, feePct: 0 });
  T.step(st, ctx(0, { A: 100 }, { A: BUY }));
  T.step(st, ctx(1, { A: 120 }, {})); // high 120, armed (≥ 104)
  assert.equal(T.step(st, ctx(2, { A: 116 }, {})).length, 0); // 3.3% off the high
  const out = T.step(st, ctx(3, { A: 115 }, {})); // 4.2% off the high
  assert.equal(out.length, 1);
  assert.match(out[0].reason, /Trailing stop/);
  assert.ok(Math.abs(out[0].pl - 1.5) < 1e-9); // 10 × 115/100 − 10
});

test("likely-peak exit only once the position is up by the minimum gain", () => {
  const st = T.create({ peakMinPct: 2, feePct: 0 });
  T.step(st, ctx(0, { A: 100 }, { A: BUY }));
  assert.equal(T.step(st, ctx(1, { A: 101 }, { A: PEAK })).length, 0); // only +1%
  const out = T.step(st, ctx(2, { A: 102.5 }, { A: PEAK }));
  assert.equal(out.length, 1);
  assert.match(out[0].reason, /Likely peak · up 2\.5%/);
});

test("never sells on the short-term downtrend signal", () => {
  const st = T.create({});
  T.step(st, ctx(0, { A: 100 }, { A: BUY }));
  assert.equal(T.step(st, ctx(1, { A: 99 }, { A: DOWN })).length, 0);
  assert.ok(st.positions.A);
});

test("cooldown blocks an instant re-buy after selling", () => {
  const st = T.create({ cooldownMin: 60, stopPct: 6 });
  T.step(st, ctx(0, { A: 100 }, { A: BUY }));
  T.step(st, ctx(1, { A: 90 }, {})); // stop-loss
  assert.equal(T.step(st, ctx(2, { A: 90 }, { A: BUY })).length, 0);
  assert.equal(T.step(st, ctx(1 + 60 * 60000, { A: 90 }, { A: BUY })).length, 1);
});

test("respects max positions, cash and strength order", () => {
  const st = T.create({ startCash: 25, perTrade: 10, maxPositions: 5 });
  const sig = { A: { ...BUY, strength: 60 }, B: { ...BUY, strength: 90 }, C: { ...BUY, strength: 75 } };
  const done = T.step(st, ctx(0, { A: 1, B: 1, C: 1 }, sig));
  assert.deepEqual(done.map((t) => t.key), ["B", "C"]); // A$25 covers two A$10 buys
  const st2 = T.create({ maxPositions: 1 });
  assert.equal(T.step(st2, ctx(0, { A: 1, B: 1 }, { A: BUY, B: BUY })).length, 1);
});

test("unpriced or untradable assets are left alone", () => {
  const st = T.create({});
  const c = ctx(0, { A: 100 }, { A: BUY });
  c.tradable = () => false;
  assert.equal(T.step(st, c).length, 0);
  T.step(st, ctx(1, { A: 100 }, { A: BUY }));
  assert.equal(T.step(st, ctx(2, {}, { A: PEAK })).length, 0);
  assert.equal(T.summary(st, () => null).openPl, 0); // valued at cost when unpriced
});

test("books balance through a run of trades", () => {
  const st = T.create({ feePct: 0.5, flatFee: 0.05 });
  const steps = [[100, BUY], [104, HOLD], [106, PEAK], [106, HOLD], [97, HOLD], [91, HOLD]];
  steps.forEach(([px, s], i) => { T.step(st, ctx(i * 3600000 * 2, { A: px }, { A: s })); assertBooks(st, { A: px }); });
});

test("benchmark averages the moves of the assets it could pick", () => {
  const st = T.create({});
  st.bench = { A: 100, B: 50 };
  assert.ok(Math.abs(T.benchMove(st, (k) => ({ A: 110, B: 45 })[k]) - 0) < 1e-12);
  assert.equal(T.benchMove(T.create({}), () => 1), null);
});

test("end to end: buys on rising momentum, takes profit at a likely peak, stays out of the fall", () => {
  // Rise from bar 40 to 120, then fall back, with a wobble so RSI isn't pinned.
  const path = Array.from({ length: 200 }, (_, i) => {
    const base = i < 40 ? 100 : i < 120 ? 100 + (i - 40) * 0.2 : 116 - (i - 120) * 0.2;
    return base + 1.2 * Math.sin(i / 3);
  });
  const top = path.indexOf(Math.max(...path));
  const st = T.create({});
  const trades = [];
  for (let i = S.MIN_BARS + 1; i < path.length; i++) {
    const c = { now: i * 300000, candidates: ["X"], price: () => path[i], tradable: () => true, signal: () => S.evaluate(path.slice(0, i)) };
    T.step(st, c).forEach((t) => trades.push({ i, ...t }));
  }
  const buys = trades.filter((t) => t.side === "BUY");
  const sells = trades.filter((t) => t.side === "SELL");
  assert.ok(buys.length >= 1 && buys.every((t) => t.i < top), "buys only during the rise");
  assert.ok(sells.length >= 1 && sells.every((t) => t.pl > 0), "exits were profitable");
  assert.equal(Object.keys(st.positions).length, 0, "nothing held through the fall");
  assert.ok(T.summary(st, () => path.at(-1)).equity > st.cfg.startCash);
});
