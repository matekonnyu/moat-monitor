// Elemzési kérés ellenőrzése (analyze.yml): a tulajdonos kérései mindig mennek;
// más GitHub-felhasználóé csak egyszerű cégnév/ticker formában, és naponta legfeljebb OUTSIDER_DAILY_LIMIT darab.
import { appendFileSync } from "node:fs";
const { REPO, NUM, GH_TOKEN, GITHUB_OUTPUT } = process.env;
const LIMIT = +(process.env.OUTSIDER_DAILY_LIMIT || 5);
const owner = REPO.split("/")[0];
const api = (p, o = {}) => fetch(`https://api.github.com/repos/${REPO}${p}`, { ...o, headers: { Authorization: "Bearer " + GH_TOKEN, Accept: "application/vnd.github+json", "Content-Type": "application/json" } });
const i = await (await api(`/issues/${NUM}`)).json();
const title = String(i.title || "").replace(/[\r\n]/g, " ");
let ok = /^\s*Elemzés\s*:/i.test(title), why = "";
if (ok && i.user?.login !== owner) {
  const q = title.replace(/^\s*Elemzés\s*:\s*/i, "");
  if (!/^[\p{L}\p{N} .,&()'\-]{1,60}$/u.test(q) || q.trim().split(/\s+/).length > 6) { ok = false; why = "Csak cégnevet vagy tickert írj a kérésbe (legfeljebb 60 karakter, speciális jelek nélkül)."; }
  else {
    const since = new Date(); since.setUTCHours(0, 0, 0, 0);
    const list = await (await api(`/issues?state=all&since=${since.toISOString()}&per_page=100`)).json();
    const n = list.filter((x) => !x.pull_request && /^\s*Elemzés\s*:/i.test(x.title) && x.user?.login !== owner && new Date(x.created_at) >= since && x.number <= i.number).length;
    if (n > LIMIT) { ok = false; why = `Ma már elérte a nyilvános elemzési kérések napi korlátját (${LIMIT}). Próbáld újra holnap.`; }
  }
  if (!ok) {
    await api(`/issues/${NUM}/comments`, { method: "POST", body: JSON.stringify({ body: why }) });
    await api(`/issues/${NUM}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
  }
}
appendFileSync(GITHUB_OUTPUT, `num=${NUM}\nok=${ok}\ntitle=${title}\n`);
console.log({ num: NUM, ok, why });
