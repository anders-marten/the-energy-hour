/**
 * @typedef {Object} TrackLinks
 * @property {string} soundcloud
 * @property {string} youtube
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
 * @property {string} lyrics Pointer to a plain-text lyrics file
 * @property {string} credits Verified writing credit shown under Info
 * @property {string} audio Self-hosted audio URL; empty when the track has no file
 * @property {number} duration Audio length in seconds (0 when unknown)
 * @property {boolean} featured
 * @property {TrackLinks} links
 */

/** @type {Track[]} */
const fallbackPlaylist = [
  {
    title: "Track 1",
    id: "2304212519",
    cover: "",
    thumbnail: "",
    teaser: "",
    story: "",
    lyrics: "",
    credits: "",
    audio: "",
    duration: 0,
    featured: false,
    links: { soundcloud: "", spotify: "", appleMusic: "", tidal: "" }
  }
];

// Every track plays through one shared <audio> element. play() is called
// synchronously in the click handler, which is what iOS needs.
const audio = new Audio();
// The selected track (feature slot and footer) is buffered ahead, so the first
// tap on it starts without waiting for the network.
audio.preload = "auto";

const featureAudio = document.createElement("div");
featureAudio.className = "feature-audio";
featureAudio.innerHTML = `
  <img class="feature-audio-art" alt="">
  <div class="feature-audio-controls">
    <button class="feature-audio-toggle cursor-interaction" type="button" aria-label="Play"><span aria-hidden="true">▶</span></button>
    <input class="feature-audio-seek" type="range" min="0" max="0" step="0.1" value="0" aria-label="Seek">
    <span class="feature-audio-time" aria-hidden="true">0:00 / 0:00</span>
  </div>`;
const featureAudioArt = featureAudio.querySelector(".feature-audio-art");
const featureAudioToggle = featureAudio.querySelector(".feature-audio-toggle");
const featureAudioSeek = featureAudio.querySelector(".feature-audio-seek");
const featureAudioTime = featureAudio.querySelector(".feature-audio-time");
// Narrow layout: the cover has no player controls; progress and seeking live
// in a thin bar on the player footer's top edge instead.
const playerSeek = document.querySelector("#teh-player-seek");
const seekInputs = [featureAudioSeek, playerSeek].filter(Boolean);
let seekingInput = null;
// iOS loads no audio before the first play(), and a seek made before the
// audio has metadata is lost. Such a seek is kept here and applied once the
// metadata arrives.
let pendingSeek = null;
const playerElapsed = document.querySelector("#teh-player-elapsed");
const playerLength = document.querySelector("#teh-player-length");

const root = document.querySelector("#teh-design");
const trackList = document.querySelector("#teh-tracks");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const wide = window.matchMedia("(min-width: 900px)");
const easing = "cubic-bezier(.22,.61,.36,1)";

let playlist = fallbackPlaylist;
let currentTrackIndex = -1;
let isPlaying = false;
let isAdvancingAfterFinish = false;
let hasPlayed = false;
let playPending = false;
let sheetSlide = null;
let sheetClosing = false;
let sheetTrackId = null;
let sheetResize = null;
const lyricsCache = new Map();

const sheet = document.querySelector("#teh-song");
const full = document.querySelector("#teh-full");
const sheetBackdrop = document.querySelector("#teh-sheet-backdrop");

function normalizePlaylist(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    title: typeof item.title === "string" ? item.title : "",
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
    links: {
      soundcloud: typeof item.links?.soundcloud === "string" ? item.links.soundcloud : "",
      spotify: typeof item.links?.spotify === "string" ? item.links.spotify : "",
      appleMusic: typeof item.links?.appleMusic === "string" ? item.links.appleMusic : "",
      tidal: typeof item.links?.tidal === "string" ? item.links.tidal : "",
      youtube: typeof item.links?.youtube === "string" ? item.links.youtube : "",
      musicbrainz: typeof item.links?.musicbrainz === "string" ? item.links.musicbrainz : ""
    }
  })).filter((item) => item.title && item.id);
}

function getCurrentTrack() {
  return playlist[currentTrackIndex] || null;
}

