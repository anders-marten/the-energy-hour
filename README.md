# the-energy-hour

Webbplatsen och musikspelaren för The Energy Hour, live på [the-energy-hour.com](https://the-energy-hour.com). Sajten har 64 spår med egen spelare, berättelser, sångtexter och releasefakta. Den är byggd som en statisk sajt utan ramverk och fungerar som en webbapp på mobilen, även från hemskärmen på iPhone.

## Innehåll

- [Kom igång](#kom-igång)
- [Teknikstack](#teknikstack)
- [Projektstruktur](#projektstruktur)
- [UI/UX: arbetet hittills](#uiux-arbetet-hittills)
- [Infrastruktur](#infrastruktur)
- [Lagring, skalbarhet och kostnader](#lagring-skalbarhet-och-kostnader)
- [Roadmap](#roadmap)
- [Kända brister och teknisk skuld](#kända-brister-och-teknisk-skuld)
- [Drift och resurser](#drift-och-resurser)

## Kom igång

```sh
npm ci
npm run dev
```

Produktionsbygge och förhandsvisning av `dist/`:

```sh
npm run build
npm run preview
```

`npm run build` gör tre saker i tur och ordning:

1. `scripts/generate-seo-content.js` skriver låtlistan, About-avsnittet, versionsraden och JSON-LD in i `index.html` utifrån `public/playlist.json`. De genererade blocken i `index.html` ska därför inte redigeras för hand. Ändra generatorn eller spellistan i stället.
2. `vite build` bygger sajten till `dist/`. JS och CSS får en hash i filnamnet.
3. `scripts/generate-site-files.js` skriver en sida per spår (`dist/tracks/<slug>/index.html`), `sitemap.xml` och `llms.txt`. Skriptet lägger också till commit-hashen på versionsraden.

En push till `main` bygger och driftsätter sajten automatiskt (se [Infrastruktur](#infrastruktur)).

## Teknikstack

| Del | Val | Kommentar |
| --- | --- | --- |
| Frontend | HTML, CSS och JavaScript utan ramverk | All appkod finns i `src/app.js` och `src/styles.css`. Inga beroenden i webbläsaren. |
| Bygge | Vite 7 | Bygger JS och CSS med hash i filnamnet. Inga andra plugins. |
| Genererat innehåll | Node-skript i `scripts/` | Statisk HTML för låtlistan, sidor per spår, JSON-LD, sitemap och `llms.txt`, för sökmotorer och AI-crawlers. |
| Data | `public/playlist.json` | En fil med alla spår, beskriven av `public/playlist.schema.json`. Bygget kontrollerar inte filen mot schemat. Sångtexter ligger som textfiler i `public/lyrics/`. |
| Ljud | Egen spelare på ett delat `<audio>`-element | AAC/MP3-filer på `media.the-energy-hour.com`. Ingen SoundCloud-widget. |
| Hosting | Scaleway Object Storage och Edge Services | Två buckets: sajten och ljudfilerna. |
| DNS och apex | AWS Route 53 och AWS CloudFront | CloudFront ligger framför Scaleway för att apexdomänen ska fungera. |
| Infrastruktur som kod | OpenTofu (`deploy/infra`) | Scaleway-resurserna. CloudFront och DNS ligger i en äldre CDK-stack. |
| CI/CD | GitHub Actions (`.github/workflows/deploy.yml`) | Bygger, synkar till bucketen och tömmer båda CDN-cacharna. |
| Ljudverktyg | Python (`scripts/encode-audio.py`, `scripts/upload-audio.py`) | Kodar masterfiler och laddar upp dem manuellt. |

## Projektstruktur

```text
index.html                  Sidans skal; låtlistan m.m. genereras in i den
src/app.js                  Spelare, Discover, gester och spellistelogik
src/styles.css              All stil: smal layout under 900 px, två kolumner från 900 px
public/playlist.json        Spåren: titel, texter, länkar, ljudfil, release
public/playlist.schema.json Schema för spellistan
public/lyrics/              Sångtexter som UTF-8-text
public/images/              Omslag, tumnaglar, logotyper och appikoner
public/manifest.webmanifest Webbappens namn och ikoner
scripts/                    Generatorer (Node) och ljudverktyg (Python)
deploy/infra/               OpenTofu för Scaleway
.github/workflows/          Deploy
```

Layouten styrs av container queries på `#teh-mobile-preview`. Under 900 px gäller mobillayouten, och flera beteenden gäller bara i stående läge. Från 900 px används en tvåkolumnslayout.

## UI/UX: arbetet hittills

Sajten började i april 2026 som en enkel låtsida med inbäddad SoundCloud-spelare. Den har sedan vuxit till en mobilanpassad musikapp. Designen har tagits fram iterativt: Anders skickar skärmdumpar med önskade ändringar, varje ändring byggs och kontrolleras i 375 px och 1280 px och testas sedan på iPhone efter deploy. Nedan beskrivs de viktigaste utmaningarna och hur de lösts.

### Från SoundCloud-widget till egen spelare

**Problem:** På iPhone startade det första trycket på play ofta ingenting. Safari tillåter bara ljud som startas direkt i användarens tryck. SoundCloud-widgeten är en iframe som styrs med `postMessage`, och när den hade laddat klart hade tillståndet för trycket redan gått ut.

**Lösning:** Alla 64 spår kodades om (AAC 256 kbps från förlustfria masterfiler där sådana fanns) och läggs i en egen bucket. Spelaren är ett enda delat `<audio>`-element, och `play()` anropas direkt i klickhanteraren. SoundCloud finns kvar som länk under Info. Detaljer finns i `AUDIO_PLAYER_INVESTIGATION.md` och `SCALEWAY_AUDIO_MIGRATION_PLAN.md`.

### Mobilspelaren

Målet har varit en spelare som känns som en app, med så lite ytor som möjligt som tävlar om platsen.

- **Kontrollpanel:** Footern blev en flytande panel med rundade hörn och en ljusare färg, så att den sticker ut mot listan. "Discover the story" står under titeln på låten som spelas, i stället för som en knapp under omslaget. Det tydliggör att berättelsen hör till just den låten. Ett tryck på panelen öppnar och stänger Discover.
- **Discover som kort:** Discover-panelen och kontrollpanelen bildar ett enda kort. Kortet växer upp ur panelen och krymper tillbaka ner i den. Överkanten styrs av en registrerad CSS-egenskap (`@property --sheet-top`) som både beskär kortet och flyttar innehållet. Därför följer innehållet med fingret när kortet dras ner, i stället för att beskäras uppifrån.
- **Löpande text i stället för flikar:** På mobil visas Story, Lyrics och Info som en löpande text med rubriker, som skrollar för sig. Desktop behåller flikarna. Båda bygger på samma HTML, och CSS väljer visning efter bredd.
- **Fast omslag:** Omslaget ligger överst i 2/3 höjd medan listan skrollar in under det. Ett drag nedåt öppnar det till full höjd. Listan följer med, titeln och toningen försvinner så att omslaget syns oförändrat, och när man släpper fjädrar det tillbaka. Spelarkontrollerna på omslaget togs bort eftersom panelen redan har dem. Långa titlar får högst två rader.
- **Kompakt låtlista:** Raderna gick från 116 px till 69 px, med en rad beskrivning och "Discover" centrerat.

### Utmaningar som krävde felsökning

| Utmaning | Orsak | Lösning |
| --- | --- | --- |
| Listan följde inte med när omslaget drogs ut | Webbläsarens scroll-ankring höll raderna på plats när ett element ovanför växte | `overflow-anchor: none` på mobil |
| Draget på omslaget slutade fungera ibland på iPhone | iOS bestämmer redan vid fingrets första rörelse om sidan ska skrolla | Draget tas över direkt om rörelsen inte tydligt går uppåt eller åt sidan |
| Tryck på tumnaglar startade inte låten | Spolningslinjens osynliga tryckyta stack ut ovanför panelen och tog trycket | Tryckytan ligger helt inne i panelen, och spolningen fick en egen rad |
| Spolning före första play bröt uppspelningen på iPhone: låten startade från början och gick inte att pausa | Safari laddar inte ljudet förrän play, och ett avbrutet `play()` gav appen fel uppfattning om läget | Spolningslinjen är låst tills låten har börjat spela. Play och paus utgår från `audio.paused`, inte en egen flagga |
| Blå ram runt stängpilen när Discover öppnades i Safari | Dialogen gav fokus till första knappen | Titeln får fokus (`autofocus`, `tabindex="-1"`). Det hjälper också skärmläsare |
| Rader syntes ovanför omslaget och under statusfältet | Det fasta omslaget hade ett mellanrum till överkanten | Omslaget ligger kant i kant med överkanten och täcker ytan ovanför med sidans bakgrund |
| iPhone visade gammal kod efter deploy | `app.js` och `styles.css` hade samma namn och saknade cache-regler | Vite hashar filnamnen, och deployen sätter `immutable` på dem och `no-cache` på HTML. Versionsraden visar vilken commit som är live |
| Webbappen hette "Energy Hour" på hemskärmen | iPhone använder manifestets `short_name` | `short_name` är "The Energy Hour" |

### Arbetssätt

- Ändringar görs en i taget och kontrolleras i lokal förhandsvisning (`npm run build` och `vite preview`) i 375 px och 1280 px, utan konsolfel, innan de pushas.
- Allt som rör gester och ljud måste till sist testas på en riktig iPhone. Safari beter sig på flera punkter annorlunda än Chrome, och det har varit den vanligaste felkällan.
- Desktop har medvetet hållits stabil medan mobilen gjorts om.

## Infrastruktur

```text
Besökare
  -> Route 53 (the-energy-hour.com, www)
  -> AWS CloudFront (apex-proxy)
  -> Scaleway Edge Services (pipeline för sajten)
  -> Scaleway Object Storage (ungap-the-energy-hour-prod)

Spelaren
  -> media.the-energy-hour.com (CNAME i Route 53)
  -> Scaleway Edge Services (pipeline för media)
  -> Scaleway Object Storage (the-energy-hour-media)
```

CloudFront finns där för att apexdomänen ska kunna ligga kvar i Route 53. Scaleway Edge Services är det egentliga ursprunget, och CloudFront kan tas bort när Scaleway kan hantera apexdomänen på ett lämpligt sätt.

### Deploy

En push till `main` kör `.github/workflows/deploy.yml`:

1. `npm ci` och `npm run build` (Node 20).
2. `dist/assets/` laddas upp med `Cache-Control: public, max-age=31536000, immutable`. Äldre hashade filer behålls, så att en sparad sida fortfarande hittar sina filer.
3. Resten av `dist/` synkas med `--delete`. HTML skickas med `no-cache` och textfiler med UTF-8.
4. Edge Services-cachen töms.
5. CloudFront-cachen töms (`/*`) via en IAM-roll som bara får göra invalideringar på den här distributionen (GitHub OIDC, bara från `main`).

Ljudfilerna ingår inte i deployen. De kodas med `scripts/encode-audio.py` och laddas upp manuellt med `scripts/upload-audio.py`, eftersom GitHub-deployern inte har åtkomst till media-bucketen.

## Lagring, skalbarhet och kostnader

### Lagring

| Data | Var | Storlek (nov 2026) |
| --- | --- | --- |
| Ljud, 64 spår | Bucket `the-energy-hour-media` | ca 433 MB |
| Sajten (HTML, JS, CSS, bilder, texter) | Bucket `ungap-the-energy-hour-prod` | under 10 MB, mest bilder |
| Spellista och texter | Git (`public/`) | under 1 MB |

Spellistan och texterna versionshanteras i Git och är därmed säkerhetskopierade. Ljudfilerna finns bara i media-bucketen (versionshantering avstängd) och i Anders lokala masterfiler. Se [Kända brister](#kända-brister-och-teknisk-skuld).

### Skalbarhet

Sajten är helt statisk och har ingen server eller databas. Allt serveras från CDN, så den klarar i princip hur många besökare som helst utan ändringar. Varje besökare hämtar spellistan och en ljudfil i taget. Ljudet strömmas med `Range`-anrop, så bara det som spelas laddas ner. Det som växer med trafiken är utgående data, i första hand ljudet.

### Kostnader

Kostnaderna är små och domineras av ljudtrafiken. Grovt räknat ger AAC 256 kbps ungefär 1,9 MB per minut, så en låt som spelas klart (cirka 4 minuter) motsvarar ungefär 7–8 MB trafik.

| Post | Hur den räknas | Ungefärlig nivå |
| --- | --- | --- |
| Object Storage, lagring | Per GB och månad | Under en euro i månaden vid dagens 0,5 GB |
| Edge Services (två pipelines) | Månadsavgift per pipeline plus trafik enligt Scaleways prislista | Den största fasta posten |
| CloudFront | Utgående trafik och anrop | Bör rymmas i AWS kostnadsfria nivå (1 TB och 10 miljoner anrop per månad) vid nuvarande trafik |
| Route 53 | Per hostad zon och antal DNS-frågor | Under en dollar i månaden |
| GitHub Actions | Minuter | Ingår i gratiskvoten |

Siffrorna är uppskattningar. Kontrollera Scaleways och AWS aktuella prislistor innan de används för budget. Det som framför allt kan driva kostnaderna är många fullständiga lyssningar: 1 000 lyssningar ger ungefär 7–8 GB ljudtrafik genom Edge Services. Att ta bort CloudFront-lagret skulle minska både komplexitet och antalet leverantörer.

## Roadmap

### 1. Uppladdning av låtar

**Mål:** Att lägga upp en ny låt, med ljud, omslag, texter och releasefakta, ska inte kräva terminal och Git.

- Ett skyddat adminläge med inloggning, till exempel via magic link eller en extern identitetstjänst.
- Uppladdning direkt till bucketen med tidsbegränsade presignerade URL:er, så att ingen hemlighet behövs i webbläsaren.
- Kodning till AAC i molnet, till exempel Scaleway Serverless Jobs med ffmpeg, i stället för `encode-audio.py` lokalt.
- Spellistan flyttas från `public/playlist.json` i Git till en datakälla som adminläget kan skriva till: en JSON-fil i bucketen till att börja med, eventuellt en databas senare. Ett ombygge av de statiska sidorna (SEO, låtsidor, sitemap) körs efter varje ändring.
- Validering mot `playlist.schema.json` innan något publiceras.

### 2. Lyssnarsiffror

**Mål:** Att se hur mycket varje låt spelas, utan cookies och utan att spåra personer.

- Spelaren skickar en enkel händelse vid start, efter 30 sekunder (räknas som en lyssning) och när låten spelats klart. Händelsen skickas med `navigator.sendBeacon`, är anonym och innehåller bara spår-id och tidpunkt.
- En liten endpoint, till exempel en Scaleway Serverless Function, tar emot händelserna och summerar dem per spår och dag, i en databas eller som filer i en bucket.
- Ett alternativ eller komplement är att räkna `Range`-anrop i Edge Services-loggarna för media. Det kräver ingen kod i spelaren men blir mindre exakt.
- En enkel statistikvy i adminläget.
- Integritet: ingen IP-lagring, inga cookies och en kort text om detta på sajten.

### 3. Multi-tenant (eventuellt)

**Mål:** Samma app ska kunna drivas för flera artister eller etiketter, var och en med egen domän, egna låtar och eget utseende.

- **Datamodell:** varje tenant får en egen spellista, egna texter, egna mediafiler under ett eget prefix eller i en egen bucket, och en egen konfiguration med namn, färger, logotyp, sociala länkar och manifest.
- **Routning:** tenant väljs efter domän eller underdomän. Förbyggda statiska sidor per tenant behåller dagens SEO-fördelar.
- **Isolering:** separata IAM-nycklar och prefix per tenant, så att en tenant inte kan skriva i en annans filer.
- **Bygge och deploy:** en byggmatris i GitHub Actions per tenant, eller ett bygge som körs när en tenant ändrar sitt innehåll.
- **Förutsättningar:** uppladdning (punkt 1) och lyssnarsiffror (punkt 2) bör finnas på plats först, eftersom de behöver vara tenant-medvetna från början. Dagens hårdkodade texter i `scripts/site-content.js` och färger i `src/styles.css` behöver flyttas till konfiguration.

## Kända brister och teknisk skuld

Det här är sådant som är värt att åtgärda, ungefär i prioritetsordning:

- **Ingen säkerhetskopia av ljudet i molnet.** Versionshantering är avstängd på media-bucketen. Ett felaktigt `--delete` eller en felaktig uppladdning går inte att ångra. Aktivera versionshantering eller replikera till en andra plats.
- **Spellistan kontrolleras inte mot schemat.** Ett fel i `playlist.json` märks först på sajten. Lägg till validering i `npm run build`.
- **Inga automatiska tester.** Gester och uppspelning har testats manuellt. Ett litet Playwright-test i WebKit och mobil storlek (spela, pausa, spola, öppna och stänga Discover, dra omslaget) skulle fånga många av de fel som hittades den här omgången.
- **CDK-stacken för CloudFront och DNS.** Den får inte driftsättas igen och inte tas bort (se nedan). Flytta posterna till OpenTofu eller ta bort CloudFront när det går.
- **Node 20 i GitHub Actions är föråldrat.** Actions varnar redan. Byt till Node 22 eller 24.
- **Scaleway CLI installeras från `master` vid varje deploy.** En deploy har redan fallerat på det. Lås en version.
- **Bilder.** Omslagen är cirka 7,5 MB totalt och serveras som JPEG/PNG i full storlek. AVIF/WebP i några storlekar (`srcset`) ger snabbare mobilladdning.
- **Säkerhetsrubriker** som Content-Security-Policy, `Referrer-Policy` och `Permissions-Policy` saknas och kan sättas i Edge Services.
- **Övervakning.** Det finns ingen upptidskontroll eller felrapportering från webbläsaren. En enkel extern ping mot sajten och mot en ljudfil räcker långt.
- **Dokumentationen.** Överlämningsdokumenten i rotkatalogen (`*_HANDOVER*.md`, `*_PLAN.md`, `*_INVESTIGATION.md`) är historik och kan flyttas till `docs/`.
- **Tillgänglighet** har förbättrats längs vägen men inte granskats systematiskt, till exempel kontrast, tangentbordsnavigering i Discover och `prefers-reduced-motion` i alla animationer.

## Drift och resurser

### AWS: CloudFront och DNS

CloudFront-distributionen `E27BVM56VP6GE4` och Route 53-posterna för `the-energy-hour.com` och `www` ägs av CloudFormation-stacken `the-energy-hour-main-stack` (CDK, `eu-west-1`).

- **Ta inte bort stacken.** Då försvinner CloudFront och DNS-posterna, och sajten går ner.
- **Driftsätt inte stacken igen.** Distributionens origin pekar nu på Scaleway, vilket har ändrats utanför CDK. En ny CDK-driftsättning kan återställa origin till den gamla S3-bucketen.
- **Stackens pipeline används inte.** `the-energy-hour-main-pipeline` och `the-energy-hour-pipeline-3` är avstängda sedan 2026-11-25. Driftsättningen görs av `.github/workflows/deploy.yml`.

`media.the-energy-hour.com` är en CNAME i Route 53-zonen `Z02620932D0CX2U386KT4` som pekar på Edge Services-pipelinen för media.

### Scaleway

- Projekt: `ungap-the-energy-hour` (`2b51727e-5099-4e8e-ba86-70dab30a8261`)
- Region: `fr-par`
- Sajtens bucket: `ungap-the-energy-hour-prod` (privat, serveras via Edge Services)
- Sajtens Edge-pipeline: `af3a7f64-0728-49da-8637-65941dc6d3a1` (`af3a7f64-0728-49da-8637-65941dc6d3a1.svc.edge.scw.cloud`)
- Media-bucket: `the-energy-hour-media`
- Media-pipeline: `508dd936-f76d-4c04-8b4a-c249cf22620b`
- OpenTofu-state: `s3://ungap-live-tofu-state/the-energy-hour/terraform.tfstate`

### GitHub Secrets

- `SCW_DEPLOY_ACCESS_KEY`, `SCW_DEPLOY_SECRET_KEY`: deployerns nyckel. Den får skriva till objekt i projektet och tömma Edge-cachen, men media-bucketens policy släpper inte in den.
- `SCW_BUCKET_NAME`, `SCW_PROJECT_ID`, `SCW_EDGE_PIPELINE_ID`
- `AWS_INVALIDATION_ROLE_ARN`, `CLOUDFRONT_DISTRIBUTION_ID`: CloudFront-invalidering via OIDC

Hemligheter ska aldrig committas.

### OpenTofu lokalt

Lokal konfiguration ligger i den ignorerade filen `config/the-energy-hour-deploy.local.json`.

```sh
python3 deploy/tofu.py init
python3 deploy/tofu.py plan \
  -var-file=../../config/the-energy-hour-deploy.local.json \
  -out=deployment.tfplan
python3 deploy/tofu.py apply deployment.tfplan
```

Planer och statefiler får inte committas.

### Repository

- Namn: `the-energy-hour`, ägare `anders-marten`, repository-id `1212362677`
- Licens: se `LICENSE`
