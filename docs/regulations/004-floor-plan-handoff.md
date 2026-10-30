pusu# 004 — Provere merljive iz 2D tlocrta

## Dogovoreni fokus

Korisnik je pojasnio da želi merljive zahteve koji se mogu pročitati iz tlocrta, a ne sve odredbe niti sve fizičke veličine iz propisa. Ovaj paket zato odvaja horizontalnu geometriju, putanje i anotacije od visina, nagiba i podataka o celoj zgradi.

Početna Git revizija: `13e6b442958a4f90350c654c79805e62f436406e`. Grana: `feat/regulatory-intelligence`. Pre rada je proveren origin/main; već je bio uključen. Ne menjamo tuđe fajlove, pravila iz 001–003 ili njihove zapise odobrenja. Raniji modeli ostaju audit istorija; nisu obrisani radi menjanja brojača.

## Šta sada brojimo

| Grupa | Broj | Značenje |
| --- | --- | --- |
| Direktna horizontalna geometrija tlocrta | 26 | Stroga lista za pregled, od toga 20 modela sa postojećim MIN/MAX evaluatorom i 6 geometrijskih kandidata kojima evaluator nedostaje |
| Validiran graf tlocrta | 1 | Evakuaciona putanja: veze prostorija, vrata i zidova moraju biti potvrđene; ne meri se prava linija kroz zidove |
| Potvrđene anotacije na tlocrtu | 2 | Sobni broj korisnika za broj izlaza i uslovnu širinu vrata; nije izveden iz površine ili ukupnog broja korisnika projekta |
| Dodatna dokumentacija ili eksplicitne vertikalne oznake | 6 | Visina stepenika, visina praga, nagib rampe, visina vrata, kapacitet stepeništa i uslovni nagib rampe — isključeni iz podrazumevanog paketa za tlocrt |
| Ceo registar | 35 | Svi sačuvani modeli iz 001–004, ne 35 automatskih ili aktivnih provera |

**Svih 26 provera iz stroge liste je HUMAN_VERIFIED — approved by Petar Popovic.** Korisnik je eksplicitno odobrio upravo tih 26 zapisa; audit je u `fixtures/regulations/004-human-review.json`. Šest geometrijskih evaluatora još zahteva implementaciju. Nula pravila je ACTIVE; preostalih devet zapisa izvan stroge liste nije dobilo ovo odobrenje.

## Deset novih zahteva

Svi novi UUID-jevi imaju prefiks `00400000-0000-4000-8000-`, verziju 1. Podskup ostaje novi poslovni projekat RS, OFFICE, CONCEPT/DESIGN, uz potvrđen kontekst.

| ID sufiks | Zahtev iz tlocrta | Izvor pristupačnosti | Podrška |
| --- | --- | --- | --- |
| 60 | Dužina označenog odmorišta odgovarajuće dugačke rampe najmanje 1.50 m | Čl. 7 st. 1 t. 3 | MIN RUN_M |
| 61 | Produžetak vetrobrana iza ravni unutrašnjih vrata najmanje 0.90 m | Čl. 13 st. 2 t. 3 | MIN RUN_M |
| 62 | Prostor za kretanje oko nameštaja u pristupačnom radnom prostoru najmanje 1.20 m | Čl. 19 st. 4 t. 2 | MIN CLEAR_WIDTH_M |
| 63 | Pristupni koridor usmeren ogradom u prostoru javne upotrebe najmanje 0.90 m | Čl. 26 st. 2 | MIN CLEAR_WIDTH_M; dodatno poznat hasPublicAccess |
| 64 | Slobodan podest dvokrake rampe 1.50 x 1.70 m | Čl. 7 st. 1 t. 16 | Potreban pregledan rectangle-fit evaluator i značenje osa |
| 65 | Označena pristupačna kabina lifta 1.10 x 1.40 m | Čl. 9 st. 1 t. 2 | Potreban pregledan evaluator unutrašnjeg slobodnog pravougaonika |
| 66 | Slobodan prilaz označenom pristupačnom liftu 1.50 x 2.00 m | Čl. 9 st. 1 t. 1 | Potrebna veza vrata/prilaz i pregledan evaluator |
| 67 | Slobodan krug za okretanje kolica u pristupačnom WC, prečnik 1.50 m | Čl. 20 st. 1 t. 12 | Potreban circle-fit sa stvarnim preprekama |
| 68 | Slobodan krug za okretanje kolica u pristupačnom radnom prostoru, prečnik 1.50 m | Čl. 19 st. 4 t. 1 | Potreban circle-fit sa nameštajem i vratima |
| 69 | Odstojanje odgovarajuće ivice ručnih vrata od ugla/prepreke najmanje 0.50 m | Čl. 17 st. 5 | Potreban pregledan evaluator strane kvake i odstojanja |