async function loadLyrics(track) {
  if (!track?.lyrics) return "";
  if (lyricsCache.has(track.lyrics)) return lyricsCache.get(track.lyrics);

  try {
    const response = await fetch(track.lyrics, { cache: "no-cache" });
    if (!response.ok) throw new Error(`Lyrics request failed with ${response.status}`);
    const lyrics = (await response.text()).trim();
    lyricsCache.set(track.lyrics, lyrics);
    return lyrics;
  } catch (error) {
    console.warn(`Unable to load lyrics for ${track.title}.`, error);
    return "";
  }
}

function mountFeatureAudio(track) {
  const slot = document.querySelector("#teh-feature-player-slot");
  if (!slot) return;
  featureAudioArt.src = track.cover || track.thumbnail || "";
  featureAudioArt.alt = track.title + " cover";
  if (!slot.contains(featureAudio)) slot.replaceChildren(featureAudio);
  slot.setAttribute("aria-label", "Player: " + track.title);
  updateAudioProgress();
}

function usesAudio(track = getCurrentTrack()) {
  return Boolean(track?.audio);
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function audioDuration() {
  return Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (getCurrentTrack()?.duration || 0);
}

function updateAudioProgress() {
  const length = audioDuration();
  const position = seekingInput ? Number(seekingInput.value) : (pendingSeek ?? (audio.currentTime || 0));
  for (const input of seekInputs) {
    input.max = String(length);
    if (input !== seekingInput) input.value = String(position);
    input.style.setProperty("--progress", length ? `${(position / length) * 100}%` : "0%");
  }
  featureAudioTime.textContent = `${formatTime(position)} / ${formatTime(length)}`;
  playerElapsed.textContent = formatTime(position);
  playerLength.textContent = formatTime(length);
  if ("mediaSession" in navigator && length && navigator.mediaSession.setPositionState) {
    try {
      navigator.mediaSession.setPositionState({ duration: length, position: Math.min(audio.currentTime || 0, length), playbackRate: audio.playbackRate || 1 });
    } catch {}
  }
}

function playAudio() {
  if (!usesAudio()) {
    console.warn("This track has no audio file.");
    return;
  }
  playPending = true;
  hasPlayed = true;
  updatePlayerUi();
  audio.play().catch((error) => {
    if (error?.name !== "AbortError") console.warn("Audio playback did not start.", error);
    // A rejected play() (for example interrupted by a seek) does not always
    // mean the audio is stopped, so ask the element.
    playPending = false;
    isPlaying = !audio.paused;
    updatePlayerUi();
  });
}

function setMediaSession(track) {
  if (!("mediaSession" in navigator)) return;
  const art = track.cover || track.thumbnail;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: "The Energy Hour",
    artwork: art ? [{ src: new URL(art, location.href).href, sizes: "512x512" }] : []
  });
}

function paragraphs(target, text) {
  if (!target) return;
  target.replaceChildren(...String(text || "").split(/\n\n+/).filter(Boolean).map((block) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = block;
    return paragraph;
  }));
}

function handleTrackFinished() {
  if (isAdvancingAfterFinish) return;
  isAdvancingAfterFinish = true;
  showForwardTrack(true);
}

