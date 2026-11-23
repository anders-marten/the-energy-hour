# the-energy-hour

En lättviktig statisk musiksite för The Energy Hour, byggd med Vite och plain HTML, CSS och JavaScript.

## Lokal utveckling

```sh
npm ci
npm run dev
```

Produktionsbyggnad:

```sh
npm run build
npm run preview
```

Builden genererar SEO-innehåll från `public/playlist.json` och skriver den färdiga sajten till `dist/`.

## Teknik

- HTML, CSS och JavaScript
- Vite
- Node.js 20 i CI/CD
- GitHub Actions
- Scaleway Object Storage
- Scaleway Edge Services
- AWS Route 53
- AWS CloudFront

## Production

Sajten ligger primärt på Scaleway:

```text
Besökare
  -> Route 53
  -> AWS CloudFront
  -> Scaleway Edge Services
  -> Scaleway Object Storage
```

AWS CloudFront är en temporär proxy som gör det möjligt att behålla Apex-domänen i Route 53. Scaleway Edge Services är primär origin.

Användaren når samma domän oavsett backend:

- `the-energy-hour.com`
- `www.the-energy-hour.com`

AWS Route 53 och CloudFront kan tas bort eller ersättas när Scaleway stöder samma apexdomän på ett lämpligt DNS/CDN-sätt.

## Scaleway-resurser

Produktionen använder ett separat Scaleway-projekt:

- Projekt: `ungap-the-energy-hour`
- Projekt-ID: `2b51727e-5099-4e8e-ba86-70dab30a8261`
- Region: `fr-par`
- Privat bucket: `ungap-the-energy-hour-prod`
- Edge pipeline: `af3a7f64-0728-49da-8637-65941dc6d3a1`
- Edge endpoint: `af3a7f64-0728-49da-8637-65941dc6d3a1.svc.edge.scw.cloud`
- State: `s3://ungap-live-tofu-state/the-energy-hour/terraform.tfstate`

Infrastrukturen definieras i `deploy/infra` och hanteras med OpenTofu.

## Deploy från GitHub

Pushar till `main` kör `.github/workflows/deploy.yml`:

1. Installera Node.js beroenden.
2. Bygg sajten med `npm run build`.
3. Synka `dist/` till Scaleway Object Storage.
4. Rensa Edge Services-cache.

Arbetsflödet använder följande GitHub Secrets:

- `SCW_DEPLOY_ACCESS_KEY`
- `SCW_DEPLOY_SECRET_KEY`
- `SCW_BUCKET_NAME`
- `SCW_PROJECT_ID`
- `SCW_EDGE_PIPELINE_ID`

Hemligheterna ska aldrig committas till repositoryt.

## Lokal OpenTofu

Lokal konfiguration sparas i den ignorerade filen `config/the-energy-hour-deploy.local.json`.

```sh
python3 deploy/tofu.py init
python3 deploy/tofu.py plan \
  -var-file=../../config/the-energy-hour-deploy.local.json \
  -out=deployment.tfplan
python3 deploy/tofu.py apply deployment.tfplan
```

Planer och statefiler får inte committas.

## Innehåll

Statiska resurser ligger under `public/`:

- `public/playlist.json` — låtlistan och externa länkar
- `public/images/` — logotyper, favicon och appikoner
- `public/styles.css` — webbplatsens stil
- `public/app.js` — spelare och playlistlogik

Repository:

- Namn: `the-energy-hour`
- Ägare: `anders-marten`
- Repository ID: `1212362677`
