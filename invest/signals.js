// Rules-based buy/sell signals on 5-minute closing prices. No forecasting model: these
// rules react to trend, momentum and how stretched the price is. They will be wrong often.
(function (root) {
  "use strict";

  const MIN_BARS = 35; // MACD(12,26,9) needs 26 + 9 bars before its signal line exists

  function ema(xs, n) {
    const out = new Array(xs.length).fill(null);
    if (xs.length < n) return out;
    let prev = 0;
    for (let i = 0; i < n; i++) prev += xs[i];
    prev /= n;
    out[n - 1] = prev;
    const k = 2 / (n + 1);
    for (let i = n; i < xs.length; i++) { prev = xs[i] * k + prev * (1 - k); out[i] = prev; }
    return out;
  }

  // Wilder's RSI. Flat stretches read 50 (neutral) rather than dividing by zero.
  function rsi(xs, n) {
    n = n || 14;
    const out = new Array(xs.length).fill(null);
    if (xs.length <= n) return out;
    let gain = 0, loss = 0;
    for (let i = 1; i <= n; i++) { const d = xs[i] - xs[i - 1]; if (d > 0) gain += d; else loss -= d; }
    gain /= n; loss /= n;
    const val = () => (loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss));
    out[n] = val();
    for (let i = n + 1; i < xs.length; i++) {
      const d = xs[i] - xs[i - 1];
      gain = (gain * (n - 1) + Math.max(d, 0)) / n;
      loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
      out[i] = val();
    }
    return out;
  }

  // MACD histogram (MACD line minus its 9-period signal line).
  function macdHist(xs) {
    const e12 = ema(xs, 12), e26 = ema(xs, 26);
    const start = 25;
    const out = new Array(xs.length).fill(null);
    if (xs.length <= start) return out;
    const line = [];
    for (let i = start; i < xs.length; i++) line.push(e12[i] - e26[i]);
    const sig = ema(line, 9);
    for (let j = 0; j < line.length; j++) if (sig[j] != null) out[start + j] = line[j] - sig[j];
    return out;
  }

  // Bollinger band ending at index i: mean ± k standard deviations of the last n closes.
  function band(xs, i, n, k) {
    n = n || 20; k = k || 2;
    if (i + 1 < n) return null;
    let sum = 0;
    for (let j = i - n + 1; j <= i; j++) sum += xs[j];
    const mean = sum / n;
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) v += (xs[j] - mean) * (xs[j] - mean);
    const sd = Math.sqrt(v / n);
    return { mid: mean, upper: mean + k * sd, lower: mean - k * sd };
  }

  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

  // closes: oldest → newest, completed bars only.
  // Returns { action: "buy" | "sell" | "hold" | "wait", strength 0–100, reason, rsi, ceiling, floor, trend }.
  function evaluate(closes) {
    const n = closes.length;
    if (n < MIN_BARS) return { action: "wait", strength: 0, reason: "Warming up: " + n + "/" + MIN_BARS + " five-minute bars", ready: false };
    const last = n - 1;
    const e12 = ema(closes, 12), e26 = ema(closes, 26);
    const hist = macdHist(closes);
    const r = rsi(closes, 14);
    const bb = band(closes, last);
    const h0 = hist[last], h1 = hist[last - 1];
    const rsiNow = r[last];
    const trendUp = e12[last] > e26[last];
    const fading = h0 < h1;

    // "Stretched": RSI 70+ or a close above the upper 2σ band in the last 3 bars.
    let peakRsi = 0, stretched = false;
    for (let i = last; i > last - 3; i--) {
      peakRsi = Math.max(peakRsi, r[i]);
      const b = band(closes, i);
      if (r[i] >= 70 || (b && closes[i] >= b.upper)) stretched = true;
    }

    const base = { rsi: rsiNow, ceiling: bb.upper, floor: bb.lower, trend: trendUp ? "up" : "down", ready: true };
    const fmtRsi = "RSI " + Math.round(rsiNow);

    if (stretched && fading) {
      return Object.assign(base, { action: "sell", kind: "peak", strength: Math.round(clamp(60 + (peakRsi - 70) * 2, 60, 100)), reason: "Likely peak: stretched (" + fmtRsi + ") and momentum fading" });
    }
    if (!trendUp && h0 < 0 && fading) {
      return Object.assign(base, { action: "sell", kind: "downtrend", strength: Math.round(clamp(50 + (50 - rsiNow), 50, 90)), reason: "Downtrend: momentum falling (" + fmtRsi + ")" });
    }
    if (trendUp && h0 > 0 && h0 > h1 && rsiNow >= 50 && rsiNow < 70 && !stretched) {
      const accel = (h0 - h1) / (Math.abs(h0) + Math.abs(h1) || 1);
      const sweet = 1 - Math.abs(rsiNow - 60) / 10;
      return Object.assign(base, { action: "buy", kind: "uptrend", strength: Math.round(clamp(50 + 25 * accel + 25 * sweet, 50, 100)), reason: "Uptrend, momentum rising (" + fmtRsi + ")" });
    }
    return Object.assign(base, { action: "hold", kind: "none", strength: 0, reason: (trendUp ? "Uptrend, no fresh momentum" : "No uptrend") + " (" + fmtRsi + ")" });
  }

  const api = { MIN_BARS, ema, rsi, macdHist, band, evaluate };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.InvestSignals = api;
})(typeof window !== "undefined" ? window : globalThis);
