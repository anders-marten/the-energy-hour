# Track content handover for Claude

## Purpose

Create the complete presentation text structure for every track in The Energy Hour app.
The result should be maintainable, factual, consistent and searchable by search engines.

## Project

This is a Vite project using plain HTML, CSS and JavaScript. There is no frontend framework.

The main playlist file is `public/playlist.json`.
The track presentation schema is `public/playlist.schema.json`.

## Repository rules

- English for code, comments and commit messages.
- Do not use a framework or add dependencies unless clearly needed.
- Do not change deploy, `.github/` or infrastructure files.
- Preserve existing track IDs and service URLs.
- Do not invent facts, origins, biographical details or meanings.
- Mark uncertain or speculative text clearly rather than presenting it as fact.
- Keep track titles, track IDs and image paths intact unless a clearly documented correction is required.

## Current track model

```json
{
  "title": "Morning Can Wait",
  "id": "2441732988",
  "cover": "/images/covers/morning-can-wait.jpg",
  "thumbnail": "/images/covers/thumb/morning-can-wait.jpg",
  "teaser": "One night. One encounter. A feeling that remains.",
  "story": "Short or longer editorial description.",
  "lyrics": "/lyrics/morning-can-wait.txt",
  "featured": true,
  "links": {
    "soundcloud": "https://soundcloud.com/the_energy_hour/morning-can-wait",
    "spotify": "https://open.spotify.com/album/example",
    "appleMusic": "",
    "tidal": ""
  }
}
```

## Fields

### `title`

The display title and the public track title.

### `id`

The numeric SoundCloud track ID used by the widget.

### `cover`

Large square cover path under `public/images/covers/`.

### `thumbnail`

Small square thumbnail path under `public/images/covers/thumb/`.

### `teaser`

A short presentation of 1–2 sentences.

It should:

- appear below the track title in the app;
- describe the feeling, theme or context of the track;
- be natural in the track's language;
- avoid merely repeating the story;
- be suitable for search.

Use an empty string when no reliable teaser can be written.

### `story`

A short or medium-length editorial story.

It should:

- explain the track's origin or idea;
- use clear, readable paragraphs;
- be in the track's language;
- avoid unsupported claims;
- not mix placeholders into a finished-sounding story;
- be suitable for search.

Use an empty string when the story is unknown.

### `lyrics`

A pointer to a plain-text lyrics file:

```json
"lyrics": "/lyrics/morning-can-wait.txt"
```

Store the file at:

```text
public/lyrics/<slug>.txt
```

Use `.txt`, not HTML or Markdown, in the lyrics files.
Preserve intentional line breaks and paragraph spacing.
Do not add explanatory HTML to the text.
Use an empty string when lyrics are unavailable.

### `featured`

Set to `true` on exactly one track if that track should be the initial feature.

If there is no explicit featured track, the app falls back to the first track with a cover.
Do not add multiple featured tracks unless requested.

### `links`

External service links.

Keep empty strings for services that do not have a verified link.

## Existing source text

These tracks currently have approved source text:

- `Morning Can Wait`
- `Tokyo`

Their existing story and lyrics should be preserved or revised only to improve clarity.
Do not silently replace their meaning or introduce unsupported details.

Existing lyrics live in:

- `public/lyrics/morning-can-wait.txt`
- `public/lyrics/tokyo.txt`

## SEO requirement

Story and lyrics must be present in server-generated HTML after `npm run build`.

The SEO build script is `scripts/generate-seo-content.js`.
It:

1. reads `public/playlist.json`;
2. reads separate lyrics files pointed to by `lyrics`;
3. updates the generated track markup in `index.html`;
4. updates the JSON-LD MusicGroup schema.

Do not solve SEO only by dynamically loading text into JavaScript.
The generated HTML must contain the track story and lyrics text.

## App presentation

The text is used in:

- the desktop feature column;
- the mobile feature card;
- track rows;
- the Discover sheet;
- the full-screen player;
- SEO markup and JSON-LD;
- future search or indexing features.

The UI may hide:

- Discover if neither `story` nor `lyrics` exists;
- the Story tab if `story` is empty;
- the Lyrics tab if `lyrics` is empty or cannot be loaded;
- the full lyrics section if no lyrics file exists.

## Audio and image behavior

Playback remains a real SoundCloud widget controlled by `public/app.js`.
Keep existing widget events and iOS Safari autoplay handling.

Cover and thumbnail files must remain available at the paths stored in the playlist.
Do not download or replace image files as part of this text-generation task.

## Inventory task

Before creating text, inspect all tracks and classify them by:

1. title;
2. language;
3. whether `story` exists;
4. whether `lyrics` exists;
5. whether a teaser exists;
6. whether external links are complete;
7. whether the track is a remix, collaboration or release variant;
8. whether facts can be verified from existing project or public source material.

Present a short inventory before writing uncertain content.

## Text-generation rules

### Teaser

- 1–2 sentences;
- concise;
- no invented facts;
- use the album or track title naturally;
- do not reveal a whole story.

### Story

- 1–4 short paragraphs unless there is enough verified source material;
- explain origin or concept when known;
- distinguish fact from interpretation;
- use no first-person claims unless established in the source;
- preserve emotional tone, but do not add fabricated details.

### Lyrics

- use the supplied lyrics exactly when available;
- do not paraphrase copyrighted lyrics;
- do not add uncertain lyrics;
- leave a placeholder or empty `lyrics` pointer when the text is missing.

## Validation requirements

After editing:

1. `public/playlist.json` must contain valid JSON.
2. Every `lyrics` value must match a real file under `public/lyrics/`.
3. Every `cover` and `thumbnail` path must point to an existing file.
4. `public/playlist.schema.json` must remain valid for the resulting data.
5. `npm run build` must succeed.
6. `index.html` must contain the newly generated story and lyrics text after build.
7. The Discover sheet must hide empty tabs.
8. Mobile and desktop layouts must still work.

## Suggested workflow

1. Inventory all tracks.
2. Identify tracks that already have verified source text.
3. Write teases for tracks with no story or lyrics.
4. Write story text only when information is available.
5. Create separate lyrics files for every track with supplied lyrics.
6. Update `public/playlist.json`.
7. Update [public/playlist.schema.json](/Users/anders/github/ungap/the-energy-hour/public/playlist.schema.json) only if the data model changes.
8. Run `npm run build`.
9. Verify the generated HTML contains the text.
10. Report facts, interpretations, placeholders and items needing approval.

## Final report format

Return a short summary with:

- number of tracks updated;
- tracks with verified stories;
- tracks with verified lyrics;
- tracks with neutral or placeholder teases;
- tracks needing user-provided facts;
- any unresolved or conflicting track metadata;
- validation commands run and result.
