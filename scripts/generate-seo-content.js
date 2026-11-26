const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const indexPath = path.join(rootDir, "index.html");
const playlistPath = path.join(rootDir, "public", "playlist.json");

const {
  SITE_URL,
  ARTIST_NAME,
  ARTIST_PERSON,
  ARTIST_LOCATION,
  ARTIST_SUMMARY,
  ARTIST_BIO,
  ARTIST_SAME_AS,
  trackSlugs,
  trackUrl,
  isoDuration
} = require("./site-content");

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanExternalUrl(value) {
  const url = String(value || "").trim();

  if (!url) {
    return "";
  }

  try {
    const parsedUrl = new URL(url);
    parsedUrl.search = "";
    parsedUrl.hash = "";

    return parsedUrl.toString();
  } catch {
    return url;
  }
}

function getLinks(track) {
  const links = track && typeof track.links === "object" ? track.links : {};

  return {
    soundcloud: typeof links.soundcloud === "string" ? cleanExternalUrl(links.soundcloud) : "",
    spotify: typeof links.spotify === "string" ? cleanExternalUrl(links.spotify) : "",
    appleMusic: typeof links.appleMusic === "string" ? cleanExternalUrl(links.appleMusic) : "",
    tidal: typeof links.tidal === "string" ? cleanExternalUrl(links.tidal) : "",
    musicbrainz: typeof links.musicbrainz === "string" ? cleanExternalUrl(links.musicbrainz) : ""
  };
}

