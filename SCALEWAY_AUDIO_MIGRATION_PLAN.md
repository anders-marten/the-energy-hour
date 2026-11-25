# Plan: move the tracks to Scaleway

Status: steps 1–6 done (2026-11-25). All 64 tracks are self-hosted. Remaining: remove the SoundCloud widget code (investigation plan step 7).

- **Pilot on iPhone:** Anders confirmed that the first tap starts playback.
- **Full run:**
  - 64 files encoded (46 AAC 256 kbps from lossless masters, 9 AAC remuxes, 9 MP3 remuxes). 433 MB in total.
  - The pilot files kept the same hash, because the encoding is deterministic.
  - All 64 uploaded; `playlist.json` has `audio` and `duration` for every track.
  - Every URL answers `206` to a `Range` request with the right size.
- **Local preview:** auto-advance from one self-hosted track to the next works, and no SoundCloud iframe is loaded.

Done:
- **Step 1:** `deploy/infra/media.tf` applied. 10 resources added, 0 changed, 0 destroyed:
  - bucket `the-energy-hour-media`
  - Edge Services pipeline `the-energy-hour-media` (`508dd936-f76d-4c04-8b4a-c249cf22620b`)
- **Step 2:** Route 53 CNAME `media.the-energy-hour.com` → `508dd936-f76d-4c04-8b4a-c249cf22620b.svc.edge.scw.cloud`, in zone `Z02620932D0CX2U386KT4`, created with the `ungap-aws-admin` profile.
- **Step 3:** verified with a 20-second test tone, which was then removed:
  - HTTP/2 `200` with `Content-Type: audio/mp4` and `Accept-Ranges: bytes`
  - `Range` requests return `206` with the correct `Content-Range`
  - edge cache hit (`x-cache: hit-fresh`)
  - bytes identical to the source
  - root returns `403` (no listing); a missing file returns `404`
  - Let's Encrypt certificate for `media.the-energy-hour.com`, valid until 2027-02-22, renewed by Scaleway
  - the certificate took about two minutes to reach every edge node after the pipeline was ready
  - playback in Safari was not tested

- **Steps 4–5:** `scripts/encode-audio.py` and `scripts/upload-audio.py` written. `playlist.schema.json` has `audio` and `duration`.
- **Step 6 pilot:** three tracks encoded, uploaded and verified:

  | Track | Id | Kind | Size | Length |
  | --- | --- | --- | --- | --- |
  | Tokyo | `2441734662` | 24-bit WAV → AAC 256 kbps (48 kHz) | 8.2 MB | 245.00 s |
  | U make my heart | `2308189358` | AAC remux (moov moved first; embedded cover art dropped) | 7.7 MB | 237.79 s |
  | House Break - 1994 | `32522641` | MP3 remux (192 kbps; tags and cover art removed) | 6.4 MB | 265.09 s |

  For each track:
  - `200` with the right `Content-Type`
  - `Cache-Control: public, max-age=31536000, immutable`
  - `Range` requests return `206`
  - the bytes served match the local file
  - a second upload run left the objects untouched (`kept`), and `playlist.json` got exactly the three `audio`/`duration` pairs
  - `npm run build` succeeds
  - playback in Safari or on iPhone was not tested

Original date of the plan: 2026-11-25.
Background: `AUDIO_PLAYER_INVESTIGATION.md` (decisions, method, technical design).

Goal: every track in `public/playlist.json` gets an `audio` URL on `https://media.the-energy-hour.com/…` that plays on iPhone (progressive download with `Range` requests) and is cached for a long time. The player work itself (own `<audio>` player) is a separate step after this plan.

## Current state (checked 2026-11-25)

- **Originals:** 64 files in `~/Desktop/desktop/The Energy Hour 2024/soundcloud-originals/`, listed by track id in `manifest.tsv`.
  - 46 lossless (WAV/AIFF, 16- or 24-bit)
  - 9 AAC `.m4a`
  - 9 MP3
- **iCloud:** the folder is on the iCloud-synced Desktop, and only part of it is stored locally.
- **AAC layout:** 8 of the 9 `.m4a` files already have `moov` first (fast start). `u-make-my-heart.m4a` has `moov` last and must be remuxed for progressive playback.
- **Tools:**
  - `ffmpeg` with `aac_at` (Apple's AAC encoder through AudioToolbox, better quality than ffmpeg's own `aac`)
  - `ffprobe`
  - `aws` CLI 2.36
  - `scw` CLI 2.62
