// Moat Monitor – Portfólió (jelszóval védett).
// A repó nyilvános, ezért a portfólió listája titkosítva van: data/portfolio.enc.json
// (AES-GCM 256, a kulcs a jelszóból PBKDF2-SHA256-tal). A jelszó soha nem hagyja el a böngészőt.
// Mentés: a böngésző újratitkosítja a teljes listát, és "Portfólió: mentés" issue-t nyit, a törzsében
// csak a titkosított adat van; a scripts/issues.mjs (csak a tulajdonos kérésére) beírja a fájlba.
// Az árak, a célár, a trend és az ajánlás a főlista (data/companies.json) napi frissítéséből jönnek,
// a jelzések a data/signals.json-ból (trend- és ajánlásváltás).
// Saját célár: papíronként a titkosított listában (my); a szükséges emelkedés = saját célár / árfolyam − 1.
const PF_FILE = "data/portfolio.enc.json", PF_ITER = 250000, PF_TITLE = "Portfólió: mentés";
const b64 = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let PF = null;        // feloldva: { ids: [{ id, added }] }
let PF_KEY = null, PF_SALT = null, PF_ENV = null, PF_SIG = [];
const pfStore = { get(k) { try { return sessionStorage.getItem(k) || localStorage.getItem(k); } catch { return null; } },
  set(k, v, keep) { try { (keep ? localStorage : sessionStorage).setItem(k, v); } catch {} },
  del(k) { try { sessionStorage.removeItem(k); localStorage.removeItem(k); } catch {} } };

async function pfDerive(pw, salt) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PF_ITER }, base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}
async function pfDecrypt(env, key) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv) }, key, unb64(env.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
async function pfEncrypt(data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, PF_KEY, new TextEncoder().encode(JSON.stringify(data)));
  return { v: 1, at: new Date().toISOString(), it: PF_ITER, salt: b64(PF_SALT), iv: b64(iv), ct: b64(ct) };
}

// A titkosított fájl: a repóból, vagy a böngészőben tárolt utolsó mentés, ha az újabb (a GitHub Pages pár percig késhet).
async function pfLoadEnv() {
  let remote = null;
  try {
    if (TOKEN) { const r = await gh("/contents/" + PF_FILE, { headers: { Accept: "application/vnd.github.raw+json" } }); if (r.ok) remote = await r.json(); }
    if (!remote) remote = await getJSON(PF_FILE);
  } catch {}
  let local = null; try { local = JSON.parse(localStorage.getItem("mm_pf_env") || "null"); } catch {}
  if (local && (!remote || local.at > remote.at)) return local;
  return remote && remote.ct ? remote : null;
}

async function pfInit() {
  PF_ENV = await pfLoadEnv();
  const raw = pfStore.get("mm_pf_k");
  if (PF_ENV && raw) {
    try {
      const key = await crypto.subtle.importKey("raw", unb64(raw), "AES-GCM", true, ["encrypt", "decrypt"]);
      PF = await pfDecrypt(PF_ENV, key); PF_KEY = key; PF_SALT = unb64(PF_ENV.salt);
    } catch { pfStore.del("mm_pf_k"); }
  }
  pfDraw();
}

async function pfUnlock(pw, keep) {
  if (!PF_ENV) throw new Error("Még nincs portfólió.");
  const salt = unb64(PF_ENV.salt), key = await pfDerive(pw, salt);
  try { PF = await pfDecrypt(PF_ENV, key); } catch { throw new Error("Hibás jelszó."); }
  PF_KEY = key; PF_SALT = salt;
  pfStore.set("mm_pf_k", b64(await crypto.subtle.exportKey("raw", key)), keep);
}
async function pfCreate(pw, keep) {
  PF_SALT = crypto.getRandomValues(new Uint8Array(16));
  PF_KEY = await pfDerive(pw, PF_SALT); PF = { ids: [] };
  pfStore.set("mm_pf_k", b64(await crypto.subtle.exportKey("raw", PF_KEY)), keep);
  await pfSave("A portfólió létrejött.");
}
function pfLock() { PF = null; PF_KEY = null; pfStore.del("mm_pf_k"); pfDraw(); if (typeof draw == "function" && C.length) draw(); }

