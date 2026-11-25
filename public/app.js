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
audio.preload = "none";

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
let isSeeking = false;

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
    featured: item.featured === true,
    links: {
      soundcloud: typeof item.links?.soundcloud === "string" ? item.links.soundcloud : "",
      spotify: typeof item.links?.spotify === "string" ? item.links.spotify : "",
      appleMusic: typeof item.links?.appleMusic === "string" ? item.links.appleMusic : "",
      tidal: typeof item.links?.tidal === "string" ? item.links.tidal : ""
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
  featureAudioSeek.max = String(length);
  if (!isSeeking) featureAudioSeek.value = String(audio.currentTime || 0);
  featureAudioSeek.style.setProperty("--progress", length ? `${(Number(featureAudioSeek.value) / length) * 100}%` : "0%");
  featureAudioTime.textContent = `${formatTime(Number(featureAudioSeek.value))} / ${formatTime(length)}`;
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
    playPending = false;
    isPlaying = false;
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
  if (isPlaying) audio.pause();
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

function setSection(name) {
  for (const key of ["story", "lyrics", "info"]) {
    const section = document.querySelector("#teh-" + key);
    section.hidden = key !== name;
    section.style.visibility = key === name ? "visible" : "hidden";
    const button = document.querySelector(`[data-section="${key}"]`);
    if (button) button.setAttribute("aria-pressed", key === name ? "true" : "false");
  }
  document.querySelector("#teh-" + name)?.scrollTo({ top: 0 });
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
  const credits = document.querySelector("#teh-credits");
  credits.textContent = track.credits;
  credits.hidden = !track.credits;
  paragraphs(document.querySelector("#teh-story-text"), track.story);
  paragraphs(document.querySelector("#teh-lyrics-text"), "");
  document.querySelector("#teh-full-title").textContent = track.title;

  const storyButton = document.querySelector('[data-section="story"]');
  const lyricsButton = document.querySelector('[data-section="lyrics"]');
  const infoButton = document.querySelector('[data-section="info"]');
  const lyrics = await loadLyrics(track);
  if (sheetTrackId === trackId) {
    paragraphs(document.querySelector("#teh-lyrics-text"), lyrics);
  }
  storyButton.hidden = !track.story;
  lyricsButton.hidden = !lyrics;
  infoButton.hidden = false;

  const firstSection = track.story ? "story" : (lyrics ? "lyrics" : "info");
  setSection(firstSection);

  if (!sheet.open) {
    // Non-modal, so the player footer stays visible and usable below the sheet.
    sheet.show();
    sheetBackdrop.hidden = false;
    sheet.getBoundingClientRect();
    sheet.classList.add("is-visible");
    sheetBackdrop.classList.add("is-visible");
    if (!reducedMotion.matches) {
      const offscreen = wide.matches ? "translateX(100%)" : "translateY(100%)";
      sheetSlide = sheet.animate([{ transform: offscreen }, { transform: "none" }], { duration: 250, easing, fill: "forwards" });
    }
  } else {
    sheet.classList.add("is-visible");
    sheetSlide?.cancel();
    sheet.style.transform = "none";
  }
  updatePlayerUi();
  if (startHeight && sheetTrackId === trackId) animateSheetHeight(startHeight);
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

function closeDiscover() {
  if (!sheet.open || sheetClosing) return;
  sheetClosing = true;
  sheetSlide?.cancel();
  sheet.classList.remove("is-visible");
  sheetBackdrop.classList.remove("is-visible");
  if (reducedMotion.matches) {
    sheet.close();
    sheetClosing = false;
    return;
  }
  const offscreen = wide.matches ? "translateX(100%)" : "translateY(100%)";
  sheetSlide = sheet.animate([{ transform: getComputedStyle(sheet).transform }, { transform: offscreen }], { duration: 250, easing, fill: "forwards" });
  sheetSlide.onfinish = () => {
    sheet.close();
    sheetSlide.cancel();
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
  showTrack(0, false);
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
featureAudioSeek.addEventListener("input", () => {
  isSeeking = true;
  updateAudioProgress();
});
featureAudioSeek.addEventListener("change", () => {
  audio.currentTime = Number(featureAudioSeek.value);
  isSeeking = false;
  updateAudioProgress();
});

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
document.querySelector("#teh-now-open").addEventListener("click", openCurrentDiscover);
document.querySelector("#teh-player-expand").addEventListener("click", openCurrentDiscover);
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
  if (!reducedMotion.matches) sheet.style.transform = `translateY(${Math.max(0, offset)}px)`;
}
function endSheetDrag(offset) {
  if (offset > DRAG_CLOSE) closeDiscover();
  else sheet.style.transform = "";
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

// Portrait feature: dragging down on the cover slides the controls and title
// panel down to show more of the image, and springs back on release.
const featureBlock = document.querySelector(".mobile-feature");
let reveal = null;
function setReveal(offset, max) {
  featureBlock.style.setProperty("--reveal", `${offset}px`);
  featureBlock.style.setProperty("--reveal-fade", String(max ? Math.max(0, 1 - offset / max) : 1));
}
featureBlock?.addEventListener("touchstart", (event) => {
  if (event.touches.length !== 1 || !event.target.closest(".feature-audio-art")) return;
  if (getComputedStyle(featureBlock).display !== "grid" || window.scrollY > 0) return;
  const touch = event.touches[0];
  const panel = featureBlock.querySelector(".feature-copy").offsetHeight + featureAudio.querySelector(".feature-audio-controls").offsetHeight;
  reveal = { x: touch.clientX, y: touch.clientY, active: false, max: panel };
  featureBlock.classList.remove("is-settling");
}, { passive: true });
featureBlock?.addEventListener("touchmove", (event) => {
  if (!reveal) return;
  const touch = event.touches[0];
  const dx = touch.clientX - reveal.x;
  const dy = touch.clientY - reveal.y;
  if (!reveal.active) {
    if (dy < -8 || Math.abs(dx) > Math.max(8, dy)) {
      reveal = null;
      return;
    }
    if (dy < 8) return;
    reveal.active = true;
    reveal.y = touch.clientY;
  }
  if (event.cancelable) event.preventDefault();
  const pull = Math.max(0, touch.clientY - reveal.y);
  // Rubber-band: follows the finger at first, then resists.
  const offset = reveal.max * (1 - Math.exp(-pull / reveal.max));
  setReveal(reduceMotionOffset(offset), reveal.max);
}, { passive: false });
function reduceMotionOffset(offset) {
  return reducedMotion.matches ? 0 : offset;
}
function settleReveal() {
  if (!reveal) return;
  const wasActive = reveal.active;
  reveal = null;
  if (!wasActive) return;
  featureBlock.classList.add("is-settling");
  setReveal(0, 0);
}
featureBlock?.addEventListener("touchend", settleReveal);
featureBlock?.addEventListener("touchcancel", settleReveal);
featureBlock?.addEventListener("transitionend", (event) => {
  if (event.propertyName === "transform") featureBlock.classList.remove("is-settling");
});

loadPlaylist();
