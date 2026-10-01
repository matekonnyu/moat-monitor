// Ha a böngésző régi (gyorsítótárazott) index.html-t adott az új app.js mellé, egyszer újratöltjük frissen.
if (!document.getElementById("nnew")) { let n = 0; try { n = +sessionStorage.getItem("mm_rl") || 0; sessionStorage.setItem("mm_rl", n + 1); } catch {} if (n < 2) location.replace(location.pathname + "?v=" + Date.now()); }
// Moat Monitor – statikus oldal. Adat: data/*.json (GitHub Actions frissíti).
// A gombok előre kitöltött GitHub issue-t nyitnak; a feldolgozást a repó workflow-i végzik.
const $ = (s) => document.querySelector(s);
const esc = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const num = (x) => x.toLocaleString("hu-HU", { minimumFractionDigits: Math.abs(x) >= 1000 ? 0 : 2, maximumFractionDigits: Math.abs(x) >= 1000 ? 0 : 2 });
const mon = (x, c) => x == null || !isFinite(x) ? "–" : c == "USD" ? "$" + num(x) : c == "EUR" ? num(x) + " €" : c == "HUF" ? num(x) + " Ft" : c == "GBP" ? "£" + num(x) : num(x) + " " + (c || "");
const pct = (x) => x == null || !isFinite(x) ? "–" : (x > 0 ? "+" : "") + x.toFixed(1).replace(".", ",") + "%";
const K = { Positive: "g", Negative: "r", "Very High": "r", Extreme: "r", Wide: "g", Narrow: "a", None: "r", Undervalued: "g", Fair: "a", Expensive: "r", Strong: "g", Adequate: "a", Weak: "r", Low: "g", Medium: "a", High: "r", "Emelkedő": "g", "Oldalazó": "a", "Csökkenő": "r" };
const chip = (t) => t ? `<span class="chip ${K[t] || ""}">${esc(t)}</span>` : `<span class="chip">nincs adat</span>`;
const PL = ["Immateriális javak", "Váltási költség", "Hálózati hatás", "Költségelőny", "Hatékony méret"];

// GitHub repó a címből: https://<owner>.github.io/<repo>/
// Saját domain (konninvest.com) vagy github.io alatt is ugyanazt a repót használja.
const OWNER = "matekonnyu", REPO = "moat-monitor";
const issueUrl = (title, body = "") => `https://github.com/${OWNER}/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body || "Ezt a kérést a Moat Monitor oldal készítette. Kattints a „Submit new issue” gombra.")}`;

