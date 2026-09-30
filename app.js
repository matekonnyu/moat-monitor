// Moat Monitor – statikus oldal. Adat: data/*.json (GitHub Actions frissíti).
// A gombok előre kitöltött GitHub issue-t nyitnak; a feldolgozást a repó workflow-i végzik.
const $ = (s) => document.querySelector(s);
const esc = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = (x) => x.toLocaleString("hu-HU", { minimumFractionDigits: Math.abs(x) >= 1000 ? 0 : 2, maximumFractionDigits: Math.abs(x) >= 1000 ? 0 : 2 });
const mon = (x, c) => x == null || !isFinite(x) ? "–" : c == "USD" ? "$" + num(x) : c == "EUR" ? num(x) + " €" : c == "HUF" ? num(x) + " Ft" : c == "GBP" ? "£" + num(x) : num(x) + " " + (c || "");
const pct = (x) => x == null || !isFinite(x) ? "–" : (x > 0 ? "+" : "") + x.toFixed(1).replace(".", ",") + "%";
const K = { Wide: "g", Narrow: "a", None: "r", Undervalued: "g", Fair: "a", Expensive: "r", Strong: "g", Adequate: "a", Weak: "r", Low: "g", Medium: "a", High: "r", "Emelkedő": "g", "Oldalazó": "a", "Csökkenő": "r" };
const chip = (t) => t ? `<span class="chip ${K[t] || ""}">${esc(t)}</span>` : `<span class="chip">nincs adat</span>`;
const PL = ["Immateriális javak", "Váltási költség", "Hálózati hatás", "Költségelőny", "Hatékony méret"];

// GitHub repó a címből: https://<owner>.github.io/<repo>/
const OWNER = location.hostname.endsWith(".github.io") ? location.hostname.split(".")[0] : "OWNER";
const REPO = location.hostname.endsWith(".github.io") ? (location.pathname.split("/").filter(Boolean)[0] || OWNER + ".github.io") : "moat-monitor";
const issueUrl = (title, body = "") => `https://github.com/${OWNER}/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body || "Ezt a kérést a Moat Monitor oldal készítette. Kattints a „Submit new issue” gombra.")}`;

let C = [], CD = [], RQ = [], META = {}, sk = "s", sd = -1;
const open = new Set();

function valuation(pv) { return pv < -10 ? "Undervalued" : pv <= 15 ? "Fair" : "Expensive"; }
function derive(o) {
  const mk = o.mk || {}, px = mk.p ?? o.pr;
  const pv = o.iv > 0 && px > 0 ? (px / o.iv - 1) * 100 : null;
  const up = o.tp > 0 && px > 0 ? (o.tp / px - 1) * 100 : null;
  const v = pv == null ? o.v : valuation(pv);
  return { ...o, mk, px, pv, up, v, tr: mk.tr || null, mo: { Wide: 3, Narrow: 2, None: 1 }[o.m] || 0, vo: { Undervalued: 3, Fair: 2, Expensive: 1 }[v] || 0, to: { "Emelkedő": 3, "Oldalazó": 2, "Csökkenő": 1 }[mk.tr] || 0 };
}
const pillars = (p) => (p || []).map((v, i) => `<div class="p"><span>${PL[i]}</span><div class="tr"><i style="width:${v}%"></i></div><span>${v}</span></div>`).join("");

function detail(r) {
  const mk = r.mk;
  return `<tr class="d"><td colspan="10"><div class="dg"><div>${pillars(r.p)}<p class="rec">${esc(r.r)}</p>${r.risks ? `<p class="rec">Kockázatok: ${esc(r.risks)}</p>` : ""}${r.ivb ? `<p class="rec note">Belső érték alapja: ${esc(r.ivb)}</p>` : ""}<a class="del" style="display:inline-block;text-decoration:none" href="${issueUrl("Törlés: " + r.id)}" target="_blank" rel="noopener">Törlés a listáról</a></div>
<div><div class="k"><span>Záróár dátuma</span><span>${esc(mk.d || r.d || "–")}</span></div>
<div class="k"><span>Napi változás</span><span>${mk.prev ? pct((mk.p / mk.prev - 1) * 100) : "–"}</span></div>
<div class="k"><span>1 hónap / 6 hónap</span><span>${pct(mk.ch1m)} / ${pct(mk.ch6m)}</span></div>
<div class="k"><span>SMA20 / SMA50 / SMA200</span><span>${mon(mk.sma20, r.cur)} / ${mon(mk.sma50, r.cur)} / ${mon(mk.sma200, r.cur)}</span></div>
<div class="k"><span>EMA20 / EMA50</span><span>${mon(mk.ema20, r.cur)} / ${mon(mk.ema50, r.cur)}</span></div>
<div class="k"><span>Célár (konszenzus)</span><span>${mon(r.tp, r.cur)}</span></div>
<div class="k"><span>AI-kockázat</span>${chip(r.ai)}</div><div class="k"><span>Pénzügyi erő</span>${chip(r.f)}</div>
<div class="k"><span>Margin of Safety</span><span>${r.mos ?? "–"}%</span></div>
<div class="k"><span>Szektor</span><span>${esc(r.sec)}</span></div><div class="k"><span>Elemzés dátuma</span><span>${esc(r.d || "–")}</span></div>
<div class="k"><span>Árfolyamgrafikon</span><a class="g" href="${esc(r.ch || "https://finance.yahoo.com/chart/" + r.y)}" target="_blank" rel="noopener">${esc(r.y || r.t)}</a></div>
${mk.err ? `<p class="note r">Utolsó frissítési hiba: ${esc(mk.err)}</p>` : ""}</div></div></td></tr>`;
}

