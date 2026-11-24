# Investigation: own audio player instead of the SoundCloud widget

Status: investigation, updated with decisions. No code changed. Date: 2026-11-24.

## Decisions (Anders, 2026-11-24)

1. **Audio source:** download the files from SoundCloud, automatically if possible.
2. **Rights:** Anders holds the rights to all tracks, including the remixes. Every track gets its own file. No hybrid player is needed.
3. **Storage:** audio files are stored in Scaleway Object Storage. AWS CloudFront is used only for apex routing from Route 53.
4. **SoundCloud statistics:** plays through the embedded widget do not seem to count on SoundCloud anyway, so nothing is lost by dropping the widget.
5. **Loudness:** the masters play as they are. No loudness normalization.

## Problem

On iPhone, the first tap on a play button often does not start playback.

The SoundCloud widget is a cross-origin iframe. The page controls it with `postMessage` (`widget.play()`). iOS Safari only starts audio when playback is triggered directly by a user gesture. When a different track is tapped, `app.js` calls `widget.load()` and only calls `widget.play()` in the load callback ([app.js:232](public/app.js:232)). By then the gesture has expired, so Safari blocks playback. Details and short-term fixes are in `PLAYBACK_FIRST_TAP_HANDOVER.md`.

As long as playback goes through a cross-origin iframe, this cannot be fully controlled from the page.

## Solution

Play every track with one `<audio>` element in the page. Self-host the audio files and call `audio.play()` synchronously in the click handler. This is the pattern iOS supports reliably:

- Setting `audio.src` and calling `audio.play()` in the same click handler starts playback on the first tap.
- After the first gesture-started playback, the same element may start the next track from the `ended` event. Auto-advance therefore keeps working, also with the screen locked. This must be verified on a device.
- The Media Session API (Safari 15+) shows title, artist and cover on the lock screen and in Control Center, with play/pause/previous/next.
- Use `<audio>`, not the Web Audio API. Web Audio is muted by the ringer switch on iOS.

Because every track gets its own file, the SoundCloud widget is removed completely:

- `api.js`
- `SC.Widget`
- the state polling
- the feature-slot iframe

SoundCloud and Spotify stay as links in Discover → Info.

### Effect on the short-term widget fixes

`PLAYBACK_FIRST_TAP_HANDOVER.md` describes fixes for the current widget:

- Fix 3 and Fix 4 are no longer worth building, because the widget will be removed.
- Fix 1 and Fix 2 are worth doing only if getting the audio files takes several weeks.

## 1. Getting the files from SoundCloud

Checked against the current SoundCloud API spec (`developers.soundcloud.com/docs/api/explorer/api.json`, 2026-11-24):

- **There is no `/tracks/{id}/download` endpoint in the current spec.**
- **The track object has `download_url`.** The spec describes it as "URL to download a track. Omitted or null when track is not downloadable." It points to the originally uploaded file.
- **`downloadable` can be changed through the API.** `PUT /tracks/{track_urn}` accepts `downloadable`.
- **Transcoded streams are available.** `GET /tracks/{track_urn}/streams` returns lossy versions (MP3 128 kbps, AAC 160 kbps HLS).
- **Authentication:** OAuth 2.1 with PKCE against `secure.soundcloud.com`. All API use requires a registered application. Tokens expire after about an hour.

**Unverified:** whether the owner receives `download_url` for their own tracks when downloads are switched off. Test this first, with one track.

### Order of preference

1. **The owner receives `download_url` with downloads switched off.** A script fetches every original directly. Best case.
2. **Downloads are switched on per track for a moment.** A script does this for one track at a time:
   - sets `downloadable: true`
   - downloads the original
   - sets `downloadable: false` again

   The track can be downloaded publicly for a few seconds, which should be acceptable. The script must record each track's original `downloadable` value and restore it, also if it fails halfway.
3. **Transcoded streams from `/streams`.** Use this only if 1 and 2 fail. These files are already lossy. Serve them as they are, with a remux at most (`ffmpeg -c copy`), not a second lossy encode. The quality is lower than the originals.

Do not use tools that scrape SoundCloud with the website's own client id (for example `scdl` or `yt-dlp`). That breaks SoundCloud's terms.

The track `id` in `public/playlist.json` is the SoundCloud track id, so mapping files to tracks is automatic (`track_urn` = `soundcloud:tracks:<id>`).

### What Anders does

- Register an application in SoundCloud's developer portal.
- Log in once through the OAuth flow (the script opens the login page; Anders signs in himself).
- Keep the client secret and tokens in a local, git-ignored file (`config/*.local.json`, like the deploy config). Never commit them.

## 2. Encoding

`ffmpeg`, `ffprobe` and `afconvert` are installed locally.

| Original | Handling |
| --- | --- |
| WAV / AIFF / FLAC (lossless) | Encode to AAC-LC 192 kbps `.m4a` |
| MP3 / AAC (already lossy) | Keep the codec; remux to `.m4a` if AAC, otherwise serve the MP3 as is |

For every file:

- Write title, artist ("The Energy Hour") and cover as metadata.
- Put a content hash in the filename (`<slug>-<hash8>.m4a`), so files can be cached as immutable.
- No loudness normalization or other processing. The masters play as they are (decision 5).
- Read the duration with `ffprobe` and write it to `playlist.json`.

