// A weboldal gombjai GitHub issue-t nyitnak; ez a szkript hajtja végre őket.
// Címformátumok: "Felvétel: TICKER", "Elvetés: TICKER", "Törlés: TICKER", "Elemzés: szöveg"
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
const reply = (text, close = true) =>
  Promise.all([api(`/issues/${issue.number}/comments`, "POST", { body: text }), close ? api(`/issues/${issue.number}`, "PATCH", { state: "closed" }) : null]);

if (issue.user.login !== repo.owner.login) {
  await reply("Ezt a kérést csak a repó tulajdonosa indíthatja.");
  process.exit(0);
}
const m = issue.title.match(/^\s*(Felvétel|Elvetés|Törlés|Elemzés|Frissítés)\s*:\s*(.+?)\s*$/i);
if (!m) process.exit(0);
const action = m[1].toLowerCase(), arg = m[2].trim(), id = arg.toUpperCase();

if (action === "elemzés") {
  // Az elemzést az analyze.yml workflow végzi.
  await reply(`Rögzítettem az elemzési kérést: **${arg}**. Claude pár percen belül elkészíti, és az oldal „Új cég” fülén jóváhagyásra vár.`, false);
  process.exit(0);
}

const load = async (f) => JSON.parse(await readFile(f, "utf8"));
const save = (f, d) => writeFile(f, JSON.stringify(d, null, 1) + "\n");

// Egy módosítás a friss adatokon; visszaadja a választ, vagy {skip} ha nincs mit menteni.
async function apply() {
  if (action === "frissítés") return { refresh: true, text: "Frissítettem az árfolyamokat és a trendeket. Az oldal 1–2 percen belül frissül." };
  const companies = await load("data/companies.json");
  const candidates = await load("data/candidates.json");
  if (action === "felvétel") {
    const i = candidates.findIndex((c) => c.id === id);
    if (i < 0) return { skip: true, text: companies.some((c) => c.id === id) ? `Már a listán van: ${id}.` : `Nem találom a jóváhagyásra váró elemzések között: ${id}` };
    const [c] = candidates.splice(i, 1);
    const old = companies.findIndex((x) => x.id === id);
    c.l = old >= 0 ? companies[old].l : "Jelölt";
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
  sh("git add data");
  if (!sh("git status --porcelain data").trim()) { await reply(res.text); process.exit(0); }
  sh(`git commit -qm ${JSON.stringify(issue.title)}`);
  try { sh("git push -q origin HEAD:main"); await reply(res.text); process.exit(0); }
  catch (e) { last = String(e.stderr || e.message).slice(-300); console.error("push", attempt, last); await new Promise((r) => setTimeout(r, 3000 * attempt)); }
}
await reply(`Nem sikerült menteni (${last.trim()}). Próbáld újra a gombbal.`, false);
process.exit(1);
