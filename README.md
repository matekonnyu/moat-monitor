# Moat Monitor

Moat-minőség, belső érték és napi árfolyamtrend a követett részvényekre (BÉT, európai, amerikai).

- **Weboldal:** GitHub Pages (`index.html`, `app.js`), adat: `data/companies.json`, `data/candidates.json`.
- **Napi frissítés:** `.github/workflows/refresh.yml` minden reggel lekéri a Yahoo Finance napi záróárait, és kiszámolja az SMA20/50/200 és EMA20/50 értékeket és a trendet (`scripts/refresh.mjs`).
- **Gombok:** az oldal gombjai előre kitöltött GitHub issue-t nyitnak (`Elemzés:`, `Felvétel:`, `Elvetés:`, `Törlés:`); a `.github/workflows/issues.yml` hajtja végre őket. Csak a repó tulajdonosának kérését dolgozza fel.
- **Elemzés:** az `Elemzés:` kéréseket Claude egy reggeli ütemezett feladatban dolgozza fel, és a kész elemzést a `data/candidates.json`-ba írja.

Kutatási eszköz, nem befektetési tanács.

## Jelzések (trend- és ajánlásváltás)
A napi frissítés után a `scripts/signals.mjs` összeveti a figyelőlista papírjait az előző napi állapottal. Ha egy papír középtávú vagy hosszú távú (200 napos) trendje megfordul, változik az ajánlása (Buy/Accumulate/Hold/Avoid), vagy az ár átlépi a vételi szintet, a workflow `jelzes` címkéjű GitHub issue-t nyit – erről a GitHub e-mailben értesít. Napló: `data/signals.json` (cégenként és jelzésfajtánként csak a legfrissebb jelzés marad, a régebbi azonos jelzés törlődik; a napon belül visszaállt változás eltűnik; a Mai ajánlat változása nem jelzés), állapot: `data/signals-state.json`.

## Portfólió (jelszóval védett)
A **Portfólió** fül a saját, megvásárolt papírokat mutatja (árfolyam, célár, potenciál, saját célár és az ahhoz szükséges emelkedés, trend 20/50/200, ajánlás), a főlistával együtt frissül, és kiemeli a portfólió papírjainak trend- és ajánlásváltásait (a `data/signals.json`-ból). A repó nyilvános, ezért a lista titkosítva van: `data/portfolio.enc.json` (AES-GCM 256, a kulcs a jelszóból PBKDF2-SHA256-tal, 250 000 iteráció). A jelszó nem hagyja el a böngészőt, és nem állítható vissza. A főlistán a cég részleteiben a **+ Portfólióba** gomb adja hozzá; mentéskor a böngésző újratitkosítja a teljes listát, és `Portfólió: mentés` issue-t nyit, amelynek törzsében csak a titkosított adat van – a `scripts/issues.mjs` (csak a tulajdonos kérésére) beírja a fájlba, mindig a legfrissebb kérést.