function showTrack(index, shouldPlay = false) {
  if (!playlist.length || index < 0 || index >= playlist.length) return;
  currentTrackIndex = index;
  isAdvancingAfterFinish = false;
  const track = getCurrentTrack();
  isPlaying = false;
  playPending = false;
  pendingSeek = null;
  if (usesAudio(track)) {
    const source = new URL(track.audio, location.href).href;
    if (audio.src !== source) {
      audio.src = source;
      audio.currentTime = 0;
    }
  } else {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  mountFeatureAudio(track);
  setMediaSession(track);
  if (shouldPlay) playAudio();
  else updatePlayerUi();
}

function showPreviousTrack(shouldPlay = isPlaying) {
  if (currentTrackIndex <= 0) return;
  showTrack(currentTrackIndex - 1, shouldPlay);
}

function showForwardTrack(shouldPlay = isPlaying) {
  if (currentTrackIndex >= playlist.length - 1) {
    isPlaying = false;
    updatePlayerUi();
    return;
  }
  showTrack(currentTrackIndex + 1, shouldPlay);
}

function showTrackById(trackId, shouldPlay = true) {
  const index = playlist.findIndex((track) => track.id === trackId);
  if (index < 0) return false;
  if (index === currentTrackIndex && shouldPlay) {
    toggleCurrentTrack();
  } else {
    showTrack(index, shouldPlay);
  }
  return true;
}

function toggleCurrentTrack() {
  if (!getCurrentTrack()) return;
  // The element, not isPlaying, decides, so a stale state can never leave
  // playback impossible to stop.
  if (!audio.paused) audio.pause();
  else playAudio();
}

function updatePlayerUi() {
  const track = getCurrentTrack();
  const playerBar = document.querySelector("#teh-player");
  const featureTitle = document.querySelector("#teh-feature-title");
  const featureTeaser = document.querySelector("#teh-feature-teaser");
  if (track && featureTitle) featureTitle.textContent = track.title;
  if (track && featureTeaser) featureTeaser.textContent = track.teaser || "";
  const featureDiscover = document.querySelector("#teh-feature-discover");
  if (track && featureDiscover) {
    featureDiscover.dataset.discover = track.id;
    featureDiscover.setAttribute("aria-label", "Discover the story of " + track.title);
    featureDiscover.hidden = !(track.story || track.lyrics);
  }
  const nowDiscover = document.querySelector("#teh-now-discover");
  if (track && nowDiscover) nowDiscover.hidden = !(track.story || track.lyrics);
  if (track) {
    featureAudioToggle.disabled = !usesAudio(track);
    featureAudioToggle.querySelector("span").textContent = isPlaying ? "Ⅱ" : "▶";
    featureAudioToggle.setAttribute("aria-label", (isPlaying ? "Pause " : "Play ") + track.title);
    featureAudio.classList.toggle("is-loading", playPending && !isPlaying);
  }
  if (!track) {
    playerBar.hidden = true;
    return;
  }

  playerBar.hidden = false;
  const art = track.thumbnail || track.cover || "";
  document.querySelector("#teh-now").textContent = track.title;
  document.querySelector("#teh-now-art").src = art;
  document.querySelector("#teh-now-status").textContent = isPlaying ? "Now playing" : (playPending ? "Loading…" : "Paused");
  document.querySelector("#teh-full-now").textContent = track.title;
  document.querySelector("#teh-full-now-art").src = art;
  document.querySelector("#teh-full-status").textContent = isPlaying ? "Now playing" : (playPending ? "Loading…" : "Paused");

  document.querySelector("#teh-prev-track").disabled = currentTrackIndex <= 0;
  document.querySelector("#teh-next-track").disabled = currentTrackIndex >= playlist.length - 1;

  for (const id of ["teh-toggle", "teh-full-toggle"]) {
    const button = document.querySelector("#" + id);
    button.textContent = isPlaying ? "Ⅱ" : "▶";
    button.setAttribute("aria-label", (isPlaying ? "Pause " : "Play ") + track.title);
  }

  document.querySelectorAll("[data-play]").forEach((button) => {
    const active = button.dataset.play === track.id && isPlaying;
    button.querySelector("span")?.replaceChildren(document.createTextNode(active ? "Ⅱ" : "▶"));
    button.setAttribute("aria-label", (active ? "Pause " : "Play ") + (playlist.find((item) => item.id === button.dataset.play)?.title || "track"));
  });

  const discoverTrack = sheetTrackId ? playlist.find((item) => item.id === sheetTrackId) : null;
  if (discoverTrack) {
    const active = discoverTrack.id === track.id && isPlaying;
    const sheetPlay = document.querySelector("#teh-play");
    sheetPlay.textContent = active ? "Ⅱ" : "▶";
    sheetPlay.setAttribute("aria-label", active ? "Pause " + discoverTrack.title : "Play " + discoverTrack.title);
  }
}

function formatReleaseDate(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year) return "";
  if (!month) return String(year);
  const date = new Date(Date.UTC(year, month - 1, day || 1));
  return date.toLocaleDateString("en-GB", { timeZone: "UTC", year: "numeric", month: "long", ...(day ? { day: "numeric" } : {}) });
}

