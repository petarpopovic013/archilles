# 001 — Dosije zvaničnih izvora i prvo pravilo

Status: završen paket 001 sa korisnikovim ljudskim odobrenjem; jedno pravilo `HUMAN_VERIFIED`. Aktivacija ostaje zaseban korak Runtime tima. Tim: Regulatory intelligence. Grana: `feat/regulatory-intelligence`. Glavni primalac: Runtime + integration.

> **Istorijski presek pre korisnikovog odobrenja (30.10.2026):** zvanični PIS API je uspešno korišćen. Ranije prepreke sa preuzimanjem požarnog teksta i izmene pristupačnosti su otklonjene. Registar sada sadrži tri zapisa izvora (dve oblasti, uključujući istorijsku verziju pristupačnosti), 53 odredbe i jedno pravilo verzije 2 u stanju `AI_REVIEWED`. Najnovije stanje posle ljudskog odobrenja i uputstvo za integraciju nalaze se u `001-runtime-handoff.md`; ostali preseci ispod su istorija. Prethodni zapis implementacije ostaje istorija, a ne aktuelna lista blokada.


## Cilj i očekivani tok

Preuzeti oba zvanična izvora, izdvojiti relevantne regulatorne odredbe, izabrati najjednostavniju proveru i pripremiti jedno verzionisano pravilo do stanja `HUMAN_VERIFIED`. Predati naš paket i primer poziva Runtime timu. Rad počinje odmah nakon odobrenja implementacije; ovaj dokument ne predstavlja izvršeno istraživanje ili odobrenje pravila.

Tok: zvanični dokumenti → proverene verzije i dosije → odredbe sa poreklom → matrica kandidata → jedno formalizovano pravilo → ljudska provera → predaja.

## Uključeno

- Oba izvora iz constitution: protivpožarni propis 22/2019-3 i pristupačnost 22/2015-95 sa navedenom izmenom 10/2026-89. Ove reference su početne tačke; proveriti njihovu aktuelnost i eventualne kasnije izmene.
- Preuzimanje dostupnog zvaničnog dokumenta ili čuvanje dostupnog zvaničnog teksta, sa datumom pristupa, verzijom, publikacijom i SHA-256 stvarno sačuvanog sadržaja. Zabeležiti format i način izdvajanja teksta.
- Izdvajanje relevantnih članova, stavova, tačaka, definicija, izuzetaka i povezanih odredaba za mali poslovni objekat. Svaki izdvojeni tekst vezati za originalnu lokaciju. Nije potrebno strukturirati svaki član oba propisa.
- Dosije oba izvora i matrica kandidata iz obe oblasti; jedno pravilo ukupno, iz bilo koje oblasti, izabrano prema jasnoći izvora, jednostavnosti primenljivosti i podršci postojeće DSL.
- Registar izvora, odredaba i pravila, čista primenljivost, test primeri, dokumentovan zahtev za potrebnim merama i primer poziva za Runtime tim.
- Eksplicitna provera korisnika pre `HUMAN_VERIFIED`; do tada pravilo ostaje kandidat ili `AI_REVIEWED` ako je stvarna AI provera evidentirana.

## Isključeno

- Aktivacija pravila, numerički engine, runtime agenti, API, baza, UI i kompletna integracija do nalaza.
- Dodatna aktivna pravila, opšta ingestion platforma, OCR servis, vektorska baza i automatsko preuzimanje svih srpskih propisa.
- Izmene zajedničkih šema, engine-a, zavisnosti, lockfile-a ili governance dokumenata u ovom zadatku.
- Automatsko odobravanje tumačenja, izmišljeni pragovi, neprovereni citati i predstavljanje kandidata kao izvršive provere.

## Preduslovi i postojeće stanje

- C0 tipovi i Zod šeme postoje u `src/domain/`; regulatorni moduli tek treba da se naprave.
- Lokalna grana je ažurirana sa `origin/main` na commit `009fb64` u trenutku planiranja. Ponovo proveriti stanje pre implementacije.
- Engine već izlaže `evaluateCondition`, `evaluateRules` i tipove trovalentne logike. Ne praviti drugu implementaciju iste logike.
- Potrebni su pristup zvaničnim dokumentima i korisnikova provera originala. Identitet reviewera tražiti pre upisa odobrenja; ne izmišljati ga.
- Pratiti `TEAM.md`: naš kod ostaje u `src/rules/registry/`, `src/rules/applicability/`, `src/rules/sources/`, `fixtures/regulations/`, `tests/regulatory/` i `docs/regulations/`.
- Nove zavisnosti nisu planirane. Ako format dokumenta zahteva dodatni alat u projektu, zahtev sa nazivom i razlogom šalje se Runtime timu.

