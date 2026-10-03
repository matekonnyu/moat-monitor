// A weboldal gombjai GitHub issue-t nyitnak; ez a szkript hajtja végre őket.
// Címformátumok: "Felvétel: TICKER", "Elvetés: TICKER", "Törlés: TICKER", "Elemzés: szöveg",
// "Portfólió: mentés" (a törzsben a titkosított portfólió; a szkript nem tudja visszafejteni, csak eltárolja).
// Csak a repó tulajdonosától érkező issue-kat dolgozza fel.
// A módosítást a legfrissebb main ágon végzi, feltölti (ütközésnél újrapróbálja), és csak sikeres mentés után válaszol.
import { readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";

const ev = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const issue = ev.issue, repo = ev.repository;
const sh = (c) => execSync(c, { stdio: "pipe" }).toString();
const api = async (path, method = "GET", body) => {
  const r = await fetch(`https://api.github.com/repos/${repo.full_name}${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) console.error(method, path, r.status, await r.text());
};
const replyOne = (n, text, close = true) =>
  Promise.all([api(`/issues/${n}/comments`, "POST", { body: text }), close ? api(`/issues/${n}`, "PATCH", { state: "closed" }) : null]);
const reply = async (text, close = true) => {
  await replyOne(issue.number, text, close);
  // Ugyanazzal a címmel nyitva maradt ikerkérések (pl. dupla kattintás) lezárása, hogy ne ragadjanak „fut” állapotban.
  if (!close) return;
  try {
    const r = await fetch(`https://api.github.com/repos/${repo.full_name}/issues?state=open&per_page=100`, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } });
    const open = r.ok ? await r.json() : [];
    for (const o of open) if (!o.pull_request && o.number !== issue.number && o.title.trim().toLowerCase() === issue.title.trim().toLowerCase()) await replyOne(o.number, text);
  } catch (e) { console.error("ikerkérések:", e.message); }
};

const m = issue.title.match(/^\s*(Felvétel|Elvetés|Törlés|Elemzés|Frissítés|Portfólió)\s*:\s*(.+?)\s*$/i);
if (!m) process.exit(0);
const action = m[1].toLowerCase(), arg = m[2].trim(), id = arg.toUpperCase();
// Elemzést és árfolyam-frissítést bárki kérhet; a lista módosítása csak a tulajdonosé.
const isOwner = issue.user.login === repo.owner.login;
if (!isOwner && !["elemzés", "frissítés"].includes(action)) {
  await reply("A lista módosítása (hozzáadás, elvetés, törlés) csak a tulajdonosnak engedélyezett.");
  process.exit(0);
}
if (!isOwner && action === "elemzés") process.exit(0); // az analyze.yml ellenőrzi és válaszol
if (!isOwner && action === "frissítés") {
  try { const meta = JSON.parse(await readFile("data/meta.json", "utf8")); if (Date.now() - Date.parse(meta.refreshedAt) < 30 * 60e3) { await reply("Az árfolyamok az elmúlt 30 percben frissültek, most nincs szükség újabb frissítésre."); process.exit(0); } } catch {}
}

// Portfólió: a már lezárt (ikerként feldolgozott) kérést nem dolgozzuk fel újra.
if (action === "portfólió") {
  try {
    const r = await fetch(`https://api.github.com/repos/${repo.full_name}/issues/${issue.number}`, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } });
    if (r.ok && (await r.json()).state === "closed") process.exit(0);
  } catch {}
}

if (action === "elemzés") {
  // Az elemzést az analyze.yml workflow végzi.
  await reply(`Rögzítettem az elemzési kérést: **${arg}**. Claude pár percen belül elkészíti, és az oldal „Új cég” fülén jóváhagyásra vár.`, false);
  process.exit(0);
}

const load = async (f) => JSON.parse(await readFile(f, "utf8"));
const save = (f, d) => writeFile(f, JSON.stringify(d, null, 1) + "\n");

