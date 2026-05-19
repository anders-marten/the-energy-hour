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

function normalizeTracks(items) {
  if (!Array.isArray(items)) {
    throw new Error("playlist.json must contain an array.");
  }

  return items
    .map((item) => ({
      title: typeof item.title === "string" ? item.title.trim() : "",
      id: String(item.id || "").trim(),
      links: getLinks(item)
    }))
    .filter((item) => item.title && item.id);
}

function renderTrackList(tracks) {
  const items = tracks
    .map((track) => {
      const title = escapeHtml(track.title);
      const soundcloud = track.links.soundcloud;
      const spotify = track.links.spotify;
      const titleHref = soundcloud || "#";
      const titleHtml = `<a class="track-title track-play-link" href="${escapeHtml(titleHref)}" data-track-id="${escapeHtml(track.id)}">${title}</a>`;
      const serviceLinks = [
        soundcloud
          ? `<a class="track-service" href="${escapeHtml(soundcloud)}" target="_blank" rel="noopener noreferrer">SoundCloud</a>`
          : "",
        spotify
          ? `<a class="track-service" href="${escapeHtml(spotify)}" target="_blank" rel="noopener noreferrer">Spotify</a>`
          : ""
      ].filter(Boolean);
      const servicesHtml = serviceLinks.length
        ? `\n            <span class="track-services" aria-label="Listen links">${serviceLinks.join("\n              ")}</span>`
        : "";

      return `        <li>\n          <span class="track-row">\n            ${titleHtml}${servicesHtml}\n          </span>\n        </li>`;
    })
    .join("\n");

  return `<section class="track-list" aria-labelledby="track-list-title">
      <h2 id="track-list-title">Tracks by The Energy Hour</h2>
      <ol>
${items}
      </ol>
    </section>`;
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
