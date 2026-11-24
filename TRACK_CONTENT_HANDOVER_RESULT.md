# Track content – handover result

Result of the task described in `CLAUDE_TRACK_CONTENT_HANDOVER.md`.

## Commits (local `main`, not pushed)

| Commit | Content |
| --- | --- |
| `77eaa91` | Teasers, stories and lyrics for all tracks; schema allows empty `lyrics`; SEO markup regenerated |
| `87b58bc` | Pronunciation spellings in lyrics normalized to standard spelling; SEO markup regenerated |

Untracked `.DS_Store` files and `.vscode/` were left out on purpose.

## Sources

Only verified, artist-owned sources were used. Nothing was invented.

1. **SoundCloud track descriptions** published by The Energy Hour (fetched from each track's public page). Used for teasers and stories.
2. **Lyric blueprints** in `~/Desktop/desktop/The Energy Hour 2024/Sångtexter/` (`lyrics/*.md`, 26 songs, author Anders Mårtén). Used for lyrics and some teasers.
3. **`Tokyo_Song_Blueprint_Anders_Marten.docx`** in the same folder. It confirms the existing Tokyo story, which was left unchanged.

## Result

- **64 tracks.** Every track has a `teaser`, plus `story` and `lyrics` as strings (empty when there is nothing).
- **27 stories.** They come from the artist's SoundCloud descriptions, rewritten in the third person ("The Energy Hour").
- **31 tracks with lyrics**, using 26 lyrics files in `public/lyrics/`.
- **Morning Can Wait** is still the only `featured` track.
- **Language:** text follows the track's language. Instrumental tracks, and tracks whose language is unclear, use English.
- **Schema:** the `lyrics` pattern in `public/playlist.schema.json` is now `^$|^/lyrics/.+\.txt$`, because the handover requires empty strings for missing lyrics.

### How lyrics were cleaned

- Only the content of the `text` code block was used.
- Removed:
  - lines that are entirely `[...]`, such as arrangement and section directions
  - leading `[Lead]` / `[Backing]` tags
  - the section labels `VERSE`, `CHORUS` and `INSTRUMENTAL INTRO`
  - the section labels `(verse)`, `(chorus)`, `(pre chorus)`, `(bridge)`, `(outro)`, `(end)` and `(instrumental …)`
  - Markdown asterisks and `&#xA0;`
- Three or more blank lines were collapsed to one.
- Ad-libs in parentheses were kept, for example "(Tokyo)" and "(What happened!)".
- Check: the rule reproduces the previously approved `tokyo.txt` exactly.

### Spelling normalization

Phonetic spellings written for vocal generation were replaced with standard spelling. Examples:

| File | Before | After |
| --- | --- | --- |
| `rocket-funk.txt` | planét | planet |
| `rocket-funk.txt` | jay bees | JB:s |
| `man-cave.txt` | man kejv | man cave |
| `vad-vet-jag.txt` | Mashiin, Männisha | Maskin, Människa |
| `mamma.txt` | leer mot kaamran | ler mot kameran |
| `mamma.txt`, `varje-morgon-ar-du-ny.txt` | å (as conjunction) | och |
| `varje-morgon-ar-du-ny.txt` | proschekt | projekt |
| `som-allt-du-gor.txt` | inchenjör, succe | ingenjör, succé |
| `en-strimma-av-hopp.txt`, `morkrum.txt` | irr-bloss, trettio-sex | irrbloss, trettiosex |
| `feeling-low.txt` | I. do. not. know. | I do not know. |
| `sending-it-high.txt` | trapeeze, loards, up-riight | trapeze, lords, upright |
| `sending-it-high.txt` | it's seems | it seems |

Kept on purpose:

- **Tokyo:** "To-ky-oo" and "Ne-on", which are part of the approved hook.
- **Colloquial and slang words:** "det hära" (it rhymes with "kära"), "vajb", "bjussar", "åå" and "hou hou".
- **Patois** in Goodness Signal.

## Track–lyrics mapping that needs confirmation

- **Shared lyrics files.** These versions of the same song use one file. Split the file if the lyrics differ between versions.
  - Act of balance + Act of balance (Spectrum mix) → `act-of-balance.txt`
  - Feeling low (Trance) + Feeling low (Deep house) → `feeling-low.txt`
  - Bow of love + Bow of love (Holiday Edit) → `bow-of-love.txt`
  - Mörkrum – Dansband-ish + Mörkrum – Hip hop remix → `morkrum.txt`
  - En strimma av hopp (Julen 2024) + (Holiday Edit) → `en-strimma-av-hopp.txt`
- **Minnen vid vattnet → Minnen by the synth.** The titles differ. The SoundCloud description mentions "minnen vid vattnet".
- **You Make My Heart → "You make my heart" (id `2186965518`).** The match is based on the "pump" lyrics and the matching "Keep My Heart Pump" description. "U make my heart" (`2308189358`, the song written before a cardiac ablation) has no lyrics yet.

## Open issues

1. **Swapped links.** The SoundCloud links of "You make my heart" (`2186965518`) and "U make my heart" (`2308189358`) point to each other's pages. Spotify may be affected too. The links are unchanged, but texts follow the track id, which is what the widget plays.
2. **Conflicting years.** The SoundCloud descriptions give different years from the titles:
   - Analog Bass Sweep – 1994: recorded 1993
   - House Break – 1994: made 1997
   - The Energy Hour – 1994: recorded 1997

   The texts avoid the year for these tracks.
3. **Unconfirmed relations.** These were not stated in the texts:
   - Feels like new seems to be a version of Varje morgon är du ny (a wedding in Greece/Rhodes).
   - Goodness signal and Godhetssignal have parallel lyrics.
4. **Private names left out.** Names of third parties were omitted: wedding couples, fellow musicians, vocalists, and "Siri" in Hjalmar – Skog Med Siri. The photo credit Henrik Trygg (Sending it high) was kept. Add the names if wanted.
5. **Facts needed.**
   - Hjalmar – Skog Med Siri
   - Alva – När Världen Håller Andan (the SoundCloud URL says "preview")
   - Säg funk funk (the description refers only to a wedding)
   - Uno 50
   - Wild One (SoundCloud title "Wild One – 3")
6. **Neutral teasers.** These teasers are based only on genre or title: Black Friday, Vox On Vox, Julen på radion, Säg funk funk, Uno 50, Farr 30, Analog Bass Sweep, The Energy Hour – 1994.
7. **Missing lyrics.** 33 tracks have no lyrics. Many are instrumental, but these appear to have vocals: All In, Luxury, I collect, Haze 2026, It was you, Julen på radion, Feels like new, När första ljuset brinner, U make my heart.
8. **Ambiguous word.** "every gib is lean" in `sending-it-high.txt` could mean gybe or jib. It was not changed.

## Validation run

- `public/playlist.json` is valid JSON.
- Track ids, titles, links, cover and thumbnail paths are unchanged compared with the commit before the task (`eef0f19`).
- Every `lyrics` pointer resolves to an existing file, and no lyrics file is unreferenced. All cover and thumbnail files exist.
- All values match the schema rules, including the lyrics pattern.
- `npm run build` succeeds: "Generated SEO content for 64 tracks."
- `index.html` and `dist/index.html` contain every teaser, the story text and the lyrics text. JSON-LD contains 64 `MusicRecording` entries.
- No browser test was run. `public/app.js` was not changed, so its existing logic still hides the Discover tabs when they are empty.

## Scripts

The one-off scripts used for the work are not part of the repo. They lived in the session scratchpad and are not needed to maintain the content. To add lyrics later:

1. Save the plain text as `public/lyrics/<slug>.txt`.
2. Set `"lyrics": "/lyrics/<slug>.txt"` in `public/playlist.json`.
3. Run `npm run build`.
