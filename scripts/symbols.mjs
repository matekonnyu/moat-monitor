// Kereshető részvénylista az "Új cég elemzése" mezőhöz: data/symbols.json
// Források: Nasdaq Trader (USA), Deutsche Börse Xetra (Németország), valamint BÉT és bécsi tőzsde listája,
// amelyet a Yahoo Finance-en ellenőrzünk. Formátum: [[yahooSymbol, név, tőzsde], ...]
import { writeFile, readFile } from "node:fs/promises";

const UA = { "User-Agent": "Mozilla/5.0 (moat-monitor symbol index)" };
const get = async (u) => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(u + " " + r.status); return r.text(); };
const out = new Map(); const stats = {};
const add = (sym, name, ex) => { sym = sym.trim(); name = name.replace(/\s+/g, " ").trim(); if (!sym || !name || out.has(sym)) return; out.set(sym, [sym, name, ex]); stats[ex] = (stats[ex] || 0) + 1; };
const junk = /\b(warrants?|rights?|units?|preferred|depositary shares? representing .*preferred|notes? due|debentures?|% |acquisition corp|trust preferred|subordinated)\b/i;
const clean = (n) => n.replace(/\s*-?\s*(Class [A-Z] )?(Common Stock|Ordinary Shares|Common Shares|American Depositary Shares.*|Class [A-Z] Ordinary Shares.*)$/i, "").replace(/[,\s]+$/, "");

// 1) USA – Nasdaq Trader szimbólumjegyzék
try {
  for (const line of (await get("https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt")).split("\n").slice(1)) {
    const [s, n, , test, , , etf] = line.split("|"); if (!s || test != "N" || etf != "N" || junk.test(n) || /File Creation/.test(s)) continue;
    add(s.replace(/\./g, "-"), clean(n), "USA");
  }
  for (const line of (await get("https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt")).split("\n").slice(1)) {
    const [s, n, , , etf, , test] = line.split("|"); if (!s || test != "N" || etf != "N" || junk.test(n) || /[$]/.test(s) || /File Creation/.test(s)) continue;
    add(s.replace(/\./g, "-"), clean(n), "USA");
  }
} catch (e) { console.error("USA:", e.message); }

// 2) Xetra – Deutsche Börse "All tradable instruments"
try {
  const page = await get("https://www.xetra.com/xetra-en/instruments/instruments");
  const href = (page.match(/href="([^"]*t7-xetr-allTradableInstruments\.csv)"/) || [])[1];
  if (!href) throw new Error("nincs CSV link");
  const csv = await get(new URL(href, "https://www.xetra.com").href);
  const lines = csv.split(/\r?\n/); const hi = lines.findIndex((l) => /Mnemonic/.test(l) && /ISIN/.test(l));
  const H = lines[hi].split(";"); const ix = (re) => H.findIndex((h) => re.test(h));
  const iN = ix(/^Instrument$/), iM = ix(/^Mnemonic$/), iT = ix(/Instrument Type/i), iS = ix(/Instrument Status/i);
  const types = {};
  for (const l of lines.slice(hi + 1)) {
    const c = l.split(";"); if (c.length < H.length / 2) continue;
    const t = iT >= 0 ? c[iT] : ""; types[t] = (types[t] || 0) + 1;
    if (iT >= 0 && !/^(CS|Common Stock)$/i.test(t)) continue;
    if (iS >= 0 && /inactive|suspend/i.test(c[iS])) continue;
    if (c[iM]) add(c[iM] + ".DE", c[iN], "Xetra");
  }
  stats.xetraTypes = types;
} catch (e) { console.error("Xetra:", e.message); }

// 3) BÉT és bécsi tőzsde – ismert részvények, Yahoo-n ellenőrizve (ami nem létezik, kimarad)
const BUD = ["OTP", "MOL", "RICHTER", "MTELEKOM", "4IG", "ANY", "APPENINN", "AUTOWALLIS", "ALTEO", "AKKO", "BIF", "CIGPANNONIA", "DUNAHOUSE", "ENEFI", "GSPARK", "MASTERPLAST", "NATURLAND", "OPUS", "PANNERGY", "RABA", "WABERERS", "ZWACK", "MBHBANK", "KONZUM", "DELTA", "SPLUS", "EHEP", "GOPD", "NUTEX", "ESTMEDIA", "FUTURAQUA", "MEGAKRAN", "CYBERG", "VERTIKAL", "SUNDELL", "PANNONBIO", "BET", "ORMESTER", "MBHJB", "OXOTEC", "PENSUM", "SHOPRENTER", "STRT"];
const VIE = ["ANDR", "ATS", "BG", "CAI", "DOC", "EBS", "EVN", "FLU", "IIA", "LNZ", "OMV", "POST", "RBI", "SBO", "STR", "TKA", "UQA", "VER", "VIG", "VOE", "WIE", "AGR", "PAL", "SEM", "PYT", "ZAG", "KTCG", "RHIM", "MMK", "AMAG", "FACC", "ROS", "SPI", "PORR", "UBS", "OBS", "DOCM", "HHH", "MARI", "ADKO", "FQT", "WXF", "BKS", "ATRS", "ECO", "FLUH"];
async function yahooName(sym) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=5d&interval=1d`, { headers: UA });
    if (!r.ok) return null; const m = (await r.json())?.chart?.result?.[0]?.meta;
    return m && m.regularMarketPrice ? (m.longName || m.shortName || sym) : null;
  } catch { return null; }
}
for (const [list, suf, ex] of [[BUD, ".BD", "BÉT"], [VIE, ".VI", "Bécs"]]) {
  for (const t of list) { const n = await yahooName(t + suf); if (n) add(t + suf, n, ex); await new Promise((r) => setTimeout(r, 250)); }
}

// 4) a saját listán lévő cégek biztosan szerepeljenek
try { for (const c of JSON.parse(await readFile("data/companies.json", "utf8"))) add(c.y, c.n, /\.BD$/.test(c.y) ? "BÉT" : /\.DE$/.test(c.y) ? "Xetra" : /\.VI$/.test(c.y) ? "Bécs" : "USA"); } catch {}

const arr = [...out.values()].sort((a, b) => a[1].localeCompare(b[1]));
if (arr.length < 1000) { console.error("Túl kevés találat, nem írom felül:", arr.length, stats); process.exit(1); }
await writeFile("data/symbols.json", JSON.stringify(arr));
await writeFile("data/symbols-meta.json", JSON.stringify({ builtAt: new Date().toISOString(), count: arr.length, stats }, null, 1) + "\n");
console.log("symbols:", arr.length, JSON.stringify(stats));