## Arhitektura i odluke

1. **Odvojiti slojeve.** Sačuvani izvor, izdvojena odredba, kandidat i ljudski provereno pravilo ostaju različiti artefakti. Koristiti `RegulationSource`, `RegulationProvision` i `ComplianceRule` iz zajedničkog domena, bez novih paralelnih enum-a.
2. **Verzija je eksplicitna.** Svaka odredba i pravilo referenciraju konkretan izvor i njegovu verziju. Ne izvoditi datum stupanja na snagu iz datuma objave. Ne menjati istorijski sadržaj tiho.
3. **Zvanični početni URL-ovi:**
   - Požar: https://pravno-informacioni-sistem.rs/SlGlasnikPortal/reg/viewAct/ec3c54bc-de4a-433f-afa8-d9eb44b7dab1
   - Pristupačnost: https://pravno-informacioni-sistem.rs/SlGlasnikPortal/reg/viewAct/512f4f2c-4bc4-4c31-a335-409673b7fac5
4. **Bez dupliranja engine-a.** Modul primenljivosti koristi postojeći `evaluateCondition`. Potvrđen izuzetak isključuje pravilo; nepoznat uslov ili izuzetak ostaje nepoznat i zahteva kontekst. Nikakav prag ne izvršava se u selektoru.
5. **Prvo jednostavno pravilo.** Birati proveru opisivu postojećim `MIN`, `MAX`, `BOOL` ili `COUNT` evaluatorima, bez potrebe za novom šemom ili složenim geometrijskim grafom. Numeričke vrednosti određuju se tek iz originalnog izvora. Uslovne rampe ne pretvarati u univerzalni prag.
6. **Završno stanje je `HUMAN_VERIFIED`.** `getActiveRules` neće vratiti ovo pravilo. Runtime dobija pravilo kroz zaseban direktan izvoz registra za predaju; aktivacija je poseban korak posle provere evaluatora i testova.
7. **Neproveren izvor je vidljiva blokada.** Ako zvanični tekst ili njegovo važenje nisu potvrđeni, sačuvati dostupne činjenice i razlog. Kandidat ostaje neaktivan; takva predaja nije uspešno dostignut `HUMAN_VERIFIED` cilj.

## Interfejsi za predaju

Implementirati direktne izvoze iz naših modula, bez zajedničkog `src/rules/index.ts`:

```ts
getActiveRules(sourceVersionDate: string): ComplianceRule[]

selectApplicableRules(
  project: Project,
  elements: ArchitecturalElement[],
  rules: ComplianceRule[],
): {
  ruleIds: string[];
  explanations: Record<string, string>;
  missingContext: string[];
}
```

- Datum preseka je eksplicitan `YYYY-MM-DD`; ne koristiti skriveni trenutni datum. Vraćati samo potvrđene aktivne verzije za datum. Ako nema aktivnih pravila, rezultat je prazan niz.
- Selekcija za live analizu razmatra samo `ACTIVE` pravila. Zadržava potencijalno primenljiva pravila uz nedostajući kontekst, a izbacuje dokazano neprimenljiva. Rezultat odgovara postojećem događaju `regulation.rules.selected`.
- Registar dodatno izlaže `regulationSources`, `regulationProvisions` i `complianceRules` kao nizove kanonskih tipova, radi predaje i uvida u neaktivna pravila.
- Primer poziva prikazuje pristup pravilu `HUMAN_VERIFIED`, prazan rezultat `getActiveRules` dok nema aktivacije i očekivano engine odbijanje neaktivnog pravila. Ne praviti prečicu za izvršavanje neodobrenih pravila.

## Koraci implementacije

