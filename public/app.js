const fallbackPlaylist = [
  { title: "Track 1", id: "2304212519" }
];

const player = document.querySelector("#soundcloud-player");
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
let widget = null;
let playerStateTimer = 0;
let hasPlayed = false;
let sheetSlide = null;
let sheetClosing = false;
let sheetTrackId = null;

const sheet = document.querySelector("#teh-song");
const full = document.querySelector("#teh-full");

function isAppleMobileSafari() {
  const userAgent = window.navigator.userAgent;
  const isIOS = /iP(ad|hone|od)/.test(userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS/.test(userAgent);
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
    featured: item.featured === true,
    links: item.links && typeof item.links === "object" ? item.links : {}
  })).filter((item) => item.title && item.id);
}

function buildSoundCloudSrc(trackId, autoPlay = false) {
  return "https://w.soundcloud.com/player/?" +
    `url=https%3A//api.soundcloud.com/tracks/${encodeURIComponent(trackId)}` +
    "&color=%23ff987e" +
    `&auto_play=${autoPlay ? "true" : "false"}` +
    "&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false";
}

function getCurrentTrack() {
  return playlist[currentTrackIndex] || null;
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
  if (!widget) return;
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
    if (shouldPlayWhenReady) {
      shouldPlayWhenReady = false;
      widget.play();
    }
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
  const shouldUseEmbedAutoplay = shouldPlay && !isAppleMobileSafari();
  shouldPlayWhenReady = shouldPlay && !shouldUseEmbedAutoplay;
  player.src = buildSoundCloudSrc(track.id, shouldUseEmbedAutoplay);
  player.title = `SoundCloud player: ${track.title}`;
  widget = SC.Widget(player);
  bindWidgetEvents();
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
    if (isPlaying) widget.pause();
    else widget.play();
  } else {
    showTrack(index, shouldPlay);
  }
  return true;
}

function toggleCurrentTrack() {
  if (!getCurrentTrack()) return;
  if (isPlaying) widget.pause();
  else widget.play();
}

function updatePlayerUi() {
  const track = getCurrentTrack();
  const playerBar = document.querySelector("#teh-player");
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
  document.querySelector("#teh-full-art").src = track.cover || art;

  for (const id of ["teh-toggle", "teh-full-toggle", "teh-sheet-toggle"]) {
    const button = document.querySelector("#" + id);
    button.textContent = isPlaying ? "Ⅱ" : "▶";
    button.setAttribute("aria-label", (isPlaying ? "Pause " : "Play ") + track.title);
  }

  document.querySelectorAll("[data-play]").forEach((button) => {
    const active = button.dataset.play === track.id && isPlaying;
    const label = document.querySelector("[data-play='" + CSS.escape(button.dataset.play) + "']") === button;
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

function openDiscover(trackId) {
  const track = playlist.find((item) => item.id === trackId);
  if (!track) return;
  sheetTrackId = trackId;
  document.querySelector("#teh-title").textContent = track.title;
  document.querySelector("#teh-teaser").textContent = track.teaser;
  document.querySelector("#teh-soundcloud").href = track.links.soundcloud || "";
  document.querySelector("#teh-spotify").href = track.links.spotify || "";
  paragraphs(document.querySelector("#teh-story-text"), track.story);
  paragraphs(document.querySelector("#teh-lyrics-text"), track.lyrics);
  document.querySelector("#teh-full-title").textContent = track.title;

  const storyButton = document.querySelector('[data-section="story"]');
  const lyricsButton = document.querySelector('[data-section="lyrics"]');
  const infoButton = document.querySelector('[data-section="info"]');
  storyButton.hidden = !track.story;
  lyricsButton.hidden = !track.lyrics;
  infoButton.hidden = false;

  const firstSection = track.story ? "story" : (track.lyrics ? "lyrics" : "info");
  setSection(firstSection);

  const position = playlist.findIndex((item) => item.id === trackId);
  document.querySelector("#teh-previous").disabled = position <= 0;
  document.querySelector("#teh-next").disabled = position >= playlist.length - 1;

  sheet.showModal();
  sheet.getBoundingClientRect();
  sheet.classList.add("is-visible");
  if (!reducedMotion.matches) {
    const offscreen = wide.matches ? "translateX(100%)" : "translateY(100%)";
    sheetSlide = sheet.animate([{ transform: offscreen }, { transform: "none" }], { duration: 250, easing, fill: "forwards" });
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

function openFull() {
  if (!getCurrentTrack() || full.open) return;
  const track = getCurrentTrack();
  document.querySelector("#teh-full-art").src = track.cover || track.thumbnail || "";
  document.querySelector("#teh-full-art").alt = `${track.title} cover`;
  document.querySelector("#teh-full-title").textContent = track.title;
  document.querySelector("#teh-full-now").textContent = track.title;
  paragraphs(document.querySelector("#teh-full-lyrics"), track.lyrics);
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
document.querySelector("#teh-now-open").addEventListener("click", openFull);
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
document.querySelector("#teh-next").addEventListener("click", () => {
  const position = playlist.findIndex((item) => item.id === sheetTrackId);
  if (position >= 0 && position < playlist.length - 1) openDiscover(playlist[position + 1].id);
});

sheet.addEventListener("click", (event) => {
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

const grip = sheet.querySelector(".drag-grip");
let drag = null;
grip.addEventListener("pointerdown", (event) => {
  if (sheetClosing || wide.matches || !event.isPrimary || event.button !== 0) return;
  sheetSlide?.cancel();
  drag = { id: event.pointerId, y: event.clientY };
  grip.setPointerCapture(event.pointerId);
});
grip.addEventListener("pointermove", (event) => {
  if (drag?.id !== event.pointerId || reducedMotion.matches) return;
  sheet.style.transform = `translateY(${Math.max(0, event.clientY - drag.y)}px)`;
});
function finishDrag(event) {
  if (drag?.id !== event.pointerId) return;
  const distance = event.clientY - drag.y;
  drag = null;
  if (distance > 65) closeDiscover();
  else {
    sheet.style.transform = "";
  }
}
grip.addEventListener("pointerup", finishDrag);
grip.addEventListener("pointercancel", finishDrag);

loadPlaylist();