Precizni izvorni tekstovi su sačuvani u `fixtures/regulations/provisions-004.json`, a pravila u `rules-004.json`. Povezani isečci odobrenih 26 pravila su SOURCE_VERIFIED na osnovu ovog ljudskog odobrenja. Tekstovi su preuzeti iz postojećeg sačuvanog aktuelnog PIS teksta, ne iz izmišljenih preporuka. Izvor i njegova verzija nisu menjani.

## Šta se stvarno može pročitati

- Dimenzija mora biti kotirana ili izvedena iz ljudski potvrđene razmere. Pikseli sami nisu metri. Nepostojanje kote nije dozvola da se mera proceni i označi potvrđenom.
- Uslov se odnosi na pravi element: odmorište, unutrašnju ravan vrata vetrobrana, prolaz između stvarnih otisaka nameštaja ili koridor vođen stvarnom ogradom. Sama širina prostorije nije dovoljna.
- Potrebno je potvrditi semantičke podtipove. Npr. pravilo dužine odmorišta ne tvrdi da se zakonski okidač za njegovo postojanje uvek može utvrditi iz jedne nepotpune osnove.
- Slobodan krug nije isto što i bbox prostorije 1.50 x 1.50 m. Potrebni su granice prostorije, oprema, nameštaj i relevantno otvaranje vrata. Kandidat se ne svodi na proveru jedne širine.
- Pravougaoni prostor se proverava kao slobodan prostor sa obe dimenzije i pravilnom orijentacijom. Ne proglašavati ga dokazanim na osnovu dve nepovezane dužine iz crteža.
- Broj korisnika, visine i nagibi mogu ponekad biti eksplicitno označeni na osnovi. Bez takvih potvrđenih oznaka ne računaju se kao neposredno čitljiv geometrijski ulaz. Zato su izdvojeni u posebne režime i nisu u strogoj listi.
- Postojeća pravila širine vrata, koridora, stepenišnih krakova, rampi, ulaznih platformi i vetrobrana zadržavaju originalne pravne uslove. Ulazna dostupnost iz tlocrta ne znači automatsku pravnu primenljivost.

## Kod za Runtime tim

Novi modul je zaseban opt-in pogled; postojeći Runtime adapter nije menjan.

```ts
import {
  getFloorPlanCatalogue,
  getFloorPlanRules,
  getActiveFloorPlanRules,
} from "./src/rules/registry/floor-plan";

const reviewCatalogue = getFloorPlanCatalogue(); // svih 35 sa oznakom potrebnog ulaza
const drawingReview = getFloorPlanRules();      // 26 zapisa za neposrednu 2D geometriju
const executable = getActiveFloorPlanRules("2026-10-30"); // trenutno []
```

`getFloorPlanRules` je lista od 26 ljudski odobrenih, još neaktivnih pravila. **Ne prosleđivati je kao da je aktivan skup.** `getActiveFloorPlanRules` prvo primenjuje postojeće source/lifecycle/date gates pa ograničava rezultat na strogu 2D listu. Ne aktivira pravila i ne tvrdi da su mere već izdvojene.

