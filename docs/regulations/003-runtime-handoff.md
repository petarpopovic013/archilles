# 003 — Prošireni katalog: 25 regulatornih pravila

> Novije korisnikovo pojašnjenje ograničava prioritet na mere čitljive iz 2D tlocrta. Pogled 004 je u `004-floor-plan-handoff.md`: stroga lista ima 26 zapisa, dok je ceo istorijski registar proširen na 35. Ovaj dokument opisuje prethodni paket 003.

## Isporučeno

Dodato je dvadeset pravila na prethodnih pet. To su zasebne dimenzione ili uslovne provere, ne tvrdnja da je automatizovano 25 različitih članova ili kompletna usklađenost objekta.

- **20 pravila** ima definiciju podržanu postojećim evaluatorima; sva i dalje zahtevaju odgovarajuće odobrenje i zasebnu aktivaciju.
- **5 složenih kandidata** zahteva posebne evaluatore i potvrđene dodatne ulaze. Nisu predstavljeni kao izvršive provere.
- Lifecycle zbir: jedno prethodno `HUMAN_VERIFIED`, devetnaest `AI_REVIEWED` i pet `CANDIDATE`; **nula ACTIVE**.
- Registar sadrži 67 zapisa odredaba, uz tri verzionisana zapisa izvora iz dve oblasti. Ponovljene iste odredbe su referencirane postojećim ID-jem, bez dupliranja persistence ključeva.

Početna revizija pre dodatnog povlačenja: `1bcebf0acae0146cb6be723f86609a4604ebbbfb`. Uključeni `origin/main`: `22820896c156b52751cef59e8d8272474e4415e4`. Zatečene necommitovane izmene 002 sačuvane su i uključene u ovaj paket; `.idea/vcs.xml` nije menjan.

## Pregled svih pravila

Sufiks ID-ja se čita zajedno sa prefiksom paketa. Puni UUID-jevi i verzije nalaze se u `rules.json`, `rules-002.json` i `rules-003.json`.

| Paket / sufiks | Provera | Odredba | Definicija | Stanje |
| --- | --- | --- | --- | --- |
| 001 / 10 | Ширина коридора између фиксних елемената намештаја | pristupačnost, čl. 1 | MIN 0.9 m | HUMAN_VERIFIED |
| 002 / 11 | Апсолутни минимум ширине надземног евакуационог ходника | požar, čl. 29 st. 3 | MIN 1.2 m | AI_REVIEWED |
| 002 / 12 | Апсолутни минимум ширине надземног евакуационог степенишног крака | požar, čl. 29 st. 3 | MIN 1.0 m | AI_REVIEWED |
| 002 / 13 | Минимална ширина приступачног надземног степенишног крака | pristupačnost, čl. 8 st. 1 t. 1 | MIN 1.2 m | AI_REVIEWED |
| 002 / 14 | Максимална висина појединачног степеника | pristupačnost, čl. 8 st. 1 t. 2 | MAX 0.15 m | AI_REVIEWED |
| 003 / 30 | Дубина газишта појединачног приступачног степеника | pristupačnost, čl. 8 st. 1 t. 2 | MIN 0.33 m | AI_REVIEWED |
| 003 / 31 | Чиста ширина једносмерне једнокраке приступачне рампе | pristupačnost, čl. 7 st. 1 t. 4 | MIN 0.9 m | AI_REVIEWED |
| 003 / 32 | Чиста ширина двокраке приступачне рампе | pristupačnost, čl. 7 st. 1 t. 4 | MIN 1.5 m | AI_REVIEWED |
| 003 / 33 | Ширина кратког једносмерног приступачног пролаза | pristupačnost, čl. 14 st. 1 | MIN 0.9 m | AI_REVIEWED |
| 003 / 34 | Светла ширина унутрашњих приступачних врата по члану 22 | pristupačnost, čl. 22 st. 1 t. 1 | MIN 0.81 m | AI_REVIEWED |
| 003 / 35 | Светла ширина улазних приступачних врата по члану 22 | pristupačnost, čl. 22 st. 1 t. 1 | MIN 0.91 m | AI_REVIEWED |
| 003 / 36 | Светла ширина врата приступачног WC | pristupačnost, čl. 20 st. 1 t. 1 | MIN 0.9 m | AI_REVIEWED |
| 003 / 37 | Чист отвор врата означеног приступачног лифта | pristupačnost, čl. 9 st. 1 t. 3 | MIN 0.8 m | AI_REVIEWED |
| 003 / 38 | Слободна ширина платоа испред приступачног улаза | pristupačnost, čl. 13 st. 2 t. 1 | MIN 1.5 m | AI_REVIEWED |
| 003 / 39 | Слободна дубина платоа испред приступачног улаза | pristupačnost, čl. 13 st. 2 t. 1 | MIN 1.5 m | AI_REVIEWED |
| 003 / 40 | Дубина ветробрана са вратима која се отварају у истом смеру | pristupačnost, čl. 13 st. 2 t. 2 | MIN 2.4 m | AI_REVIEWED |
| 003 / 41 | Дубина ветробрана када се оба врата отварају ка ветробрану | pristupačnost, čl. 13 st. 2 t. 2 | MIN 3 m | AI_REVIEWED |
| 003 / 42 | Висина прага унутрашњих приступачних врата | pristupačnost, čl. 22 st. 1 t. 2 | MAX 0.02 m | AI_REVIEWED |
| 003 / 43 | Нагиб стандардне приступачне рампе од 5 процената | pristupačnost, čl. 7 st. 1 t. 1 | MAX 0.05 ratio | AI_REVIEWED |
| 003 / 44 | Минимална висина евакуационих врата пословног објекта | požar, čl. 34 st. 4 | MIN 2 m | AI_REVIEWED |
| 003 / 45 | Број првих излаза просторије према броју лица | požar, čl. 31 | Potreban poseban evaluator | CANDIDATE |
| 003 / 46 | Ширина врата просторије према њеном броју лица | požar, čl. 34 | Potreban poseban evaluator | CANDIDATE |
| 003 / 47 | Дужина пута до првог излаза зависно од броја излаза | požar, čl. 32 | Potreban poseban evaluator | CANDIDATE |
| 003 / 48 | Капацитет степеништа према броју лица и повезаних етажа | požar, čl. 36 | Potreban poseban evaluator | CANDIDATE |
| 003 / 49 | Условни нагиб рампе са изузетком кратке стрме рампе | pristupačnost, čl. 7 | Potreban poseban evaluator | CANDIDATE |