Keep the downloaded originals locally, outside the repo. Do not commit audio to git.

## 3. Storage and delivery on Scaleway

The live site already runs through this chain: Route 53 → CloudFront (apex) → Scaleway. The `x-amz-*` headers in the response come from Scaleway's S3-compatible API.

The live site returns `206 Partial Content` for `Range` requests through this chain. iOS Safari requires that for audio seeking.

`buildspec.yml` (AWS CodeBuild → S3 bucket `the-energy-hour`) appears to be legacy. Check that the AWS pipeline is switched off, so two pipelines do not sync in parallel.

### Proposal

- **Separate bucket**, for example `the-energy-hour-media` in `fr-par`.
  - The site deploy (`deploy.yml`) runs `aws s3 sync dist/ … --delete`. It would delete audio files placed in the site bucket.
  - A separate bucket keeps about 300 MB out of git and out of every deploy.
- **Subdomain** `media.the-energy-hour.com`:
  - a CNAME in Route 53 straight to Scaleway (Edge Services or the bucket website endpoint)
  - subdomains do not need the CloudFront apex workaround, so audio does not pass through two CDNs
  - check that `Range` returns `206` on the new hostname too
- **Object metadata at upload:**
  - `Content-Type: audio/mp4` (or `audio/mpeg`)
  - `Cache-Control: public, max-age=31536000, immutable`
- **No CORS rules needed.** A plain `<audio>` element (without the `crossorigin` attribute) and Media Session artwork work across origins. CORS is needed only if the audio is later read with `fetch` or Web Audio.
- **Upload script:** `aws s3 cp` / `sync` against `https://s3.fr-par.scw.cloud`, with the same kind of credentials as the deploy, but only on Anders' machine or in a separate manual workflow. Not in the site deploy.

### Cost

64 tracks × about 4 min at AAC 192 kbps ≈ 6 MB per track ≈ 400 MB in total. One full listen ≈ 6 MB, so 1,000 full plays ≈ 6 GB of transfer. Check Scaleway's current prices before deciding, but the cost should be small.

## 4. What changes on the site

- **Plays no longer go through SoundCloud.** According to Anders they are not counted there today anyway. Own play measurement can be added later from `<audio>` events (`play`, `ended`, time listened).
- **The SoundCloud waveform disappears.** The feature slot shows the cover with an own progress bar or scrubber and a time readout. This is a design task.
- **SoundCloud's "Privacy policy" box and its third-party cookies disappear.** This is a privacy improvement.

## Technical design

**Data:**

- New fields per track in `public/playlist.json`:
  - `"audio": "https://media.the-energy-hour.com/<slug>-<hash8>.m4a"`
  - `"duration"` in seconds
- Add both to `playlist.schema.json`.

**Scripts (new, in `scripts/`):**

| Script | Job |
| --- | --- |
| `soundcloud-auth` | OAuth PKCE login. Stores the token locally (git-ignored). |
| `fetch-originals` | For each track id: fetch `download_url` (fallback 2 or 3 above), download into a local folder outside the repo, and log the result per track. |
| `encode-audio` | Encode or remux, write metadata, hash the filename, and read the duration. |
| `upload-audio` | Upload to the media bucket with the right metadata, then write `audio` and `duration` into `playlist.json`. |

**Player (`app.js`):**

- One shared `<audio preload="none">` element.
- Play: set `src` if the track changed, then call `audio.play()` synchronously in the click handler.
- Drive the UI state from the `playing`, `pause`, `waiting`, `ended` and `error` events, never optimistically.
- On `ended`, play the next track.
- Media Session: metadata (title, artist, cover), plus play, pause, previoustrack, nexttrack and seekto actions.
- Remove `SC.Widget`, the polling and the `api.js` script tag.

**UI:**

- The feature slot shows the cover, a progress bar and the time instead of the iframe.
- The full view and mini player keep their current design.

**SEO:**

- The JSON-LD `MusicRecording` entries get `audio` (`AudioObject` with `contentUrl` and `duration`).

## Plan

| Step | Who | Done when |
| --- | --- | --- |
| 1. Register a SoundCloud app; test `download_url` as owner on one track | Anders + Claude | It is known which fetch path (1, 2 or 3) works |
| 2. Create the media bucket and `media.the-energy-hour.com`; check `Range` and cache headers | Anders (cloud account) + Claude | One test file plays from the subdomain with `206` |
| 3. Fetch, encode and upload 2–3 tracks | Claude | Files are in the bucket; `playlist.json` has `audio` for them |
| 4. Build the own player; tracks without `audio` temporarily fall back to the widget | Claude | Works on desktop |
| 5. Test on a real iPhone: first tap, auto-advance, locked screen, lock-screen controls | Anders | All cases work |
| 6. Fetch, encode and upload the remaining tracks | Claude | All 64 tracks have `audio` |
| 7. Remove the SoundCloud widget, `api.js` and the fallback | Claude | No SoundCloud iframe on the site |

The temporary fallback in step 4 exists only so the site keeps working during the migration. It is removed in step 7.
