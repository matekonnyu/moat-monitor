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

// Háttérben futtatás: a tulajdonos egyszer megad egy GitHub-kulcsot (csak ebben a böngészőben tárolódik).
let TOKEN = ""; try { TOKEN = localStorage.getItem("mm_gh_token") || ""; } catch {}
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const gh = (path, opt = {}) => fetch(API + path, { ...opt, headers: { Accept: "application/vnd.github+json", ...(TOKEN ? { Authorization: "Bearer " + TOKEN } : {}), ...(opt.body ? { "Content-Type": "application/json" } : {}), ...(opt.headers || {}) } });
const ACT = /^\s*(Elemzés|Felvétel|Elvetés|Törlés)\s*:\s*(.+?)\s*$/i;
let PENDING = [], pollT = null, lastPendingCount = 0;
async function act(title) {
  if (!TOKEN) { window.open(issueUrl(title), "_blank", "noopener"); return; }
  try {
    const r = await gh("/issues", { method: "POST", body: JSON.stringify({ title, body: "A Moat Monitor oldal indította." }) });
    if (r.status == 401 || r.status == 403 || r.status == 404) { flash("A GitHub-kulcs érvénytelen vagy nincs hozzá jogosultsága. Állítsd be újra az „Új cég” fül alján."); return; }
    if (!r.ok) throw new Error(r.status);
    const i = await r.json();
    PENDING.push({ n: i.number, title, at: Date.now() }); renderPending(); poll(true);
  } catch (e) { flash("Nem sikerült elküldeni a kérést (" + (e.message || e) + "). Próbáld újra."); }
}
function flash(t) { $("#msg").textContent = t; $("#msg").hidden = !t; }
function ago(ms) { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "most" : m + " perce"; }
function renderPending() {
  const lbl = { "elemzés": "Elemzés fut", "felvétel": "Hozzáadás folyamatban", "elvetés": "Elvetés folyamatban", "törlés": "Törlés folyamatban" };
  const html = PENDING.map((p) => { const m = p.title.match(ACT); return `<div class="k"><span><span class="spin"></span>${esc(lbl[m[1].toLowerCase()] || "Fut")}: <b>${esc(m[2])}</b></span><span>${ago(p.at)}${m[1].toLowerCase() == "elemzés" ? ", kb. 3–8 perc" : ", kb. 1 perc"}</span></div>`; }).join("");
  for (const id of ["#run1", "#run2"]) { $(id).innerHTML = html ? `<div class="res">${html}</div>` : ""; }
}
async function poll(soon) {
  clearTimeout(pollT);
  if (OWNER == "OWNER") return;
  try {
    const r = await gh("/issues?state=open&per_page=50");
    if (r.ok) {
      const open = (await r.json()).filter((i) => !i.pull_request && ACT.test(i.title) && i.user.login == OWNER);
      const had = PENDING.length;
      const keep = new Map(PENDING.map((p) => [p.n, p]));
      PENDING = open.map((i) => keep.get(i.number) || { n: i.number, title: i.title, at: Date.parse(i.created_at) });
      renderPending();
      if (PENDING.length < had) await reload();
    }
  } catch {}
  if (PENDING.length) pollT = setTimeout(poll, TOKEN ? 8000 : 60000);
}
async function reload() {
  try {
    const raw = async (f) => { if (TOKEN) { const r = await gh("/contents/" + f, { headers: { Accept: "application/vnd.github.raw+json" } }); if (r.ok) return r.json(); } return getJSON(f); };
    [C, CD] = await Promise.all([raw("data/companies.json"), raw("data/candidates.json")]);
    draw(); drawQ();
  } catch {}
}

let C = [], CD = [], RQ = [], META = {}, sk = "s", sd = -1;
const open = new Set();