1. **Usaglasiti predaju.** Runtime timu dati plan izvoza i potvrditi da naša primenljivost koristi njihov postojeći evaluator uslova. Ne menjati njihove fajlove.
2. **Preuzeti izvore.** Sačuvati zvanični sadržaj u `fixtures/regulations/`, napraviti inventar sa hash-evima i zapisati dostupnost i nedostatke. Ne koristiti nezvaničnu kopiju kao zamenu za potvrđen original.
3. **Izdvojiti odredbe.** Sačuvati originalni srpski tekst i lokacije; očuvati veze sa definicijama, izmenama, izuzecima i standardima. Proveriti izdvajanje vizuelno prema originalu, posebno brojeve, jedinice i tabele.
4. **Napraviti matricu i izabrati pravilo.** Popisati kandidate iz obe oblasti; obrazložiti izbor jednog i razloge odlaganja ostalih.
5. **Formalizovati paket.** Implementirati izvore, registar i selekciju kroz postojeće tipove. Dodati stabilne ID-jeve, verziju, potrebne ulaze, uslove, izuzetke i definiciju evaluatora.
6. **Pripremiti testove.** Napisati testove registra i primenljivosti, kao i deklarativne ulaze i očekivanja za buduće engine testove. Ne kopirati engine u naš modul.
7. **Obaviti ljudsku proveru.** Korisniku prikazati originalnu odredbu, tumačenje, izuzetke i test primere. Tek po eksplicitnoj potvrdi upisati reviewer zapis i `HUMAN_VERIFIED`.
8. **Proveriti i predati.** Pokrenuti provere, ažurirati ovaj dokument rezultatima i manifestom artefakata, te pripremiti PR sa primerom poziva i poznatim blokadama. Ne slati poruke drugim timovima bez zasebne instrukcije korisnika.

## Testovi i kriterijumi prihvatanja

- [x] Oba izvora imaju dosije: zvanični URL, publikaciju, datum pristupa, verziju, stanje potvrde i lokaciju sačuvanog sadržaja ili eksplicitnu blokadu.
- [x] Hash odgovara stvarno sačuvanim bajtovima; izdvojene relevantne odredbe proverene su prema originalu.
- [x] Matrica obuhvata kandidate iz obe oblasti, a tačno jedno pravilo je detaljno formalizovano.
- [x] Pravilo i svi njegovi izvori prolaze zajedničke šeme; reference među zapisima su dosledne.
- [x] Postoje test primeri za prolaz, pad, tačnu granicu, nedostajući ulaz, neprimenljivost i relevantne izuzetke. Za nenumeričko pravilo granica pokriva odgovarajući prelom broja ili uslova; ne izmišljati numerički prag.
- [x] Testovi primenljivosti pokrivaju `ALL`/`ANY`, nepoznat kontekst, dokazan i nepoznat izuzetak; nepoznat podatak nikada se ne pretvara u poznat negativan odgovor.
- [x] `getActiveRules` isključuje `CANDIDATE`, `AI_REVIEWED` i `HUMAN_VERIFIED`; selektor ne proizvodi numeričke rezultate.
- [x] Korisnik je eksplicitno potvrdio original, tumačenje i test primere. Zapis sadrži reviewer identitet, vreme, verziju izvora i reference na proverene artefakte.
- [ ] Runtime tim dobija paket i primer poziva bez potrebe da nagađa značenje mere ili uslove primene.
- [x] Pokrenuti su `npm test`, `npx tsc --noEmit`, `npm run lint` i `npm run build`; navesti stvarne rezultate. Numerički engine testovi koje Runtime tim još nije izvršio označavaju se kao pripremljena očekivanja, ne kao prošli testovi.

Ako izvor ostane nepotvrđen ili korisnik još nije izvršio proveru, dokumentovati delimičnu predaju i blokadu. Ne označavati ceo zadatak završenim prema cilju `HUMAN_VERIFIED`.

## Predaja i odgovornosti

| Primalac | Paket | Odgovornost posle predaje |
| --- | --- | --- |
| Runtime + integration | Izvori, odredbe, jedno pravilo, registar, selektor, test primeri, primer poziva i stanje blokada | Provera evaluatora, engine testovi, zasebna aktivacija uz odobrenje i integracija sa runtime-om |
| Geometry + Vision, preko handoff dokumenta | Tip elementa, tačno značenje metrike, jedinica, potrebni dokazi i potvrda | Proizvodnja ili traženje odgovarajućih ulaza |
| Workspace UI, preko Runtime API-ja | Naziv i verzija izvora, citat, objašnjenje uslova i nedostajućeg konteksta | Prikaz podataka koje izlaže Runtime tim |

Predaja sadrži PR/commit referencu, manifest fajlova, tačne importe, primer poziva, stanje pravila, zapis provere i rezultate izvršenih komandi. Ovaj dokument je jedinstvena specifikacija i checklist za zadatak; kod, izvori i test fixture-i ostaju zasebni artefakti.


## Prvobitni zapis implementacije 001 — istorija pre dodatnog preuzimanja

### Početna revizija i granice izmena