// Release facts under Info, as registered in MusicBrainz (playlist.json "release").
function renderReleaseInfo(release) {
  const list = document.querySelector("#teh-release");
  const rows = release ? [
    ["Released", [formatReleaseDate(release.date), release.type].filter(Boolean).join(" · ")],
    ["Label", release.label],
    ["ISRC", release.isrc],
    ["Barcode", release.barcode]
  ].filter(([, value]) => value) : [];
  list.replaceChildren(...rows.flatMap(([term, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    return [dt, dd];
  }));
  list.hidden = rows.length === 0;
}

// Wide layout: Story, Lyrics and Info are tabs. Narrow layout: the tabs are
// hidden and all three run as one text with headings (see styles.css).
function setSection(name) {
  const reading = document.querySelector("#teh-reading");
  reading.dataset.active = name;
  for (const button of document.querySelectorAll("#teh-song [data-section]")) {
    button.setAttribute("aria-pressed", String(button.dataset.section === name));
  }
  reading.scrollTo({ top: 0 });
}

async function openDiscover(trackId) {
  const track = playlist.find((item) => item.id === trackId);
  if (!track) return;
  // When the sheet is already open (Previous/Next), remember its height so the
  // change to the new track's content can be animated.
  const startHeight = sheet.open && !sheetClosing && !wide.matches ? sheet.getBoundingClientRect().height : 0;
  // Hold that height while the new content (and its lyrics) loads.
  if (startHeight) {
    sheetResize?.cancel();
    sheet.style.height = `${startHeight}px`;
  }
  sheetClosing = false;
  sheetTrackId = trackId;
  document.querySelector("#teh-title").textContent = track.title;
  document.querySelector("#teh-teaser").textContent = track.teaser;
  document.querySelector("#teh-soundcloud").href = track.links.soundcloud || "";
  document.querySelector("#teh-spotify").href = track.links.spotify || "";
  document.querySelector("#teh-spotify").hidden = !track.links.spotify;
  document.querySelector("#teh-soundcloud").hidden = !track.links.soundcloud;
  const youtubeLink = document.querySelector("#teh-youtube");
  youtubeLink.href = track.links.youtube || "";
  youtubeLink.hidden = !track.links.youtube;
  document.querySelector("#teh-musicbrainz").href = track.links.musicbrainz || "";
  document.querySelector("#teh-musicbrainz").hidden = !track.links.musicbrainz;
  renderReleaseInfo(track.release);
  const credits = document.querySelector("#teh-credits");
  credits.textContent = track.credits;
  credits.hidden = !track.credits;
  paragraphs(document.querySelector("#teh-story-text"), track.story);
  paragraphs(document.querySelector("#teh-lyrics-text"), "");
  // Story, Lyrics and Info run as one text with headings, scrolled on its own.
  document.querySelector("#teh-story").hidden = !track.story;
  document.querySelector("#teh-lyrics").hidden = true;
  document.querySelector("#teh-reading").scrollTo({ top: 0 });
  document.querySelector("#teh-full-title").textContent = track.title;

  const lyrics = await loadLyrics(track);
  if (sheetTrackId === trackId) {
    paragraphs(document.querySelector("#teh-lyrics-text"), lyrics);
    document.querySelector("#teh-lyrics").hidden = !lyrics;
  }
  document.querySelector('[data-section="story"]').hidden = !track.story;
  document.querySelector('[data-section="lyrics"]').hidden = !lyrics;
  setSection(track.story ? "story" : (lyrics ? "lyrics" : "info"));

  if (!sheet.open) {
    // Non-modal, so the player footer stays visible and usable below the sheet.
    sheet.show();
    sheetBackdrop.hidden = false;
    sheet.getBoundingClientRect();
    sheet.classList.add("is-visible");
    sheetBackdrop.classList.add("is-visible");
    if (!reducedMotion.matches) {
      sheetSlide = wide.matches
        ? sheet.animate([{ transform: "translateX(100%)" }, { transform: "none" }], { duration: 250, easing, fill: "forwards" })
        : sheet.animate([{ "--sheet-top": sheetTop(collapsedSheetInset()) }, { "--sheet-top": "0px" }], { duration: 320, easing });
    }
  } else {
    // Reopened while closing: bring the dimmed backdrop back too.
    sheet.classList.add("is-visible");
    sheetBackdrop.hidden = false;
    sheetBackdrop.classList.add("is-visible");
    sheetSlide?.cancel();
    sheet.style.transform = "none";
  }
  updatePlayerUi();
  setDiscoverExpanded(true);
  if (startHeight && sheetTrackId === trackId) animateSheetHeight(startHeight);
}

// Tells assistive tech whether the footer's Discover toggles are open.
function setDiscoverExpanded(expanded) {
  for (const id of ["#teh-player-expand", "#teh-now-open"]) {
    document.querySelector(id).setAttribute("aria-expanded", String(expanded));
  }
  document.querySelector("#teh-player-expand").setAttribute("aria-label", expanded ? "Close Discover" : "Open Discover");
}

function animateSheetHeight(startHeight) {
  sheetResize?.cancel();
  sheet.style.height = "";
  const endHeight = sheet.getBoundingClientRect().height;
  if (reducedMotion.matches || wide.matches || Math.abs(endHeight - startHeight) < 1) return;
  sheetResize = sheet.animate(
    [{ height: `${startHeight}px` }, { height: `${endHeight}px` }],
    { duration: 250, easing }
  );
  sheetResize.onfinish = () => { sheetResize = null; };
}

// Narrow layout: the sheet and the player footer form one card. Opening grows
// the card up from the footer; closing shrinks it back down to the footer.
// --sheet-top moves the card's top edge down: styles.css clips the sheet there
// and moves its content down with it, so the content travels with the edge.
function sheetTop(top) {
  return `${Math.max(0, top)}px`;
}
function currentSheetTop() {
  return getComputedStyle(sheet).getPropertyValue("--sheet-top").trim() || "0px";
}
function collapsedSheetInset() {
  return sheet.getBoundingClientRect().height - document.querySelector("#teh-player").getBoundingClientRect().height;
}

function closeDiscover() {
  if (!sheet.open || sheetClosing) return;
  sheetClosing = true;
  setDiscoverExpanded(false);
  sheetSlide?.cancel();
  sheet.classList.remove("is-visible");
  sheetBackdrop.classList.remove("is-visible");
  if (reducedMotion.matches) {
    sheet.close();
    sheetClosing = false;
    return;
  }
  sheetSlide = wide.matches
    ? sheet.animate([{ transform: getComputedStyle(sheet).transform }, { transform: "translateX(100%)" }], { duration: 250, easing, fill: "forwards" })
    : sheet.animate([{ "--sheet-top": currentSheetTop() }, { "--sheet-top": sheetTop(collapsedSheetInset()) }], { duration: 280, easing, fill: "forwards" });
  sheetSlide.onfinish = () => {
    sheet.close();
    sheetSlide.cancel();
    sheet.style.removeProperty("--sheet-top");
    sheetClosing = false;
  };
}

async function openFull() {
  if (!getCurrentTrack() || full.open) return;
  const track = getCurrentTrack();
  document.querySelector("#teh-full-title").textContent = track.title;
  document.querySelector("#teh-full-now").textContent = track.title;
  const fullArt = document.querySelector("#teh-full-art");
  fullArt.src = track.cover || track.thumbnail || "";
  fullArt.alt = track.title + " cover";
  fullArt.hidden = !fullArt.getAttribute("src");
  paragraphs(document.querySelector("#teh-full-lyrics"), "");
  const lyrics = await loadLyrics(track);
  paragraphs(document.querySelector("#teh-full-lyrics"), lyrics);
  full.showModal();
  document.querySelector("#teh-full-scroll").scrollTop = 0;
  if (!reducedMotion.matches) {
    document.querySelector("#teh-full-sheet").animate(
      [{ transform: "translateY(100%)" }, { transform: "translateY(0)" }],
      { duration: 280, easing }
    );
  }
}

function closeFull() {
  if (!full.open) return;
  if (reducedMotion.matches) {
    full.close();
    document.querySelector("#teh-now-open").focus();
    return;
  }
  const slide = document.querySelector("#teh-full-sheet").animate(
    [{ transform: "translateY(0)" }, { transform: "translateY(100%)" }],
    { duration: 250, easing, fill: "forwards" }
  );
  slide.onfinish = () => {
    full.close();
    slide.cancel();
    document.querySelector("#teh-now-open").focus();
  };
}

async function loadPlaylist() {
  try {
    const response = await fetch("/playlist.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Playlist request failed with ${response.status}`);
    const loaded = normalizePlaylist(await response.json());
    playlist = loaded.length ? loaded : fallbackPlaylist;
  } catch (error) {
    console.warn("Using fallback playlist.", error);
  }
  // Track pages (/tracks/<slug>/) name their track in <meta name="teh-track">.
  const pageTrackId = document.querySelector('meta[name="teh-track"]')?.content;
  const pageTrackIndex = pageTrackId ? playlist.findIndex((track) => track.id === pageTrackId) : -1;
  showTrack(Math.max(0, pageTrackIndex), false);
}

trackList.addEventListener("click", (event) => {
  const playButton = event.target.closest("[data-play]");
  if (playButton) {
    showTrackById(playButton.dataset.play, true);
    return;
  }
  const discoverButton = event.target.closest("[data-discover]");
  if (discoverButton) openDiscover(discoverButton.dataset.discover);
});

document.querySelector("#teh-toggle").addEventListener("click", toggleCurrentTrack);
featureAudioToggle.addEventListener("click", toggleCurrentTrack);
for (const input of seekInputs) {
  input.addEventListener("input", () => {
    seekingInput = input;
    updateAudioProgress();
  });
  input.addEventListener("change", () => {
    const position = Number(input.value);
    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      audio.currentTime = position;
      pendingSeek = null;
    } else {
      pendingSeek = position;
    }
    seekingInput = null;
    updateAudioProgress();
  });
}

audio.addEventListener("playing", () => {
  if (!usesAudio()) return;
  isPlaying = true;
  playPending = false;
  hasPlayed = true;
  updatePlayerUi();
});
audio.addEventListener("waiting", () => {
  if (!usesAudio()) return;
  playPending = true;
  updatePlayerUi();
});
audio.addEventListener("pause", () => {
  if (!usesAudio()) return;
  isPlaying = false;
  playPending = false;
  updatePlayerUi();
});
audio.addEventListener("ended", () => {
  if (usesAudio()) handleTrackFinished();
});
audio.addEventListener("error", () => {
  if (!usesAudio() || !audio.getAttribute("src")) return;
  console.warn("Audio file could not be played.", audio.error);
  isPlaying = false;
  playPending = false;
  updatePlayerUi();
});
audio.addEventListener("loadedmetadata", () => {
  if (pendingSeek === null) return;
  audio.currentTime = pendingSeek;
  pendingSeek = null;
});
for (const name of ["timeupdate", "durationchange", "loadedmetadata", "seeked"]) {
  audio.addEventListener(name, updateAudioProgress);
}

if ("mediaSession" in navigator) {
  const handlers = {
    play: () => usesAudio() && playAudio(),
    pause: () => usesAudio() && audio.pause(),
    previoustrack: () => showPreviousTrack(true),
    nexttrack: () => showForwardTrack(true),
    seekto: (details) => {
      if (usesAudio() && typeof details.seekTime === "number") audio.currentTime = details.seekTime;
    }
  };
  for (const [action, handler] of Object.entries(handlers)) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {}
  }
}
document.querySelector("#teh-full-toggle").addEventListener("click", toggleCurrentTrack);
function openCurrentDiscover() {
  const track = getCurrentTrack();
  if (track) openDiscover(track.id);
}
// A click on the footer (outside the playback controls) toggles Discover.
function toggleCurrentDiscover() {
  if (sheet.open && !sheetClosing) closeDiscover();
  else openCurrentDiscover();
}
document.querySelector("#teh-now-open").addEventListener("click", toggleCurrentDiscover);
document.querySelector("#teh-player-expand").addEventListener("click", toggleCurrentDiscover);
document.querySelector("#teh-full-collapse").addEventListener("click", closeFull);
document.querySelector("#teh-full-close").addEventListener("click", closeFull);
document.querySelector("#teh-sheet-close").addEventListener("click", closeDiscover);
document.querySelector("#teh-brand").addEventListener("click", () => trackList.scrollIntoView({ block: "start" }));
document.querySelector("#teh-tracks-link").addEventListener("click", () => trackList.scrollIntoView({ block: "start" }));

