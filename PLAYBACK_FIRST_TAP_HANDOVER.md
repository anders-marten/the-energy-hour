# Handover: first tap on play does not start playback on iPhone

Status: proposed fixes only. No code changed. Date: 2026-11-24.
Scope: `public/app.js`. Line numbers refer to commit `d8f824e`.

This is the short-term alternative to `AUDIO_PLAYER_INVESTIGATION.md`. Try these fixes first, and move to an own audio player only if they are not enough.

## Symptom

On iPhone (Safari), the first tap on a play button usually does not start the track. A second tap does.

## Cause

The SoundCloud widget is a cross-origin iframe. `widget.play()` is a `postMessage` to the iframe. iOS Safari only lets audio start when playback is triggered directly by a user gesture.

| Case | What the code does | Result on iOS |
| --- | --- | --- |
| Tap on the track that is already loaded and ready | `playIfRequested()` → `widget.play()` runs synchronously in the click handler ([app.js:122](public/app.js:122), [app.js:270](public/app.js:270), [app.js:284](public/app.js:284)) | Works |
| Tap on another track | `showTrack()` → `widget.load(...)`, and `widget.play()` only runs in the load callback after a network round trip ([app.js:232-238](public/app.js:232)) | The gesture has expired, so playback is blocked |
| First tap right after page load, before `READY` | `shouldPlayWhenReady = true`, and `play()` only runs from the `READY` handler ([app.js:197-199](public/app.js:197)) | Blocked |

This matches "the second tap works": by then the track is loaded, and `play()` is sent within the gesture.

Two bugs make it worse:

1. **Optimistic state** ([app.js:243-244](public/app.js:243)). `isPlaying = shouldPlay` is set before anything plays. The UI shows pause (Ⅱ), "Now playing" and an active row button even when iOS blocked playback. A new tap within about 1 s, before polling corrects the state, is treated as **pause** in `showTrackById()` ([app.js:266](public/app.js:266)) and `toggleCurrentTrack()` ([app.js:280](public/app.js:280)). It can then take three taps.
2. **Polling never syncs the first track** ([app.js:197](public/app.js:197)). `widgetLoadingTrackId` is set in `showTrack()` but only cleared in the `load()` callback, never in the `READY` handler. Until the first track change, `syncPlayerState()` ([app.js:165](public/app.js:165)) always returns early, so a wrong state is never corrected.

## Fixes, in order

### Fix 1: clear `widgetLoadingTrackId` on READY (small, do first)

In `bindWidgetEvents()`:

```js
widget.bind(SC.Widget.Events.READY, () => {
  widgetReady = true;
  widgetLoadingTrackId = null;   // new
  playIfRequested();
  syncPlayerState();
  startPlayerStatePolling();
});
```

### Fix 2: honest player state with a "pending" state

Show playing only when SoundCloud reports it.

- Add `let playPending = false;`.
- In `showTrack()`: replace `isPlaying = shouldPlay;` with `isPlaying = false; playPending = shouldPlay;`. Keep `hasPlayed = true` when `shouldPlay`, so the player bar is shown.
- In `playIfRequested()`, and wherever `widget.play()` is called: set `playPending = true`.
- `PLAY` event: `isPlaying = true; playPending = false;`.
- `PAUSE` event and `syncPlayerState()`: when paused, set `isPlaying = false`.
- **Timeout:** if no `PLAY` arrives within about 1.5 s of a `play()` call, set `playPending = false`. The UI then shows ▶ again, so the next tap is a play, not a pause. On iOS that next tap runs synchronously and works.
- In `showTrackById()` and `toggleCurrentTrack()`, branch on `isPlaying` only, not on the intended state. A tap while `playPending` is true should call `widget.play()` synchronously again. That is a retry, not a pause.
- In `updatePlayerUi()`, show the status text "Loading…" while `playPending`. Optionally add a spinner or dimmed state on the active play button. "Paused" and "Now playing" stay as they are.

This alone does not make the first tap play, but it removes the confusing states. The second tap is then always a play.

### Fix 3: unlock audio within the first gesture (needs testing on iPhone)

On the first tap ever, before any `PLAY` event has been seen, send a play synchronously within the gesture so iOS lets the iframe start audio:

```js
let audioUnlocked = false;   // set to true in the PLAY handler

function showTrack(index, shouldPlay = false) {
  // ...
  } else {
    if (shouldPlay && !audioUnlocked && widgetReady) {
      // Inside the click handler: start and immediately pause the loaded track
      // silently, so iOS lets the widget start audio later.
      widget.setVolume(0);
      widget.play();
      widget.pause();
    }
    widget.load(trackApiUrl(track.id), { ...widgetOptions, callback: () => {
      widget.setVolume(100);
      // ...existing callback (play if requested)...
    } });
  }
}
```

Uncertain: whether the unlock survives `widget.load()`. It depends on whether the SoundCloud widget reuses its `<audio>` element when loading a new sound. Test with Safari Web Inspector against a real iPhone. If it does not survive, keep Fix 2 and add Fix 4.

Also cover the case "first tap before `READY`". Call `widget.play()` both in the tap and again in `READY`. If the iframe is not ready, the first call is a no-op. On iOS a tap before `READY` can only be helped by Fix 4.

### Fix 4 (fallback): let the first tap land in the widget

If Fix 3 does not work, make the very first play happen inside the iframe on iOS. For example, while `audioUnlocked` is false on iOS, scroll to the featured widget and show a short hint such as "Tap play in the player to start". A tap inside the iframe always works, and Fix 3 or the second-tap behavior then handles later tracks. This is a UX trade-off, so ask Anders before building it.

## Test plan (real iPhone, Safari)

1. Connect the iPhone to the Mac: Safari → Develop → [iPhone] → the page.
2. Temporarily log `play()` calls and the `READY`, `PLAY` and `PAUSE` events with a timestamp.
3. Test each case after a fresh page load:
   - **a.** Tap play on the featured track (Morning Can Wait).
   - **b.** Tap play on another track in the list.
   - **c.** Tap play in the Discover sheet for another track.
   - **d.** Tap quickly right after the page has loaded, before `READY`.
   - **e.** Let a track finish, and check that the next one starts (auto-advance).
   - **f.** Lock the screen during playback, and check auto-advance and lock-screen controls.
4. After each fix, check that "Now playing", Ⅱ and the active row only show when audio plays, and that a blocked attempt goes back to ▶.

Desktop Chrome and the existing behavior (one widget in the feature slot, `widget.load()` for later tracks, see commit `134ef62`) must keep working. Do not move the iframe in the DOM, because that reloads it and stops playback.

## Done when

- On iPhone, the first tap on any track starts playback (Fix 3). If that is not possible, a single extra tap is clearly signaled (Fix 2 and Fix 4).
- The UI never shows "Now playing" for a track that is not playing.
- No regressions on desktop.