function draw() {
  const q = $("#q").value.toLowerCase(), fm = $("#fm").value, fl = $("#fl").value, ft = $("#ft").value;
  const a = C.map(derive).filter((r) => (!q || (r.n + r.t + r.sec).toLowerCase().includes(q)) && (!fm || r.m == fm) && (!fl || r.l == fl) && (!ft || r.tr == ft));
  a.sort((x, y) => { const u = x[sk] ?? -1e18, w = y[sk] ?? -1e18; return (typeof u == "string" ? u.localeCompare(w) : u - w) * sd; });
  $("#cnt").textContent = a.length + " / " + C.length + " cég";
  $("#tb").innerHTML = a.map((r) => `<tr class="row" tabindex="0" data-id="${esc(r.id)}"><td><b>${esc(r.n)}</b><small>${esc(r.t)}, ${esc(r.l)}</small></td><td>${chip(r.m)}</td><td><span class="sc"><span class="tr"><i style="width:${r.s}%"></i></span>${r.s}</span></td><td>${mon(r.px, r.cur)}<small>${r.mk.d ? esc(r.mk.d) + " záró" : "pillanatkép"}</small></td><td>${chip(r.tr)}</td><td class="${r.up >= 0 ? "g" : "r"}">${pct(r.up)}</td><td>${mon(r.iv, r.cur)}</td><td>${mon(r.bb, r.cur)}</td><td class="${r.pv <= 0 ? "g" : "r"}">${pct(r.pv)}</td><td>${chip(r.v)}</td></tr>${open.has(r.id) ? detail(r) : ""}`).join("") || `<tr><td colspan="10" style="text-align:center;padding:24px;position:static">Nincs találat ezekkel a szűrőkkel.</td></tr>`;
  document.querySelectorAll("#hd th").forEach((h) => { const on = h.dataset.k == sk; h.classList.toggle("on", on); h.textContent = h.textContent.replace(/ [▲▼]$/, "") + (on ? (sd < 0 ? " ▼" : " ▲") : ""); });
  pick();
}

// Napi ajánlat: vételi ajánlás, nem drága, trend nem lefelé, score ≥ 70, van moat; a Buy Below-hoz legközelebbi.
function pick() {
  const buy = (r) => /^\s*(buy|accumulate)/i.test(r.r || "");
  const c = C.map(derive).filter((r) => r.s >= 70 && r.m != "None" && r.bb > 0 && r.px > 0 && r.tr && r.tr != "Csökkenő" && buy(r) && r.v != "Expensive").sort((a, b) => a.px / a.bb - b.px / b.bb)[0];
  $("#pk").hidden = false;
  if (!c) { $("#pk").innerHTML = `<b>Ma nincs ajánlat</b><p>Egyik cég sem felel meg egyszerre minden feltételnek: vételi (Buy/Accumulate) ajánlás, nem drága az ár a belső értékhez képest, és a trend nem mutat lefelé.</p>`; return; }
  const g = (c.px / c.bb - 1) * 100;
  $("#pk").innerHTML = `<b>Mai ajánlat: ${esc(c.n)} (${esc(c.t)})</b><p>${c.m} moat, score ${c.s}, trend: ${c.tr}. Ár ${mon(c.px, c.cur)}, Buy Below ${mon(c.bb, c.cur)}: az ár ${g > 0 ? Math.abs(g).toFixed(1).replace(".", ",") + "%-kal felette van" : "alatta van"}. Célár szerinti upside ${pct(c.up)}.</p><p>${esc(c.r)}</p><p><small>Szűrés a listából: score legalább 70, van moat, vételi (Buy/Accumulate) ajánlás, nem drága az ár a belső értékhez képest, a trend nem mutat lefelé, és ezek közül az ár a legközelebb van a Buy Belowhoz. Nem személyre szabott befektetési tanács.</small></p>`;
}

