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
    featured: false,
    links: { soundcloud: "", spotify: "", appleMusic: "", tidal: "" }
  }
];

const player = document.createElement("iframe");
player.id = "soundcloud-player";
player.title = "SoundCloud player";
player.scrolling = "no";
player.frameBorder = "no";
player.allow = "autoplay";
const root = document.querySelector("#teh-design");
const trackList = document.querySelector("#teh-tracks");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const wide = window.matchMedia("(min-width: 900px)");
const easing = "cubic-bezier(.22,.61,.36,1)";

let playlist = fallbackPlaylist;
let currentTrackIndex = -1;
let isPlaying = false;
let isAdvancingAfterFinish = false;
let shouldPlayWhenReady = false;
let widgetReady = false;
let widgetLoadingTrackId = null;
let widget = null;
let playerStateTimer = 0;
let hasPlayed = false;
let sheetSlide = null;
let sheetClosing = false;
let sheetTrackId = null;
const lyricsCache = new Map();

const sheet = document.querySelector("#teh-song");
const full = document.querySelector("#teh-full");

function isAppleMobileSafari() {
  const userAgent = window.navigator.userAgent;
  const isIOS = /iP(ad|hone|od)/.test(userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(userAgent) &&
    !/CriOS|FxiOS|EdgiOS/.test(userAgent);

  return isIOS && isSafari;
}

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
    featured: item.featured === true,
    links: {
      soundcloud: typeof item.links?.soundcloud === "string" ? item.links.soundcloud : "",
      spotify: typeof item.links?.spotify === "string" ? item.links.spotify : "",
      appleMusic: typeof item.links?.appleMusic === "string" ? item.links.appleMusic : "",
      tidal: typeof item.links?.tidal === "string" ? item.links.tidal : ""
    }
  })).filter((item) => item.title && item.id);
}

const widgetOptions = {
  color: "#ff987e",
  auto_play: false,
  hide_related: true,
  show_comments: false,
  show_user: true,
  show_reposts: false,
  show_teaser: false,
  visual: true
};

function trackApiUrl(trackId) {
  return `https://api.soundcloud.com/tracks/${encodeURIComponent(trackId)}`;
}

function buildSoundCloudSrc(trackId) {
  const params = new URLSearchParams({ url: trackApiUrl(trackId) });
  for (const [key, value] of Object.entries(widgetOptions)) params.set(key, String(value));
  return "https://w.soundcloud.com/player/?" + params.toString();
}

function playIfRequested() {
  if (!shouldPlayWhenReady) return;
  shouldPlayWhenReady = false;
  widget.play();
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

// The widget stays in the feature slot. Moving an iframe in the DOM reloads it
// and stops playback, so other views show the cover image instead.
function mountWidget() {
  const slot = document.querySelector("#teh-feature-widget-slot");
  if (slot && !slot.contains(player)) slot.replaceChildren(player);
}

function paragraphs(target, text) {
  if (!target) return;
  target.replaceChildren(...String(text || "").split(/\n\n+/).filter(Boolean).map((block) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = block;
    return paragraph;
  }));
}

function syncPlayerState() {
  if (!widget || widgetLoadingTrackId) return;
  widget.isPaused((paused) => {
    isPlaying = !paused;
    updatePlayerUi();
  });
}

function checkTrackFinished() {
  if (!widget || isAdvancingAfterFinish) return;
  widget.getDuration((duration) => {
    if (!duration) return;
    widget.getPosition((position) => {
      if (position > 0 && duration - position <= 1000) handleTrackFinished();
    });
  });
}

function startPlayerStatePolling() {
  window.clearInterval(playerStateTimer);
  playerStateTimer = window.setInterval(() => {
    syncPlayerState();
    checkTrackFinished();
  }, 1000);
}

function handleTrackFinished() {
  if (isAdvancingAfterFinish) return;
  isAdvancingAfterFinish = true;
  showForwardTrack(true);
}

function bindWidgetEvents() {
  widget.bind(SC.Widget.Events.READY, () => {
    widgetReady = true;
    playIfRequested();
    syncPlayerState();
    startPlayerStatePolling();
  });
  widget.bind(SC.Widget.Events.PLAY, () => {
    hasPlayed = true;
    isPlaying = true;
    updatePlayerUi();
  });
  widget.bind(SC.Widget.Events.PAUSE, syncPlayerState);
  widget.bind(SC.Widget.Events.FINISH, handleTrackFinished);
}

