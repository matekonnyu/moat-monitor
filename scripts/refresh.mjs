// Napi árfolyam- és trendfrissítés a Yahoo Finance napi záróáraiból.
// Futtatja: .github/workflows/refresh.yml (minden reggel), vagy kézzel: node scripts/refresh.mjs
import { readFile, writeFile } from "node:fs/promises";

const FILES = ["data/companies.json", "data/candidates.json"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const round = (x) => (x == null ? null : Math.round(x * 100) / 100);

export function indicators(closes) {
  // closes: legrégebbitől a legújabbig
  const n = closes.length;
  const sma = (k) => (n >= k ? avg(closes.slice(n - k)) : null);
  const ema = (k) => {
    if (n < k) return null;
    let e = avg(closes.slice(0, k));
    const m = 2 / (k + 1);
    for (let i = k; i < n; i++) e = closes[i] * m + e * (1 - m);
    return e;
  };
  const p = closes[n - 1], s50 = sma(50), e20 = ema(20), e50 = ema(50);
  let tr = null;
  if (s50 && e20 && e50) tr = p > s50 && e20 > e50 ? "Emelkedő" : p < s50 && e20 < e50 ? "Csökkenő" : "Oldalazó";
  const back = (k) => (n > k ? (p / closes[n - 1 - k] - 1) * 100 : null);
  return {
    p: round(p), prev: round(closes[n - 2] ?? null),
    sma20: round(sma(20)), sma50: round(s50), sma200: round(sma(200)),
    ema20: round(e20), ema50: round(e50), tr,
    ch1m: round(back(21)), ch6m: round(back(126)),
  };
}

async function fetchDaily(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1y&interval=1d&includePrePost=false`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (moat-monitor daily refresh)" } });
    if (res.ok) {
      const j = await res.json();
      const r = j?.chart?.result?.[0];
      const ts = r?.timestamp || [], cl = r?.indicators?.quote?.[0]?.close || [];
      const rows = ts.map((t, i) => [t, cl[i]]).filter(([, c]) => c != null && isFinite(c));
      if (rows.length < 2) throw new Error("Nincs elég napi adat");
      const last = rows[rows.length - 1][0];
      const tz = r.meta?.exchangeTimezoneName || "UTC";
      const d = new Date(last * 1000).toLocaleDateString("sv-SE", { timeZone: tz });
      return { ...indicators(rows.map((x) => x[1])), d, cur: r.meta?.currency || null };
    }
    if (res.status === 404) throw new Error("Ismeretlen ticker a Yahoo Finance-en: " + sym);
    await sleep(2000 * (attempt + 1));
  }
  throw new Error("A Yahoo Finance nem válaszolt");
}

const at = new Date().toISOString();
export const CAND_TTL = 2 * 864e5; // 2 nap
let ok = 0, fail = 0;
for (const f of FILES) {
  let list;
  try { list = JSON.parse(await readFile(f, "utf8")); } catch { continue; }
  if (f.endsWith("candidates.json")) {
    // Jóváhagyásra váró elemzés: az első mentés ideje "added"; 2 nap után kikerül a várólistából.
    for (const c of list) if (!c.added) c.added = at;
    const before = list.length;
    list = list.filter((c) => Date.parse(at) - Date.parse(c.added) < CAND_TTL);
    if (list.length < before) console.log(`Lejárt jelölt törölve: ${before - list.length}`);
  }
  for (const c of list) {
    if (!c.y) continue;
    try {
      const { cur, ...mk } = await fetchDaily(c.y);
      c.mk = { ...mk, at, src: "Yahoo Finance" };
      if (!c.cur && cur) c.cur = cur;
      ok++;
    } catch (e) {
      c.mk = { ...(c.mk || {}), err: String(e.message || e), errAt: at };
      fail++;
      console.error(c.y, e.message);
    }
    await sleep(400);
  }
  await writeFile(f, JSON.stringify(list, null, 1) + "\n");
}
await writeFile("data/meta.json", JSON.stringify({ refreshedAt: at, ok, fail }, null, 1) + "\n");
console.log(`Frissítve: ${ok}, hiba: ${fail}`);
