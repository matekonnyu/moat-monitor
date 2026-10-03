# Moat Monitor – módszertan

Ez a Moat Monitor hivatalos módszertana (2026-09-30-tól). Minden elemzés – a kézi, az „Azonnali elemzés” GitHub Action és az ütemezett tartalék-elemző – ezt követi. Forrás: kizárólag friss internetes adatok (cég IR / SEC / éves és negyedéves jelentések, konszenzus-oldalak, BÉT-papíroknál bet.hu, portfolio.hu, vg.hu). A Notion nem forrás.

## 1. Moat (Morningstar)
- **Wide:** nagyon valószínű, hogy a cég 10 évig a tőkeköltsége felett keres (ROIC > WACC), és inkább igen, mint nem, hogy legalább 20 évig.
- **Narrow:** inkább igen, mint nem, hogy legalább 10 évig ROIC > WACC.
- **None:** nincs tartós versenyelőny.
- **Moat trend:** Positive (erősödő) / Stable / Negative (gyengülő).
- Az öt moat-forrás 0–100 pontja (Intangible Assets, Switching Costs, Network Effects, Cost Advantage, Efficient Scale) és az összesített moat score (0–100) kiegészítő mutató; a besorolást a fenti definíció dönti el, nem pontszámhatár.

## 2. Belső érték és bizonytalanság
- **Belső érték (fair value):** konzervatív Buffett–Munger owner-earnings becslés részvényenként, a jegyzés pénznemében (normalizált FCF/eredmény × konzervatív szorzó vagy egyszerű DCF). Negatív FCF-ű / bináris kimenetelű cégnél nem fújjuk fel.
- **Bizonytalanság (Morningstar Uncertainty Rating):** Low / Medium / High / Very High / Extreme – a lehetséges fair value-k szórása.

## 3. Csillagos értékelés és vételi szint (Morningstar)
| Bizonytalanság | 5 csillag: ár ≤ | 1 csillag: ár ≥ |
|---|---|---|
| Low | fair value × 0,80 | fair value × 1,25 |
| Medium | × 0,70 | × 1,35 |
| High | × 0,60 | × 1,55 |
| Very High | × 0,50 | × 1,75 |
| Extreme | × 0,25 | × 4,00 |

- **Vételi szint (Buy Below)** = az 5 csillagos ár; `mos` = a diszkont (20/30/40/50/75%).
- 2–4 csillag: a határok a két szélső határ és a fair value közötti felezőpontokon (saját interpoláció, mert a Morningstar nem közli nyilvánosan).
- Értékelés: 4–5 csillag = Alulértékelt, 3 = Korrekt ár, 1–2 = Drága.

## 4. Kiegészítő mutatók
- **MPA score** (Buffett–Munger / MPA): moat (Wide 40, Narrow 25, None 5) + pénzügyi erő (Strong 30, Adequate 18, Weak 5) + ár (≤ vételi szint 30; IV alatt 22; 0–10% felett 15; 10–30% felett 8; 30% felett 0).
- **Eltérés** = MPA score − moat score.
- **Ajánlás:** Buy / Accumulate / Hold / Avoid, egy mondatos indoklással.
- **Kockázatok, belső érték alapja, források** minden cégnél.

## 5. Trend és napi ajánlat
- Trend 20 napon (ár vs SMA20 ±1%), 50 napon (ár vs SMA50 és EMA20 vs EMA50), 200 napon (ár és SMA50 vs SMA200); Yahoo Finance napi záróárakból, minden reggel.
- **Ajánlás (Buy / Accumulate / Hold / Avoid):** minden napi árfrissítéskor újraszámolódik az aktuális árból a csillag alapján: 4–5 csillag Buy; 3 csillag Accumulate, ha a cégnek van moatja, a 200 napos trend emelkedő és az elemzői célár legalább 10% potenciált ad, egyébként Hold; 2 csillag Hold, 1 csillag Avoid. Moat nélküli (None) cég legfeljebb Hold, és ha az elemzés Avoidot adott, Avoid marad. Az elemzés szövege az elemzés napján készült; a részleteknél látszik, ha az elemzéskori ajánlás eltér a mostanitól.
- **Mai ajánlat:** moat score legalább 70, van moat, Buy, Accumulate vagy Hold ajánlás (Avoid nem), nem drága (legalább 3 csillag), és a trend: vagy a 200 napos (hosszú távú) trend emelkedő – ilyenkor a rövid vagy középtávú trend lehet csökkenő is –, vagy az 50 és a 200 napos trend sem csökkenő. Ezek közül a vételi szinthez legközelebbi ár.

Kutatási eszköz, nem befektetési tanács.