document.querySelector("#teh-play").addEventListener("click", () => {
  if (!sheetTrackId) return;
  showTrackById(sheetTrackId, true);
});
// With Discover open, the sheet follows the footer's Previous/Next.
function followInDiscover() {
  if (sheet.open && !sheetClosing && getCurrentTrack()) openDiscover(getCurrentTrack().id);
}
document.querySelector("#teh-prev-track").addEventListener("click", () => {
  showPreviousTrack(isPlaying || playPending);
  followInDiscover();
});
document.querySelector("#teh-next-track").addEventListener("click", () => {
  showForwardTrack(isPlaying || playPending);
  followInDiscover();
});


sheet.addEventListener("click", (event) => {
  const rect = sheet.getBoundingClientRect();
  const isOutsidePanel =
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom;
  if (isOutsidePanel) {
    closeDiscover();
    return;
  }

  const sectionButton = event.target.closest("[data-section]");
  if (sectionButton) setSection(sectionButton.dataset.section);
});

sheet.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDiscover();
});
sheetBackdrop.addEventListener("click", closeDiscover);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && sheet.open) closeDiscover();
});

full.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeFull();
});

let opener = null;
root.addEventListener("click", (event) => {
  const discoverButton = event.target.closest("[data-discover]");
  if (discoverButton) opener = discoverButton;
});
sheet.addEventListener("close", () => {
  sheetBackdrop.hidden = true;
  sheetBackdrop.classList.remove("is-visible");
  sheetResize?.cancel();
  sheet.style.height = "";
  sheet.style.removeProperty("--sheet-top");
  if (opener) {
    opener.focus();
    opener = null;
  }
});