async function pfSave(okText, redraw = true) {
  const env = await pfEncrypt(PF);
  PF_ENV = env; try { localStorage.setItem("mm_pf_env", JSON.stringify(env)); } catch {}
  if (redraw) { pfDraw(); if (C.length) draw(); }
  const body = JSON.stringify(env);
  if (!TOKEN) {
    if (!confirm((okText ? okText + "\n\n" : "") + "A mentéshez megnyitom a GitHubot (a kérés csak titkosított adatot tartalmaz). Ott kattints a „Submit new issue” gombra.")) return;
    window.open(`https://github.com/${OWNER}/${REPO}/issues/new?title=${encodeURIComponent(PF_TITLE)}&body=${encodeURIComponent(body)}`, "_blank", "noopener");
    return;
  }
  try {
    const r = await gh("/issues", { method: "POST", body: JSON.stringify({ title: PF_TITLE, body }) });
    if (!r.ok) throw new Error(r.status);
    const i = await r.json();
    if (!PENDING.some((p) => p.title == PF_TITLE)) PENDING.push({ n: i.number, title: PF_TITLE, at: Date.now() });
    renderPending(); poll(true);
    pfMsg(okText ? okText + " Mentés folyamatban (kb. 1 perc)." : "Mentés folyamatban (kb. 1 perc).", true);
  } catch (e) { pfMsg("Nem sikerült menteni (" + (e.message || e) + "). Próbáld újra.", false); }
}
const pfHas = (id) => !!PF && PF.ids.some((x) => x.id == id);
async function pfAdd(id) {
  if (pfHas(id)) return;
  PF.ids.push({ id, added: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Budapest" }) });
  const n = (C.find((c) => c.id == id) || {}).n || id;
  await pfSave(`Hozzáadva a portfólióhoz: ${n}.`);
}
async function pfRemove(id) {
  PF.ids = PF.ids.filter((x) => x.id != id);
  await pfSave(`Eltávolítva a portfólióból: ${id}.`);
}

// Gomb a főlista részleteiben, a Törlés mellett.
function pfBtn(r) {
  return pfHas(r.id)
    ? `<button class="del pfb on" data-pf="${esc(r.id)}" type="button">✓ Portfólióban</button>`
    : `<button class="del pfb" data-pf="${esc(r.id)}" type="button">+ Portfólióba</button>`;
}
// Feloldó ablak, ha a gombot zárolt állapotban nyomják meg.
function pfAsk() {
  return new Promise((res) => {
    const d = $("#pfdlg"); $("#pfdpw").value = ""; $("#pfdmsg").hidden = true;
    d.showModal(); $("#pfdpw").focus();
    $("#pfdok").onclick = async (e) => {
      e.preventDefault();
      try { await pfUnlock($("#pfdpw").value, $("#pfdkeep").checked); d.close(); pfDraw(); res(true); }
      catch (err) { $("#pfdmsg").textContent = err.message; $("#pfdmsg").hidden = false; }
    };
    $("#pfdno").onclick = (e) => { e.preventDefault(); d.close(); res(false); };
  });
}
async function pfToggle(id) {
  if (!PF) {
    if (!PF_ENV) { flash("Előbb állítsd be a portfólió jelszavát a Portfólió fülön."); show(3); return; }
    if (!(await pfAsk())) return;
  }
  if (pfHas(id)) { if (confirm("Eltávolítod a portfólióból?")) await pfRemove(id); }
  else await pfAdd(id);
}

function pfMsg(t, ok) { const e = $("#pfmsg"); e.textContent = t; e.className = "note " + (ok ? "g" : "r"); e.hidden = !t; }

// Portfólió-jelzések: a figyelőlista jelzéseiből a portfólió papírjaira, az elmúlt 7 napból (cégenként és fajtánként a legfrissebb).
function pfSignals() {
  if (!PF) return [];
  const ids = new Set(PF.ids.map((x) => x.id));
  const lim = new Date(Date.now() - 7 * 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Budapest" });
  const seen = new Set();
  return (PF_SIG || []).filter((c) => ids.has(c.id) && c.d >= lim && (c.kind.includes("trend") || c.kind == "Ajánlás")
    && !seen.has(c.id + "|" + c.kind) && seen.add(c.id + "|" + c.kind));
}
// Célár-közelség: a mai árfolyam 2%-on belül van a saját célárhoz, vagy már elérte (a böngészőben számolva,
// mert a saját célár titkosítva van; minden árfrissítés után újraszámolódik).
const PF_NEAR = 2;
function pfNear() {
  if (!PF) return [];
  const out = [];
  for (const x of PF.ids) {
    const c = C.find((r) => r.id == x.id); if (!c || !(x.my > 0)) continue;
    const r = derive(c), need = pfNeed(x.my, r.px);
    if (need == null || need >= PF_NEAR) continue;
    out.push({ id: r.id, n: r.n, d: r.mk.d || "", need, my: x.my, px: r.px, cur: r.cur,
      kind: need <= 0 ? "Célár elérve" : "Célár közel", to: need <= 0 ? `elérte a saját célárat (${mon(x.my, r.cur)})` : `${pct(need)} kell a saját célárig (${mon(x.my, r.cur)})` });
  }
  return out.sort((a, b) => a.need - b.need);
}
function pfBadge() {
  const n = pfSignals().length + pfNear().length, b = $("#npfc");
  b.hidden = !n; b.textContent = n || ""; b.title = n ? n + " jelzés a portfólióban (7 nap)" : "";
}

function pfDraw() {
  const box = $("#pfbox");
  $("#npf").classList.toggle("unl", !!PF);
  if (!PF) {
    $("#pflockbtn").hidden = true;
    box.innerHTML = PF_ENV
      ? `<div class="res pfl"><h2><span class="lk" aria-hidden="true"></span>A portfólió jelszóval védett</h2>
<div class="fm"><input id="pfpw" type="password" placeholder="Jelszó" aria-label="Jelszó" autocomplete="current-password"><button class="btn pri" id="pfgo">Megnyitás</button></div>
<label class="note"><input type="checkbox" id="pfkeep"> Emlékezzen rám ezen az eszközön</label></div>`
      : `<div class="res pfl"><h2><span class="lk" aria-hidden="true"></span>Portfólió beállítása</h2>
<p class="note">Adj meg egy jelszót. A portfólió listája ezzel titkosítva kerül a repóba, a jelszó nem hagyja el a böngészőt, és nem állítható vissza, ezért jegyezd fel.</p>
<div class="fm"><input id="pfpw" type="password" placeholder="Új jelszó (min. 8 karakter)" aria-label="Új jelszó" autocomplete="new-password"><input id="pfpw2" type="password" placeholder="Jelszó újra" aria-label="Jelszó újra" autocomplete="new-password"><button class="btn pri" id="pfgo">Létrehozás</button></div>
<label class="note"><input type="checkbox" id="pfkeep"> Emlékezzen rám ezen az eszközön</label></div>`;
    const go = async () => {
      const pw = $("#pfpw").value, keep = $("#pfkeep").checked;
      try {
        if (PF_ENV) await pfUnlock(pw, keep);
        else {
          if (pw.length < 8) throw new Error("A jelszó legalább 8 karakter legyen.");
          if (pw != $("#pfpw2").value) throw new Error("A két jelszó nem egyezik.");
          await pfCreate(pw, keep);
        }
        pfDraw(); if (C.length) draw();
      } catch (e) { pfMsg(e.message, false); }
    };
    $("#pfgo").onclick = go;
    box.querySelectorAll("input[type=password]").forEach((i) => i.addEventListener("keydown", (e) => { if (e.key == "Enter") go(); }));
    $("#npfc").hidden = true;
    return;
  }
  $("#pflockbtn").hidden = false;
  const RC = { buy: "g", accumulate: "g", hold: "a", avoid: "r" };
  const sig = pfSignals(), last = sig[0]?.d, near = pfNear();
  const hit = new Map(); for (const s of [...near, ...sig.filter((s) => s.d == last)]) hit.set(s.id, (hit.get(s.id) || []).concat(s.kind));
  const rows = PF.ids.map((x) => { const c = C.find((r) => r.id == x.id); return c ? derive(c) : { id: x.id, n: x.id, missing: true }; })
    .sort((a, b) => String(a.n).localeCompare(String(b.n), "hu"));
  const nearHtml = near.map((c) => `<li class="pfnear"><span class="sgv"><b class="g">${esc(c.id)}</b> ${esc(c.n || "")}</span><span class="sgk">🎯 ${esc(c.kind)}</span><span class="sgv">ár ${esc(mon(c.px, c.cur))} → <b class="g">${esc(c.to)}</b></span></li>`).join("");
  const pfKey = last || near.map((c) => c.id + c.kind).join(",");
  const sigHtml = !(sig.length || near.length) ? "" : sigHid("pf", pfKey) ? `<section class="sig min">${sigMin("pf", "Portfólió-jelzések", sig.length + near.length, last)}</section>` : `<section class="sig">${sigHead("pf", `Portfólió-jelzések${last ? " · " + esc(last) : ""}`, pfKey)}<p class="sgs">Saját célár 2%-on belül, valamint trend- vagy ajánlásváltás a portfólió papírjainál (az elmúlt 7 nap).</p><ul>${nearHtml}${sig.map((c) => {
    const tr = c.kind.includes("trend"), f = (v) => (tr && ARW[v] ? ARW[v] + " " : "") + v;
    return `<li><span class="sgv"><b class="${sigTone(c)}">${esc(c.id)}</b> ${esc(c.n || "")}</span><span class="sgk">${esc(c.kind)}</span><span class="sgv">${esc(f(c.from))} → <b class="${sigTone(c)}">${esc(f(c.to))}</b></span>${c.d != last ? `<span class="sgd">${esc(c.d)}</span>` : ""}</li>`; }).join("")}</ul></section>`;
  box.innerHTML = sigHtml + (rows.length ? `<div class="w"><table class="pft"><thead><tr><th>Cég</th><th>Árfolyam</th><th>Célár</th><th>Potenciál</th><th title="Saját célár – kattints a mezőbe és írd be">Saját célár</th><th title="Ennyi százalékos emelkedés kell a mai árfolyamtól a saját célárig">Szükséges emelkedés</th><th title="Rövid (20 nap), közép (50 nap), hosszú (200 nap)">Trend 20/50/200</th><th>Elemzés</th><th></th></tr></thead><tbody>${rows.map((r) => r.missing
    ? `<tr><td><b>${esc(r.id)}</b><small>Már nincs a figyelőlistán, ezért nem frissül.</small></td><td colspan="7">–</td><td><button class="del" data-pfrm="${esc(r.id)}" type="button">Eltávolítás</button></td></tr>`
    : `<tr${hit.has(r.id) ? ` class="pfhit" title="Jelzés: ${esc(hit.get(r.id).join(", "))}"` : ""}><td><b>${esc(r.n)}</b><small>${esc(r.t)}${hit.has(r.id) ? ` · <span class="pfnew">${esc(hit.get(r.id).join(", ").toLowerCase())}</span>` : ""}</small></td>
<td>${mon(r.px, r.cur)}<small>${r.mk.d ? esc(r.mk.d) + " záró" : ""}</small></td><td>${mon(r.tp, r.cur)}</td><td class="${r.up == null ? "" : r.up > 0 ? "g" : "r"}">${pct(r.up)}</td>${pfMyCells(r)}<td>${tri(r)}</td>
<td title="${esc(r.r)}">${r.rw ? `<span class="chip ${RC[r.rw.toLowerCase()]}">${esc(r.rw)}</span>` : "–"}</td><td><button class="del" data-pfrm="${esc(r.id)}" type="button">Eltávolítás</button></td></tr>`).join("")}</tbody></table></div>`
    : `<div class="res"><p>A portfólió üres. A Táblázat fülön nyisd le egy cég sorát, és nyomd meg a <b>+ Portfólióba</b> gombot.</p></div>`);
  pfBadge();
}

// Saját célár: szerkeszthető mező és a szükséges emelkedés.
const pfMy = (id) => (PF?.ids.find((x) => x.id == id) || {}).my ?? null;
function pfNeed(my, px) { return my > 0 && px > 0 ? (my / px - 1) * 100 : null; }
function pfMyCells(r) {
  const my = pfMy(r.id), need = pfNeed(my, r.px);
  const cs = { USD: "$", EUR: "€", HUF: "Ft", GBP: "£" }[r.cur] || r.cur || "";
  return `<td><span class="pfmy"><input class="pfin" data-pfmy="${esc(r.id)}" inputmode="decimal" value="${my == null ? "" : String(my).replace(".", ",")}" placeholder="–" aria-label="Saját célár: ${esc(r.n)}"><i>${esc(cs)}</i></span></td>`
    + `<td class="pfneed ${need == null ? "" : need <= 0 ? "g" : ""}" data-pfneed="${esc(r.id)}">${need == null ? "–" : need <= 0 ? "Elérte ✓" : pct(need)}</td>`;
}
let pfMyT = null;
$("#pfbox").addEventListener("input", (e) => {
  const id = e.target.dataset.pfmy; if (!id) return;
  const v = e.target.value.trim().replace(/\s/g, "").replace(",", "."), my = v === "" ? null : Number(v);
  const r = C.find((c) => c.id == id), px = r ? derive(r).px : null, need = pfNeed(my, px), td = $(`[data-pfneed="${CSS.escape(id)}"]`);
  e.target.classList.toggle("bad", v !== "" && !(my > 0));
  if (td) { td.textContent = need == null ? "–" : need <= 0 ? "Elérte ✓" : pct(need); td.className = "pfneed " + (need != null && need <= 0 ? "g" : ""); }
});
$("#pfbox").addEventListener("change", async (e) => {
  const id = e.target.dataset.pfmy; if (!id || !PF) return;
  const v = e.target.value.trim().replace(/\s/g, "").replace(",", "."), my = v === "" ? null : Number(v);
  if (v !== "" && !(my > 0)) { pfMsg("A saját célár pozitív szám legyen (pl. 650 vagy 650,5).", false); return; }
  const x = PF.ids.find((y) => y.id == id); if (!x || (x.my ?? null) === my) return;
  if (my == null) delete x.my; else x.my = my;
  // Több mező gyors kitöltésekor egyetlen mentés.
  // Gépelés közben (másik mezőben) nem rajzolja újra a táblát.
  const later = () => { pfMyT = setTimeout(() => document.activeElement?.classList?.contains("pfin") ? later() : pfSave("Saját célár mentve.", false).then(pfDraw), 1200); };
  clearTimeout(pfMyT); later();
});
$("#pfbox").addEventListener("keydown", (e) => { if (e.target.dataset.pfmy && e.key == "Enter") e.target.blur(); });

$("#pfbox").addEventListener("click", async (e) => {
  const id = e.target.dataset.pfrm; if (!id) return;
  if (confirm("Eltávolítod a portfólióból? (Például ha eladtad.)")) await pfRemove(id);
});
$("#pflockbtn").onclick = pfLock;
$("#tb").addEventListener("click", (e) => { const id = e.target.dataset.pf; if (!id) return; e.stopPropagation(); pfToggle(id); }, true);
getJSON("data/signals.json").then((s) => { PF_SIG = s || []; if (PF) pfDraw(); }).catch(() => {});
pfInit();
