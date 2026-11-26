// Anonymous listening events. One session per loaded track: "listened-30-seconds"
// once the track has really played for 30 s, "completed" once it ends after that.
// Only the track id and event name are sent. No ids, cookies or storage.

// Empty unless the build sets VITE_STATS_URL, so local and preview builds send nothing.
const STATS_URL = (import.meta.env.VITE_STATS_URL || "").replace(/\/$/, "");
export const statsEnabled = Boolean(STATS_URL);
const LISTEN_THRESHOLD_SECONDS = 30;
// Slack between media time and wall-clock time before a step counts as a seek.
const STEP_TOLERANCE_SECONDS = 0.75;

let session = null;

function send(event, trackId) {
  if (!STATS_URL || !trackId) return;
  const url = `${STATS_URL}/listening-event`;
  // text/plain keeps this a "simple" request, so there is no CORS preflight.
  const body = JSON.stringify({ trackId, event });
  try {
    if (navigator.sendBeacon?.(url, new Blob([body], { type: "text/plain" }))) return;
    fetch(url, { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => {});
  } catch {
    // Stats must never interfere with playback.
  }
}

/** Starts a new listening session; pass an empty id when the track has no audio. */
export function startListenSession(trackId) {
  session = trackId ? { trackId, played: 0, mediaTime: null, wallTime: 0, listened: false, ended: false } : null;
}

function resetBaseline() {
  if (session) session.mediaTime = null;
}

/** Wires the shared <audio> element to the current listening session. */
export function trackListening(audio) {
  audio.addEventListener("playing", () => {
    // Playing again after the end (for example a replay) is a new listen.
    if (session?.ended) startListenSession(session.trackId);
    resetBaseline();
  });
  for (const name of ["pause", "seeking", "waiting", "emptied"]) audio.addEventListener(name, resetBaseline);

  audio.addEventListener("timeupdate", () => {
    if (!session || audio.paused || audio.seeking) return;
    const mediaTime = audio.currentTime;
    const wallTime = performance.now();
    if (session.mediaTime !== null) {
      const step = mediaTime - session.mediaTime;
      const elapsed = ((wallTime - session.wallTime) / 1000) * (audio.playbackRate || 1);
      // Only count time that advanced at the rate real time passed, so seeks
      // forward never count, while throttled updates on a locked iPhone still do.
      if (step > 0 && step <= elapsed + STEP_TOLERANCE_SECONDS) session.played += step;
    }
    session.mediaTime = mediaTime;
    session.wallTime = wallTime;
    if (!session.listened && session.played >= LISTEN_THRESHOLD_SECONDS) {
      session.listened = true;
      send("listened-30-seconds", session.trackId);
    }
  });

  audio.addEventListener("ended", () => {
    if (!session || session.ended) return;
    session.ended = true;
    if (session.listened) send("completed", session.trackId);
  });
}

const STATS_TTL_MS = 10 * 60 * 1000;
let statsRequest = null;

/**
 * Play counts for all tracks, `{ [trackId]: { total, last30Days } }`, fetched
 * once and kept in memory for a while. Resolves null when stats are off or
 * unavailable, so callers can simply hide them.
 */
export function loadTrackStats() {
  if (!STATS_URL) return Promise.resolve(null);
  if (statsRequest && Date.now() - statsRequest.at < STATS_TTL_MS) return statsRequest.promise;
  const promise = fetch(`${STATS_URL}/stats`, { headers: { Accept: "application/json" } })
    .then((response) => (response.ok ? response.json() : null))
    .then((body) => (body && typeof body.tracks === "object" ? body.tracks : null))
    .catch(() => null);
  statsRequest = { at: Date.now(), promise };
  // A failed request is retried the next time instead of being cached.
  promise.then((tracks) => { if (!tracks && statsRequest?.promise === promise) statsRequest = null; });
  return promise;
}