## Granice i važni uslovi

Sva nova pravila ostaju u podskupu novih poslovnih objekata u RS (`OFFICE`, `CONCEPT/DESIGN`, potvrđeno `isNewBuild`). Požarne provere koriste potvrđenu klasifikaciju ИП1/НП1 i visinu 0–10 m, uz pregled isključenja čl. 1–3. To nisu univerzalna pravila za sve tipove objekata. Nepoznat kontekst ne sme se zameniti podrazumevanim vrednostima.

- Širine su svetle, upotrebljive širine sa dokazima, ne širine bbox-a ili razmaci u pikselima bez potvrđene razmere.
- Uslovi za jedan smer, kratko rastojanje, način otvaranja vrata, odabrani pristupačni ulaz ili lift i grananje rampe moraju se posebno potvrditi. Odredbe koje dozvoljavaju najmanje jednu pristupačnu alternativu ne primenjuju se kao univerzalni pad za sve ostale elemente.
- Članovi 17, 20 i 22 propisa pristupačnosti imaju različite kontekste širine vrata. Provera 81/91 cm iz čl. 22 ne potiskuje stroži zahtev drugog primenljivog člana. Svaki rezultat je samo rezultat svog imenovanog uslova.
- Širina i dubina platforme su dve nezavisne ose. PASS za jednu osu ne potvrđuje zahtev 150 x 150 cm kao celinu. Isto važi za širinu vrata i visinu praga.
- `RUN_M` za stepenik znači dubinu jednog gazišta, za ulaznu platformu dubinu te platforme, a za vetrobran njegovu slobodnu dubinu. Ne mešati sa dužinom evakuacione putanje. Tačno značenje je dato uz svaki podtip u katalogu.
- `RISE_M` za prag je njegova visina iznad završenog poda; za pojedinačni stepenik njegova visina. Nepostojanje praga može biti potvrđena nula; odsutan podatak nikada nije nula.
- `SLOPE_RATIO` je odnos rise/run. Pet procenata je **0.05**, ne broj 5 niti ugao u stepenima. Posebno pravilo standardne rampe ne proglašava sve izuzetne rampe neispravnim.
- Požarni apsolutni minimum širine ne potvrđuje dovoljnu propusnost za broj ljudi. Pravilo visine vrata od 2 m vezano je za poslovni, ne javni objekat.
- Nema zamene sobnog broja ljudi ukupnim brojem ljudi projekta. COUNT i FLOOR_COUNT za poseban evaluator imaju lokalno značenje, ne automatski značenje broja etaža čitave zgrade.