- **Infrastructure as code:** OpenTofu in `deploy/infra/`, run with `deploy/tofu.py` (Scaleway CLI profile). State is in `ungap-live-tofu-state`, key `the-energy-hour/terraform.tfstate`.
  - The site has its own project `ungap-the-energy-hour`, bucket, deployer IAM app and Edge Services pipeline `the-energy-hour-production`.
  - Edge Services plan: **starter**, with 6 pipelines in the organization already.
- **DNS:** the local AWS user (`ungap-live-cli`) is **not allowed** to read or change Route 53, so DNS changes are done by Anders.
- **Site deploy:** `deploy.yml` runs `aws s3 sync dist/ … --delete` against the site bucket. A separate media bucket is not affected.

## Decisions needed from Anders

1. **Delivery path.** **Decided 2026-11-25: A, own subdomain.**

   | Option | How | Pros | Cons |
   | --- | --- | --- | --- |
   | **A. Own subdomain** (recommended) | New bucket + new Edge Services pipeline with custom domain `media.the-energy-hour.com`; CNAME in Route 53 | Fits "CloudFront only for apex"; audio passes through one CDN; independent of the site | One more Edge Services pipeline. **Check the cost on the starter plan first** |
   | B. Same pipeline, `/audio/*` | New bucket + an extra route rule in the existing pipeline | No new pipeline or DNS record | Audio passes through CloudFront too (apex), with AWS transfer costs and double caching |

2. **Where the originals live during encoding.** **Decided 2026-11-25: copy to `~/Music/the-energy-hour-originals/`.** Recommended: copy them to `~/Music/the-energy-hour-originals/`, which is not synced with iCloud. Or keep them on the Desktop and download them all locally first ("Keep downloaded" in Finder).

3. **Embedded cover art in MP3 files.** **Decided 2026-11-25: strip the tags with a lossless remux.** Some MP3s carry large ID3 images, for example `house-break.mp3`. Options:
   - Strip the tags with a lossless remux. The audio is untouched (`-c copy`); only the tags go. Recommended.
   - Keep the files byte for byte as they are.

Note on decision 5 ("masters play as they are"): the lossless masters still need to be encoded to AAC for the web. WAV files of 40–100 MB per track are too large for mobile. No loudness or other processing is applied; only the format changes.

## Steps

### Step 1: infrastructure (Claude writes, Anders approves)

New file `deploy/infra/media.tf`, following the patterns in `storage.tf` and `edge.tf`:

- **Bucket** `the-energy-hour-media` (or another globally unique name):
  - in project `ungap-the-energy-hour`, `fr-par`
  - `prevent_destroy`, no versioning
  - ACL `private`
- **Bucket policy:**
  - public `s3:GetObject` on objects
  - full access only for the owner and the existing CLI app (like the site bucket)
  - the GitHub deployer gets no write access; uploads are done manually
- **No website configuration and no CORS.**
- **Edge Services pipeline** `the-energy-hour-media` (option A):
  - S3 backend (`is_website = false`)
  - route GET/HEAD
  - cache stage with a long `fallback_ttl` (for example 86400); objects also carry `Cache-Control: immutable`
  - TLS stage with a managed certificate
  - DNS stage with `fqdns = ["media.the-energy-hour.com"]`
- **Outputs:** bucket name and the pipeline's default FQDN (the CNAME target).

Approval: Claude runs `python3 deploy/tofu.py plan` and shows the plan. **Nothing is applied before Anders has approved the plan and the cost.** For option A, check first whether one more pipeline costs extra on the starter plan.

### Step 2: DNS (Anders)

- Create a CNAME in Route 53: `media.the-energy-hour.com` → the pipeline's default FQDN (the output from step 1).
- The managed certificate is issued when the CNAME resolves. Depending on how Scaleway validates it, the CNAME may need to exist before the TLS stage is applied. If so, apply in two rounds.

### Step 3: verify with a test file (Claude)

Upload a short test file and check against `https://media.the-energy-hour.com/`:

- `HEAD` returns `200` with the right `Content-Type` and `Cache-Control`
- `Range: bytes=0-99` returns `206` with `Content-Range`
- the TLS certificate is valid for the subdomain
- the file plays in Safari on the Mac

