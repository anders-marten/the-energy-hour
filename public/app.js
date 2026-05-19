const fallbackPlaylist = [
  { title: "Track 1", id: "2304212519" }
];

const player = document.querySelector("#soundcloud-player");
const previousButton = document.querySelector(".playlist-button.previous");
const nextButton = document.querySelector(".playlist-button.next");
const playButton = document.querySelector(".play-button");
const trackList = document.querySelector(".track-list");
let widget = SC.Widget(player);
let playlist = fallbackPlaylist;
let shuffledPlaylist = [];
let currentTrackIndex = 0;
let isPlaying = false;
let playlistComplete = false;
let playerStateTimer = 0;
let isAdvancingAfterFinish = false;
let shouldPlayWhenReady = false;

function isAppleMobileSafari() {
  const userAgent = window.navigator.userAgent;
  const isIOS = /iP(ad|hone|od)/.test(userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS/.test(userAgent);

  return isIOS && isSafari;
}

function buildSoundCloudSrc(trackId, autoPlay = false) {
  return "https://w.soundcloud.com/player/?" +
    `url=https%3A//api.soundcloud.com/tracks/${encodeURIComponent(trackId)}` +
    "&color=%23ff5500" +
    `&auto_play=${autoPlay ? "true" : "false"}` +
    "&hide_related=true" +
    "&show_comments=true" +
    "&show_user=true" +
    "&show_reposts=false" +
    "&show_teaser=false" +
    "&visual=true";
}

function updatePlayButton() {
  playButton.classList.toggle("is-hidden", isPlaying);
}

function updatePlaylistButtons() {
  previousButton.disabled = currentTrackIndex <= 0;
  nextButton.disabled = currentTrackIndex >= shuffledPlaylist.length - 1;
}

function updateActiveTrackLink() {
  const currentTrack = shuffledPlaylist[currentTrackIndex];

  document.querySelectorAll(".track-play-link").forEach((link) => {
    const isActive = Boolean(currentTrack && link.dataset.trackId === currentTrack.id);
    link.classList.toggle("is-active", isActive);

    if (isActive) {
      link.setAttribute("aria-current", "true");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function syncPlayerState() {
  widget.isPaused((paused) => {
    isPlaying = !paused;
    updatePlayButton();
    updatePlaylistButtons();
  });
}

function checkTrackFinished() {
  widget.getDuration((duration) => {
    if (!duration || isAdvancingAfterFinish) {
      return;
    }

    widget.getPosition((position) => {
      const remainingTime = duration - position;
      const isAtEnd = position > 0 && remainingTime <= 1000;

      if (isAtEnd) {
        handleTrackFinished();
      }
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
  if (isAdvancingAfterFinish) {
    return;
  }

  isAdvancingAfterFinish = true;
  showForwardTrack(true);
}

function shuffleTracks(tracks) {
  const shuffledTracks = [...tracks];

  for (let index = shuffledTracks.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const currentTrack = shuffledTracks[index];

    shuffledTracks[index] = shuffledTracks[randomIndex];
    shuffledTracks[randomIndex] = currentTrack;
  }

  return shuffledTracks;
}

function showTrack(index, shouldPlay = false) {
  if (!shuffledPlaylist.length) {
    return;
  }

  currentTrackIndex = index;
  const track = shuffledPlaylist[currentTrackIndex];
  playlistComplete = false;
  isAdvancingAfterFinish = false;
  const shouldUseEmbedAutoplay = shouldPlay && !isAppleMobileSafari();
  shouldPlayWhenReady = shouldPlay && !shouldUseEmbedAutoplay;

  player.src = buildSoundCloudSrc(track.id, shouldUseEmbedAutoplay);
  widget = SC.Widget(player);
  bindWidgetEvents();
  startPlayerStatePolling();
  player.title = track.title ? `SoundCloud player: ${track.title}` : "SoundCloud player";
  isPlaying = shouldPlay;
  updatePlayButton();
  updatePlaylistButtons();
  updateActiveTrackLink();
}

function showInitialTrack() {
  shuffledPlaylist = shuffleTracks(playlist);
  currentTrackIndex = 0;
  showTrack(currentTrackIndex, false);
}

function showPreviousTrack(shouldPlay = isPlaying) {
  if (currentTrackIndex <= 0) {
    return;
  }

  showTrack(currentTrackIndex - 1, shouldPlay);
}

function showForwardTrack(shouldPlay = isPlaying) {
  if (currentTrackIndex >= shuffledPlaylist.length - 1) {
    isPlaying = false;
    playlistComplete = true;
    updatePlayButton();
    updatePlaylistButtons();
    return;
  }

  showTrack(currentTrackIndex + 1, shouldPlay);
}

function showTrackById(trackId) {
  const trackIndex = shuffledPlaylist.findIndex((track) => track.id === trackId);

  if (trackIndex < 0) {
    return false;
  }

  showTrack(trackIndex, true);
  return true;
}

function normalizePlaylist(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      title: typeof item.title === "string" ? item.title : "",
      id: String(item.id || "").trim()
    }))
    .filter((item) => item.id);
}

async function loadPlaylist() {
  try {
    const response = await fetch("/playlist.json", { cache: "no-cache" });

    if (!response.ok) {
      throw new Error(`Playlist request failed with ${response.status}`);
    }

    const loadedPlaylist = normalizePlaylist(await response.json());
    playlist = loadedPlaylist.length ? loadedPlaylist : fallbackPlaylist;
  } catch (error) {
    console.warn("Using fallback playlist.", error);
  }

  showInitialTrack();
}

previousButton.addEventListener("click", () => {
  showPreviousTrack(isPlaying);
});

nextButton.addEventListener("click", () => {
  showForwardTrack(isPlaying);
});

playButton.addEventListener("click", () => {
  if (playlistComplete) {
    return;
  }

  isPlaying = true;
  updatePlayButton();
  widget.play();
});

if (trackList) {
  trackList.addEventListener("click", (event) => {
    const trackLink = event.target.closest(".track-play-link");

    if (!trackLink) {
      return;
    }

    const shouldHandleClick = showTrackById(trackLink.dataset.trackId || "");

    if (shouldHandleClick) {
      event.preventDefault();
    }
  });
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
    isPlaying = true;
    updatePlayButton();
  });

  widget.bind(SC.Widget.Events.PAUSE, () => {
    syncPlayerState();
  });

  widget.bind(SC.Widget.Events.FINISH, () => {
    handleTrackFinished();
  });
}

loadPlaylist();