## Pet blokiranih kandidata

| Kandidat | Šta nedostaje |
| --- | --- |
| Број првих излаза просторије према броју лица | Verified occupants of this room, not project total; Distinct confirmed FIRST_EXIT elements belonging to this room through validated relations; A reviewed per-room counting evaluator; global COUNT_MIN is insufficient |
| Ширина врата просторије према њеном броју лица | Door-to-room relationship and room-level occupant count, never Project.occupantCount; Reviewed handling of source intervals and the uncovered exact boundary of 50 occupants; Room purpose and applicability confirmed |
| Дужина пута до првог излаза зависно од броја излаза | Validated traversability graph with wall/door connectivity; Confirmed room FIRST_EXIT count and exact route start/end; No straight-line path through walls; reviewed 20/45 m branch selection |
| Капацитет степеништа према броју лица и повезаних етажа | Original HTML table 5 cell-wise review (flattened text is insufficient); Occupants assigned to this stair and floors served by this stair, not whole-project totals; Reviewed table lookup and boundary/unsupported-value policy; no invented interpolation |
| Условни нагиб рампе са изузетком кратке стрме рампе | Explicit reviewed evidence that 5-percent ramp is not feasible; no shared allowlisted field currently exists; Confirmed route length up to 6 m for the exceptional 8.3-percent branch; Reviewed relation between verified rise/run, total rise, ramp layout and source exceptions |

Ovi kandidati koriste `REVIEWED_EVALUATOR` sa eksplicitnim ID-jem i verzijom. Implementacije nisu registrovane u engine-u i ovim zadatkom se ne menjaju njegovi fajlovi. Čak i na test-only aktiviranoj kopiji sa imenovanim merama, rezultat je `NEEDS_REVIEW / EVALUATOR_UNAVAILABLE`, ne PASS/FAIL. Originalni neaktivni zapis engine odbija pre izvršavanja.

Za širinu vrata prema broju ljudi ne izmišljati ishod za granicu 50 lica: tekst navodi do 10, više od 10 a manje od 50, kao i zasebne naredne uslove. Za kapacitet stepeništa pregledati originalnu HTML tabelu 5 po ćelijama; spljošten tekst nije zamena za strukturu tabele. Za evakuacionu putanju obavezan je validiran graf bez prolaska kroz zidove. Za izuzetni nagib rampe nedostaje odobren, tipizovan dokaz da standardnih 5% nije izvodljivo; zajednička šema nije proširena proizvoljnim poljem.

## Dokazi i pregled

PIS sadržaji oba izvora ponovo su preuzeti i njihovi SHA-256 se podudaraju sa ranije sačuvanim zvaničnim bajtovima. Zapis je `003-source-check.json`. Nijedna pretpostavljena izmena ili datum nisu dodati. Jedanaest novih preciznih izvoda je u `provisions-003.json`, a ostala već postojeća identična mesta su referencirana svojim ID-jevima. Novi izvodi ostaju UNVERIFIED do zasebnog ljudskog pregleda.

AI pregled i otvorene stavke su u `003-ai-review.json`; tehnička spremnost i tačno značenje metrike/podtipa po pravilu u `rule-catalogue-003.json`. Novi modeli nisu predstavljeni kao ljudski odobreni i raniji `human-review.json` iz 001 nije promenjen. Nisu pokretani lažni ingestion agenti niti izmišljeni run zapisi.

## Geometry ugovor za nove podržane provere

