// Gépi (AI-ügynök) olvasásra szánt kiadás: JavaScript nélkül is olvasható adatok.
// Kimenet: adatok.md (Markdown), adatok.csv, adatok.json (számított mezőkkel), llms.txt,
// és az index.html-be előre beírt táblázat + Mai ajánlat (a JS betöltéskor lecseréli).
// Futtatja: scripts/refresh.mjs a végén, és scripts/issues.mjs minden listamódosítás után.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { derive, pickOf } = require("../core.js");

const SITE = "https://konninvest.com";
const load = async (f, d) => { try { return JSON.parse(await readFile(f, "utf8")); } catch { return d; } };
const C = (await load("data/companies.json", [])).map(derive);
const CD = (await load("data/candidates.json", [])).map(derive);
const META = await load("data/meta.json", {});

const num = (x) => x.toLocaleString("hu-HU", { minimumFractionDigits: Math.abs(x) >= 1000 ? 0 : 2, maximumFractionDigits: Math.abs(x) >= 1000 ? 0 : 2 });
const mon = (x, c) => x == null || !isFinite(x) ? "–" : c == "USD" ? "$" + num(x) : c == "EUR" ? num(x) + " €" : c == "HUF" ? num(x) + " Ft" : num(x) + " " + (c || "");
const pct = (x) => x == null || !isFinite(x) ? "–" : (x > 0 ? "+" : "") + x.toFixed(1).replace(".", ",") + "%";
const esc = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const md = (x) => String(x ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const HU = { Undervalued: "Alulértékelt", Fair: "Korrekt ár", Expensive: "Drága" };
const ARW = { "Emelkedő": "↑", "Oldalazó": "→", "Csökkenő": "↓" };
const tr3 = (r) => [r.trS, r.trM, r.trL].map((t) => ARW[t] || "–").join(" ");
const tr3t = (r) => [r.trS, r.trM, r.trL].map((t) => t || "–").join(" / ");
const st = (r) => r.st ? "★".repeat(r.st) + "☆".repeat(5 - r.st) : "–";
const dates = C.map((r) => r.mk.d).filter(Boolean).sort();
const asOf = dates[dates.length - 1] || "";
const sorted = [...C].sort((a, b) => (b.s ?? 0) - (a.s ?? 0));
const pick = pickOf(C);

// ---- adatok.json: minden mező + a számított értékek (gépi feldolgozásra)
const pub = (r) => ({
  id: r.id, nev: r.n, ticker: r.t, yahoo: r.y, lista: r.l, szektor: r.sec, penznem: r.cur,
  arfolyam: r.px, arfolyam_datum: r.mk.d || null, celar: r.tp ?? null, potencial_szazalek: r.up == null ? null : +r.up.toFixed(2),
  trend: { nap20: r.trS, nap50: r.trM, nap200: r.trL }, sma20: r.mk.sma20 ?? null, sma50: r.mk.sma50 ?? null, sma200: r.mk.sma200 ?? null,
  valtozas_1ho: r.mk.ch1m ?? null, valtozas_6ho: r.mk.ch6m ?? null,
  belso_ertek: r.iv ?? null, veteli_szint: r.bb ?? null, biztonsagi_sav_szazalek: r.mos ?? null, ar_vs_belso_ertek_szazalek: r.pv == null ? null : +r.pv.toFixed(2),
  csillag: r.st ?? null, ertekeles: HU[r.v] || r.v || null, bizonytalansag: r.u ?? null,
  moat: r.m, moat_trend: r.mt ?? null, moat_score: r.s, moat_pillerek: r.p ? { immaterialis_javak: r.p[0], valtasi_koltseg: r.p[1], halozati_hatas: r.p[2], koltsegelony: r.p[3], hatekony_meret: r.p[4] } : null,
  mpa_score: r.mpa, elteres: r.gap, penzugyi_ero: r.f ?? null, ai_kockazat: r.ai ?? null, bizonyossag: r.c ?? null,
  ajanlas: r.rw || null, ajanlas_elemzeskor: r.rw0 || null, ajanlas_szoveg: r.r || null, kockazatok: r.risks || null, belso_ertek_alapja: r.ivb || null, forrasok: r.srcs || null, elemzes_datuma: r.d || null,
});
await writeFile("adatok.json", JSON.stringify({
  forras: SITE, leiras: "konninvest Moat Monitor – a követett cégek moat-, értékelési és trendadatai. Kutatási eszköz, nem befektetési tanács.",
  modszertan: SITE + "/MODSZERTAN.md", arak_datuma: asOf, frissitve: META.refreshedAt || null,
  mai_ajanlat: pick ? pick.id : null, cegek: sorted.map(pub), jovahagyasra_var: CD.map(pub),
}, null, 1) + "\n");

// ---- adatok.csv
const cols = ["id", "nev", "ticker", "penznem", "arfolyam", "arfolyam_datum", "celar", "potencial_szazalek", "trend_20", "trend_50", "trend_200", "belso_ertek", "veteli_szint", "ar_vs_belso_ertek_szazalek", "csillag", "ertekeles", "bizonytalansag", "moat", "moat_trend", "moat_score", "mpa_score", "elteres", "ajanlas"];
const q = (v) => v == null ? "" : /[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
const csvRows = sorted.map((r) => { const p = pub(r); return [p.id, p.nev, p.ticker, p.penznem, p.arfolyam, p.arfolyam_datum, p.celar, p.potencial_szazalek, r.trS, r.trM, r.trL, p.belso_ertek, p.veteli_szint, p.ar_vs_belso_ertek_szazalek, p.csillag, p.ertekeles, p.bizonytalansag, p.moat, p.moat_trend, p.moat_score, p.mpa_score, p.elteres, p.ajanlas].map(q).join(","); });
await writeFile("adatok.csv", [cols.join(","), ...csvRows].join("\n") + "\n");

// ---- adatok.md
const L = [];
L.push(`# konninvest Moat Monitor – adatok`, "");
L.push(`Árak: ${asOf} záró (Yahoo Finance). Frissítve: ${META.refreshedAt || "–"}. Forrás: ${SITE}. Módszertan: ${SITE}/MODSZERTAN.md (Morningstar-gyakorlat). Gépi formátumok: ${SITE}/adatok.json, ${SITE}/adatok.csv. Kutatási eszköz, nem befektetési tanács.`, "");
L.push(`## Mai ajánlat`, "");
L.push(pick ? `${pick.n} (${pick.t}) – ${pick.m} moat, ${st(pick)} (${HU[pick.v]}), árfolyam ${mon(pick.px, pick.cur)}, belső érték ${mon(pick.iv, pick.cur)}, vételi szint ${mon(pick.bb, pick.cur)}, trend 20/50/200: ${tr3t(pick)}. ${pick.r || ""}` : "Ma nincs ajánlat: egyik cég sem felel meg egyszerre minden feltételnek (moat score legalább 70, van moat, Buy/Accumulate/Hold ajánlás, legalább 3 csillag, és a 200 napos trend emelkedő, vagy az 50 és 200 napos trend sem csökkenő).", "");
L.push(`## Követett cégek (${sorted.length})`, "");
L.push("| Cég | Ticker | Árfolyam | Célár | Potenciál | Trend 20/50/200 | Belső érték | Vételi szint | Ár vs IV | Értékelés | Moat | Moat score | MPA score | Eltérés | Elemzés |");
L.push("| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: | --- |");
for (const r of sorted) L.push(`| ${md(r.n)} | ${md(r.t)} | ${mon(r.px, r.cur)} | ${mon(r.tp, r.cur)} | ${pct(r.up)} | ${tr3t(r)} | ${mon(r.iv, r.cur)} | ${mon(r.bb, r.cur)} | ${pct(r.pv)} | ${st(r)} ${HU[r.v] || ""} | ${r.m || "–"} | ${r.s ?? "–"} | ${r.mpa ?? "–"} | ${r.gap == null ? "–" : (r.gap > 0 ? "+" : "") + r.gap} | ${r.rw || "–"} |`);
L.push("", "## Cégenkénti részletek", "");
for (const r of sorted) {
  L.push(`### ${r.n} (${r.t})`, "");
  L.push(`- Szektor: ${r.sec || "–"}; lista: ${r.l || "–"}; elemzés dátuma: ${r.d || "–"}`);
  L.push(`- Moat: ${r.m || "–"} (score ${r.s ?? "–"}, trend: ${r.mt || "–"}); pillérek: ${r.p ? `immateriális javak ${r.p[0]}, váltási költség ${r.p[1]}, hálózati hatás ${r.p[2]}, költségelőny ${r.p[3]}, hatékony méret ${r.p[4]}` : "–"}`);
  L.push(`- Értékelés: ${st(r)} ${HU[r.v] || ""}; bizonytalanság: ${r.u || "–"}; pénzügyi erő: ${r.f || "–"}; AI-kockázat: ${r.ai || "–"}`);
  L.push(`- Árfolyam ${mon(r.px, r.cur)} (${r.mk.d || "–"}); belső érték ${mon(r.iv, r.cur)}; vételi szint ${mon(r.bb, r.cur)} (biztonsági sáv ${r.mos ?? "–"}%); konszenzus célár ${mon(r.tp, r.cur)}`);
  L.push(`- Trend 20/50/200 nap: ${tr3t(r)}; változás 1 hó ${pct(r.mk.ch1m)}, 6 hó ${pct(r.mk.ch6m)}`);
  L.push(`- Aktuális ajánlás (mai ár alapján): ${r.rw || "–"}${r.rw0 && r.rw0 !== r.rw ? ` (elemzéskor: ${r.rw0})` : ""}`);
  if (r.r) L.push(`- Elemzés: ${md(r.r)}`);
  if (r.risks) L.push(`- Kockázatok: ${md(r.risks)}`);
  if (r.ivb) L.push(`- Belső érték alapja: ${md(r.ivb)}`);
  if (r.srcs) L.push(`- Források: ${[].concat(r.srcs).map(md).join("; ")}`);
  L.push("");
}
if (CD.length) {
  L.push(`## Jóváhagyásra váró elemzések (${CD.length})`, "");
  for (const r of CD) L.push(`- ${r.n} (${r.t}): ${r.m || "–"} moat, ${st(r)} ${HU[r.v] || ""}, árfolyam ${mon(r.px, r.cur)}, belső érték ${mon(r.iv, r.cur)}. ${md(r.r || "")}`);
  L.push("");
}
await writeFile("adatok.md", L.join("\n"));

// ---- llms.txt (útmutató AI-ügynököknek)
await writeFile("llms.txt", `# konninvest Moat Monitor

> Magyar nyelvű részvénykutatási oldal: a követett cégek versenyelőnye (Morningstar-moat), becsült belső értéke, vételi szintje, Morningstar-módszerű csillagos értékelése és 20/50/200 napos árfolyamtrendje. Minden reggel frissül. Kutatási eszköz, nem befektetési tanács.

Az oldal (${SITE}) JavaScripttel jelenik meg; ugyanazok az adatok JavaScript nélkül is elérhetők:

- [Adatok Markdownban](${SITE}/adatok.md): Mai ajánlat, a teljes táblázat és cégenkénti részletek (kockázatok, források).
- [Adatok JSON-ban](${SITE}/adatok.json): minden mező és számított érték (csillag, MPA score, trendek), magyar mezőnevekkel.
- [Adatok CSV-ben](${SITE}/adatok.csv): a táblázat egy sor / cég formában.
- [Módszertan](${SITE}/MODSZERTAN.md): moat, belső érték, bizonytalanság, csillagok, MPA score, trend, Mai ajánlat szabályai.
- Nyers adatfájlok: ${SITE}/data/companies.json, ${SITE}/data/candidates.json, ${SITE}/data/meta.json

Árak dátuma: ${asOf}. Cégek száma: ${C.length}.
`);

// ---- index.html: előre beírt táblázat és Mai ajánlat (a JS betöltéskor lecseréli)
let html = await readFile("index.html", "utf8");
const rows = sorted.map((r) => `<tr><td>${esc(r.n)} (${esc(r.t)})</td><td>${esc(mon(r.px, r.cur))}</td><td>${esc(mon(r.tp, r.cur))}</td><td>${esc(pct(r.up))}</td><td>${esc(tr3(r))}</td><td>${esc(mon(r.iv, r.cur))}</td><td>${esc(mon(r.bb, r.cur))}</td><td>${esc(pct(r.pv))}</td><td>${esc(st(r))} ${esc(HU[r.v] || "")}</td><td>${esc(r.m || "–")}</td><td>${r.s ?? "–"}</td><td>${r.mpa ?? "–"}</td><td>${r.gap ?? "–"}</td><td>${esc(r.rw || "–")}</td></tr>`).join("\n");
const pk = pick ? `<h2>Mai ajánlat: ${esc(pick.n)} (${esc(pick.t)})</h2><p>${esc(pick.r || "")}</p>` : `<h2>Ma nincs ajánlat</h2><p>Egyik cég sem felel meg egyszerre minden feltételnek.</p>`;
const swap = (h, a, b, inner) => { const i = h.indexOf(a), j = h.indexOf(b); return i < 0 || j < 0 ? h : h.slice(0, i + a.length) + "\n" + inner + "\n" + h.slice(j); };
html = swap(html, "<!--SSR-TB-->", "<!--/SSR-TB-->", rows);
html = swap(html, "<!--SSR-PK-->", "<!--/SSR-PK-->", pk);
// Gyorsítótár: a core.js / app.js verziója a tartalmuk hash-e, így módosításkor a böngésző biztosan az újat tölti be.
const { createHash } = await import("node:crypto");
for (const fn of ["core.js", "app.js"]) {
  const v = createHash("sha1").update(await readFile(fn)).digest("hex").slice(0, 10);
  html = html.replace(new RegExp(`(src="${fn.replace(".", "\\.")})\\?v=[^"]*"`), `$1?v=${v}"`);
}
await writeFile("index.html", html);
console.log(`Gépi kiadás kész: ${C.length} cég, ajánlat: ${pick ? pick.id : "nincs"}`);
