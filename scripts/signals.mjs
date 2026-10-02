// Jelzések: a figyelőlista (data/companies.json) papírjainál összeveti a mostani állapotot az előző futáséval,
// és rögzíti, ha egy papír trendet vált vagy a vételi ajánlata változik.
// Figyelt jellemzők:
//   - középtávú trend (mk.tr: ár vs SMA50, EMA20 vs EMA50) és hosszú távú trend (SMA50/SMA200)
//   - ajánlás (Buy / Accumulate / Hold / Avoid – a mai árból számolva; a naplóban cégenként csak a legfrissebb)
//   - vételi szint: az ár a vételi szint (bb) alá esett vagy fölé ment
// Állapot: data/signals-state.json, napló: data/signals.json.
// Ha van változás, az issue szövegét a SIGNAL_OUT fájlba írja (a workflow ebből nyit GitHub issue-t → e-mail értesítés).
// Futtatja: .github/workflows/refresh.yml a napi frissítés után.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const { derive, pickOf } = createRequire(import.meta.url)("../core.js");
const STATE = "data/signals-state.json", LOG = "data/signals.json";
const RW = { buy: "Vétel (Buy)", accumulate: "Gyűjtés (Accumulate)", hold: "Tartás (Hold)", avoid: "Kerülendő (Avoid)" };
const rwHu = (x) => RW[String(x || "").toLowerCase()] || "–";
const arrow = { "Emelkedő": "📈 Emelkedő", "Csökkenő": "📉 Csökkenő", "Oldalazó": "➡️ Oldalazó" };
const tr = (x) => arrow[x] || "–";
const read = async (f, d) => { try { return JSON.parse(await readFile(f, "utf8")); } catch { return d; } };
const fmt = (x) => (x == null ? "–" : Number(x).toLocaleString("hu-HU", { maximumFractionDigits: 2 }));

const all = (await read("data/companies.json", [])).map(derive);
const pick = pickOf(all);
const now = {};
for (const r of all) {
  if (!r.id) continue;
  now[r.id] = {
    n: r.n, trM: r.trM || null, trL: r.trL || null, rw: r.rw || null,
    below: r.bb > 0 && r.px > 0 ? r.px <= r.bb : null, px: r.px ?? null, bb: r.bb ?? null, cur: r.cur || "",
  };
}
const prev = await read(STATE, null);
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Budapest" });
const changes = [];
if (prev && prev.c) {
  for (const [id, a] of Object.entries(now)) {
    const b = prev.c[id];
    if (!b) continue; // új papír a listán – nincs mihez viszonyítani
    const add = (kind, from, to) => changes.push({ d: today, id, n: a.n, kind, from, to, px: a.px, bb: a.bb, cur: a.cur });
    if (a.trM && b.trM && a.trM !== b.trM) add("Középtávú trend", b.trM, a.trM);
    if (a.trL && b.trL && a.trL !== b.trL) add("Hosszú távú trend (200 nap)", b.trL, a.trL);
    if (a.rw && b.rw && a.rw.toLowerCase() !== b.rw.toLowerCase()) add("Ajánlás", rwHu(b.rw), rwHu(a.rw));
    if (a.below != null && b.below != null && a.below !== b.below)
      add("Vételi szint", b.below ? "a vételi szint alatt" : "a vételi szint felett", a.below ? "a vételi szint alá esett" : "a vételi szint fölé ment");
  }
}
await writeFile(STATE, JSON.stringify({ at: new Date().toISOString(), pick: pick?.id || null, c: now }, null, 1) + "\n");
if (!changes.length) { console.log(prev ? "Nincs trend- vagy ajánlásváltás." : "Kiinduló állapot rögzítve."); process.exit(0); }

// Ajánlásváltásból cégenként csak a legfrissebb marad a naplóban; a Mai ajánlat nem jelzés.
const newRec = new Set(changes.filter((c) => c.kind === "Ajánlás").map((c) => c.id));
const log = (await read(LOG, [])).filter((c) => c.kind !== "Mai ajánlat" && !(c.kind === "Ajánlás" && newRec.has(c.id)));
await writeFile(LOG, JSON.stringify([...changes, ...log].slice(0, 300), null, 1) + "\n");
console.log(`Jelzés: ${changes.length} változás`);

if (process.env.SIGNAL_OUT) {
  const isTrend = (k) => k.includes("trend");
  const show = (c, x) => (isTrend(c.kind) ? tr(x) : x);
  const rows = changes.map((c) =>
    `| **${c.id}** ${c.n} | ${c.kind} | ${show(c, c.from)} → **${show(c, c.to)}** | ${c.px != null ? fmt(c.px) + " " + c.cur : ""} | ${c.bb != null ? fmt(c.bb) + " " + c.cur : ""} |`);
  const ids = [...new Set(changes.map((c) => c.id))];
  const title = `Jelzés ${today}: ${ids.slice(0, 5).join(", ")}${ids.length > 5 ? " …" : ""} – trend/ajánlás változott`;
  const body = [
    `@${process.env.OWNER || "matekonnyu"} a figyelőlistán ${changes.length} változás történt a mai (${today}) frissítéskor:`, "",
    "| Papír | Mi változott | Előtte → Most | Ár | Vételi szint |", "|---|---|---|---|---|", ...rows, "",
    "Trend: középtáv = ár vs. 50 napos átlag és EMA20/EMA50; hosszú táv = 50 vs. 200 napos átlag (napi záróárak, Yahoo Finance).",
    "Részletek: https://konninvest.com · Ez kutatási jelzés, nem befektetési tanácsadás.",
  ].join("\n");
  await writeFile(process.env.SIGNAL_OUT, JSON.stringify({ title, body }));
}