| ID / podtip | Metrika i značenje |
| --- | --- |
| 003/30 — `ABOVE_GROUND_STAIR_STEP` | `RUN_M`: RUN_M is the horizontal tread depth of one step, not flight run or step rise. |
| 003/31 — `ACCESSIBLE_ONE_WAY_SINGLE_FLIGHT_RAMP` | `CLEAR_WIDTH_M`: Only a reviewed one-way, non-switchback ramp; do not apply 0.9 m to a two-flight ramp. |
| 003/32 — `ACCESSIBLE_TWO_FLIGHT_RAMP` | `CLEAR_WIDTH_M`: Only the clear ramp width dimension; landing dimensions and all other ramp conditions remain separate. |
| 003/33 — `ACCESSIBLE_DESIGNATED_SHORT_ONE_WAY_PASSAGE` | `CLEAR_WIDTH_M`: Human must confirm short-distance, one-way movement and designated accessible route. Article 14 paragraph 2 permits an alternative designated route; do not apply this rule to every corridor. |
| 003/34 — `ACCESSIBLE_INTERNAL_DOOR_ART22` | `CLEAR_WIDTH_M`: Article 22 dimension only; articles 17 and 20 can impose different or stronger contextual requirements. Do not resolve precedence by choosing the smaller threshold. |
| 003/35 — `ACCESSIBLE_ENTRANCE_DOOR_ART22` | `CLEAR_WIDTH_M`: Article 22 entrance dimension only; article 13 and public-building conditions require separate review. |
| 003/36 — `DESIGNATED_ACCESSIBLE_WC_DOOR` | `CLEAR_WIDTH_M`: Only a door of the designated accessible WC. Outward opening, safety hardware and number of accessible cabins are not checked. |
| 003/37 — `DESIGNATED_ACCESSIBLE_LIFT_CABIN_DOOR` | `CLEAR_WIDTH_M`: Door of a human-designated accessible lift only; not all lift doors. Article 9 permits at least one qualifying lift where multiple lifts serve the rise. |
| 003/38 — `DESIGNATED_ACCESSIBLE_ENTRANCE_LANDING` | `CLEAR_WIDTH_M`: One axis of the required 1.5 x 1.5 m level platform. Does not prove its depth or level surface. Multiple-entrance selection must be confirmed by a human. |
| 003/39 — `DESIGNATED_ACCESSIBLE_ENTRANCE_LANDING` | `RUN_M`: Other independent horizontal axis of the required platform. RUN_M is clear platform depth, not route length or width. |
| 003/40 — `ACCESSIBLE_VESTIBULE_SAME_DIRECTION` | `RUN_M`: Only a vestibule that exists and has confirmed same-direction external and internal doors. RUN_M is clear vestibule depth. |
| 003/41 — `ACCESSIBLE_VESTIBULE_BOTH_INWARD` | `RUN_M`: Only confirmed external and internal doors both opening into the vestibule; do not assume the same-direction case. |
| 003/42 — `ACCESSIBLE_INTERNAL_DOOR_ART22` | `RISE_M`: RISE_M is the actual threshold height above adjacent finished floor, not total door height. A confirmed absent threshold is zero; missing evidence is not zero. |
| 003/43 — `CONFIRMED_STANDARD_FIVE_PERCENT_RAMP` | `SLOPE_RATIO`: Standard branch only, explicitly confirmed by a human; not a universal cap for exceptional ramps. SLOPE_RATIO is rise/run: 5 percent is 0.05, not 5 or degrees. Exception branch remains a separate blocked evaluator. |
| 003/44 — `ABOVE_GROUND_OFFICE_EVACUATION_DOOR` | `HEIGHT_M`: Business-class door only; not a public-building door (which has a different minimum in the same paragraph). Door width and opening direction remain separate checks. |

Podtipovi su predlozi kroz postojeće string polje, ne nova zajednička schema. Geometry tim treba da ih potvrdi i ne dodeljuje automatski kada je njihov semantički uslov nepoznat. Provere koje se odnose na isti element koriste isti podtip gde je kontekst isti (npr. širina i prag unutrašnjih vrata). Dok ulaz nije podržan ili potvrđen, konkretna provera ne može dati pouzdan numerički ishod.

## Adapter i predaja Runtime timu

Runtime tim je u međuvremenu integrisao adapter za postojeći `RegistryPort`. Naš raniji ulaz ostaje kompatibilan i delegira njihovoj jedinoj implementaciji:

```ts
import { createRegulatoryRegistry } from "../src/rules/registry/runtime-adapter";

// Runtime već koristi runtime/adapters/registry.ts; ovaj import je kompatibilan alias:
const registry = createRegulatoryRegistry();
```

