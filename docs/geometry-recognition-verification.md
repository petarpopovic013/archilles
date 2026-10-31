# Provera Geometry Agenta

31. oktobar 2026. Grana: `feat/geometry-reading`. Produkcioni pipeline: `geometry-reading-v6`.

Implementiran je celovit tok za korišćenje uz pregled predloga: privatni upload, pregled/legenda, potvrda konvencija, detaljni isečci originala, rekonstrukcija, dijagnostika, korekcije i nova revizija. **Kriterijumi pune automatske tačnosti iz plana nisu prošli.** Rezultat na stvarnom projektu i dalje zahteva pregled granica i otvora; ovo nije završena verzija koja svaki plan automatski iscrta tačno.

## Šta radi

- PDF/PNG/JPEG imaju kanonski source sistem. Detalji se čitaju iz originala; PDF tekst ostaje pozicionirani dokaz.
- Prvi prolaz pravi lokalnu legendu sa vizuelnim primerima. Korisnik može ostaviti jedinice nepoznatim. Detaljni prolazi pokrivaju četiri preklopljena regiona.
- Najviše četiri logička Vision poziva i jedan zajednički transient retry po zadatku, uključujući nastavak nakon potvrde. Page rezerva je najviše 0,80 USD za Vision i 0,20 USD za Geometry kontroler; postojeći ukupni/satni limiti ostaju aktivni.
- Keširani pregled se koristi nakon potvrde. Eksplicitno ponovno čitanje je novi plaćeni zadatak. Zakasneli rezultati prethodne revizije se odbacuju uz evidentiranu potrošnju.
- Rekonstrukcija prvo koristi pune zidove; šrafirana hipoteza menja samo nerešene prostorije i ostaje označena. Nezavisna provera otkriva i izostavljene zatvorene oblasti. Unutrašnja šupljina u već podržanoj sobi ne postaje automatski nova soba.
- Kote ostaju doslovne anotacije sa položajem, vrstom, pravcem i vidljivim krajevima raspona. Loš dokaz se izdvaja pojedinačno uz upozorenje, bez prekidanja ostalih regiona. Nominalni otvor se ne pretvara u svetlu širinu. Eksplicitna jedinica u tekstu ima prednost nad podrazumevanom jedinicom crteža.
- Sukob vrata/prozor ostaje vidljiv; poslednji isečak ga ne može tiho preglasati. Nepodržan simbol postaje UNKNOWN.
- Viewer podržava slojeve, izmenu temena, dodavanje i uklanjanje elementa, dvotačkastu kalibraciju i pregled problema. Ispravke čuvaju USER dokaz i istoriju. Potvrda granice ne potvrđuje pravni podtip ili meru. Promena dimenzije/recheck ne kupuje novo Vision čitanje.

## Izvršene softverske provere

- `npm run typecheck`: prošao.
- `npm test`: 493 prošla, 0 neuspešnih.
- `npm run lint`: prošao.
- `npm run build`: prošao.
- `git diff --check`: prošao.
- Stvarni `npm run smoke:geometry -- --report /tmp/archilles-geometry-v5-smoke.json`: COMPLETE, 6 predloženih elemenata, 0 aktivnih pravila, ukupno procenjeno 0,123054 USD. To je provera stvarnog HTTP/Mozaik/Claude povezivanja na sintetičkom office primeru, ne dokaz tačnosti na arhitektonskom planu. Poslednje promene v6 obuhvataju pojedinačno izdvajanje loših anotacija i nastavak preostalih regiona, proverene i stvarnim čitanjima ispod.
- Headless Chromium/Playwright, izolovani runtime sa zamenjenim Vision odgovorom: upload, početna potvrda, nastavak, izmena granice, dodavanje i uklanjanje elementa prošli. Desktop 1600×1050 i mobilni 390×844: bez JavaScript grešaka i horizontalnog prelivanja. Ovo je UI test sa mock odgovorom; nije treći plaćeni test prepoznavanja.
- Lokalni frontend na portu 3000 odgovorio je HTTP 200; runtime na 4317 `/health` vratio je `ok`.

Testovi posebno pokrivaju originalne isečke i PDF tekst, source transformacije, zatvorene prstenove, self-intersection, nameštaj kao pogrešnu početnu tačku, otkrivanje izostavljene sobe, razlikovanje kotne linije od para prozorskih linija, ograničenja budžeta/retry-a, potrošnju lošeg odgovora, stare revizije, ponovnu ekstrakciju uz očuvane potvrde, dodavanje/uklanjanje bez Vision-a i uklanjanje poslednjeg elementa bez neželjene nove ekstrakcije.

## Stvarna čitanja različitih planova

