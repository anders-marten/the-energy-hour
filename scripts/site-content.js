// Shared site facts and texts for the generated HTML, JSON-LD, track pages,
// sitemap and llms.txt. Keep facts here verified; nothing is invented.

const SITE_URL = "https://the-energy-hour.com";
const ARTIST_NAME = "The Energy Hour";
const ARTIST_PERSON = "Anders Mårtén";
const ARTIST_LOCATION = "Stockholm, Sweden";

// Short third-person summary (meta description, JSON-LD, llms.txt intro).
const ARTIST_DESCRIPTION =
  "The Energy Hour is an electronic music project from Stockholm blending rave roots, synth textures, funk, pop, and AI-assisted songwriting.";

const ARTIST_SUMMARY =
  "The Energy Hour is the electronic music project of Anders Mårtén from Stockholm. " +
  "It grew out of a background in violin, folk music and symphonic orchestra, and the Stockholm rave scene of Anders' university years, " +
  "and was recently reignited by new AI tools, which also sparked an interest in writing lyrics.";

// Anders' own words, shown in the About section and in llms.txt.
const ARTIST_BIO = [
  "From a young age, I have been deeply involved in music. I began playing the violin at twelve, performing in school concerts, exploring folk music, and participating in a symphonic orchestra.",
  "During my university years, I became active in the school's DJ community and began creating dance and rave music. Those were the golden days of the rave scene in Stockholm—dancing in the woods until the early morning hours.",
  "Recently, my passion for music has been reignited by new AI tools, which have opened up fresh sources of inspiration and sparked a growing interest in writing lyrics."
];

const ARTIST_SAME_AS = [
  "https://soundcloud.com/the_energy_hour",
  "https://open.spotify.com/artist/0QpQBk3Gu2aW99YiDHOBLe",
  "https://music.youtube.com/@TheEnergyHour-MusicLabel",
  "https://www.youtube.com/@TheEnergyHour-MusicLabel",
  "https://musicbrainz.org/artist/c4079535-c5f4-44b2-92fa-196476d36ce9",
  "https://www.wikidata.org/wiki/Q142282293"
];

/** URL-safe slug from a track title, for /tracks/<slug>/. */
function slugify(title) {
  return String(title)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Unique slug per track id; throws if two tracks would share a slug. */
function trackSlugs(tracks) {
  const slugs = new Map();
  const used = new Set();
  for (const track of tracks) {
    const slug = slugify(track.title) || track.id;
    if (used.has(slug)) throw new Error(`Duplicate track slug "${slug}" for ${track.title}`);
    used.add(slug);
    slugs.set(track.id, slug);
  }
  return slugs;
}

function trackUrl(slug) {
  return `${SITE_URL}/tracks/${slug}/`;
}

/** Seconds to ISO 8601 duration, e.g. 245 -> PT4M5S. */
function isoDuration(seconds) {
  const total = Math.round(Number(seconds) || 0);
  if (!total) return "";
  return `PT${Math.floor(total / 60)}M${total % 60}S`;
}

module.exports = {
  SITE_URL,
  ARTIST_NAME,
  ARTIST_PERSON,
  ARTIST_LOCATION,
  ARTIST_DESCRIPTION,
  ARTIST_SUMMARY,
  ARTIST_BIO,
  ARTIST_SAME_AS,
  slugify,
  trackSlugs,
  trackUrl,
  isoDuration
};