Adapter vraća Promise metode `getActiveRules(asOf)`, `selectApplicableRules(project, elements, rules)` i `snapshot()`, sa istim ugovorom iz `runtime/ports.ts`. Snapshot sadrži sve izvore, pravila i broj odredaba; to je katalog, ne aktivna pokrivenost. Rezultati snapshot-a se kopiraju da potrošač ne bi mutirao seed. `runtime/main.ts` sada već koristi `runtime/adapters/registry.ts`. Naš `src/rules/registry/runtime-adapter.ts` re-eksportuje isti adapter i ne duplira logiku. Runtime adapter projektuje istorijske opservacije u tekuću reviziju bez promene zapisa; naš direktni selektor ostaje strog prema svojim ulaznim revizijama. Runtime fajlovi nisu menjani u regulatornom paketu.

Ljudsko odobrenje, dostupnost ulaza i evaluatora i zasebna aktivacija ostaju uslovi za live numeričke provere. Adapter ne aktivira nijedno pravilo. Nepoznati izuzeci u postojećem engine-u i dalje imaju ranije dokumentovanu razliku u odnosu na plan; novi složeni izuzeci zato nisu prebačeni u jednostavne MIN/MAX modele.

## Izvršene provere

- **176 novih fixture primera** u `rule-cases-003.json`; ukupno 227 deklarisanih primera sa paketima 001 i 002.
- **264 regulatorna testa prolaze**; kompletan repozitorijum: **348/348 prolazi**, uključujući novi Runtime kod povučen sa main-a.
- `npm run lint`, `npx tsc --noEmit` i završni `npm run build` prolaze, uključujući sve nove API rute sa povučenog main-a.
- Izvršiv primer prikazuje 25 pravila, 67 odredaba, nula aktivnih, 15 novih engine-podržanih modela i pet blokiranih kandidata.
- Numerika se proverava kroz postojeći engine na test-only kopijama sa drugim ID-jevima; nikakav test reviewer nije upisan u registar. Blokirane grane se testiraju kao NEEDS_REVIEW, a ne lažno kao prođeni numerički scenariji.

```sh
node --import tsx --test tests/regulatory/*.test.ts
node --import tsx src/rules/registry/handoff-003-example.ts
npm test
npx tsc --noEmit
npm run lint
npm run build
```

## Paket za prosleđivanje

`docs/regulations/003-runtime-handoff.zip` je zbirni snapshot regulatornih modula i podataka iz 001, 002 i 003, testova i uputstava. Sadrži unutrašnji SHA256SUMS manifest i ima zaseban `.zip.sha256` checksum. Arhive 001/002 ostaju istorija i ne treba ih prepisivati preko novijeg paketa.

Nisu menjani dependency/lockfile, zajedničke šeme, engine evaluatori, API, Runtime ili Geometry fajlovi. Korisnik je eksplicitno odobrio commit, push na `feat/regulatory-intelligence`, merge na main i ponovno usklađivanje regulatorne grane. Aktivacija pravila i slanje poruka drugim članovima tima nisu odobreni ovim Git zahtevom niti izvršeni u paketu.

Poruka za tim:

> Regulatory paket 003 proširuje katalog na 25 pravila iz oba propisa. Dvadeset modela koristi postojeće evaluatore, a pet složenih kandidata ima eksplicitno popisane nedostajuće ulaze/evaluatore. Nema automatske aktivacije. Uključeni su izvori, 67 odredaba, podtipovi i semantika mera, 176 novih fixture primera i RegistryPort adapter usklađen sa već integrisanim Runtime adapterom. Svih 348 testova prolazi. Molimo Geometry potvrdu ulaza, Runtime pregled adaptera i pet blokiranih evaluatora, a ljudsko odobrenje novih tumačenja vodi Regulatory tim.


## Završna priprema Git predaje

Pre commita uključen je `origin/main` na reviziji `4cc5772`, uz očuvanje svih regulatornih izmena 002/003. Izvršeno je `npm ci` prema lockfile-u sa main-a. Na kombinovanom kodu prolazi 348/348 testova, lint i TypeScript; build je ponovo proveren pre Git predaje. Git operacije ne menjaju lifecycle: jedno HUMAN_VERIFIED, devetnaest AI_REVIEWED, pet CANDIDATE, nula ACTIVE. Završni merge commit je dostupan u Git istoriji i izveštaju korisniku.
