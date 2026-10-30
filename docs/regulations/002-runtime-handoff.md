# 002 — Četiri dodatna pravila za Regulatory intelligence

> Najnoviji zbirni katalog je `003-runtime-handoff.md` (25 pravila). Ovaj dokument zadržava opis ranijeg paketa; njegovi brojači nisu brojači celog aktuelnog registra.

## Stanje i granice

Početni Git commit: `1bcebf0acae0146cb6be723f86609a4604ebbbfb`. Grana: `feat/regulatory-intelligence`. `origin/main` je proveren i uključen pre rada; nije bilo dodatnih promena za spajanje. Zatečeni `.idea/vcs.xml` nije menjan.

Registar sada sadrži **pet pravila** iz obe oblasti: prethodno odobreno pravilo 001 (`HUMAN_VERIFIED`) i **četiri nova `AI_REVIEWED` pravila**. Ranija korisnikova provera nije proširena na nova pravila. Nijedno pravilo nije aktivirano; `getActiveRules` i dalje vraća prazan niz. Zadatak ne dodaje UI, API, nove zavisnosti, engine logiku, runtime agente ili zajedničke tipove.

## Pravila za pregled

Svi novi rule ID-jevi imaju prefiks `00200000-0000-4000-8000-`, verziju 1. Puni ID-jevi su u `fixtures/regulations/rules-002.json`.

| Završetak ID-ja | Provera | Izvor i tačna odredba | Metrika / evaluator | Podtip elementa |
| --- | --- | --- | --- | --- |
| `000000000011` | Apsolutni minimum evakuacionog hodnika: 1.20 m | Požar 22/2019, čl. 29 st. 3 | `CLEAR_WIDTH_M`, `MIN 1.2 m` | `CORRIDOR / ABOVE_GROUND_EVACUATION_CORRIDOR` |
| `000000000012` | Apsolutni minimum evakuacionog stepenišnog kraka: 1.00 m | Požar 22/2019, čl. 29 st. 3 | `CLEAR_WIDTH_M`, `MIN 1.0 m` | `STAIR / ABOVE_GROUND_STAIR_FLIGHT` |
| `000000000013` | Širina pristupačnog stepenišnog kraka: 1.20 m | Pristupačnost 22/2015 + 10/2026, čl. 8 st. 1 t. 1; unutrašnje stepenice povezane čl. 15 | `CLEAR_WIDTH_M`, `MIN 1.2 m` | `STAIR / ABOVE_GROUND_STAIR_FLIGHT` |
| `000000000014` | Visina jednog stepenika: najviše 0.15 m | Isti izvor, čl. 8 st. 1 t. 2 | `RISE_M`, `MAX 0.15 m` | `STAIR / ABOVE_GROUND_STAIR_STEP` |

Tačan originalni požarni tekst: „Ширина ходника не сме бити мања од 1,2 m, а ширина степенишног крака не мања од 1 m. Потребна ширина ходника и степеништа зависи од броја лица која треба да се евакуишу.”

Tačne tačke pristupačnosti: „1) најмања ширина степенишног крака буде 120 cm;” i „2) најмања ширина газишта буде 33 cm, а највећа дозвољена висина степеника буде 15 cm;”. U ovom paketu ne dodajemo proveru dubine gazišta od 33 cm; očuvana je cela tačka radi konteksta.

**Granica značenja rezultata:** PASS požarnog pravila znači samo zadovoljavanje navedenog apsolutnog minimuma. Ne potvrđuje dovoljnu propusnost za konkretan broj ljudi ili ispunjenje ostatka propisa. Prepreke se moraju uzeti u obzir pri potvrdi efektivne slobodne širine; sama širina poda ili bbox nije dovoljna. PASS jedne mere pristupačnosti ne potvrđuje sve zahteve za stepenište.

## Primena i potrebni dokazi

