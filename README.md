# UM urnik

Boljši pregledovalnik urnikov Univerze v Mariboru, zgrajen na javnih podatkih
[Wise Timetable](https://www.wise-tt.com/). Teče brezplačno na GitHub Pages,
brez strežnika in brez prijave.

**Funkcije**

- tedenski ali dnevni pogled (na telefonu izbiraš sam), enotno okno 7:00–20:00 za vse fakultete
  (termini zunaj okna, npr. Wisove »Rezervacije«, so značke v glavi dneva), urnik se prilagodi višini zaslona
- svetla/temna tema po izbiri (nastavitev velja za vsako napravo posebej), namestljiv kot aplikacija
- **filter predmetov**: skrij predmete ali posamezne izvedbe (npr. tuj jezik, ki ga ne obiskuješ)
- **obvestila o spremembah**: odpadla, prestavljena in nova predavanja so označena v koledarju in zbrana pod 🔔
- **lastni dogodki** (tudi tedensko ponavljajoči) in **opombe** k terminu ali celemu predmetu
- **prijatelji**: ročno dodaš ime, fakulteto, program in skupino; nihče ne rabi računa
- **primerjava s prijateljem**: zeleno so ure, ko sta oba prosta, z oznako skupnih predavanj in seznamom lukenj po dnevih
- **prenos na drugo napravo**: QR koda ali povezava z vsemi urniki, prijatelji, skritimi predmeti,
  lastnimi dogodki in opombami (podatki so v delu povezave za `#`, zato ne gredo na noben strežnik); ali izvoz v datoteko

Vse osebne nastavitve so shranjene samo v brskalniku (localStorage).

## Postavitev na GitHub (enkrat)

1. Ustvari nov **javen** repozitorij na GitHubu (npr. `um-urnik`) in vanj naloži to mapo:
   ```bash
   git init -b main
   git add .
   git commit -m "UM urnik"
   git remote add origin https://github.com/AlesRzmn/WiserTimetables.git
   git push -u origin main
   ```
2. V repozitoriju odpri **Settings → Pages** in pri *Source* izberi **GitHub Actions**.
3. Odpri zavihek **Actions → Osveži urnik in objavi → Run workflow** (ali počakaj na push).
   Prvi zagon traja nekaj minut (prebere programe in skupine vseh fakultet).
4. Aplikacija bo na `https://alesrzmn.github.io/WiserTimetables/`.

Action se nato sam zažene vsake 3 ure. Spremembe urnika se začnejo beležiti od drugega zagona naprej.

> GitHub ustavi časovno zagnane Actione, če v javnem repozitoriju 60 dni ni bilo nobene aktivnosti.
> V tem primeru jih ponovno vklopiš v zavihku Actions.

**Samo nekatere fakultete:** v *Settings → Secrets and variables → Actions → Variables* dodaj
spremenljivko `FACULTIES`, npr. `fs,feri`. Brez nje se berejo vse.

## Kako deluje

```
GitHub Action (vsake 3 ure)
  ├─ scraper/run.mjs      prebere javno stran wise-tt.com/web/<fakulteta>/
  │   ├─ katalog          programi, letniki, skupine in njihova hierarhija (enkrat na dan)
  │   ├─ dogodki          en iCal izvoz za vse skupine fakultete (…/reports?g=…&format=ics)
  │   └─ spremembe        primerjava s prejšnjo objavljeno verzijo (po UID dogodka)
  ├─ vite build           spletna aplikacija (React + TypeScript)
  └─ GitHub Pages         objavi aplikacijo + public/data/*.json
```

Aplikacija iz podatkov fakultete izbere dogodke izbranih skupin enako kot Wise:
izbrana podskupina (npr. `STR UN 1. l. - 7.sk.`) dobi tudi termine nadrejene skupine
(`STR UN 1. l.`). To je bilo preverjeno na pravih podatkih FS, FERI in FF (18 skupin, 0 razlik).

Podatki na strani:

| datoteka | vsebina |
| --- | --- |
| `data/faculties.json` | seznam fakultet in čas osvežitve |
| `data/<kratica>/catalog.json` | programi, letniki, skupine (`parent` = nadrejena skupina) |
| `data/<kratica>/events.json` | dogodki v stisnjeni obliki (nizi v slovarjih) |
| `data/<kratica>/changes.json` | spremembe zadnjih 21 dni |

## Lokalni razvoj

```bash
npm install
npm run mock     # testni podatki v public/data (FS + FERI)
npm run dev      # http://localhost:5173
npm test         # testi bralnika
npm run scrape   # pravi podatki z Wise (FACULTIES=fs za samo FS)
```

Struktura:

```
scraper/core.mjs        branje Wise (deluje v Node in v brskalniku)
scraper/run.mjs         zagon v GitHub Actionu
src/lib/data.ts         nalaganje podatkov, skupine, primerjava urnikov
src/components/         WeekView, ProfileEditor, CourseFilter, EventDialog, …
src/App.tsx             glavni zaslon
```

### Dodajanje novih funkcij

- **Nov podatek o dogodku** (npr. povezava do spletne učilnice): dodaj polje v `parseIcs` v
  `scraper/core.mjs`, v `packEvents`/`unpackEvents` in v tip `WEvent` v `src/lib/types.ts`.
- **Nov pogled** (npr. mesečni): nova komponenta v `src/components/`, ki dobi `CalEvent[]` iz `eventsFor()` v `App.tsx`.
- **Shranjevanje nastavitev**: `useStored('ključ', privzeto)` iz `src/lib/storage.ts`; ključ dodaj še v `EXPORT_KEYS` za izvoz.

## Opomba

Neuradna aplikacija. Podatki so javno dostopni na Wise Timetable; bralnik jih bere
nekajkrat na dan z zamikom med zahtevami. Če se kaj ne ujema, velja uradni urnik.
