# Moat Monitor

Moat-minőség, belső érték és napi árfolyamtrend a követett részvényekre (BÉT, európai, amerikai).

- **Weboldal:** GitHub Pages (`index.html`, `app.js`), adat: `data/companies.json`, `data/candidates.json`.
- **Napi frissítés:** `.github/workflows/refresh.yml` minden reggel lekéri a Yahoo Finance napi záróárait, és kiszámolja az SMA20/50/200 és EMA20/50 értékeket és a trendet (`scripts/refresh.mjs`).
- **Gombok:** az oldal gombjai előre kitöltött GitHub issue-t nyitnak (`Elemzés:`, `Felvétel:`, `Elvetés:`, `Törlés:`); a `.github/workflows/issues.yml` hajtja végre őket. Csak a repó tulajdonosának kérését dolgozza fel.
- **Elemzés:** az `Elemzés:` kéréseket Claude egy reggeli ütemezett feladatban dolgozza fel, és a kész elemzést a `data/candidates.json`-ba írja.

Kutatási eszköz, nem befektetési tanács.
