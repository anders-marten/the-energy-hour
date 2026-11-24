const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const indexPath = path.join(rootDir, "index.html");
const playlistPath = path.join(rootDir, "public", "playlist.json");

const SITE_URL = "https://the-energy-hour.com";
const ARTIST_NAME = "The Energy Hour";
const ARTIST_DESCRIPTION =
  "The Energy Hour is an electronic music project from Stockholm blending rave roots, synth textures, funk, pop, and AI-assisted songwriting.";
const ARTIST_SAME_AS = [
  "https://soundcloud.com/the_energy_hour",
  "https://open.spotify.com/artist/0QpQBk3Gu2aW99YiDHOBLe"
];

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
    tidal: typeof links.tidal === "string" ? cleanExternalUrl(links.tidal) : ""
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
        featured: item.featured === true,
        links: getLinks(item)
      };
      track.lyricsText = getLyricsText(track);
      return track;
    })
    .filter((item) => item.title && item.id);
}

function renderTrackList(tracks) {
  const featured = tracks.find((track) => track.featured) || tracks.find((track) => track.cover) || tracks[0];
  if (!featured) {
    return "";
  }

  const featuredArt = escapeHtml(featured.cover || "");
  const featuredTitle = escapeHtml(featured.title);
  const featuredTeaser = escapeHtml(featured.teaser);

  const feature = `<div class="mobile-feature">
      <div class="feature-art">
        <div class="soundcloud-widget-slot feature-widget-slot" id="teh-feature-widget-slot" aria-label="SoundCloud player"></div>
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

    const seoCopy = (story || lyrics)
      ? `<div class="track-seo-copy">
          ${story ? `<h3>${title} - Story</h3><p>${story}</p>` : ""}
          ${lyrics ? `<h3>${title} - Lyrics</h3><p>${lyrics}</p>` : ""}
        </div>`
      : "";

    return `<article class="row" aria-label="${title}">
        <div class="thumb">
          <div class="track-widget-slot" data-widget-track="${escapeHtml(track.id)}">
            ${art
              ? `<img src="${escapeHtml(art)}" alt="" loading="lazy">`
              : `<div class="neutral-thumb" role="img" aria-label=""></div>`}
          </div>
          <button class="track cursor-interaction" data-play="${escapeHtml(track.id)}" type="button" aria-label="Play ${title}"><span aria-hidden="true">▶</span></button>
        </div>
        <div><strong class="track-name">${title}</strong>${teaser ? `<p>${teaser}</p>` : ""}</div>
        ${hasDiscover
          ? `<button class="quiet cursor-interaction" data-discover="${escapeHtml(track.id)}" type="button" aria-label="Discover the story of ${title}"><span class="desktop-wording">Discover ↗</span><span class="mobile-wording">Discover <span aria-hidden="true">↗</span></span></button>`
          : ""}
        ${seoCopy}
      </article>`;
  }).join("\n");

  return `${feature}
    <div class="desktop-right">
      ${intro}
      ${rows}
    </div>`;
}

function renderMusicSchema(tracks) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "MusicGroup",
    name: ARTIST_NAME,
    url: SITE_URL,
    description: ARTIST_DESCRIPTION,
    genre: ["Electronic", "Synth", "Funk", "Pop", "Rave"],
    foundingLocation: {
      "@type": "Place",
      name: "Stockholm, Sweden"
    },
    sameAs: ARTIST_SAME_AS,
    track: tracks.map((track) => {
      const links = [
        track.links.soundcloud,
        track.links.spotify,
        track.links.appleMusic,
        track.links.tidal
      ].filter(Boolean);
      const recording = {
        "@type": "MusicRecording",
        name: track.title,
        byArtist: {
          "@type": "MusicGroup",
          name: ARTIST_NAME
        }
      };

      if (links[0]) {
        recording.url = links[0];
      }

      if (links.length > 1) {
        recording.sameAs = links.slice(1);
      }

      return recording;
    })
  };

  return `<script id="music-schema" type="application/ld+json">
${JSON.stringify(schema, null, 2)}
  </script>`;
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

const playlist = JSON.parse(fs.readFileSync(playlistPath, "utf8"));
const tracks = normalizeTracks(playlist);
let indexHtml = fs.readFileSync(indexPath, "utf8");

indexHtml = replaceGeneratedBlock(indexHtml, "MUSIC_SCHEMA", renderMusicSchema(tracks));
indexHtml = replaceGeneratedBlock(indexHtml, "TRACK_LIST", renderTrackList(tracks));

fs.writeFileSync(indexPath, indexHtml);

console.log(`Generated SEO content for ${tracks.length} tracks.`);