// Háttérben futtatás: a tulajdonos egyszer megad egy GitHub-kulcsot (csak ebben a böngészőben tárolódik).
let TOKEN = ""; try { TOKEN = localStorage.getItem("mm_gh_token") || ""; } catch {}
const API = `https://api.github.com/repos/${OWNER}/${REPO}`;
const RELAY = "https://konninvest-api.netlify.app/api/request";
const gh = (path, opt = {}) => fetch(API + path, { ...opt, headers: { Accept: "application/vnd.github+json", ...(TOKEN ? { Authorization: "Bearer " + TOKEN } : {}), ...(opt.body ? { "Content-Type": "application/json" } : {}), ...(opt.headers || {}) } });
const ACT = /^\s*(Elemzés|Felvétel|Elvetés|Törlés|Frissítés)\s*:\s*(.+?)\s*$/i;
let PENDING = [], pollT = null, lastPendingCount = 0;
async function act(title) {
  if (!TOKEN) {
    if (/^(Felvétel|Elvetés|Törlés)/i.test(title)) {
      if (!confirm("Ez a művelet csak a Moat Monitor tulajdonosának engedélyezett, más felhasználó kérését a rendszer nem hajtja végre.\n\nMegnyitod a GitHubot a megerősítéshez?")) return;
      window.open(issueUrl(title), "_blank", "noopener"); return;
    }
    // Elemzés és frissítés bárkinek: a konninvest közvetítőn keresztül, GitHub-fiók nélkül.
    if (PENDING.some((p) => p.title.toLowerCase() == title.toLowerCase())) { flash("Ez a kérés már folyamatban van, várd meg, amíg lefut."); return; }
    const m = title.match(/^\s*Elemzés\s*:\s*(.+)$/i);
    try {
      const r = await fetch(RELAY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(m ? { kind: "analysis", q: m[1].trim() } : { kind: "refresh" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { flash(j.error || "Nem sikerült elküldeni a kérést, próbáld újra később."); return; }
      flash(""); PENDING.push({ n: j.number, title, at: Date.now() }); renderPending(); poll(true);
    } catch (e) { flash("A kérés-közvetítő most nem érhető el, próbáld újra később."); }
    return;
  }
  if (PENDING.some((p) => p.title.toLowerCase() == title.toLowerCase())) { flash("Ez a kérés már folyamatban van, várd meg, amíg lefut."); return; }
  document.querySelectorAll("[data-act]").forEach((b) => { if (b.dataset.act == title) b.disabled = true; });
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
  const lbl = { "elemzés": "Elemzés fut", "felvétel": "Hozzáadás folyamatban", "elvetés": "Elvetés folyamatban", "törlés": "Törlés folyamatban", "frissítés": "Árfolyamfrissítés fut" };
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
const ARW = { "Emelkedő": "↑", "Oldalazó": "→", "Csökkenő": "↓" };
const tri = (r) => r.trM || r.trS || r.trL ? `<span class="tri">${[["20 nap", r.trS], ["50 nap", r.trM], ["200 nap", r.trL]].map(([l, t]) => `<span class="${K[t] || ""}" title="${l}: ${t || "nincs adat"}" aria-label="${l}: ${t || "nincs adat"}">${ARW[t] || "–"}</span>`).join(" ")}</span>` : chip(null);
const trTxt = (r) => `rövid ${(r.trS || "–").toLowerCase()}, közép ${(r.trM || "–").toLowerCase()}, hosszú ${(r.trL || "–").toLowerCase()}`;
const pillars = (p) => (p || []).map((v, i) => `<div class="p"><span>${PL[i]}</span><div class="tr"><i style="width:${v}%"></i></div><span>${v}</span></div>`).join("");

function detail(r) {
  const mk = r.mk;
  return `<tr class="d"><td colspan="14"><div class="dg"><div>${pillars(r.p)}<p class="rec">${esc(r.r)}</p>${r.risks ? `<p class="rec">Kockázatok: ${esc(r.risks)}</p>` : ""}${r.ivb ? `<p class="rec note">Belső érték alapja: ${esc(r.ivb)}</p>` : ""}${r.srcs ? `<p class="rec note">Források: ${esc([].concat(r.srcs).join(", "))}</p>` : ""}<button class="del" data-act="Törlés: ${esc(r.id)}">Törlés a listáról</button></div>
<div><div class="k"><span>Záróár dátuma</span><span>${esc(mk.d || r.d || "–")}</span></div>
<div class="k"><span>Napi változás</span><span>${mk.prev ? pct((mk.p / mk.prev - 1) * 100) : "–"}</span></div>
<div class="k"><span>Trend (20 / 50 / 200 nap)</span><span>${esc(r.trS || "–")} / ${esc(r.trM || "–")} / ${esc(r.trL || "–")}</span></div>
<div class="k"><span>1 hónap / 6 hónap</span><span>${pct(mk.ch1m)} / ${pct(mk.ch6m)}</span></div>
<div class="k"><span>SMA20 / SMA50 / SMA200</span><span>${mon(mk.sma20, r.cur)} / ${mon(mk.sma50, r.cur)} / ${mon(mk.sma200, r.cur)}</span></div>
<div class="k"><span>EMA20 / EMA50</span><span>${mon(mk.ema20, r.cur)} / ${mon(mk.ema50, r.cur)}</span></div>
<div class="k"><span>Célár (konszenzus)</span><span>${mon(r.tp, r.cur)}</span></div>
<div class="k"><span>Moat trend</span>${chip(r.mt)}</div><div class="k"><span>Bizonytalanság (Uncertainty)</span>${chip(r.u)}</div><div class="k"><span>Bizonyosság</span>${chip(r.c)}</div><div class="k"><span>AI-kockázat</span>${chip(r.ai)}</div><div class="k"><span>Pénzügyi erő</span>${chip(r.f)}</div>
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
  const RC = { buy: "g", accumulate: "g", hold: "a", avoid: "r" }, VH = { Undervalued: "Alulértékelt", Fair: "Korrekt ár", Expensive: "Drága" };
  const sg = (x) => x == null ? "–" : (x > 0 ? "+" : "") + x;
  $("#tb").innerHTML = a.map((r) => `<tr class="row" tabindex="0" data-id="${esc(r.id)}"><td><b>${esc(r.n)}</b><small>${esc(r.t)}, ${esc(r.l)}</small></td>
<td>${mon(r.px, r.cur)}<small>${r.mk.d ? esc(r.mk.d) + " záró" : "pillanatkép"}</small></td><td>${mon(r.tp, r.cur)}</td><td class="${r.up == null ? "" : r.up > 0 ? "g" : "r"}">${pct(r.up)}</td><td>${tri(r)}</td>
<td>${mon(r.iv, r.cur)}</td><td>${mon(r.bb, r.cur)}</td><td class="${r.pv == null ? "" : r.pv < 0 ? "g" : r.pv > 15 ? "r" : ""}">${pct(r.pv)}</td><td>${r.st ? `<span class="stars ${K[r.v] || ""}" title="Morningstar-módszer: ${r.st} csillag, bizonytalanság: ${esc(r.u)}">${"★".repeat(r.st)}<i>${"★".repeat(5 - r.st)}</i></span><small>${VH[r.v]}</small>` : r.v ? `<span class="chip ${K[r.v] || ""}">${VH[r.v] || esc(r.v)}</span>` : "–"}</td>
<td>${chip(r.m)}</td><td><span class="sc"><span class="tr"><i style="width:${r.s}%"></i></span>${r.s ?? "–"}</span></td><td><b>${r.mpa ?? "–"}</b></td><td class="${r.gap == null ? "" : r.gap > 0 ? "g" : r.gap < 0 ? "r" : ""}">${sg(r.gap)}</td>
<td title="${esc(r.r)}">${r.rw ? `<span class="chip ${RC[r.rw.toLowerCase()]}">${esc(r.rw)}</span>` : "–"}</td></tr>${open.has(r.id) ? detail(r) : ""}`).join("");
  document.querySelectorAll("#hd th").forEach((h) => { const on = h.dataset.k == sk; h.classList.toggle("on", on); h.textContent = h.textContent.replace(/ [▲▼]$/, "") + (on ? (sd < 0 ? " ▼" : " ▲") : ""); });
  pick();
}

// Napi ajánlat: vételi ajánlás, nem drága, trend nem lefelé, score ≥ 70, van moat; a Buy Below-hoz legközelebbi.
function pick() {
  const all = C.map(derive);
  const c = pickOf(all);
  const ds = all.map((r) => r.mk.d).filter(Boolean).sort();
  const day = (ds[ds.length - 1] || new Date().toISOString().slice(0, 10)).replace(/-/g, ".") + ".";
  $("#pk").hidden = false;
  if (!c) { $("#pk").innerHTML = `<div class="pkh"><span class="pkl">Mai ajánlat · ${day}</span></div><h2>Ma nincs ajánlat</h2><p class="pks">Egyik cég sem felel meg egyszerre minden feltételnek, ezért ma nem ajánlok vételt.</p>`; return; }
  const HU = { Undervalued: "Alulértékelt", Fair: "Korrekt ár", Expensive: "Drága" };
  const col = (x, inv) => x == null || !isFinite(x) ? "" : (inv ? x < 0 : x > 0) ? "g" : "r";
  const tile = (l, v, k = "") => `<div class="mt"><span>${l}</span><b class="${k}">${v}</b></div>`;
  const gb = (c.px / c.bb - 1) * 100;
  const arr = { "Emelkedő": "↑", "Oldalazó": "→", "Csökkenő": "↓" };
  const trT = [c.trS, c.trM, c.trL].map((t) => `<i class="${K[t] || ""}" title="${esc(t || "nincs adat")}">${arr[t] || "–"}</i>`).join(" ");
  const why = [c.r,
    c.pv != null ? `Az ár ${Math.abs(c.pv).toFixed(1).replace(".", ",")}%-kal a becsült belső érték ${c.pv < 0 ? "alatt" : "felett"} van; a vételi szinttől (${mon(c.bb, c.cur)}) ${gb <= 0 ? Math.abs(gb).toFixed(1).replace(".", ",") + "%-kal lejjebb" : Math.abs(gb).toFixed(1).replace(".", ",") + "%-kal feljebb"} jár.` : "",
    `Trend: 20 nap ${c.trS || "–"}, 50 nap ${c.trM || "–"}, 200 nap ${c.trL || "–"}.`,
    c.mk.ch1m != null ? `Árfolyamváltozás: 1 hónap ${pct(c.mk.ch1m)}, 6 hónap ${pct(c.mk.ch6m)}.` : "",
    c.up != null ? `Elemzői konszenzus célár ${mon(c.tp, c.cur)} (${pct(c.up)}).` : "",
    c.ivb ? `Belső érték alapja: ${c.ivb}` : ""].filter(Boolean);
  const risks = [...String(c.risks || "").split(/;\s*|\.\s+(?=[A-ZÁÉÍÓÖŐÚÜŰ])/).map((x) => x.trim().replace(/\.$/, "")).filter(Boolean),
    c.ai ? `AI-diszrupciós kockázat: ${c.ai}` : "", c.f ? `Pénzügyi erő: ${c.f}` : ""].filter(Boolean);
  $("#pk").innerHTML = `<div class="pkh"><span class="pkl">Mai ajánlat · ${day}</span>${c.v ? `<span class="bdg ${K[c.v] || ""}">${HU[c.v] || esc(c.v)}</span>` : ""}</div>
<h2>${esc(c.n)} <span class="tk">${esc(c.t)}</span></h2>
<p class="pks">${esc(c.m)} moat · ${esc(c.sec || "")} · az ár a vételi szint ${gb <= 0 ? "alatt" : "felett"}</p>
<div class="mts">${tile("Árfolyam", mon(c.px, c.cur))}${tile("Belső érték (IV)", mon(c.iv, c.cur))}${tile("Vételi szint", mon(c.bb, c.cur))}${tile("Ár vs IV", pct(c.pv), col(c.pv, true))}${tile("Konszenzus célár", mon(c.tp, c.cur))}${tile("Potenciál a célárig", pct(c.up), col(c.up))}${tile("Score / Moat", `${c.s} / ${esc(c.m)}`)}${tile("Trend 20 / 50 / 200", trT, "tt")}</div>
<div class="why"><div><h3>Miért most?</h3><ul>${why.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div><div><h3>Kockázatok</h3><ul class="rk">${risks.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></div>
<button class="pkb" type="button" id="pkd" data-id="${esc(c.id)}">Részletek →</button>`;
  $("#pkd").onclick = () => { ["#q", "#fm", "#fl", "#ft"].forEach((q) => { $(q).value = ""; }); open.add(c.id); draw(); const tr = document.querySelector(`tr.row[data-id="${CSS.escape(c.id)}"]`); if (tr) tr.scrollIntoView({ behavior: "smooth", block: "center" }); };
}

function drawQ() {
  const TTL = 2 * 864e5; CD = CD.filter((c) => !c.added || Date.now() - Date.parse(c.added) < TTL);
  $("#nqc").hidden = !CD.length; $("#nqc").textContent = CD.length || ""; $("#nqc").title = CD.length ? CD.length + " elemzés vár jóváhagyásra" : "";
  $("#qs").innerHTML = CD.map((c0) => { const c = derive(c0); return `<div class="res"><b>${esc(c.n)} (${esc(c.t)})</b> ${chip(c.m)} ${chip(c.v)} ${tri(c)}
<div class="dg" style="margin-top:10px"><div>${pillars(c.p)}</div>
<div><div class="k"><span>Score</span><span>${c.s}</span></div><div class="k"><span>Ár${c.mk.d ? ` (${esc(c.mk.d)})` : ""}</span><span>${mon(c.px, c.cur)}</span></div><div class="k"><span>Belső érték</span><span>${mon(c.iv, c.cur)}</span></div><div class="k"><span>Buy Below (MoS ${c.mos}%)</span><span>${mon(c.bb, c.cur)}</span></div><div class="k"><span>Ár vs IV</span><span>${pct(c.pv)}</span></div><div class="k"><span>Célár</span><span>${mon(c.tp, c.cur)}</span></div><div class="k"><span>Pénzügyi erő</span>${chip(c.f)}</div><div class="k"><span>AI-kockázat</span>${chip(c.ai)}</div></div></div>
<p class="rec">${esc(c.r)}</p>${c.risks ? `<p class="rec">Kockázatok: ${esc(c.risks)}</p>` : ""}${c.ivb ? `<p class="rec note">Belső érték alapja: ${esc(c.ivb)}</p>` : ""}${c.srcs ? `<p class="rec note">Források: ${esc(c.srcs)}</p>` : ""}
${c.added ? `<p class="rec note">Ha nem veszed fel a listára, ${new Date(Date.parse(c.added) + TTL).toLocaleString("hu-HU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} után törlődik a várólistáról.</p>` : ""}<button class="btn pri" style="margin-top:10px" data-act="Felvétel: ${esc(c.id)}">Hozzáadás a listához</button> <button class="btn" style="margin-top:10px" data-act="Elvetés: ${esc(c.id)}">Elvetés</button></div>`; }).join("");
}

$("#hd").addEventListener("click", (e) => { const k = e.target.dataset.k; if (!k) return; sd = sk == k ? -sd : (k == "n" ? 1 : -1); sk = k; draw(); });
const tog = (e) => { if (e.target.dataset.act) { e.stopPropagation(); if (!e.target.dataset.act.startsWith("Törlés") || confirm("Törlöd a listáról?")) act(e.target.dataset.act); return; } const tr = e.target.closest("tr.row"); if (!tr || e.target.closest("a")) return; const id = tr.dataset.id; open.has(id) ? open.delete(id) : open.add(id); draw(); };
$("#tb").addEventListener("click", tog);
$("#tb").addEventListener("keydown", (e) => { if (e.key == "Enter") tog(e); });
["#q", "#fm", "#fl", "#ft"].forEach((s) => $(s).addEventListener("input", draw));
function show(v) { $("#v1").hidden = v != 1; $("#v2").hidden = v != 2; $("#nlist").classList.toggle("on", v == 1); $("#nnew").classList.toggle("on", v == 2); document.body.classList.toggle("v2", v == 2); }
$(".brand").onclick = (e) => { e.preventDefault(); show(1); scrollTo(0, 0); };
$("#nnew").onclick = () => { show(2); scrollTo(0, 0); }; $("#nlist").onclick = () => { show(1); scrollTo(0, 0); };
show(1);
{ const root = document.documentElement; try { const t = localStorage.getItem("mm_theme"); if (t) root.dataset.theme = t; } catch {}
  $("#thm").onclick = () => { const dark = root.dataset.theme ? root.dataset.theme == "dark" : matchMedia("(prefers-color-scheme: dark)").matches; root.dataset.theme = dark ? "light" : "dark"; try { localStorage.setItem("mm_theme", root.dataset.theme); } catch {} }; }
// Kereső: találati lista az Új cég mezőhöz (data/symbols.json: [yahooSymbol, név, tőzsde])
let SYM = null, symP = null, acSel = -1, acItems = [];
const norm = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9.& -]/g, " ").replace(/\s+/g, " ").trim();
function loadSym() { return symP ||= getJSON("data/symbols.json").then((a) => (SYM = a.map((r) => [...r, norm(r[1]), norm(r[0].replace(/\.(BD|DE|VI)$/, ""))]))).catch(() => (SYM = [])); }
function search(q) {
  const n = norm(q); if (!n) return [];
  const sc = [];
  for (const r of SYM) {
    const [, , , nn, ns] = r; let v = -1;
    if (ns == n) v = 0; else if (ns.startsWith(n)) v = 1; else if (nn.startsWith(n)) v = 2; else if ((" " + nn).includes(" " + n)) v = 3; else if (n.length >= 3 && nn.includes(n)) v = 4;
    if (v >= 0) sc.push([v + (r[2] == "USA" || r[2] == "BÉT" ? 0 : 0.5), r]);
  }
  return sc.sort((a, b) => a[0] - b[0] || a[1][1].length - b[1][1].length).slice(0, 10).map((x) => x[1]);
}
function acClose() { $("#ac").hidden = true; $("#an").setAttribute("aria-expanded", "false"); acSel = -1; }
function acDraw() {
  const q = $("#an").value.trim(); if (!q) { acClose(); return; }
  if (!SYM) { $("#ac").innerHTML = `<li class="msg">Lista betöltése…</li>`; $("#ac").hidden = false; loadSym().then(acDraw); return; }
  const mine = new Set([...C, ...CD].map((c) => c.y));
  acItems = search(q);
  $("#ac").innerHTML = acItems.map((r, i) => `<li role="option" id="aco${i}" data-i="${i}" aria-selected="${i == acSel}"><span class="an">${esc(r[1])}</span><span class="as">${esc(r[0])}</span><span class="ax${mine.has(r[0]) ? " on" : ""}">${mine.has(r[0]) ? "listán" : esc(r[2])}</span></li>`).join("")
    + `<li role="option" class="free" data-i="-2" aria-selected="${acSel == acItems.length}">Elemzés kérése erre: „${esc(q)}”</li>`;
  $("#ac").hidden = false; $("#an").setAttribute("aria-expanded", "true");
}
function acPick(i) {
  const q = $("#an").value.trim();
  if (i >= 0 && acItems[i]) {
    const [y, n] = acItems[i];
    if ([...C, ...CD].some((c) => c.y == y)) { flash(`${n} (${y}) már a listán vagy a jóváhagyásra várók között van.`); acClose(); return; }
    act(`Elemzés: ${n} (${y})`);
  } else if (q) act("Elemzés: " + q);
  $("#an").value = ""; acClose();
}
let acT = null;
$("#an").addEventListener("input", () => { acSel = -1; clearTimeout(acT); acT = setTimeout(acDraw, 80); });
$("#an").addEventListener("focus", () => { loadSym(); if ($("#an").value.trim()) acDraw(); });
$("#an").addEventListener("keydown", (e) => {
  const max = acItems.length; // az utolsó sor a szabad szöveges kérés
  if (e.key == "ArrowDown" || e.key == "ArrowUp") { e.preventDefault(); if ($("#ac").hidden) acDraw(); acSel = e.key == "ArrowDown" ? Math.min(acSel + 1, max) : Math.max(acSel - 1, -1); acDraw(); const el = $(`#ac [aria-selected="true"]`); el?.scrollIntoView({ block: "nearest" }); }
  else if (e.key == "Enter") { e.preventDefault(); acPick(acSel >= 0 && acSel < max ? acSel : acSel == max ? -2 : (acItems.length && !$("#ac").hidden ? 0 : -2)); }
  else if (e.key == "Escape") acClose();
});
$("#ac").addEventListener("mousedown", (e) => { const li = e.target.closest("li[data-i]"); if (!li) return; e.preventDefault(); acPick(+li.dataset.i); });
document.addEventListener("click", (e) => { if (!e.target.closest(".acw")) acClose(); });
$("#go").onclick = () => { if (!$("#an").value.trim()) { $("#an").focus(); return; } acPick(!$("#ac").hidden && acSel >= 0 && acSel < acItems.length ? acSel : -2); };
$("#rf").addEventListener("click", () => act("Frissítés: most"));
$("#qs").addEventListener("click", (e) => { if (e.target.dataset.act) act(e.target.dataset.act); });
function drawTok() {
  document.body.classList.toggle("ro", !TOKEN);
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
// Jelzések: trend- vagy ajánlásváltás az elmúlt 7 napban (data/signals.json, a napi frissítés írja).
function sigTone(c) {
  const t = String(c.to || "");
  if (c.kind.includes("trend")) return K[t] || "";
  if (c.kind == "Ajánlás") return /Buy|Accumulate/.test(t) ? "g" : /Hold/.test(t) ? "a" : "r";
  if (c.kind == "Vételi szint") return /alá/.test(t) ? "g" : "a";
  return t && t != "nincs" ? "g" : "a";
}
function drawSig(S) {
  const el = $("#sig"), lim = new Date(Date.now() - 7 * 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Budapest" });
  const a = (S || []).filter((c) => c.d >= lim);
  if (!a.length) { el.hidden = true; return; }
  const last = a[0].d, now = a.filter((c) => c.d == last), old = a.filter((c) => c.d != last);
  const nm = (id) => (C.find((r) => r.id == id) || {}).n || "";
  const li = (c) => { const tr = c.kind.includes("trend"), f = (x) => (tr && ARW[x] ? ARW[x] + " " : "") + x;
    return `<li><span class="sgv"><b class="${sigTone(c)}">${esc(c.id || "")}</b> ${esc(c.n || nm(c.id))}</span><span class="sgk">${esc(c.kind)}</span><span class="sgv">${esc(f(c.from))} → <b class="${sigTone(c)}">${esc(f(c.to))}</b>${c.px != null ? ` <span class="sgd">· ár ${esc(c.px)} ${esc(c.cur || "")}${c.bb ? `, vételi szint ${esc(c.bb)}` : ""}</span>` : ""}</span>${old.length && c.d != last ? `<span class="sgd">${esc(c.d)}</span>` : ""}</li>`; };
  el.innerHTML = `<h2>Jelzések · ${esc(last)}</h2><p class="sgs">${now.length} változás a figyelőlistán: trendváltás, ajánlásváltás, vételi szint átlépése vagy új Mai ajánlat.</p><ul>${now.map(li).join("")}</ul>`
    + (old.length ? `<details><summary>Korábbi jelzések (7 nap, ${old.length})</summary><ul>${old.map(li).join("")}</ul></details>` : "");
  el.hidden = false;
}

drawTok();

async function getJSON(p) { const r = await fetch(p + "?t=" + Date.now(), { cache: "no-store" }); if (!r.ok) throw new Error(p); return r.json(); }
(async () => {
  try {
    [C, CD] = await Promise.all([getJSON("data/companies.json"), getJSON("data/candidates.json")]);
    try { META = await getJSON("data/meta.json"); } catch {}
    getJSON("data/signals.json").then(drawSig).catch(() => {});
    const ds = C.map((r) => r.mk?.d).filter(Boolean).sort();
    const when = META.refreshedAt ? new Date(META.refreshedAt).toLocaleString("hu-HU", { dateStyle: "medium", timeStyle: "short" }) : null;
    $("#st").textContent = (ds.length ? `Árak: ${ds[ds.length - 1]} záró.` : "") + (when ? ` Utolsó frissítés: ${when}.` : "") + (META.fail ? ` ${META.fail} papírnál nem sikerült.` : "");
    draw(); drawQ(); poll(true);
  } catch (e) { $("#st").textContent = "Az adatok betöltése nem sikerült. Töltsd újra az oldalt."; }
})();
