// Runs after `vite build`. Writes into dist/:
// - tracks/<slug>/index.html: the app with that track selected, plus its own
//   title, description, canonical URL, Open Graph tags and JSON-LD (with lyrics)
// - sitemap.xml: the home page and every track page
// - llms.txt: a Markdown summary of the artist and tracks for AI assistants

const fs = require("fs");
const path = require("path");
const {
  escapeHtml,
  loadTracks,
  artistSchema,
  recordingSchema,
  renderSchemaScript,
  replaceGeneratedBlock
} = require("./generate-seo-content");
const {
  SITE_URL,
  ARTIST_NAME,
  ARTIST_PERSON,
  ARTIST_DESCRIPTION,
  ARTIST_SUMMARY,
  ARTIST_BIO,
  ARTIST_SAME_AS,
  trackSlugs,
  trackUrl
} = require("./site-content");

const distDir = path.resolve(__dirname, "..", "dist");
// Adds the commit the site was built from to the version line, so the live
// site shows which deploy it runs (GITHUB_SHA in CI, git locally).
function buildCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return require("child_process").execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}
const commit = buildCommit();
const builtHtml = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
const baseHtml = commit
  ? builtHtml.replace(/(<p class="app-version">Version [^<]+)<\/p>/, `$1 · ${commit}</p>`)
  : builtHtml;
fs.writeFileSync(path.join(distDir, "index.html"), baseHtml);
const tracks = loadTracks();
const slugs = trackSlugs(tracks);

function absoluteUrl(value) {
  if (!value) return "";
  return /^https?:\/\//.test(value) ? value : `${SITE_URL}${value.startsWith("/") ? "" : "/"}${value}`;
}

function linkLabel(url) {
  const host = new URL(url).hostname;
  if (host.includes("spotify")) return "Spotify";
  if (host === "music.youtube.com") return "YouTube Music";
  if (host.endsWith("youtube.com")) return "YouTube";
  if (host.includes("soundcloud")) return "SoundCloud";
  if (host.includes("musicbrainz")) return "MusicBrainz";
  if (host.includes("wikidata")) return "Wikidata";
  return host;
}

function firstSentence(text) {
  const match = String(text || "").match(/^[\s\S]*?[.!?](\s|$)/);
  return (match ? match[0] : String(text || "")).trim();
}

function setMeta(html, pattern, replacement, label) {
  if (!pattern.test(html)) throw new Error(`Track page template is missing ${label}`);
  return html.replace(pattern, replacement);
}

function trackPage(track) {
  const slug = slugs.get(track.id);
  const url = trackUrl(slug);
  const title = `${track.title} – ${ARTIST_NAME}`;
  const description = track.teaser || firstSentence(track.story) || ARTIST_DESCRIPTION;
  const image = absoluteUrl(track.cover || track.thumbnail) || `${SITE_URL}/images/og-image-2.jpg`;
  const t = escapeHtml(title);
  const d = escapeHtml(description);

  let html = baseHtml;
  html = setMeta(html, /<title>[\s\S]*?<\/title>/, `<title>${t}</title>`, "<title>");
  html = setMeta(html, /<meta name="description"[\s\S]*?\/>/, `<meta name="description" content="${d}" />`, "meta description");
  html = setMeta(html, /<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${url}" />`, "canonical link");
  html = setMeta(html, /<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${t}" />`, "og:title");
  html = setMeta(html, /<meta property="og:description"[\s\S]*?\/>/, `<meta property="og:description" content="${d}" />`, "og:description");
  html = setMeta(html, /<meta property="og:type"[^>]*>/, `<meta property="og:type" content="music.song" />`, "og:type");
  html = setMeta(html, /<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${url}" />`, "og:url");
  html = setMeta(html, /<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${escapeHtml(image)}" />`, "og:image");
  html = setMeta(html, /<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${t}" />`, "twitter:title");
  html = setMeta(html, /<meta name="twitter:description"[\s\S]*?\/>/, `<meta name="twitter:description" content="${d}" />`, "twitter:description");
  html = setMeta(html, /<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${escapeHtml(image)}" />`, "twitter:image");
  // The app reads this to select the track on load.
  html = setMeta(html, /<link rel="canonical"/, `<meta name="teh-track" content="${escapeHtml(track.id)}" />\n  <link rel="canonical"`, "canonical anchor");

  // Feature panel shows this track before the app script runs.
  html = setMeta(html, /<h2 id="teh-feature-title">[\s\S]*?<\/h2>/, `<h2 id="teh-feature-title">${escapeHtml(track.title)}</h2>`, "feature title");
  html = setMeta(html, /<p id="teh-feature-teaser">[\s\S]*?<\/p>/, `<p id="teh-feature-teaser">${escapeHtml(track.teaser)}</p>`, "feature teaser");

  html = replaceGeneratedBlock(html, "MUSIC_SCHEMA",
    renderSchemaScript([artistSchema(), recordingSchema(track, slug, { withLyrics: true })]));
  return html;
}

let written = 0;
for (const track of tracks) {
  const dir = path.join(distDir, "tracks", slugs.get(track.id));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), trackPage(track));
  written += 1;
}

const sitemapUrls = [`${SITE_URL}/`, ...tracks.map((track) => trackUrl(slugs.get(track.id)))];
fs.writeFileSync(path.join(distDir, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls.map((url) => `  <url><loc>${url}</loc></url>`).join("\n")}
</urlset>
`);

const llms = [
  `# ${ARTIST_NAME}`,
  "",
  `> ${ARTIST_SUMMARY}`,
  "",
  "## About",
  "",
  ...ARTIST_BIO.flatMap((text) => [text, ""]),
  `— ${ARTIST_PERSON}`,
  "",
  "## Links",
  "",
  `- [Website](${SITE_URL}/)`,
  ...ARTIST_SAME_AS.map((url) => `- [${linkLabel(url)}](${url})`),
  `- [Playlist data (JSON)](${SITE_URL}/playlist.json): every track with title, teaser, story, lyrics path, credits, audio URL and duration`,
  "",
  "## Tracks",
  "",
  ...tracks.map((track) => `- [${track.title}](${trackUrl(slugs.get(track.id))})${track.teaser ? `: ${track.teaser}` : ""}`),
  ""
].join("\n");
fs.writeFileSync(path.join(distDir, "llms.txt"), llms);

console.log(`Generated ${written} track pages, sitemap.xml (${sitemapUrls.length} URLs) and llms.txt.`);