// Három időtáv: rövid (20 nap), közép (50 nap, a korábbi szabály), hosszú (200 nap).
function trends(mk) {
  const p = mk.p, band = 0.01;
  const shortT = mk.sma20 ? (p > mk.sma20 * (1 + band) ? "Emelkedő" : p < mk.sma20 * (1 - band) ? "Csökkenő" : "Oldalazó") : null;
  const midT = mk.tr || null;
  const longT = mk.sma200 && mk.sma50 ? (p > mk.sma200 && mk.sma50 > mk.sma200 ? "Emelkedő" : p < mk.sma200 && mk.sma50 < mk.sma200 ? "Csökkenő" : "Oldalazó") : null;
  return { trS: shortT, trM: midT, trL: longT };
}
const ARW = { "Emelkedő": "↑", "Oldalazó": "→", "Csökkenő": "↓" };
const tri = (r) => r.trM || r.trS || r.trL ? `<span class="tri">${[["20 nap", r.trS], ["50 nap", r.trM], ["200 nap", r.trL]].map(([l, t]) => `<span class="${K[t] || ""}" title="${l}: ${t || "nincs adat"}" aria-label="${l}: ${t || "nincs adat"}">${ARW[t] || "–"}</span>`).join(" ")}</span>` : chip(null);
const trTxt = (r) => `rövid ${(r.trS || "–").toLowerCase()}, közép ${(r.trM || "–").toLowerCase()}, hosszú ${(r.trL || "–").toLowerCase()}`;
function valuation(pv) { return pv < -10 ? "Undervalued" : pv <= 15 ? "Fair" : "Expensive"; }
function derive(o) {
  const mk = o.mk || {}, px = mk.p ?? o.pr;
  const pv = o.iv > 0 && px > 0 ? (px / o.iv - 1) * 100 : null;
  const up = o.tp > 0 && px > 0 ? (o.tp / px - 1) * 100 : null;
  const v = pv == null ? o.v : valuation(pv);
  return { ...o, mk, px, pv, up, v, tr: mk.tr || null, ...trends(mk), mo: { Wide: 3, Narrow: 2, None: 1 }[o.m] || 0, vo: { Undervalued: 3, Fair: 2, Expensive: 1 }[v] || 0, to: { "Emelkedő": 3, "Oldalazó": 2, "Csökkenő": 1 }[mk.tr] || 0 };
}
const pillars = (p) => (p || []).map((v, i) => `<div class="p"><span>${PL[i]}</span><div class="tr"><i style="width:${v}%"></i></div><span>${v}</span></div>`).join("");

