// konninvest Moat Monitor – közös számítások (böngésző: core.js betöltve az app.js előtt; Node: require).
// Egy helyen van, így az oldal, a statikus (AI-olvasható) kiadás és a Mai ajánlat ugyanazt számolja.
function trends(mk) {
  const p = mk.p, band = 0.01;
  const shortT = mk.sma20 ? (p > mk.sma20 * (1 + band) ? "Emelkedő" : p < mk.sma20 * (1 - band) ? "Csökkenő" : "Oldalazó") : null;
  const midT = mk.tr || null;
  const longT = mk.sma200 && mk.sma50 ? (p > mk.sma200 && mk.sma50 > mk.sma200 ? "Emelkedő" : p < mk.sma200 && mk.sma50 < mk.sma200 ? "Csökkenő" : "Oldalazó") : null;
  return { trS: shortT, trM: midT, trL: longT };
}
function valuation(pv) { return pv < -10 ? "Undervalued" : pv <= 15 ? "Fair" : "Expensive"; }
// Morningstar-csillag: az 5 és 1 csillag határa a Morningstar bizonytalansági besorolásából (Uncertainty Rating) jön;
// a 4/3/2 csillag sávhatára a köztes pontokon (saját interpoláció).
const UD = { Low: [0.20, 0.25], Medium: [0.30, 0.35], High: [0.40, 0.55], "Very High": [0.50, 0.75], Extreme: [0.75, 3.00] };
function stars(px, iv, u) { const d = UD[u]; if (!d || !(px > 0) || !(iv > 0)) return null; const x = px / iv;
  return x <= 1 - d[0] ? 5 : x <= 1 - d[0] / 2 ? 4 : x < 1 + d[1] / 2 ? 3 : x < 1 + d[1] ? 2 : 1; }
function derive(o) {
  const mk = o.mk || {}, px = mk.p ?? o.pr;
  const pv = o.iv > 0 && px > 0 ? (px / o.iv - 1) * 100 : null;
  const up = o.tp > 0 && px > 0 ? (o.tp / px - 1) * 100 : null;
  const st = stars(px, o.iv, o.u);
  const v = st ? (st >= 4 ? "Undervalued" : st == 3 ? "Fair" : "Expensive") : pv == null ? o.v : valuation(pv);
  const mpa = o.m ? ({ Wide: 40, Narrow: 25 }[o.m] ?? 5) + ({ Strong: 30, Adequate: 18, Weak: 5 }[o.f] ?? 5) + (pv == null ? 0 : o.bb > 0 && px <= o.bb ? 30 : pv < 0 ? 22 : pv <= 10 ? 15 : pv <= 30 ? 8 : 0) : null;
  // Elemzéskori ajánlás (az elemzés szövegéből) – csak tájékoztató.
  const rw0 = (String(o.r || "").match(/^\s*(Buy|Accumulate|Hold|Avoid)/i) || [])[1] || (/\bhold\b/i.test(o.r || "") ? "Hold" : "");
  // Aktuális ajánlás: minden árfrissítéskor a csillagból (ár / belső érték) számolva:
  // 5★ Buy, 4★ Accumulate, 2–3★ Hold, 1★ Avoid; moat nélküli cég legfeljebb Hold, és ha az elemzés Avoid volt, Avoid marad. Csillag híján az elemzéskori.
  let rw = st ? (st >= 5 ? "Buy" : st == 4 ? "Accumulate" : st >= 2 ? "Hold" : "Avoid") : rw0;
  if (o.m == "None") rw = /^avoid$/i.test(rw0) ? "Avoid" : (rw == "Buy" || rw == "Accumulate") ? "Hold" : rw;
  return { ...o, mk, px, pv, up, v, mpa, rw0, gap: mpa != null && o.s != null ? mpa - o.s : null, rw, rk: { buy: 4, accumulate: 3, hold: 2, avoid: 1 }[rw.toLowerCase()] || 0, tr: mk.tr || null, ...trends(mk), mo: { Wide: 3, Narrow: 2, None: 1 }[o.m] || 0, vo: st ?? ({ Undervalued: 4, Fair: 3, Expensive: 2 }[v] || 0), st, to: { "Emelkedő": 3, "Oldalazó": 2, "Csökkenő": 1 }[mk.tr] || 0 };
}
// Mai ajánlat: moat score >= 70, van moat, aktuális ajánlás Buy/Accumulate/Hold (nem Avoid), nem drága, és trend: vagy a 200 napos (hosszú távú) emelkedő – ilyenkor a rövid/közép táv eshet –,
// vagy az 50 és a 200 napos sem csökkenő. Közülük a vételi szinthez legközelebbi.
function pickOf(all) {
  const buy = (r) => /^(buy|accumulate|hold)$/i.test(r.rw || "");
  return all.filter((r) => r.s >= 70 && r.m != "None" && r.bb > 0 && r.px > 0 && (r.trL == "Emelkedő" || (r.trM && r.trM != "Csökkenő" && r.trL != "Csökkenő")) && buy(r) && r.v != "Expensive").sort((a, b) => a.px / a.bb - b.px / b.bb)[0];
}
if (typeof module !== "undefined") module.exports = { trends, valuation, UD, stars, derive, pickOf };