- Početni Git HEAD: `009fb64071d9cd8fdd3ff7b06ad07a3afb7f0638`.
- Grana: `feat/regulatory-intelligence`. Zatečeno: nepraćeni `.idea/vcs.xml` i ovaj plan. `.idea/vcs.xml` nije menjan.
- Promene su samo u našim direktorijumima. Nema novih zavisnosti, promena API-ja, domena, engine-a, runtime-a, UI-ja ili governance fajlova. Nema commit-a, push-a ili otvorenog PR-a u okviru ove predaje.
- Dogovoreni cilj `HUMAN_VERIFIED` ostaje isti; nije dostignut. Implementacija je spremna za pregled, a izvorne blokade ostaju eksplicitne.

### Dosije izvora i stvarno preuzeti sadržaj

Kompletan inventar URL-ova, vremena evidentiranja, veličina i SHA-256 je u `fixtures/regulations/manifest.json`. Hash PDF-a odnosi se na PDF bajtove, nikada na URL ili omotač sajta.

| Izvor / artefakt | Stvarno preuzeto | Stanje |
| --- | --- | --- |
| PIS požar 22/2019-3 | `originals/fire-pis-shell.html` | Samo javni HTML omotač JavaScript aplikacije; nema teksta odredaba. Verzija, izmene i važenje nisu potvrđeni. |
| PIS pristupačnost | `originals/accessibility-pis-shell.html` | Ista prepreka; omotač nije upotrebljen kao pravni tekst. |
| MGSI pristupačnost | `originals/accessibility-22-2015.pdf`, 41 strana | Zvanično hostovan osnovni tekst. Na prvoj strani izričito piše samo 22/2015. Nije konsolidovani dokaz za 10/2026. |
| MTO popis podzakonskih akata | `originals/mto-register.html` | Zvanični indeks navodi 22/15 i 10/26. To potvrđuje potrebu provere izmene, ali ne njen sadržaj ili važenje pojedinačnih odredaba. |

PIS je pokušano otvoriti i kroz web čitač i dostupni browser alat. Web daje samo aplikacioni omotač; browseri `iab` i `chrome` nisu dostupni u ovoj sesiji. Nezvanični rezultati pretrage nisu korišćeni za seed pravila ili potvrdu važenja.

Tekst PDF-a izdvojen je postojećim `pdfjs-dist/legacy/build/pdf.mjs`, `getTextContent()`, spajanjem `item.str` razmacima. `accessibility-pages.json` čuva svih 41 stranu sa brojevima. `provisions.json` sadrži čl. 1–19, lokacije i direktne reference iz čl. 15–17; to nije kompletan graf svih upućivanja. Normalizovani isečak može uključivati naslov sledećeg odeljka, što je naznačeno u lokaciji; ne menja se originalni tekst radi skrivanja tog ograničenja.

PDF strane 1 i 9 su renderovane kroz postojeći PDF.js canvas factory i vizuelno pregledane. Na strani 1 potvrđena je oznaka verzije 22/2015; na strani 9 potvrđen je tekst člana 18 i broj 90 cm. Ostali izdvojeni članci ostaju `UNVERIFIED`; vizuelna provera AI agenta nije ljudska pravna verifikacija.

### Matrica kandidata

| Oblast i odredba | Ulazi / složenost | Odluka |
| --- | --- | --- |
| Pristupačnost, čl. 18 st. 1 osnovnog teksta | Slobodna širina prolaza između fiksnog nameštaja; jednostavan `MIN` | Izabran jedan kandidat, prag 0.9 m preuzet iz 90 cm u originalu. |
| Pristupačnost, čl. 17 | Vrata, 80/90 cm u zavisnosti od uslova i konteksta | Odloženo; ne svoditi na opšti prag širine svih vrata. |
| Pristupačnost, čl. 14 | Smer kretanja, alternativne komunikacije i obeležavanje | Odloženo; zahteva dodatni potvrđeni kontekst. |
| Pristupačnost, čl. 7 | Rampe, visinska razlika i uslovni nagibi | Odloženo; nije univerzalni `MAX` nagiba. |
| Požar, čl. 29 i 31–34 prema istraživačkim smernicama Tech.MD | Tačan tekst, klasifikacija, uslovi i mere nisu pribavljeni | Samo istraživački tragovi, bez pripisanog sadržaja, pragova ili formalizovanih pravila. |

### Konkretan paket za ljudsku proveru