// Egy módosítás a friss adatokon; visszaadja a választ, vagy {skip} ha nincs mit menteni.
// A titkosított portfólió (data/portfolio.enc.json) érvényessége: csak a várt mezők, base64, ésszerű méret.
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
function pfParse(body) {
  try {
    const e = JSON.parse(String(body || "").trim());
    if (e && e.v === 1 && Number.isInteger(e.it) && e.it >= 100000 && typeof e.at === "string" && !isNaN(Date.parse(e.at))
      && [e.salt, e.iv, e.ct].every((x) => typeof x === "string" && B64.test(x)) && e.ct.length < 50000)
      return { v: 1, at: e.at, it: e.it, salt: e.salt, iv: e.iv, ct: e.ct };
  } catch {}
  return null;
}
async function pfLatest() {
  // A legfrissebb nyitott "Portfólió:" kérés (a tulajdonostól) nyer: a törzse mindig a teljes listát tartalmazza.
  const all = [issue];
  try {
    const r = await fetch(`https://api.github.com/repos/${repo.full_name}/issues?state=open&per_page=100`, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } });
    if (r.ok) for (const o of await r.json()) if (!o.pull_request && o.number !== issue.number && o.user?.login === repo.owner.login && /^\s*Portfólió\s*:/i.test(o.title)) all.push(o);
  } catch {}
  return all.map((o) => pfParse(o.body)).filter(Boolean).sort((a, b) => (a.at < b.at ? 1 : -1))[0] || null;
}

async function apply() {
  if (action === "portfólió") {
    const env = await pfLatest();
    if (!env) return { skip: true, text: "A portfólió mentése nem sikerült: a kérés nem tartalmaz érvényes titkosított adatot. Mentsd újra az oldalon." };
    let cur = null; try { cur = JSON.parse(await readFile("data/portfolio.enc.json", "utf8")); } catch {}
    if (cur && cur.at >= env.at) return { skip: true, text: "A portfólió már a legfrissebb állapotban van." };
    await save("data/portfolio.enc.json", env);
    return { text: "A portfólió mentve (titkosítva). Az oldal 1–2 percen belül frissül." };
  }
  if (action === "frissítés") return { refresh: true, text: "Frissítettem az árfolyamokat és a trendeket. Az oldal 1–2 percen belül frissül." };
  const companies = await load("data/companies.json");
  const candidates = await load("data/candidates.json");
  if (action === "felvétel") {
    const i = candidates.findIndex((c) => c.id === id);
    if (i < 0) return { skip: true, text: companies.some((c) => c.id === id) ? `Már a listán van: ${id}.` : `Nem találom a jóváhagyásra váró elemzések között: ${id}` };
    const [c] = candidates.splice(i, 1);
    const old = companies.findIndex((x) => x.id === id);
    c.l = "Követett"; // a listára felvett cég mindig követett; a "Jelölt" csak a jóváhagyásra váró elemzéseké
    if (old >= 0) companies[old] = c; else companies.push(c);
    await save("data/companies.json", companies);
    await save("data/candidates.json", candidates);
    return { text: `Felvettem a listára: ${c.n} (${id}). Az oldal 1–2 percen belül frissül.` };
  }
  if (action === "elvetés") {
    const next = candidates.filter((c) => c.id !== id);
    if (next.length === candidates.length) return { skip: true, text: `Elvetve: ${id}.` };
    await save("data/candidates.json", next);
    return { text: `Elvetve: ${id}.` };
  }
  if (action === "törlés") {
    const next = companies.filter((c) => c.id !== id);
    if (next.length === companies.length) return { skip: true, text: `Nincs ilyen cég a listán: ${id}` };
    await save("data/companies.json", next);
    return { text: `Töröltem a listáról: ${id}. Az oldal 1–2 percen belül frissül.` };
  }
}

sh('git config user.name "moat-monitor-bot" && git config user.email "moat-monitor-bot@users.noreply.github.com"');
let last = "";
for (let attempt = 1; attempt <= 4; attempt++) {
  sh("git fetch -q origin main && git reset -q --hard origin/main");
  const res = await apply();
  if (res.skip) { await reply(res.text); process.exit(0); }
  if (action === "felvétel" || res.refresh) { try { sh("node scripts/refresh.mjs"); } catch {} }
  else if (action !== "portfólió") { try { sh("node scripts/render.mjs"); } catch {} }
  sh("git add data adatok.md adatok.json adatok.csv llms.txt index.html");
  if (!sh("git status --porcelain data adatok.md adatok.json adatok.csv llms.txt index.html").trim()) { await reply(res.text); process.exit(0); }
  sh(`git commit -qm ${JSON.stringify(issue.title)}`);
  try { sh("git push -q origin HEAD:main"); await reply(res.text); process.exit(0); }
  catch (e) { last = String(e.stderr || e.message).slice(-300); console.error("push", attempt, last); await new Promise((r) => setTimeout(r, 3000 * attempt)); }
}
await reply(`Nem sikerült menteni (${last.trim()}). Próbáld újra a gombbal.`, false);
process.exit(1);