function getLyricsText(track) {
  const pointer = typeof track.lyrics === "string" ? track.lyrics.trim() : "";
  if (!pointer.startsWith("/lyrics/")) {
    return "";
  }

  const lyricsPath = path.resolve(rootDir, "public", pointer.replace(/^\//, ""));
  const publicPrefix = path.resolve(rootDir, "public") + path.sep;
  if (!lyricsPath.startsWith(publicPrefix) || path.extname(lyricsPath) !== ".txt") {
    throw new Error(`Invalid lyrics pointer for ${track.title}: ${pointer}`);
  }

  return fs.readFileSync(lyricsPath, "utf8").trim();
}

/**
 * @typedef {Object} TrackLinks
 * @property {string} soundcloud
 * @property {string} spotify
 * @property {string} appleMusic
 * @property {string} tidal
 */

/**
 * Presentation model for one track.
 * @typedef {Object} Track
 * @property {string} title
 * @property {string} id
 * @property {string} cover
 * @property {string} thumbnail
 * @property {string} teaser
 * @property {string} story
 * @property {string} lyrics
 * @property {string} lyricsText
 * @property {boolean} featured
 * @property {TrackLinks} links
 */

/** @returns {Track[]} */
function normalizeTracks(items) {
  if (!Array.isArray(items)) {
    throw new Error("playlist.json must contain an array.");
  }

  return items
    .map((item) => {
      const track = {
        title: typeof item.title === "string" ? item.title.trim() : "",
        id: String(item.id || "").trim(),
        cover: typeof item.cover === "string" ? item.cover : "",
        thumbnail: typeof item.thumbnail === "string" ? item.thumbnail : "",
        teaser: typeof item.teaser === "string" ? item.teaser : "",
        story: typeof item.story === "string" ? item.story : "",
        lyrics: typeof item.lyrics === "string" ? item.lyrics : "",
        credits: typeof item.credits === "string" ? item.credits : "",
        audio: typeof item.audio === "string" ? item.audio : "",
        duration: typeof item.duration === "number" ? item.duration : 0,
        release: item.release && typeof item.release === "object" ? item.release : null,
        featured: item.featured === true,
        links: getLinks(item)
      };
      track.lyricsText = getLyricsText(track);
      return track;
    })
    .filter((item) => item.title && item.id);
}

const SOCIAL_LINKS = [
  { label: "Spotify", url: "https://open.spotify.com/artist/0QpQBk3Gu2aW99YiDHOBLe", icon: "/images/spotify-logo-white.png" },
  { label: "SoundCloud", url: "https://soundcloud.com/the_energy_hour", icon: "/images/soundcloud-logo-white.png" },
  { label: "YouTube Music", url: "https://music.youtube.com/@TheEnergyHour-MusicLabel", icon: "/images/youtube-music-logo-white.svg" },
  { label: "GitHub", url: "https://github.com/anders-marten/the-energy-hour", icon: "/images/github-logo-white.png" }
];

function renderAbout() {
  const paragraphs = ARTIST_BIO.map((text) => `<p>${escapeHtml(text)}</p>`).join("\n        ");
  return `<section class="about" id="about" aria-labelledby="about-title">
        <h2 id="about-title">About</h2>
        ${paragraphs}
        <p class="about-signature">— ${escapeHtml(ARTIST_PERSON)}, ${escapeHtml(ARTIST_NAME)}</p>
        <nav class="social-links" aria-label="Artist social links">
          ${SOCIAL_LINKS.map(({ label, url, icon }) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(label)}"><img src="${escapeHtml(icon)}" alt="${escapeHtml(label)}"></a>`).join("\n          ")}
        </nav>
      </section>`;
}

function renderTrackList(tracks) {
  const slugs = trackSlugs(tracks);
  const featured = tracks.find((track) => track.featured) || tracks.find((track) => track.cover) || tracks[0];
  if (!featured) {
    return "";
  }

  const featuredArt = escapeHtml(featured.cover || "");
  const featuredTitle = escapeHtml(featured.title);
  const featuredTeaser = escapeHtml(featured.teaser);

  const feature = `<div class="mobile-feature">
      <div class="feature-art">
        <div class="feature-player-slot" id="teh-feature-player-slot" aria-label="Player"></div>
      </div>
      <div class="feature-copy">
        <h2 id="teh-feature-title">${featuredTitle}</h2><p id="teh-feature-teaser">${featuredTeaser}</p>
        <button class="feature-discover cursor-interaction" id="teh-feature-discover" data-discover="${escapeHtml(featured.id)}" type="button" aria-label="Discover the story of ${featuredTitle}"${(featured.story || featured.lyrics) ? "" : " hidden"}>Discover the story <span aria-hidden="true">↗</span></button>
      </div>
    </div>`;

  const intro = `<div class="intro"><p>THE ENERGY HOUR</p><h1>From outer space<br> to my heart</h1></div>
    <h2 class="desktop-track-heading">Tracks</h2>`;

  const rows = tracks.map((track) => {
    const title = escapeHtml(track.title);
    const teaser = escapeHtml(track.teaser);
    const story = escapeHtml(track.story).replace(/\n/g, "<br>");
    const lyrics = escapeHtml(track.lyricsText).replace(/\n/g, "<br>");
    const art = track.thumbnail || track.cover;
    const hasDiscover = Boolean(track.story || track.lyrics);

    const pageUrl = `/tracks/${slugs.get(track.id)}/`;
    const seoCopy = `<div class="track-seo-copy">
          <a href="${pageUrl}">${title}</a>
          ${story ? `<h3>${title} - Story</h3><p>${story}</p>` : ""}
          ${lyrics ? `<h3>${title} - Lyrics</h3><p>${lyrics}</p>` : ""}
        </div>`;

    return `<article class="row" aria-label="${title}">
        <div class="thumb">
          <div class="track-art">
            ${art
              ? `<img src="${escapeHtml(art)}" alt="" loading="lazy">`
              : `<div class="neutral-thumb" role="img" aria-label=""></div>`}
          </div>
          <button class="track cursor-interaction" data-play="${escapeHtml(track.id)}" type="button" aria-label="Play ${title}"><span aria-hidden="true">▶</span></button>
        </div>
        <div><strong class="track-name">${title}</strong>${teaser ? `<p>${teaser}</p>` : ""}</div>
        ${hasDiscover
          ? `<button class="quiet cursor-interaction" data-discover="${escapeHtml(track.id)}" type="button" aria-label="Discover the story of ${title}"><span class="desktop-wording">Discover ↗</span><span class="mobile-wording">Discover</span></button>`
          : ""}
        ${seoCopy}
      </article>`;
  }).join("\n");

  return `${feature}
    <div class="desktop-right">
      ${intro}
      ${rows}
      ${renderAbout()}
    </div>`;
}

function absoluteUrl(path) {
  if (!path) return "";
  return /^https?:\/\//.test(path) ? path : `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** MusicGroup node for the artist. */
function artistSchema() {
  return {
    "@type": "MusicGroup",
    "@id": `${SITE_URL}/#artist`,
    name: ARTIST_NAME,
    url: SITE_URL,
    description: ARTIST_SUMMARY,
    genre: ["Electronic", "Synth", "Funk", "Pop", "Rave"],
    foundingLocation: { "@type": "Place", name: ARTIST_LOCATION },
    member: { "@type": "Person", name: ARTIST_PERSON },
    sameAs: ARTIST_SAME_AS
  };
}

/** MusicRecording node for one track; lyrics only where requested (track pages). */
function recordingSchema(track, slug, { withLyrics = false } = {}) {
  const recording = {
    "@type": "MusicRecording",
    "@id": `${trackUrl(slug)}#recording`,
    name: track.title,
    url: trackUrl(slug),
    byArtist: { "@id": `${SITE_URL}/#artist` }
  };
  const duration = isoDuration(track.duration);
  if (duration) recording.duration = duration;
  if (track.teaser) recording.description = track.teaser;
  const image = absoluteUrl(track.cover || track.thumbnail);
  if (image) recording.image = image;
  if (track.audio) {
    recording.audio = {
      "@type": "AudioObject",
      contentUrl: track.audio,
      encodingFormat: track.audio.endsWith(".mp3") ? "audio/mpeg" : "audio/mp4",
      ...(duration ? { duration } : {})
    };
  }
  if (track.credits) recording.creditText = track.credits;
  const release = track.release;
  if (release) {
    if (release.isrc) recording.isrcCode = release.isrc;
    if (release.date) recording.datePublished = release.date;
    recording.inAlbum = {
      "@type": "MusicAlbum",
      name: track.title,
      ...(release.type ? { albumReleaseType: `https://schema.org/${release.type}Release` } : {}),
      byArtist: { "@id": `${SITE_URL}/#artist` },
      ...(release.date ? { datePublished: release.date } : {}),
      albumRelease: {
        "@type": "MusicRelease",
        name: track.title,
        ...(release.date ? { datePublished: release.date } : {}),
        ...(release.label ? { recordLabel: { "@type": "Organization", name: release.label } } : {}),
        ...(release.barcode ? { gtin: release.barcode } : {}),
        ...(track.links.musicbrainz ? { sameAs: track.links.musicbrainz } : {})
      }
    };
  }
  if (withLyrics && track.lyricsText) {
    recording.recordingOf = {
      "@type": "MusicComposition",
      name: track.title,
      lyrics: { "@type": "CreativeWork", text: track.lyricsText }
    };
  }
  const sameAs = [track.links.soundcloud, track.links.spotify, track.links.appleMusic, track.links.tidal, track.links.musicbrainz].filter(Boolean);
  if (sameAs.length) recording.sameAs = sameAs;
  return recording;
}

function renderSchemaScript(graph) {
  return `<script id="music-schema" type="application/ld+json">
${JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2)}
  </script>`;
}

function renderMusicSchema(tracks) {
  const slugs = trackSlugs(tracks);
  const artist = { ...artistSchema(), track: tracks.map((track) => ({ "@id": `${trackUrl(slugs.get(track.id))}#recording` })) };
  return renderSchemaScript([artist, ...tracks.map((track) => recordingSchema(track, slugs.get(track.id)))]);
}

function replaceGeneratedBlock(source, name, content) {
  const start = `<!-- ${name}_START -->`;
  const end = `<!-- ${name}_END -->`;
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`);

  if (!pattern.test(source)) {
    throw new Error(`Missing generated block markers: ${start} / ${end}`);
  }

  return source.replace(pattern, `${start}\n  ${content}\n  ${end}`);
}

function loadTracks() {
  return normalizeTracks(JSON.parse(fs.readFileSync(playlistPath, "utf8")));
}

module.exports = {
  escapeHtml,
  loadTracks,
  artistSchema,
  recordingSchema,
  renderSchemaScript,
  replaceGeneratedBlock
};

if (require.main === module) {
  const tracks = loadTracks();
  let indexHtml = fs.readFileSync(indexPath, "utf8");
  indexHtml = replaceGeneratedBlock(indexHtml, "MUSIC_SCHEMA", renderMusicSchema(tracks));
  indexHtml = replaceGeneratedBlock(indexHtml, "TRACK_LIST", renderTrackList(tracks));
  fs.writeFileSync(indexPath, indexHtml);
  console.log(`Generated SEO content for ${tracks.length} tracks.`);
}