- Pravilo: `00100000-0000-4000-8000-000000000010`, verzija 1, trenutno `CANDIDATE`.
- Izvor: `22/2015-base-mgsi`; osnovni tekst, ne navodno konsolidovana verzija.
- Original čl. 18 st. 1, PDF strana 9: „Приликом уграђивања фиксних елемената намештаја обезбеђују се коридори за кретање ширине најмање 90 цм.”
- Tumačenje za pregled: proverava se samo slobodan prolaz između fiksnog nameštaja, ne širina svakog hodnika niti ukupna pristupačnost objekta.
- Formalizovani podskup: RS, OFFICE, CONCEPT/DESIGN, potvrđeno `isNewBuild`, element `CORRIDOR` sa podtipom `FIXED_FURNITURE_PASSAGE`. Rekonstrukcija nije uključena; time se ne tvrdi da propis za nju ne važi.
- Ovaj podtip je predlog unutar postojećeg string polja `subtype`, ne proširenje zajedničke šeme. Geometry vlasnik mora potvrditi da ga proizvodi na osnovu dokaza. Nedostajući podtip daje nepoznatu primenljivost.
- Mera: `CLEAR_WIDTH_M`, metri, sa dokazom i ljudskom potvrdom stvarnog slobodnog prostora. AI procena i razmak dobijen samo iz piksela nisu dovoljni.
- U prvom stavu čl. 18 preuzetog teksta nema zasebnog izuzetka; to nije tvrdnja o svim povezanim odredbama ili izmenama. Uslovi obuhvata iz čl. 1, 2 i 5 uključeni su kao reference za pregled.
- `rule-cases.json` sadrži deklarativna očekivanja nakon buduće odobrene aktivacije: 1.0 m prolaz; 0.89 m pad; 0.9 m granica; nedostajuća mera nepoznato; nepotvrđena mera nepoznato; drugi podtip neprimenljivo; nedostajući podtip nepoznato. Ovo nisu preizračunati nalazi niti tvrdnja da su numerički testovi pravnog pravila izvršeni.
- Reviewer identitet, datum odobrenja i effective datumi nisu upisani. Potrebno je prvo proveriti izmenu 10/2026 i trenutno važenje, zatim korisnikovom eksplicitnom odlukom odobriti izvor, tumačenje i primere. Tek tada dokumentovati stvarni reviewer zapis i dozvoljenu lifecycle putanju do `HUMAN_VERIFIED`.

### Primer poziva i handoff

Pokrenuti iz korena projekta:

```sh
node --import tsx src/rules/registry/handoff-example.ts
```

Primer radi sa jasno označenim contract-only projektom. Rezultat: dva izvora, 19 izdvojenih članova, jedan kandidat, nula aktivnih pravila, prazna live selekcija i `RULE_NOT_ACTIVE` iz postojećeg engine-a. Ne izvršava nijednu pravnu numeričku proveru i ne promoviše pravilo.

Direktni importi za Runtime tim:

```ts
import {
  complianceRules, regulationSources, regulationProvisions, getActiveRules,
} from "./src/rules/registry";
import {
  selectApplicableRules, checkRuleApplicability,
} from "./src/rules/applicability";
```

`filterActiveRules` je čisti registry gate sa eksplicitnim podacima za testove: zahteva aktivnu verziju, potvrđen izvor, tačne source/provision reference i poznate datume važenja pravila i izvora. Interval se poredi inkluzivno, kao u postojećem engine-u. Ne proverava sam da li je test fixture ikada izvršen; Runtime tim ostaje vlasnik provere dostupnosti evaluatora i numeričkih testova pre aktivacije. Istovremene aktivne verzije istog rule ID-ja u izabranom intervalu odbija greškom `REGISTRY_OVERLAPPING_ACTIVE_VERSIONS`.

Selektor prihvata kanonske šeme, proverava project/revision pripadnost elemenata, koristi postojeći `evaluateCondition`, deduplikuje ID-jeve i missing context, zadržava nepoznate ciljeve i vraća payload kompatibilan sa `regulation.rules.selected`. Ne menja ulaze. Poziva se nad rezultatom `getActiveRules`, a ne nad svim kandidatima. `checkRuleApplicability` je čista pomoćna funkcija dostupna i za pregled kandidata.

**Zabeležena integraciona razlika, bez promene dogovora:** trenutni engine dopušta numerički `PASS` kada je zaseban izuzetak nepoznat, a blokira samo pad. Naš prihvaćeni plan traži da nepoznat izuzetak ostane nepoznata primenljivost, što selektor i radi. Runtime vlasnik treba da razreši ovu razliku pre aktiviranja budućih pravila sa izuzecima; njegov kod i governance nisu menjani. Trenutni kandidat nema zasebne exception conditions.