// Swipe down anywhere on the sheet to close it. Touch uses touch events so a
// swipe can start on a button or in the reading area (when it is scrolled to
// the top); a mouse drags with pointer events, away from controls.
const DRAG_START = 8;
const DRAG_CLOSE = 65;
let drag = null;
let suppressClickUntil = 0;

function moveSheet(offset) {
  if (!reducedMotion.matches) sheet.style.setProperty("--sheet-top", sheetTop(Math.min(offset, collapsedSheetInset())));
}
function endSheetDrag(offset) {
  if (offset > DRAG_CLOSE) {
    closeDiscover();
    return;
  }
  const from = sheet.style.getPropertyValue("--sheet-top");
  sheet.style.removeProperty("--sheet-top");
  if (from && !reducedMotion.matches) sheet.animate([{ "--sheet-top": from }, { "--sheet-top": "0px" }], { duration: 200, easing });
}

sheet.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "touch") return;
  if (sheetClosing || wide.matches || !event.isPrimary || event.button !== 0) return;
  if (event.target.closest("button, a, input, select, textarea, .reading")) return;
  sheetSlide?.cancel();
  drag = { id: event.pointerId, y: event.clientY };
  sheet.setPointerCapture(event.pointerId);
});
sheet.addEventListener("pointermove", (event) => {
  if (drag?.id === event.pointerId) moveSheet(event.clientY - drag.y);
});
function finishPointerDrag(event) {
  if (drag?.id !== event.pointerId) return;
  const offset = event.clientY - drag.y;
  drag = null;
  endSheetDrag(offset);
}
sheet.addEventListener("pointerup", finishPointerDrag);
sheet.addEventListener("pointercancel", finishPointerDrag);

