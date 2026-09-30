// konninvest.com – nyilvános kérés-közvetítő.
// Bárki kérhet új cég elemzést vagy árfolyam-frissítést GitHub-fiók nélkül:
// ez a függvény a tulajdonos szűk jogú GitHub-kulcsával (csak Issues írás a moat-monitor repón)
// nyit egy "Elemzés: …" / "Frissítés: most" issue-t, "nyilvános" címkével.
// Védelem: csak cégnév/ticker formátum, napi korlát, a lista módosítása (felvétel, törlés) itt nem kérhető.
const REPO = "matekonnyu/moat-monitor";
const ORIGINS = ["https://konninvest.com", "https://www.konninvest.com", "https://matekonnyu.github.io"];
const DAILY_LIMIT = Number(process.env.PUBLIC_DAILY_LIMIT || 5);
const NAME_RE = /^[\p{L}\p{N} .,&()'\-]{1,60}$/u;

const cors = (origin) => ({
  "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin",
});
const json = (status, body, origin) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors(origin) } });
const gh = (path, opt = {}) => fetch(`https://api.github.com/repos/${REPO}${path}`, {
  ...opt,
  headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "konninvest-api" },
});

export default async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json(405, { error: "Csak POST kérés." }, origin);
  if (!ORIGINS.includes(origin)) return json(403, { error: "Ismeretlen forrás." }, origin);
  if (!process.env.GITHUB_TOKEN) return json(503, { error: "A szolgáltatás még nincs beállítva." }, origin);

  let body; try { body = await req.json(); } catch { return json(400, { error: "Hibás kérés." }, origin); }
  const kind = body?.kind;
  let title;
  if (kind === "analysis") {
    const q = String(body.q || "").replace(/\s+/g, " ").trim();
    if (!NAME_RE.test(q) || q.split(" ").length > 6) return json(400, { error: "Csak cégnevet vagy tickert adj meg (legfeljebb 60 karakter, 6 szó, speciális jelek nélkül)." }, origin);
    title = `Elemzés: ${q}`;
  } else if (kind === "refresh") {
    title = "Frissítés: most";
  } else return json(400, { error: "Ismeretlen kérés." }, origin);

  // Napi korlát a nyilvános kérésekre (címke alapján), és a már futó azonos kérés kiszűrése.
  const since = new Date(); since.setUTCHours(0, 0, 0, 0);
  const r = await gh(`/issues?state=all&labels=nyilvanos&since=${since.toISOString()}&per_page=100`);
  if (!r.ok) return json(502, { error: "A GitHub most nem érhető el, próbáld újra később." }, origin);
  const today = (await r.json()).filter((i) => new Date(i.created_at) >= since);
  const same = today.find((i) => i.state === "open" && i.title.toLowerCase() === title.toLowerCase());
  if (same) return json(200, { number: same.number, title: same.title, duplicate: true }, origin);
  const used = today.filter((i) => i.title.startsWith(kind === "analysis" ? "Elemzés:" : "Frissítés:")).length;
  const limit = kind === "analysis" ? DAILY_LIMIT : 3;
  if (used >= limit) return json(429, { error: kind === "analysis" ? `Ma már elfogyott a napi ${limit} nyilvános elemzés. Próbáld újra holnap.` : "Ma már többször frissültek az árak, próbáld később." }, origin);

  const c = await gh("/issues", { method: "POST", body: JSON.stringify({ title, body: "Nyilvános kérés a konninvest.com oldalról.", labels: ["nyilvanos"] }) });
  if (!c.ok) return json(502, { error: "Nem sikerült elküldeni a kérést, próbáld újra." }, origin);
  const i = await c.json();
  return json(201, { number: i.number, title: i.title }, origin);
};

export const config = { path: "/api/request" };