### Provere i rezultati

| Komanda | Stvarni rezultat |
| --- | --- |
| `node --import tsx --test tests/regulatory/*.test.ts` | 10/10 prolazi |
| `node --import tsx src/rules/registry/handoff-example.ts` | Prolazi; kandidat odbijen pre numeričke evaluacije |
| `npm test` u sandbox-u | 42 prolazi, 5 pada zbog zabranjenog lokalnog HTTP porta i cleanup-a nakon te zabrane |
| `npm test` sa dozvoljenim lokalnim portom, van sandbox-a | 46/46 prolazi |
| `npx tsc --noEmit` | Prolazi |
| `npm run lint` | Prolazi |
| `npm run build` | Prolazi |

Prvi lokalni regulatorni test pokušaj imao je grešku u nazivu importa event šeme; ispravljeno na postojeći `eventPayloadSchemas` iz domena. Gornji rezultati su posle ispravke. Test-only fiktivni reviewer podaci služe isključivo proveri gates i nisu upisani u seed ili predstavljeni kao odobrenje.

### Manifest predaje i preostale blokade

- `fixtures/regulations/originals/`: zvanično preuzeti bajtovi; `manifest.json`: hash-evi, poreklo i blokade.
- `fixtures/regulations/{sources,provisions,rules,accessibility-pages,rule-cases}.json`: strukturisani podaci i deklarativni primeri.
- `src/rules/sources/`: parsiranje izvora i odredaba; `registry/`: registar, gate i izvršiv primer; `applicability/`: selekcija i pomoćna provera.
- `tests/regulatory/`: integritet bajtova, šeme, reference, lifecycle/source/date gates, nepoznat kontekst i izuzeci, bezbedno odbijanje kandidata u engine-u.
- Ovaj dokument: dosije, matrica, konkretan zahtev za ljudsku proveru i handoff Runtime timu. Nema tvrdnje da je tim već prihvatio interfejs ili podtip.

Preostalo za pun cilj: zvanični tekst požarnog izvora; tekst i uticaj izmene pristupačnosti 10/2026 i potvrda važenja; stvarna ljudska provera sa identitetom reviewera. Dok to ne postoji pravilo ostaje `CANDIDATE`. Predaja tehničkog paketa i nedostataka može odmah; aktivacija, engine integracija i kompletan UI tok ostaju van ovog zadatka.


## Predaja posle AI provere — istorijski presek pre ljudskog odobrenja

### Šta je dodatno provereno i sačuvano

Početna Git revizija ostaje `009fb64071d9cd8fdd3ff7b06ad07a3afb7f0638`. Sve izmene ostaju u vlasništvu Regulatory intelligence tima.

1. Iz javnih JavaScript fajlova PIS aplikacije identifikovan je javni REG API koji koristi i sam sajt. Nisu korišćeni nalozi, tokeni ili privatni pristup. Preuzeti su odgovori metapodataka i kompletni HTML tekstovi oba propisa, kao i originalni dokument izmene iz SLGL API-ja.
2. Pristupačnost: metapodaci navode 22/2015-95 i 10/2026-89. Sačuvani aktuelni tekst čl. 18 st. 1 i osnovni PDF zadržavaju minimum od 90 cm. Izmena u originalu direktno menja definicije u čl. 3, čl. 35, čl. 39, dodaje čl. 39a–39e i zamenjuje grafički prilog. Ne menja direktno čl. 18. To podržava izabrani uski tekstualni minimum, ne tvrdnju o celokupnoj pristupačnosti.
3. Vremenska linija PIS-a za preuzetu verziju navodi `2026-02-07`. Datum objavljivanja izmene u zaglavlju prečišćenog teksta je 30. januar 2026; originalni čl. 6 izmene propisuje stupanje na snagu osmog dana od objavljivanja. `effectiveFrom` pravila vezanog za ovu verziju je zato 7. februar 2026. Osnovni tekst i njegova prethodna verzija su očuvani.
4. Požar: preuzeti metapodaci navode 22/2019-3. Originalni tekst navodi objavu 28. marta 2019, a čl. 59 osmi dan od objave, odnosno 5. april 2019. Izdvojeni su čl. 1–4, 7, 29–34 i 59, bez dodavanja drugog izvršivog pravila.
5. Čl. 29 požarnog propisa povezuje širinu evakuacionog hodnika i sa preprekama i sa brojem ljudi; čl. 31 zavisi od broja ljudi i vrste izlaza; čl. 32–33 zahtevaju potvrđene evakuacione putanje; čl. 34 širinu vrata uslovljava korišćenjem i brojem ljudi. Zato oni nisu izabrani kao novo pojednostavljeno pravilo u zadatku 001.
6. `ai-review.json` beleži stvarnu AI proveru i njena ograničenja. Ovo nije zapis rada posebnog Mozaik agenta, nezavisnog ljudskog reviewera ili lažna potvrda pravne ispravnosti.