sheet.addEventListener("touchstart", (event) => {
  if (sheetClosing || wide.matches || event.touches.length !== 1) {
    drag = null;
    return;
  }
  const touch = event.touches[0];
  drag = { touch: true, x: touch.clientX, y: touch.clientY, scroller: event.target.closest(".reading"), active: false };
}, { passive: true });
sheet.addEventListener("touchmove", (event) => {
  if (!drag?.touch) return;
  const touch = event.touches[0];
  const dx = touch.clientX - drag.x;
  const dy = touch.clientY - drag.y;
  const atTop = !drag.scroller || drag.scroller.scrollTop <= 0;

  if (!drag.active) {
    if (!atTop || dy < -DRAG_START || Math.abs(dx) > Math.max(DRAG_START, dy)) {
      drag = null;
      return;
    }
    if (dy > 0 && event.cancelable) event.preventDefault();
    if (dy < DRAG_START) return;
    sheetSlide?.cancel();
    drag.active = true;
    drag.y = touch.clientY;
  }
  if (event.cancelable) event.preventDefault();
  moveSheet(touch.clientY - drag.y);
}, { passive: false });
function finishTouchDrag(event) {
  if (!drag?.touch) return;
  const wasActive = drag.active;
  const offset = event.type === "touchend" ? event.changedTouches[0].clientY - drag.y : 0;
  drag = null;
  if (!wasActive) return;
  suppressClickUntil = performance.now() + 500;
  endSheetDrag(offset);
}
sheet.addEventListener("touchend", finishTouchDrag);
sheet.addEventListener("touchcancel", finishTouchDrag);
// A swipe that started on a button must not also press it.
sheet.addEventListener("click", (event) => {
  if (performance.now() < suppressClickUntil) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);

// Portrait (narrow): the cover window sits at the top at 2/3 height. Dragging
// down on it opens it up to full height, pushing the track list down with
// it, and it springs back to 2/3 on release.
const featureBlock = document.querySelector(".mobile-feature");
let expandDrag = null;

function canExpandFeature() {
  return !wide.matches && matchMedia("(orientation: portrait)").matches && featureBlock && getComputedStyle(featureBlock).position === "sticky";
}
function startFeatureDrag(x, y) {
  if (!canExpandFeature() || reducedMotion.matches) return;
  const max = featureBlock.querySelector(".feature-audio-art").getBoundingClientRect().width / 3;
  expandDrag = { x, y, max, active: false };
}
// Returns true while the drag is ours, so the caller can stop the page scrolling.
function moveFeatureDrag(x, y) {
  if (!expandDrag) return false;
  const dx = x - expandDrag.x;
  const dy = y - expandDrag.y;
  if (!expandDrag.active) {
    // iOS decides on the first move whether the page scrolls, so claim any
    // move that is not clearly upward or sideways at once, before it does.
    if (dy < 0 || Math.abs(dx) > Math.abs(dy) + 8) {
      if (Math.abs(dx) > 8 || dy < -8) expandDrag = null;
      return false;
    }
    if (dy < 8) return true;
    expandDrag.active = true;
    featureBlock.classList.remove("is-settling");
  }
  featureBlock.style.setProperty("--expand", `${Math.min(expandDrag.max, Math.max(0, dy))}px`);
  return true;
}
function endFeatureDrag() {
  if (!expandDrag) return;
  const { active } = expandDrag;
  expandDrag = null;
  if (!active) return;
  featureBlock.classList.add("is-settling");
  featureBlock.style.removeProperty("--expand");
}

featureBlock?.addEventListener("touchstart", (event) => {
  if (event.touches.length !== 1 || event.target.closest("button, a, input")) return;
  startFeatureDrag(event.touches[0].clientX, event.touches[0].clientY);
}, { passive: true });
featureBlock?.addEventListener("touchmove", (event) => {
  const touch = event.touches[0];
  if (moveFeatureDrag(touch.clientX, touch.clientY) && event.cancelable) event.preventDefault();
}, { passive: false });
featureBlock?.addEventListener("touchend", endFeatureDrag);
featureBlock?.addEventListener("touchcancel", endFeatureDrag);
// Mouse drag, so it also works with a pointer.
featureBlock?.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "touch" || event.button !== 0 || event.target.closest("button, a, input")) return;
  startFeatureDrag(event.clientX, event.clientY);
  if (expandDrag) featureBlock.setPointerCapture(event.pointerId);
});
featureBlock?.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "touch") moveFeatureDrag(event.clientX, event.clientY);
});
featureBlock?.addEventListener("pointerup", (event) => {
  if (event.pointerType !== "touch") endFeatureDrag();
});
featureBlock?.addEventListener("dragstart", (event) => event.preventDefault());
featureBlock?.addEventListener("transitionend", (event) => {
  if (event.propertyName === "height") featureBlock.classList.remove("is-settling");
});

loadPlaylist();
