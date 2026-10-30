# 001 — Predaja timu Runtime + integration

## Isporučeno i odobreno

Regulatory intelligence paket sadrži zvanične tekstove požarnog propisa 22/2019 i pristupačnosti 22/2015 sa izmenom 10/2026, hash-eve i metapodatke, 53 izdvojene odredbe, registar, selektor, fixture očekivanja i izvršiv primer poziva.

Pravilo `00100000-0000-4000-8000-000000000010`, verzija **2**, sada je **HUMAN_VERIFIED**. Petar Popovic je u razgovoru eksplicitno potvrdio proveru i odobrenje; zapis je u `fixtures/regulations/human-review.json`. Aktuelni izvori imaju `CURRENT_CONFIRMED`, a odredbe `SOURCE_VERIFIED`. Originalni AI review je sačuvan kao prethodni istorijski zapis.

Pravilo proverava samo prolaz između fiksnog nameštaja iz čl. 18 st. 1 propisa o pristupačnosti, najmanje **0.9 m**. Ne predstavlja opštu širinu svakog hodnika ili potvrdu ukupne pristupačnosti. Predviđeni podskup je novi OFFICE objekat u RS, CONCEPT/DESIGN, sa `isNewBuild: true`, elementom `CORRIDOR` i podtipom `FIXED_FURNITURE_PASSAGE`.

## Preuzimanje i importi

Posle spajanja paketa na main, svaki tim u svojoj grani pokreće:

```sh
git fetch origin
git merge origin/main
```

Ne treba cherry-pick niti raspakivanje ZIP-a preko novijeg main-a. ZIP je prateća kopija za pregled; Git je izvor za integraciju.

Importi iz korena projekta:

```ts
import {
  getActiveRules,
  complianceRules,
  regulationSources,
  regulationProvisions,
} from "./src/rules/registry";
import {
  selectApplicableRules,
  checkRuleApplicability,
} from "./src/rules/applicability";
```

Live tok: `getActiveRules(asOf)` pa `selectApplicableRules(project, elements, rules)`. Datum je eksplicitan `YYYY-MM-DD`. Selekcija vraća `ruleIds`, `explanations` i `missingContext`, kompatibilno sa postojećim `regulation.rules.selected`. Engine nezavisno proverava svaki element i ulaze.

## Sledeći koraci Runtime tima

1. Povezati izvore, odredbe i odobreno pravilo sa persistence slojem i Regulation učesnikom.
2. Preuzeti fixture očekivanja iz `fixtures/regulations/rule-cases.json` i izvršiti ih kroz engine. Pripremljeni su prolaz, pad, granica, nedostajuća i nepotvrđena mera, drugi podtip i nedostajući podtip.
3. Sa Geometry timom potvrditi `FIXED_FURNITURE_PASSAGE`. Potrebna mera je potvrđena slobodna širina između fiksnog nameštaja, `CLEAR_WIDTH_M` u metrima, sa dokazom i odgovarajućom verifikacijom.
4. Posle potvrde podrške evaluatora i numeričkih testova sprovesti zasebnu aktivaciju kroz vlasnika registra. Ne menjati regulatorne fajlove paralelno sa njihovim vlasnikom; predati rezultate i zahtev za aktivaciju Regulatory timu.

**Očekivano trenutno ponašanje:** `getActiveRules("2026-10-30")` vraća `[]`, jer `HUMAN_VERIFIED` još nije `ACTIVE`. Engine odbija pravilo sa `RULE_NOT_ACTIVE`. Ovo nije greška integracije i ne treba zaobilaziti gate privremenom aktivacijom u live kodu.

Postoji prethodno dokumentovana razlika za buduća pravila sa izuzecima: engine dopušta PASS uz nepoznat izuzetak, dok selektor prema prihvaćenom planu zadržava nepoznatu primenljivost. Trenutno pravilo nema zasebne izuzetke. Ne menjamo taj ugovor u zadatku 001.

## Validacija i audit

- Početni commit zadatka: `009fb64071d9cd8fdd3ff7b06ad07a3afb7f0638`.
- Pre predaje uključene su promene `origin/main` do `dfa3774`.
- Kompletni testovi: **69/69 prolazi**; regulatorni testovi: 11/11.
- Lint, TypeScript, build, primer poziva i reprodukcija izdvajanja teksta prolaze.
- Izmenjene su samo regulatorne putanje; bez novih zavisnosti i promena engine/API/domain ugovora.

```sh
node --import tsx --test tests/regulatory/*.test.ts
node --import tsx src/rules/registry/handoff-example.ts
python3 fixtures/regulations/extract-official-html.py --check
```

Dosije i istorija su u `001-plan.md`; poreklo i hash-evi u `fixtures/regulations/manifest.json`. ZIP `001-runtime-handoff.zip` sadrži regulatorni kod, podatke, testove i ove dokumente, bez tajni ili privatnih nacrta.
