# the-energy-hour

Det här projektet är ett statiskt webbprojekt byggt med Vite och distribuerat till AWS. Repositoryt innehåller en enkel frontend utan ramverk, där byggprocessen genererar filer till `dist/` som sedan publiceras till en S3-bucket och levereras via CloudFront.

## Om projektet

Repositoryt ägs av `anders-marten` och fokuserar på en lättviktig webbapplikation med enkel byggkedja och automatiserad deployment.

## Teknikstack

Projektet använder en avsiktligt liten och enkel teknikstack:

- **HTML** som huvudspråk i projektet
- **Vite** som byggverktyg och lokal utvecklingsserver
- **Node.js 20** i CI/CD-miljön
- **npm** för pakethantering och skript
- **AWS S3** för hosting av den byggda sajten
- **AWS CloudFront** för distribution, cache och publicering
- **AWS CodeBuild** för att köra byggsteget
- **AWS CodePipeline** för att koppla GitHub till bygg och publicering

`package.json` visar att projektet använder Vite utan något extra frontend-ramverk, vilket tyder på att lösningen är byggd som en enkel statisk webbapp.

## Utvecklingsflöde

Det nuvarande utvecklingsflödet ser ut att vara:

1. Klona repositoryt lokalt.
2. Installera beroenden med `npm ci` eller `npm install`.
3. Starta lokal utvecklingsserver med `npm run dev`.
4. Bygg produktionsversionen med `npm run build`.
5. Förhandsgranska byggd version med `npm run preview`.
6. Committa och pusha ändringar till GitHub.
7. Låt AWS CodePipeline/CodeBuild bygga och publicera den nya versionen automatiskt.

### Viktiga npm-skript

- `npm run dev` – startar Vites utvecklingsserver
- `npm run build` – bygger projektet till `dist/`
- `npm run preview` – förhandsgranskar den byggda versionen lokalt

## Deployment och konfiguration

Deployflödet är definierat i `buildspec.yml` och dokumenterat i `aws_cicd_guide.md`.

### Bygg- och deployprocess

CI/CD-flödet fungerar i huvudsak så här:

1. GitHub används som källa för koden.
2. AWS CodePipeline triggar en build när ändringar pushas.
3. AWS CodeBuild kör `npm ci` och därefter `npm run build`.
4. Byggresultatet i `dist/` synkas till S3-bucketen `s3://the-energy-hour`.
5. En CloudFront-invalidation körs för distributionen `E7A8JILDM72BF` så att nya filer blir synliga direkt.

### Viktiga konfigurationspunkter

- **Byggutdata:** `dist/`
- **Node-version i CI:** `20`
- **Deploymål:** S3-bucketen `the-energy-hour`
- **CDN/cache-invalidering:** CloudFront-distribution `E7A8JILDM72BF`
- **Byggspecifikation:** `buildspec.yml` i repositoryts rot

### AWS-komponenter som används

- **S3** för lagring och hosting av statiska filer
- **CloudFront** för distribution av webbplatsen
- **CodeBuild** för buildsteget
- **CodePipeline** för automatiserad CI/CD
- **IAM** för åtkomst till artifact bucket, webb-bucket, CloudFront och loggar

## Drift och innehåll

Repositoryt innehåller även en `public/`-katalog, vilket följer Vites standardmönster för statiska tillgångar. Där finns bland annat:

- `manifest.webmanifest`
- `playlist.json`
- en bildkatalog under `public/images`

Det tyder på att projektet publicerar statiska resurser direkt tillsammans med den byggda sajten.

## Vidare förbättringar av README

README:n kan senare kompletteras ytterligare med:

- lokal installationsguide steg för steg
- exempel på mappstruktur
- beskrivning av syftet med `playlist.json`
- hur domännamn och HTTPS hanteras i CloudFront
- eventuella rutiner för versionshantering och releaseflöde

## Repositoryinformation

- **Namn:** the-energy-hour
- **Ägare:** anders-marten
- **Repository ID:** 1212362677