- Sva četiri pravila su ograničena na nove poslovne projekte u RS: `purpose: OFFICE`, `phase: CONCEPT/DESIGN`, `characteristics.isNewBuild: true`, odgovarajući tip i potvrđen podtip elementa. Rekonstrukcija i podzemni elementi nisu deo ovog podskupa. `NOT_APPLICABLE` znači van ovog pravila, ne da na taj projekat ne važi nijedan propis.
- Požarna pravila dodatno traže proverenu požarnu klasifikaciju **`ИП1` ili `НП1`**, tačno ćiriličnim oznakama iz čl. 7, i `buildingHeightM` u opsegu 0–10 m. OFFICE nije zamena za požarnu klasifikaciju. Visina mora pratiti definiciju iz čl. 4, a ne proizvoljnu ukupnu visinu fasade.
- Osoba koja potvrđuje požarnu klasifikaciju i podtip mora proveriti obuhvat čl. 1–3: ne dodeljivati ih isključenim visokim, plutajućim ili ugostiteljskim objektima za ishranu/piće, niti nepoznatim ili isključenim podzemnim delovima. Ne izvoditi obuhvat iz samog broja širine, filename-a ili podrazumevanih projektnih vrednosti.
- `ABOVE_GROUND_STAIR_FLIGHT` je zajednički podtip za oba pravila širine kraka. Isti element može zadovoljiti minimum 1.00 m i ne zadovoljiti minimum 1.20 m. Nisu potrebni duplikati geometrije za različite propise.
- `ABOVE_GROUND_STAIR_STEP` označava **jedan pojedinačni stepenik**, sa `relationIds` vezom ka roditeljskom kraku. `RISE_M` je visina tog stepenika, nikada visinska razlika celog kraka ili prosek svih stepenika. Jedan provereni stepenik ne predstavlja proveru svih ostalih.
- Geometry/Runtime vlasnici treba da potvrde podtipove kao dogovor u postojećem slobodnom `subtype` polju. Nije menjana zajednička šema. Dok podtip ili klasifikacija nisu pouzdano potvrđeni, ne dodeljivati ih automatski; nedostajući kontekst mora ostati UNKNOWN.
- Potrebne su mere u metrima sa dokazima i potvrđenom verifikacijom. Visina stepenika uglavnom nije dokaziva iz samog tlocrta: prihvatljivi su relevantna kota, presek ili korisnikov potvrđen unos. Bez takvog podatka ishod ostaje UNKNOWN.

## Poreklo i pregled

Oba zvanična PIS teksta ponovo su preuzeta tokom rada na 002. SHA-256 sadržaja i PIS `versionGuid` podudaraju se sa već sačuvanim verzijama. Nije uvedena neproverena nova verzija izvora. Zapis sa vremenom provere i URL-ovima je `fixtures/regulations/002-source-check.json`.

Tri nova precizna isečka odredaba su u `provisions-002.json`: jedan požarni stav za oba pravila širine, te dve tačke člana 8. Isečci ostaju `UNVERIFIED` do ljudske potvrde ovih novih zapisa. Izvori i odredbe iz 001 i njihov ljudski zapis nisu menjani. AI pregled četiri nova tumačenja i otvorene stavke su u `002-ai-review.json`.

Nezavisni AI validator ili Mozaik ingestion sesija nisu pokretani; nema izmišljenih agent run-ova. Ostaje ranije dokumentovana razlika engine-a za nepoznate izuzetke, ali nova pravila nemaju zasebne exception conditions koje bi tu granu koristile.

## Testovi i primer poziva

`rule-cases-002.json` sadrži **44 konkretna primera**: prolaz, pad, tačnu granicu, odsutnu i nepotvrđenu meru, pogrešan ili nepoznat podtip, rekonstrukciju izvan podskupa i nedostajući kontekst. Za požarna pravila uključeni su i klasifikacija, visina i isključenje projekata van izabranog podskupa.

