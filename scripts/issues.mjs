// A weboldal gombjai GitHub issue-t nyitnak; ez a szkript hajtja végre őket.
// Címformátumok: "Felvétel: TICKER", "Elvetés: TICKER", "Törlés: TICKER", "Elemzés: szöveg"
// Csak a repó tulajdonosától érkező issue-kat dolgozza fel.
import { readFile, writeFile } from "node:fs/promises";

const ev = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const issue = ev.issue, repo = ev.repository;
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

const m = issue.title.match(/^\s*(Felvétel|Elvetés|Törlés|Elemzés)\s*:\s*(.+?)\s*$/i);
if (!m) process.exit(0);
const action = m[1].toLowerCase(), arg = m[2].trim(), id = arg.toUpperCase();

const load = async (f) => JSON.parse(await readFile(f, "utf8"));
const save = (f, d) => writeFile(f, JSON.stringify(d, null, 1) + "\n");
const companies = await load("data/companies.json");
const candidates = await load("data/candidates.json");

if (action === "felvétel") {
  const i = candidates.findIndex((c) => c.id === id);
  if (i < 0) { await reply(`Nem találom a jóváhagyásra váró elemzések között: ${id}`); process.exit(0); }
  const [c] = candidates.splice(i, 1);
  const old = companies.findIndex((x) => x.id === id);
  c.l = old >= 0 ? companies[old].l : "Jelölt";
  if (old >= 0) companies[old] = c; else companies.push(c);
  await save("data/companies.json", companies);
  await save("data/candidates.json", candidates);
  await reply(`Felvettem a listára: ${c.n} (${id}). Az oldal 1–2 percen belül frissül.`);
} else if (action === "elvetés") {
  await save("data/candidates.json", candidates.filter((c) => c.id !== id));
  await reply(`Elvetve: ${id}.`);
} else if (action === "törlés") {
  const next = companies.filter((c) => c.id !== id);
  if (next.length === companies.length) { await reply(`Nincs ilyen cég a listán: ${id}`); process.exit(0); }
  await save("data/companies.json", next);
  await reply(`Töröltem a listáról: ${id}. Az oldal 1–2 percen belül frissül.`);
} else if (action === "elemzés") {
  await reply(`Rögzítettem az elemzési kérést: **${arg}**. Claude a következő reggeli futásban elkészíti, és az oldal „Új cég” fülén jóváhagyásra vár.`, false);
}