function detail(r) {
  const mk = r.mk;
  return `<tr class="d"><td colspan="10"><div class="dg"><div>${pillars(r.p)}<p class="rec">${esc(r.r)}</p>${r.risks ? `<p class="rec">Kockázatok: ${esc(r.risks)}</p>` : ""}${r.ivb ? `<p class="rec note">Belső érték alapja: ${esc(r.ivb)}</p>` : ""}<button class="del" data-act="Törlés: ${esc(r.id)}">Törlés a listáról</button></div>
<div><div class="k"><span>Záróár dátuma</span><span>${esc(mk.d || r.d || "–")}</span></div>
<div class="k"><span>Napi változás</span><span>${mk.prev ? pct((mk.p / mk.prev - 1) * 100) : "–"}</span></div>
<div class="k"><span>Trend (20 / 50 / 200 nap)</span><span>${esc(r.trS || "–")} / ${esc(r.trM || "–")} / ${esc(r.trL || "–")}</span></div>
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
  $("#tb").innerHTML = a.map((r) => `<tr class="row" tabindex="0" data-id="${esc(r.id)}"><td><b>${esc(r.n)}</b><small>${esc(r.t)}, ${esc(r.l)}</small></td><td>${chip(r.m)}</td><td><span class="sc"><span class="tr"><i style="width:${r.s}%"></i></span>${r.s}</span></td><td>${mon(r.px, r.cur)}<small>${r.mk.d ? esc(r.mk.d) + " záró" : "pillanatkép"}</small></td><td>${tri(r)}</td><td class="${r.up >= 0 ? "g" : "r"}">${pct(r.up)}</td><td>${mon(r.iv, r.cur)}</td><td>${mon(r.bb, r.cur)}</td><td class="${r.pv <= 0 ? "g" : "r"}">${pct(r.pv)}</td><td>${chip(r.v)}</td></tr>${open.has(r.id) ? detail(r) : ""}`).join("") || `<tr><td colspan="10" style="text-align:center;padding:24px;position:static">Nincs találat ezekkel a szűrőkkel.</td></tr>`;
  document.querySelectorAll("#hd th").forEach((h) => { const on = h.dataset.k == sk; h.classList.toggle("on", on); h.textContent = h.textContent.replace(/ [▲▼]$/, "") + (on ? (sd < 0 ? " ▼" : " ▲") : ""); });
  pick();
}

// Napi ajánlat: vételi ajánlás, nem drága, trend nem lefelé, score ≥ 70, van moat; a Buy Below-hoz legközelebbi.
function pick() {
  const buy = (r) => /^\s*(buy|accumulate)/i.test(r.r || "");
  const c = C.map(derive).filter((r) => r.s >= 70 && r.m != "None" && r.bb > 0 && r.px > 0 && r.trM && r.trM != "Csökkenő" && r.trL != "Csökkenő" && buy(r) && r.v != "Expensive").sort((a, b) => a.px / a.bb - b.px / b.bb)[0];
  $("#pk").hidden = false;
  if (!c) { $("#pk").innerHTML = `<b>Ma nincs ajánlat</b><p>Egyik cég sem felel meg egyszerre minden feltételnek: vételi (Buy/Accumulate) ajánlás, nem drága az ár a belső értékhez képest, és a közép- (50 nap) és hosszú távú (200 nap) trend nem mutat lefelé.</p>`; return; }
  const g = (c.px / c.bb - 1) * 100;
  $("#pk").innerHTML = `<b>Mai ajánlat: ${esc(c.n)} (${esc(c.t)})</b><p>${c.m} moat, score ${c.s}, trend: ${trTxt(c)}. Ár ${mon(c.px, c.cur)}, Buy Below ${mon(c.bb, c.cur)}: az ár ${g > 0 ? Math.abs(g).toFixed(1).replace(".", ",") + "%-kal felette van" : "alatta van"}. Célár szerinti upside ${pct(c.up)}.</p><p>${esc(c.r)}</p><p><small>Szűrés a listából: score legalább 70, van moat, vételi (Buy/Accumulate) ajánlás, nem drága az ár a belső értékhez képest, a közép- és hosszú távú trend nem mutat lefelé, és ezek közül az ár a legközelebb van a Buy Belowhoz. Nem személyre szabott befektetési tanács.</small></p>`;
}

function drawQ() {
  $("#t2").textContent = CD.length ? `Új cég (${CD.length} kész)` : "Új cég";
  $("#qs").innerHTML = CD.map((c0) => { const c = derive(c0); return `<div class="res"><b>${esc(c.n)} (${esc(c.t)})</b> ${chip(c.m)} ${chip(c.v)} ${tri(c)}
<div class="dg" style="margin-top:10px"><div>${pillars(c.p)}</div>
<div><div class="k"><span>Score</span><span>${c.s}</span></div><div class="k"><span>Ár${c.mk.d ? ` (${esc(c.mk.d)})` : ""}</span><span>${mon(c.px, c.cur)}</span></div><div class="k"><span>Belső érték</span><span>${mon(c.iv, c.cur)}</span></div><div class="k"><span>Buy Below (MoS ${c.mos}%)</span><span>${mon(c.bb, c.cur)}</span></div><div class="k"><span>Ár vs IV</span><span>${pct(c.pv)}</span></div><div class="k"><span>Célár</span><span>${mon(c.tp, c.cur)}</span></div><div class="k"><span>Pénzügyi erő</span>${chip(c.f)}</div><div class="k"><span>AI-kockázat</span>${chip(c.ai)}</div></div></div>
<p class="rec">${esc(c.r)}</p>${c.risks ? `<p class="rec">Kockázatok: ${esc(c.risks)}</p>` : ""}${c.ivb ? `<p class="rec note">Belső érték alapja: ${esc(c.ivb)}</p>` : ""}${c.srcs ? `<p class="rec note">Források: ${esc(c.srcs)}</p>` : ""}
<button class="btn pri" style="margin-top:10px" data-act="Felvétel: ${esc(c.id)}">Hozzáadás a listához</button> <button class="btn" style="margin-top:10px" data-act="Elvetés: ${esc(c.id)}">Elvetés</button></div>`; }).join("");
}

$("#hd").addEventListener("click", (e) => { const k = e.target.dataset.k; if (!k) return; sd = sk == k ? -sd : (k == "n" ? 1 : -1); sk = k; draw(); });
const tog = (e) => { if (e.target.dataset.act) { e.stopPropagation(); if (!e.target.dataset.act.startsWith("Törlés") || confirm("Törlöd a listáról?")) act(e.target.dataset.act); return; } const tr = e.target.closest("tr.row"); if (!tr || e.target.closest("a")) return; const id = tr.dataset.id; open.has(id) ? open.delete(id) : open.add(id); draw(); };
$("#tb").addEventListener("click", tog);
$("#tb").addEventListener("keydown", (e) => { if (e.key == "Enter") tog(e); });
["#q", "#fm", "#fl", "#ft"].forEach((s) => $(s).addEventListener("input", draw));
function show(v) { $("#v1").hidden = v != 1; $("#v2").hidden = v != 2; $("#t1").classList.toggle("on", v == 1); $("#t2").classList.toggle("on", v == 2); }
$("#t1").onclick = () => show(1); $("#t2").onclick = () => show(2);
$("#go").onclick = () => { const q = $("#an").value.trim(); if (!q) { $("#an").focus(); return; } act("Elemzés: " + q); $("#an").value = ""; };
$("#qs").addEventListener("click", (e) => { if (e.target.dataset.act) act(e.target.dataset.act); });
function drawTok() {
  $("#tokst").textContent = TOKEN ? "Be van állítva: a gombok a háttérben futnak, átirányítás nélkül." : "Nincs beállítva: a gombok egy GitHub-oldalt nyitnak meg.";
  $("#tokdel").hidden = !TOKEN;
}
function tokMsg(t, ok) { const e = $("#tokmsg"); e.textContent = t; e.className = "note " + (ok ? "g" : "r"); e.hidden = false; }
$("#toksave").onclick = async () => {
  const t = $("#tok").value.trim(); if (!t) { tokMsg("Előbb illeszd be a kulcsot a mezőbe.", false); return; }
  tokMsg("Ellenőrzés...", true);
  const r = await fetch(API + "/issues?per_page=1", { headers: { Authorization: "Bearer " + t, Accept: "application/vnd.github+json" } }).catch(() => null);
  if (!r || !r.ok) { tokMsg(r && (r.status == 401) ? "Ez a kulcs érvénytelen. Másold be újra, teljes hosszában." : "Ez a kulcs nem fér hozzá a moat-monitor repóhoz. Ellenőrizd: Only select repositories → moat-monitor, Issues: Read and write.", false); return; }
  TOKEN = t; try { localStorage.setItem("mm_gh_token", t); } catch {} $("#tok").value = ""; drawTok(); poll(true);
  tokMsg("Mentve, működik. Mostantól a gombok a háttérben futnak.", true);
};
$("#tokdel").onclick = () => { TOKEN = ""; try { localStorage.removeItem("mm_gh_token"); } catch {} drawTok(); tokMsg("A kulcsot töröltem ebből a böngészőből.", true); };
drawTok();
$("#an").addEventListener("keydown", (e) => { if (e.key == "Enter") $("#go").click(); });

async function getJSON(p) { const r = await fetch(p + "?t=" + Date.now(), { cache: "no-store" }); if (!r.ok) throw new Error(p); return r.json(); }
(async () => {
  try {
    [C, CD] = await Promise.all([getJSON("data/companies.json"), getJSON("data/candidates.json")]);
    try { META = await getJSON("data/meta.json"); } catch {}
    const ds = C.map((r) => r.mk?.d).filter(Boolean).sort();
    const when = META.refreshedAt ? new Date(META.refreshedAt).toLocaleString("hu-HU", { dateStyle: "medium", timeStyle: "short" }) : null;
    $("#st").textContent = (ds.length ? `Árak: ${ds[ds.length - 1]} záró.` : "") + (when ? ` Utolsó frissítés: ${when}.` : "") + (META.fail ? ` ${META.fail} papírnál nem sikerült.` : "");
    draw(); drawQ(); poll(true);
  } catch (e) { $("#st").textContent = "Az adatok betöltése nem sikerült. Töltsd újra az oldalt."; }
})();