Regulatorni testovi izvršavaju numeriku kroz **postojeći engine**, na jasno označenim test-only kopijama sa drugim ID-jevima. To su provere podrške evaluatora i očekivanog ponašanja, bez aktiviranja originalnih pravila ili upisivanja test reviewera u seed. Zasebni testovi potvrđuju da engine odbija sva nova originalna pravila sa `RULE_NOT_ACTIVE`.

```sh
node --import tsx --test tests/regulatory/*.test.ts
node --import tsx src/rules/registry/handoff-002-example.ts
```

Primer je bez AI poziva i stvarnih nalaza nad crtežom; pokazuje četiri nova review pravila, trenutna stanja i engine odbijanje neaktivnih originala. Dva podatkovno različita sintetička ulaza po pravilu daju različite ishode u testovima. To nije tvrdnja o novoj end-to-end analizi dva stvarna crteža.

## Predaja timu

Runtime koristi iste importe iz `src/rules/registry` i `src/rules/applicability`; postojeće funkcije i oblik događaja nisu menjani. `complianceRules` sada ima pet pravila, a `regulationProvisions` 56 zapisa. Inactive review paket ne treba pomešati sa rezultatom `getActiveRules`.

1. Runtime tim pregleda rule JSON i 44 fixture-a, potvrđuje semantiku ulaza i može ponovo izvršiti iste engine probe testove.
2. Geometry tim potvrđuje tri nova podtipa, obuhvat nadzemnog elementa, efektivnu slobodnu širinu i dokaz za visinu pojedinačnog stepenika.
3. Korisnik pregleda četiri nova pravila, tačne odredbe i ograničenja. Odobrenje se beleži zasebno od istorijskog `human-review.json` iz 001.
4. Posle ljudskog odobrenja prelazi se u `HUMAN_VERIFIED`; aktivacija ostaje zaseban koordinisan korak uz rezultate evaluatora. Ne menjati vlasnikove fajlove paralelno.

Paket za slanje: `docs/regulations/002-runtime-handoff.zip`, sa checksum-om i manifestom članova. Sadrži najnoviji regulatorni kod i podatke uključujući 001, bez `.env`, privatnih projekata ili fajlova drugih timova. ZIP 001 ostaje istorijski snapshot i ne koristi se za prepisivanje novih modula.

Git commit/push i spajanje na main nisu deo ove predaje pre korisnikovog odobrenja novih pravila.


## Izvršene završne provere

| Komanda | Rezultat |
| --- | --- |
| `node --import tsx --test tests/regulatory/*.test.ts` | 63/63 prolazi |
| `npm test` | 121/121 prolazi, uključujući postojeće Geometry, Runtime i UI testove |
| `npm run lint` | Prolazi |
| `npx tsc --noEmit` | Prolazi |
| `npm run build` | Prolazi |
| `node --import tsx src/rules/registry/handoff-002-example.ts` | Prolazi; 5 ukupnih pravila, 56 odredaba, 44 nova primera, originali odbijeni pre izvršavanja |
| `git diff --check` | Prolazi za izmenjene praćene fajlove |

## Poruka za prosleđivanje

> Pripremljen je Regulatory paket 002: četiri dodatna AI_REVIEWED pravila, ukupno pet pravila iz obe oblasti. Nova pravila su požarni minimum širine evakuacionog hodnika 1.20 m i kraka 1.00 m, širina pristupačnog kraka 1.20 m i visina pojedinačnog stepenika najviše 0.15 m. Paket sadrži zvanične odredbe, ponovnu proveru verzija, 44 fixture primera, testove kroz postojeći engine i uputstvo. Svih 121 testova prolazi. Potrebno je potvrditi Geometry podtipove i kontekst, pa evidentirati zasebno ljudsko odobrenje i koordinisati aktivaciju. Prvo pravilo iz 001 zadržava postojeće HUMAN_VERIFIED odobrenje. Novi paket još nije commitovan ni spojen na main; za tehnički pregled koristite ZIP ili lokalni diff Regulatory tima.