Sačuvani javni API URL-ovi i SHA-256 svakog odgovora nalaze se u `fixtures/regulations/manifest.json`. `originals/accessibility-amendment-10-2026.html` sadrži original izmene. Prvi pokušaj preko REG `viewdoc` sa `regactid` vratio je konsolidovani tekst umesto tražene izmene; taj pokušaj nije upotrebljen kao dokaz originalne izmene. Original je pribavljen preko SLGL `prins/viewdoc`.

**Uočena nedoslednost u zvaničnom materijalu:** redakcijska napomena prečišćenog teksta upućuje na član 10 izmene, ali preuzeti original izmene sadrži operativne čl. 1–6, sa zamenom priloga u čl. 5. Za mapiranje promena korišćen je original izmene. Neslaganje je zapisano u AI review-u i nije tiho ispravljeno. Grafički resursi priloga nisu svi zasebno preuzeti; ne implementiramo proveru koja zavisi od njihovog tumačenja.

### Paket i ugovor za integraciju

- Jedno pravilo: `00100000-0000-4000-8000-000000000010`, **verzija 2**, `AI_REVIEWED`.
- Prethodni neaktivni kandidat verzije 1 ostaje sačuvan u `fixtures/regulations/history/rule-v1.json`.
- Aktuelni izvor: `22/2015+10/2026-pis-af678b61-8cda-4138-a62d-d26e110dd49f`; hash se odnosi na preuzeti `accessibility-current.html`.
- Tačna izvršiva odredba u pripremi: član 18, stav 1, provision ID `00100000-0000-4000-8000-000000000400`. Kontekst: čl. 1, 2 i 5 iste verzije.
- Mera i DSL ostaju nepromenjeni: `CLEAR_WIDTH_M`, `MIN 0.9 m`, element `CORRIDOR`, podtip `FIXED_FURNITURE_PASSAGE`, novi poslovni objekat u RS.
- Nema `approvedBy`/`approvedAt`. Izvori namenjeni aktuelnoj upotrebi ostaju `CURRENT_UNCONFIRMED`, odredbe `UNVERIFIED`, jer automatska provera ne zamenjuje dogovoreno ljudsko odobrenje. Time se ne tvrdi da tekstovi nisu pribavljeni; stanje znači da nema ljudskog reviewer zapisa.
- Izvozi i endpoint ugovori nisu menjani. `getActiveRules("2026-10-30")` ispravno vraća `[]`. Engine vraća `RULE_NOT_ACTIVE` za ovo pravilo.

### Koraci za Runtime + integration

1. Koristiti repozitorijum sa C0 ugovorima i postojećim engine-om iz početne revizije ili kompatibilnog novijeg `main`.
2. ZIP raspakovati u privremeni direktorijum radi pregleda. Prekopirati samo Regulatory-owned putanje u dogovorenu integracionu granu ili, poželjno, preuzeti kroz PR Regulatory tima. Ne prepisivati lokalne izmene i ne dodavati alternativni `src/rules/index.ts`.
3. Pozivati `getActiveRules(asOf)` pa `selectApplicableRules(project, elements, activeRules)`. `asOf` mora biti eksplicitan validan kalendarski datum. Rezultat selekcije odgovara `regulation.rules.selected` payload-u; ne sadrži numerički nalaz.
4. `complianceRules`, `regulationSources` i `regulationProvisions` koristiti za pregled/persistiranje seed paketa. Ne tretirati `AI_REVIEWED` kao izvršivo pravilo i ne promeniti lifecycle radi demonstracije.
5. Pokrenuti sledeće komande iz korena repozitorijuma:

```sh
node --import tsx --test tests/regulatory/*.test.ts
node --import tsx src/rules/registry/handoff-example.ts
python3 fixtures/regulations/extract-official-html.py --check
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Python je potreban samo za opcionu reprodukciju izdvajanja HTML teksta; aplikacioni moduli i Node testovi ga ne koriste. Primer trenutno prikazuje 3 izvora, 53 odredbe, jedno `AI_REVIEWED` pravilo v2, nula aktivnih pravila i odbijanje neaktivnog pravila od strane engine-a.

6. Geometry timu potvrditi predloženi podtip i dokumentovanu slobodnu širinu između fiksnog nameštaja. Potvrda `isNewBuild`, pripadnost projektu/reviziji i dokaz mere moraju biti stvarni, ne izvedeni iz imena fixture-a ili samog broja širine.
7. Posebno pribaviti stvarni ljudski reviewer zapis za izvor, odredbe, tumačenje i fixture očekivanja. Posle toga dozvoljena je promena u `HUMAN_VERIFIED`. Tek naknadna provera evaluatora i numeričkih fixture-a omogućava zasebnu aktivaciju. To je preostali gate iz prihvaćenog plana, ne dodatni novi zahtev.
8. Pre aktivacije budućih pravila sa izuzecima razrešiti ranije evidentiranu razliku engine-a i plana za nepoznat izuzetak. Ovaj paket ne menja Runtime vlasnikove fajlove i ne zahteva promenu dogovora radi prikrivanja te razlike.

### Poslednja validacija

- Regulatorni testovi: **11/11 prolazi**.
- Kompletni testovi: **47/47 prolazi**, uz dozvoljen lokalni port za Runtime HTTP testove.
- TypeScript i lint: prolaze.
- Primer poziva i reprodukcija sva tri HTML teksta: prolaze.
- `npm run build`: prolazi posle dodatne provere i ažuriranja verzije pravila.
- Numerički rezultati pravnog pravila: i dalje samo deklarativna očekivanja, bez aktivacije ili tvrdnje da je odobreno.

### Poruka spremna za prosleđivanje

> Predajemo Regulatory intelligence paket 001, zasnovan na Git reviziji `009fb64071d9cd8fdd3ff7b06ad07a3afb7f0638`. Paket sadrži zvanične tekstove oba propisa, original izmene pristupačnosti 10/2026, metapodatke, hash-eve, 53 odredbe i jedno pravilo v2 u stanju `AI_REVIEWED` za čl. 18 st. 1: prolaz između fiksnog nameštaja, minimum 0.9 m. Uključeni su registar, selektor, deklarativni test primeri i izvršiv primer poziva. Svi 47 testova prolaze. Runtime može odmah da poveže izvoze i obradi paket; `getActiveRules` ostaje prazan dok ne postoji ljudsko odobrenje i zasebna aktivacija. Molimo potvrdu interfejsa sa Runtime timom i podtipa `FIXED_FURNITURE_PASSAGE` sa Geometry timom. Uputstvo i poznata razlika u ponašanju engine-a za nepoznate izuzetke nalaze se u ovom dokumentu.


### Arhiva za slanje

`docs/regulations/001-runtime-handoff.zip` sadrži ovaj dokument, Regulatory-owned kod, fixture-e i testove sa putanjama relativnim u odnosu na koren projekta. U arhivi je `SHA256SUMS.txt` za proveru svih članova; zaseban `001-runtime-handoff.zip.sha256` potvrđuje hash ZIP-a. Arhiva ne uključuje `.env`, `.idea`, `node_modules`, bazu, privatne nacrte ili promene drugih timova. Git commit/push i slanje timu nisu izvršeni.


## Ljudsko odobrenje i priprema merge-a

Korisnik je eksplicitno potvrdio da je sve proverio i odobrio spajanje na `main`. U `fixtures/regulations/human-review.json` zabeleženi su originalna potvrda, vreme, reviewer `Petar Popovic` (repo Git identitet), verzije izvora, ID-jevi odredaba i test fixture-a. Time je izvršen prelaz `AI_REVIEWED` u `HUMAN_VERIFIED`; nije izvršen prelaz u `ACTIVE`.

Aktuelni izvori su sada `CURRENT_CONFIRMED` sa reviewer zapisom; istorijski izvor ostaje `HISTORICAL`. Odredbe su `SOURCE_VERIFIED`. Preuzeti originalni bajtovi i prethodni AI review ostaju neizmenjeni radi audita.

Pre finalne predaje preuzet je i spojen `origin/main` na `dfa3774`, uključujući ranije spojene UI client i Geometry promene. Na tom zajedničkom kodu prolazi **69/69 testova**, lint, TypeScript, primer poziva i provera ekstrakcije. Najnovije kratko uputstvo za integraciju je `docs/regulations/001-runtime-handoff.md`. Raniji blokovi ovog dokumenta koji kažu da ljudsko odobrenje nedostaje predstavljaju istorijsko stanje i više nisu otvorena blokada.