Runtime vlasnik može da koristi taj filter u getActiveRules metodi svog RegistryPort-a. Time se ne menja transport ili persistence ugovor. `snapshot` može zadržati ceo audit katalog, uz odvojeno prikazivanje režima ulaza iz `getFloorPlanCatalogue`.

U JSON katalogu `floor-plan-catalogue.json` režimi su PLAN_GEOMETRY, PLAN_GRAPH, PLAN_ANNOTATIONS i EXTRA_DOCUMENTATION. Ovo nisu novi engine statusi ili životni ciklusi pravila. `engineSupported` označava samo podršku tipa evaluatora, ne raspoloživost potvrđene geometrije, ljudsko odobrenje ili aktivaciju.

## Testiranje i predaja

- Dodato je 55 novih fixture scenarija, uključujući odsutne/nepotvrđene mere, nedostajući javni kontekst i odbijanje neaktivnih originala.
- Testovi potvrđuju svih 35 klasifikacija ulaza i da stroga lista nema HEIGHT_M, RISE_M, SLOPE_RATIO ili FLOOR_COUNT provere.
- Šest nepotpunih evaluatora se testira kao NEEDS_REVIEW / EVALUATOR_UNAVAILABLE na test-only kopiji, bez izmišljanja numeričkih ishoda ili upisivanja test reviewera.
- Regulatorni testovi: 322/322 prolazi. Ceo repozitorijum: 407/407 prolazi. Lint, TypeScript i završni produkcioni build prolaze.