function drawQ() {
  $("#t2").textContent = CD.length ? `Új cég (${CD.length} kész)` : "Új cég";
  $("#qs").innerHTML = (RQ.length ? `<div class="res"><b>Folyamatban lévő kérések</b>${RQ.map((r) => `<div class="k"><span>${esc(r.q)}</span><span>pár percen belül kész</span></div>`).join("")}</div>` : "") +
    CD.map((c0) => { const c = derive(c0); return `<div class="res"><b>${esc(c.n)} (${esc(c.t)})</b> ${chip(c.m)} ${chip(c.v)} ${c.tr ? chip(c.tr) : ""}
<div class="dg" style="margin-top:10px"><div>${pillars(c.p)}</div>
<div><div class="k"><span>Score</span><span>${c.s}</span></div><div class="k"><span>Ár${c.mk.d ? ` (${esc(c.mk.d)})` : ""}</span><span>${mon(c.px, c.cur)}</span></div><div class="k"><span>Belső érték</span><span>${mon(c.iv, c.cur)}</span></div><div class="k"><span>Buy Below (MoS ${c.mos}%)</span><span>${mon(c.bb, c.cur)}</span></div><div class="k"><span>Ár vs IV</span><span>${pct(c.pv)}</span></div><div class="k"><span>Célár</span><span>${mon(c.tp, c.cur)}</span></div><div class="k"><span>Pénzügyi erő</span>${chip(c.f)}</div><div class="k"><span>AI-kockázat</span>${chip(c.ai)}</div></div></div>
<p class="rec">${esc(c.r)}</p>${c.risks ? `<p class="rec">Kockázatok: ${esc(c.risks)}</p>` : ""}${c.ivb ? `<p class="rec note">Belső érték alapja: ${esc(c.ivb)}</p>` : ""}${c.srcs ? `<p class="rec note">Források: ${esc(c.srcs)}</p>` : ""}
<a class="btn pri" style="display:inline-block;margin-top:10px;text-decoration:none" href="${issueUrl("Felvétel: " + c.id)}" target="_blank" rel="noopener">Hozzáadás a listához</a> <a class="btn" style="display:inline-block;margin-top:10px;text-decoration:none" href="${issueUrl("Elvetés: " + c.id)}" target="_blank" rel="noopener">Elvetés</a></div>`; }).join("");
}

$("#hd").addEventListener("click", (e) => { const k = e.target.dataset.k; if (!k) return; sd = sk == k ? -sd : (k == "n" ? 1 : -1); sk = k; draw(); });
const tog = (e) => { const tr = e.target.closest("tr.row"); if (!tr || e.target.closest("a")) return; const id = tr.dataset.id; open.has(id) ? open.delete(id) : open.add(id); draw(); };
$("#tb").addEventListener("click", tog);
$("#tb").addEventListener("keydown", (e) => { if (e.key == "Enter") tog(e); });
["#q", "#fm", "#fl", "#ft"].forEach((s) => $(s).addEventListener("input", draw));
function show(v) { $("#v1").hidden = v != 1; $("#v2").hidden = v != 2; $("#t1").classList.toggle("on", v == 1); $("#t2").classList.toggle("on", v == 2); }
$("#t1").onclick = () => show(1); $("#t2").onclick = () => show(2);
$("#go").onclick = () => { const q = $("#an").value.trim(); if (!q) { $("#an").focus(); return; } window.open(issueUrl("Elemzés: " + q), "_blank", "noopener"); $("#an").value = ""; };
$("#an").addEventListener("keydown", (e) => { if (e.key == "Enter") $("#go").click(); });

async function getJSON(p) { const r = await fetch(p + "?t=" + Date.now(), { cache: "no-store" }); if (!r.ok) throw new Error(p); return r.json(); }
async function loadRequests() {
  if (OWNER == "OWNER") return;
  try {
    const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/issues?state=open&per_page=50`);
    if (!r.ok) return;
    RQ = (await r.json()).filter((i) => !i.pull_request && /^\s*Elemzés\s*:/i.test(i.title)).map((i) => ({ q: i.title.replace(/^\s*Elemzés\s*:\s*/i, "") }));
    drawQ();
  } catch {}
}
(async () => {
  try {
    [C, CD] = await Promise.all([getJSON("data/companies.json"), getJSON("data/candidates.json")]);
    try { META = await getJSON("data/meta.json"); } catch {}
    const ds = C.map((r) => r.mk?.d).filter(Boolean).sort();
    const when = META.refreshedAt ? new Date(META.refreshedAt).toLocaleString("hu-HU", { dateStyle: "medium", timeStyle: "short" }) : null;
    $("#st").textContent = (ds.length ? `Árak: ${ds[ds.length - 1]} záró.` : "") + (when ? ` Utolsó frissítés: ${when}.` : "") + (META.fail ? ` ${META.fail} papírnál nem sikerült.` : "");
    draw(); drawQ(); loadRequests();
  } catch (e) { $("#st").textContent = "Az adatok betöltése nem sikerült. Töltsd újra az oldalt."; }
})();