Remove the test file afterwards.

### Step 4: encoding script (Claude)

New script `scripts/encode-audio.py` (a tool only; no audio in git):

- **Input:** `manifest.tsv` + the originals folder.
- **Output folder:** outside the repo, for example `~/Music/the-energy-hour-media/`.
- **Per track, by format:**

  | Original | Command (sketch) |
  | --- | --- |
  | WAV/AIFF | `afconvert -f m4af -d aac -b 256000 -s 2 -q 127 in out.m4a` (Apple AAC, constrained VBR, highest quality, full source precision), then the AAC remux below. **Decided 2026-11-25: 256 kbps.** ffmpeg's `aac_at` was not used because it only accepts 16-bit input. |
  | AAC `.m4a` | `ffmpeg -i in -map 0:a:0 -c copy -movflags +faststart -map_metadata -1 … out.m4a` (lossless remux) |
  | MP3 | `ffmpeg -i in -map 0:a:0 -c copy -map_metadata -1 … out.mp3` (lossless, strips cover art; per decision 3) |

- **File name:** `<track id>-<sha256 of content, 8 characters>.<ext>`.
  - The id rather than the slug, so the swapped You make my heart / U make my heart links do not matter.
  - The hash makes every new version a new URL, so files can be cached for a year.
- **Results file** `audio-manifest.json` with id, file, duration (from `ffprobe`), bytes and content type.
- **Checks:**
  - every track has exactly one output file
  - the duration is within ±0.5 s of the original
  - every `.m4a` has `moov` first

Expected size: about 400 MB in total, compared with 2.4 GB for the originals.

### Step 5: upload and playlist (Claude)

New script `scripts/upload-audio.py`:

- **Upload:** use the credentials from the `scw` profile (like `deploy/tofu.py`). For each file in `audio-manifest.json`, run `aws s3 cp` against `https://s3.fr-par.scw.cloud` with:
  - `Content-Type`: `audio/mp4` or `audio/mpeg`
  - `Cache-Control: public, max-age=31536000, immutable`
- **Repeatable:** skip objects that already exist. Hashed names make this safe.
- **Playlist:** write `"audio"` (full URL) and `"duration"` (seconds) into `public/playlist.json`.
- **Schema:** add both fields to `public/playlist.schema.json`.
- **Never deletes objects.** Old versions are cleaned up manually later, if at all.

### Step 6: pilot first, then everything

1. Run steps 4–5 for three tracks that cover all cases:
   - Tokyo (24-bit WAV → AAC)
   - U make my heart (AAC with `moov` last → remux)
   - House Break (MP3 with large cover art)
2. Check each URL with `curl` (`200`/`206`) and play it in Safari.
3. Then run all 64.

`playlist.json` gets `audio` fields, but the site keeps using the SoundCloud widget until the player is built (steps 4–7 in the investigation). The fields can therefore be committed and deployed early without changing the site's behavior.

### Step 7: commits

- `deploy/infra/media.tf` (+ outputs) and the two scripts: one commit.
- `playlist.json` + schema with `audio`/`duration`: one commit, after the full upload.
- Push only when Anders says so.

## Who does what

| Step | Claude | Anders |
| --- | --- | --- |
| Decisions 1–3 | | Decide |
| 1. Infrastructure | Write `media.tf`, run `plan` | Approve the plan and cost; Claude then runs `apply` |
| 2. DNS | Provide the CNAME target | Create the CNAME in Route 53 |
| 3. Verification | Test file, `curl` checks | |
| 4–5. Encoding, upload, playlist | Write and run the scripts | |
| 6. Pilot | Run and check | Listen through the pilot tracks if wanted |
| 7. Commits | Commit | Approve commit and push |

## Risks

- **Edge Services cost.** A new pipeline may raise the monthly cost on the starter plan. Mitigation: check before `apply`, or choose option B.
- **Certificate order.** The managed certificate may need the CNAME to exist first. Mitigation: apply in two rounds.
- **iCloud.** Files that are not stored locally make reads slow or fail. Mitigation: decision 2.
- **Shared OpenTofu state bucket.** The state lives in `ungap-live-tofu-state`, which is also used by the live project. Only touch the key `the-energy-hour/terraform.tfstate`. Never run `destroy`.
