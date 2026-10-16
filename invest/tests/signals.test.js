// Run: node --test invest/tests/*.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../signals.js");

// Deterministic price paths: base 100 + a·sin(i/b) + c·i.
const wave = (n, a, b, c) => Array.from({ length: n }, (_, i) => 100 + a * Math.sin(i / b) + c * i);

test("EMA of a constant series is that constant", () => {
  const e = S.ema(Array(30).fill(7), 12);
  assert.equal(e[10], null);
  assert.equal(e[11], 7);
  assert.equal(e[29], 7);
});

test("RSI reads 100 on straight rises, 0 on straight falls, 50 when flat", () => {
  const up = Array.from({ length: 30 }, (_, i) => 10 + i);
  const down = Array.from({ length: 30 }, (_, i) => 50 - i);
  assert.equal(S.rsi(up, 14)[29], 100);
  assert.equal(S.rsi(down, 14)[29], 0);
  assert.equal(S.rsi(Array(30).fill(5), 14)[29], 50);
});

test("Bollinger band collapses to the mean on a flat series", () => {
  const b = S.band(Array(25).fill(3), 24);
  assert.deepEqual(b, { mid: 3, upper: 3, lower: 3 });
  assert.equal(S.band([1, 2, 3], 2), null);
});

test("waits until there are enough bars", () => {
  const r = S.evaluate(wave(S.MIN_BARS - 1, 1, 3, 0));
  assert.equal(r.action, "wait");
  assert.equal(r.ready, false);
});

test("buy: uptrend with rising momentum", () => {
  const r = S.evaluate(wave(60, 1, 3, 0));
  assert.equal(r.action, "buy");
  assert.equal(r.kind, "uptrend");
  assert.ok(r.strength >= 50 && r.strength <= 100);
  assert.ok(r.rsi >= 50 && r.rsi < 70);
});

test("sell: stretched price with momentum fading reads as a likely peak", () => {
  const r = S.evaluate(wave(60, 1, 8, 0));
  assert.equal(r.action, "sell");
  assert.equal(r.kind, "peak");
  assert.match(r.reason, /Likely peak/);
});

test("sell: downtrend with falling momentum", () => {
  const r = S.evaluate(wave(80, 1, 5, -0.05));
  assert.equal(r.action, "sell");
  assert.equal(r.kind, "downtrend");
});

test("hold when nothing lines up", () => {
  const r = S.evaluate(wave(60, 1, 3, -0.05));
  assert.equal(r.action, "hold");
});

test("ceiling sits above floor and both bracket the last close", () => {
  const xs = wave(60, 2, 4, 0.01);
  const r = S.evaluate(xs);
  assert.ok(r.ceiling > r.floor);
  assert.ok(r.ceiling >= Math.min(...xs.slice(-20)));
});