function showTrack(index, shouldPlay = false) {
  if (!playlist.length || index < 0 || index >= playlist.length) return;
  currentTrackIndex = index;
  isAdvancingAfterFinish = false;
  const track = getCurrentTrack();
  // Embed autoplay is blocked in some browsers, so playback always starts
  // through the widget API once the track has loaded. Later tracks are loaded
  // into the same iframe; replacing its src would drop the widget events.
  widgetLoadingTrackId = track.id;
  widgetReady = false;
  shouldPlayWhenReady = shouldPlay;
  isPlaying = false;
  player.title = `SoundCloud player: ${track.title}`;
  if (!widget) {
    player.src = buildSoundCloudSrc(track.id);
    mountWidget();
    widget = SC.Widget(player);
    bindWidgetEvents();
  } else {
    widgetReady = false;
    widget.load(trackApiUrl(track.id), { ...widgetOptions, callback: () => {
      widgetReady = true;
      widgetLoadingTrackId = null;
      if (shouldPlayWhenReady) {
        shouldPlayWhenReady = false;
        widget.play();
      }
      syncPlayerState();
    } });
  }
  startPlayerStatePolling();
  if (shouldPlay) hasPlayed = true;
  isPlaying = shouldPlay;
  updatePlayerUi();
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
    if (isPlaying) {
      widget.pause();
    } else {
      shouldPlayWhenReady = true;
      if (widgetReady) playIfRequested();
    }
  } else {
    showTrack(index, shouldPlay);
  }
  return true;
}

function toggleCurrentTrack() {
  if (!getCurrentTrack()) return;
  if (isPlaying) {
    widget.pause();
  } else {
    shouldPlayWhenReady = true;
    if (widgetReady) playIfRequested();
  }
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
  if (!track || !hasPlayed) {
    playerBar.hidden = true;
    return;
  }

  playerBar.hidden = false;
  const art = track.thumbnail || track.cover || "";
  document.querySelector("#teh-now").textContent = track.title;
  document.querySelector("#teh-now-art").src = art;
  document.querySelector("#teh-now-status").textContent = isPlaying ? "Now playing" : "Paused";
  document.querySelector("#teh-full-now").textContent = track.title;
  document.querySelector("#teh-full-now-art").src = art;
  document.querySelector("#teh-full-status").textContent = isPlaying ? "Now playing" : "Paused";

  for (const id of ["teh-toggle", "teh-full-toggle", "teh-sheet-toggle"]) {
    const button = document.querySelector("#" + id);
    button.textContent = isPlaying ? "Ⅱ" : "▶";
    button.setAttribute("aria-label", (isPlaying ? "Pause " : "Play ") + track.title);
  }

  document.querySelectorAll("[data-play]").forEach((button) => {
    const active = button.dataset.play === track.id && isPlaying;
    button.querySelector("span")?.replaceChildren(document.createTextNode(active ? "Ⅱ" : "▶"));
    button.setAttribute("aria-label", (active ? "Pause " : "Play ") + (playlist.find((item) => item.id === button.dataset.play)?.title || "track"));
  });

  const sheetNow = document.querySelector("#teh-sheet-now");
  const sheetPlayingDifferentTrack = sheetTrackId && sheetTrackId !== track.id;
  sheetNow.hidden = !sheetPlayingDifferentTrack;
  if (sheetPlayingDifferentTrack) {
    document.querySelector("#teh-sheet-now-title").textContent = track.title;
    document.querySelector("#teh-sheet-now-state").textContent = isPlaying ? "Now playing" : "Paused";
  }

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

  const position = playlist.findIndex((item) => item.id === trackId);
  document.querySelector("#teh-previous").disabled = position <= 0;
  document.querySelector("#teh-next").disabled = position >= playlist.length - 1;

  if (!sheet.open) {
    sheet.showModal();
    sheet.getBoundingClientRect();
    sheet.classList.add("is-visible");
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
}

function closeDiscover() {
  if (!sheet.open || sheetClosing) return;
  sheetClosing = true;
  sheetSlide?.cancel();
  sheet.classList.remove("is-visible");
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
document.querySelector("#teh-sheet-toggle").addEventListener("click", toggleCurrentTrack);

document.querySelector("#teh-previous").addEventListener("click", () => {
  const position = playlist.findIndex((item) => item.id === sheetTrackId);
  if (position > 0) openDiscover(playlist[position - 1].id);
});
document.querySelector("#teh-next").addEventListener("click", (event) => {
  event.preventDefault();
  const position = playlist.findIndex((item) => item.id === sheetTrackId);
  if (position >= 0 && position < playlist.length - 1) openDiscover(playlist[position + 1].id);
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

loadPlaylist();