```sh
node --import tsx --test tests/regulatory/*.test.ts
node --import tsx src/rules/registry/handoff-004-example.ts
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Paket za pregled i predaju je `docs/regulations/004-floor-plan-handoff.zip`, sa checksum-om i SHA256SUMS manifestom. Uključuje ceo regulatorni snapshot 001–004 i ovo uputstvo. Stariji ZIP-ovi ostaju istorija.

Korisnik je odobrio Git predaju ovog paketa na regulatornu granu i main, uz ponovno povlačenje main-a. Aktivacija pravila nije deo te predaje. Ljudska provera odabranih 26 pravila evidentirana je kao odobrenje korisnika Petar Popovic. Geometry/Runtime vlasnici još treba da potvrde podtipove, reprezentaciju slobodnih prostora i šest nedostajućih evaluatora pre zasebne aktivacije.


## Approved by Petar Popovic — odobrenih 26 provera

Odobrenje je dato u ovom razgovoru i vezano za konkretne verzije, izvore, odredbe i test primere. AI review JSON fajlovi i ranije arhive ostaju istorijski zapisi; ne predstavljaju trenutni lifecycle.

| Pravilo | Approved by | Stanje |
| --- | --- | --- |
| `00100000-0000-4000-8000-000000000010` — Ширина коридора између фиксних елемената намештаја | Petar Popovic | HUMAN_VERIFIED |
| `00200000-0000-4000-8000-000000000011` — Апсолутни минимум ширине надземног евакуационог ходника | Petar Popovic | HUMAN_VERIFIED |
| `00200000-0000-4000-8000-000000000012` — Апсолутни минимум ширине надземног евакуационог степенишног крака | Petar Popovic | HUMAN_VERIFIED |
| `00200000-0000-4000-8000-000000000013` — Минимална ширина приступачног надземног степенишног крака | Petar Popovic | HUMAN_VERIFIED |
| `00300000-0000-4000-8000-000000000030` — Дубина газишта појединачног приступачног степеника | Petar Popovic | HUMAN_VERIFIED |
| `00300000-0000-4000-8000-000000000031` — Чиста ширина једносмерне једнокраке приступачне рампе | Petar Popovic | HUMAN_VERIFIED |
| `00300000-0000-4000-8000-000000000032` — Чиста ширина двокраке приступачне рампе | Petar Popovic | HUMAN_VERIFIED |
| `00300000-0000-4000-8000-000000000033` — Ширина кратког једносмерног приступачног пролаза | Petar Popovic | HUMAN_VERIFIED |
| `00300000-0000-4000-8000-000000000034` — Светла ширина унутрашњих приступачних врата по члану 22 | Petar Popovic | HUMAN_VERIFIED |
| `00300000-0000-4000-8000-000000000035` — Светла ширина улазних приступачних врата по члану 22 | Petar Popovic | HUMAN_VERIFIED |
| `00300000-0000-4000-8000-000000000036` — Светла ширина врата приступачног WC | Petar Popovic | HUMAN_VERIFIED |
| `00300000-0000-4000-8000-000000000037` — Чист отвор врата означеног приступачног лифта | Petar Popovic | HUMAN_VERIFIED |
| `00300000-0000-4000-8000-000000000038` — Слободна ширина платоа испред приступачног улаза | Petar Popovic | HUMAN_VERIFIED |
| `00300000-0000-4000-8000-000000000039` — Слободна дубина платоа испред приступачног улаза | Petar Popovic | HUMAN_VERIFIED |
| `00300000-0000-4000-8000-000000000040` — Дубина ветробрана са вратима која се отварају у истом смеру | Petar Popovic | HUMAN_VERIFIED |
| `00300000-0000-4000-8000-000000000041` — Дубина ветробрана када се оба врата отварају ка ветробрану | Petar Popovic | HUMAN_VERIFIED |
| `00400000-0000-4000-8000-000000000060` — Дужина означеног одморишта приступачне рампе | Petar Popovic | HUMAN_VERIFIED |
| `00400000-0000-4000-8000-000000000061` — Продужетак приступачног ветробрана иза унутрашњих врата | Petar Popovic | HUMAN_VERIFIED |
| `00400000-0000-4000-8000-000000000062` — Ширина простора за кретање око намештаја у приступачном радном простору | Petar Popovic | HUMAN_VERIFIED |
| `00400000-0000-4000-8000-000000000063` — Ширина приступног коридора усмереног оградом | Petar Popovic | HUMAN_VERIFIED |
| `00400000-0000-4000-8000-000000000064` — Слободан правоугаоник подеста двокраке рампе 150 са 170 cm | Petar Popovic | HUMAN_VERIFIED |
| `00400000-0000-4000-8000-000000000065` — Слободне димензије означене приступачне кабине лифта 110 са 140 cm | Petar Popovic | HUMAN_VERIFIED |
| `00400000-0000-4000-8000-000000000066` — Слободан прилаз означеном приступачном лифту 150 са 200 cm | Petar Popovic | HUMAN_VERIFIED |
| `00400000-0000-4000-8000-000000000067` — Круг за окретање колица у приступачном WC пречника 150 cm | Petar Popovic | HUMAN_VERIFIED |
| `00400000-0000-4000-8000-000000000068` — Круг за окретање колица у приступачном радном простору пречника 150 cm | Petar Popovic | HUMAN_VERIFIED |
| `00400000-0000-4000-8000-000000000069` — Одстојање ивице ручних врата од угла или препреке најмање 50 cm | Petar Popovic | HUMAN_VERIFIED |

Odobrenje ne potvrđuje da nedostajući kod već postoji: šest geometrijskih evaluatora ostaje tehnička blokada. Originalni 001 zapis ostaje sa prvobitnim datumom odobrenja; novo odobrenje obuhvata i njegovu potvrdu. Ostalih devet pravila nema novog approvedBy zapisa. Nisu menjani izvorni dokumenti, aritmetika evaluatora ili test-only identiteti.


## Priprema merge-a

Pre predaje uključen je origin/main `3274c40`; 407/407 testova, lint i TypeScript prolaze na kombinovanom kodu. Završni build je ponovo proveren. Svih 26 PLAN_GEOMETRY pravila ima approvedBy Petar Popovic i HUMAN_VERIFIED, ostalih devet nema ovo odobrenje, a nula pravila je ACTIVE. Konačni commit je naveden u Git istoriji i završnom izveštaju korisniku.