Oba poziva koristila su `claude-sonnet-4-6`, produkcioni v6 pipeline i izolovane privremene baze bez aktivnih pravnih pravila. U testu je potvrđen nastavak konvencija uz nepoznate jedinice; nijedna dimenzija nije odobrena.

| Plan | Stanje | Pozivi | Obrađeni regioni | Ukupna procena troška |
|---|---|---:|---:|---:|
| residential-dimensioned | PARTIAL | 4 | 4/4 | 0,232362 USD |
| stan-b-1-2 | PARTIAL | 4 | 4/4 | 0,320364 USD |

Ovo su različiti rasporedi. Referentne anotacije su **DRAFT, nisu ljudski pregledane**. Tabela ispod pokriva samo tri ručno označene sobe po planu; iz nje se ne zaključuje ukupni recall/precision, tačnost svih vrata ili čitanje/povezivanje svih kota. Draft reference mogu sadržati i sopstvena odstupanja od unutrašnjeg lica zida; nisu dovoljne za dokaz stvarne tačnosti niti ih treba menjati samo radi boljeg rezultata. P95 je simetrično odstupanje granice u source pikselima i procentu dijagonale strane.

| Plan / referentna soba | IoU | P95 px | P95 / dijagonala |
|---|---:|---:|---:|
| residential / soba 3 | 0,9410 | 27,85 | 1,643% |
| residential / soba 4 | 0,9673 | 7,00 | 0,413% |
| residential / neoznačeno kupatilo | 0,9846 | 2,00 | 0,118% |
| stan-b-1-2 / soba 6 | 0,9267 | 11,00 | 0,844% |
| stan-b-1-2 / soba 5 | 0,8959 | 11,00 | 0,844% |
| stan-b-1-2 / kupatilo 3 | 0,8019 | 17,54 | 1,345% |

Neoznačeno kupatilo u prvom planu vraćeno je kao zatvorena oblast za pregled, bez izmišljenog broja sobe. Oznaka PARTIAL je namerna: ostaju nepodržani otvori, privremeno zatvoreni zidni prekidi, nesigurni obrisi i u prvom planu izostavljen neispravan anotacioni dokaz. Na drugom planu postoje preklapanja i nerešene veze otvora. Rezultati su vizuelno pregledani na privatnim overlay slikama.

Ranija razvojna čitanja obuhvatila su i treću porodicu `stan-21`, kao i neuspešne varijante. Na jednom ranijem pipeline-u IoU tri draft spavaće sobe iznosio je približno 0,975 / 0,955 / 0,518. To nije rezultat završnog v6 pipeline-a niti holdout validacija. Greške složenijih oblika, pogrešnih početnih tačaka, šrafura i prozorskih prekida pokazuju da šira automatska pouzdanost nije utvrđena. Odbijena prevelika provider šema zamenjena je kompaktnim wire protokolom; neispravna pojedinačna anotacija više ne obara ostatak čitanja.

## Privatni artefakti i ponavljanje

`data/geometry-verification/residential/` i `data/geometry-verification/stan-b-1-2/` sadrže `overlay.png`, `overlay.svg`, `observations.json`, validirane `stages.json`, `metrics.json` i zasebni `evaluation.json`. Fajlovi su privatni, isključeni iz Git-a; ne objavljivati ih kao javne assete. `data/geometry-verification/smoke.json` čuva izolovanu smoke proveru. Ne čuvaju se ključevi ili sirovi promptovi.

```sh
npm run benchmark:geometry -- --plan fixtures/plans/residential-dimensioned.png --output /tmp/geometry-check --reference fixtures/plans/recognition-reference-drafts.json
npm run evaluate:geometry -- /tmp/geometry-check/observations.json fixtures/plans/recognition-reference-drafts.json /tmp/geometry-check/evaluation.json
```

Benchmark i smoke su eksplicitno plaćeni. `npm test` ne poziva provajdera. Reference i rezultat moraju pripadati istoj strani istog crteža.

## Otvoreni kriterijumi

Nisu dostignuti ciljevi IoU/P95 za sve označene sobe, potpun recall vrata/prozora, tačnost krajeva svih otvora ili potpuno čitanje i povezivanje ključnih kota. Nema kompletnog ljudski pregledanog referentnog skupa niti PDF vektorskog parsera zidova. Kose/šrafirane granice, nameštaj dodirnut zidom i otvorene funkcionalne zone zahtevaju dalju validaciju. Novi segmentacioni pristup treba proceniti na tim konkretnim greškama pre tvrdnje da je automatska geometrija gotova za opštu upotrebu.

Za sada: upload → potvrda legende/jedinica → detalji → pregled dijagnostike i granica → ručne ispravke → potvrda stvarnih mera → pravna analiza. Postojeći projekti koriste sačuvanu geometriju; dugme **Read geometry again** eksplicitno pokreće novu ekstrakciju i čuva potvrđene ispravke.
