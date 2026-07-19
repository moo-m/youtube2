// Wraps the YouTube IFrame Player API: loads the script once, creates a
// player instance per video, and reports progress back via a callback so
// the repository can persist resume position / percentage / completion.

import { COMPLETION_THRESHOLD } from "../utils/constants.js";

let apiReadyPromise = null;

function loadIframeApi() {
  if (apiReadyPromise) return apiReadyPromise;

  apiReadyPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }
    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prevCallback === "function") prevCallback();
      resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });

  return apiReadyPromise;
}

export class VideoPlayer {
  /**
   * @param {string} containerId - element id to mount the player into
   * @param {(state: {position:number, duration:number, pct:number, playing:boolean}) => void} onProgress
   * @param {() => void} onCompleted - fired once when crossing the completion threshold
   * @param {(state: number) => void} onStateChange - raw YT.PlayerState changes, for custom UI
   */
  constructor(containerId, { onProgress, onCompleted, onStateChange } = {}) {
    this.containerId = containerId;
    this.onProgress = onProgress || (() => {});
    this.onCompleted = onCompleted || (() => {});
    this.onStateChange = onStateChange || (() => {});
    this.player = null;
    this.tickHandle = null;
    this.completedFired = false;
  }

  async loadVideo(videoId, { startSeconds = 0 } = {}) {
    const YT = await loadIframeApi();
    this.completedFired = false;

    if (this.player) {
      this.player.loadVideoById({ videoId, startSeconds });
      return;
    }

    this.player = await new Promise((resolve) => {
      const instance = new YT.Player(this.containerId, {
        videoId,
        playerVars: {
          start: Math.floor(startSeconds),
          rel: 0,          // no related-video recommendations
          modestbranding: 1,
          playsinline: 1,
          controls: 0,     // native chrome hidden — replaced by our own glass control bar
          disablekb: 1,    // we handle keyboard shortcuts ourselves at the app level
          iv_load_policy: 3,
        },
        events: {
          onReady: () => resolve(instance),
          onStateChange: (e) => this._handleStateChange(e),
        },
      });
    });

    this._startTicking();
  }

  _handleStateChange(e) {
    const YT = window.YT;
    this.onStateChange(e.data);
    if (e.data === YT.PlayerState.PLAYING) this._startTicking();
    if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) this._reportProgress();
    if (e.data === YT.PlayerState.ENDED) this._maybeComplete(1);
  }

  _startTicking() {
    clearInterval(this.tickHandle);
    this.tickHandle = setInterval(() => this._reportProgress(), 2000);
  }

  _reportProgress() {
    if (!this.player || typeof this.player.getCurrentTime !== "function") return;
    const position = this.player.getCurrentTime() || 0;
    const duration = this.player.getDuration() || 0;
    const pct = duration > 0 ? position / duration : 0;
    this.onProgress({ position, duration, pct, playing: true });
    this._maybeComplete(pct);
  }

  _maybeComplete(pct) {
    if (!this.completedFired && pct >= COMPLETION_THRESHOLD) {
      this.completedFired = true;
      this.onCompleted();
    }
  }

  // ---- Control surface used by player/customControls.js ----

  getCurrentTime() { return this.player?.getCurrentTime?.() || 0; }
  getDuration() { return this.player?.getDuration?.() || 0; }
  getPlayerState() { return this.player?.getPlayerState?.() ?? -1; }
  isMuted() { return this.player?.isMuted?.() || false; }
  getVolume() { return this.player?.getVolume?.() ?? 100; }
  getPlaybackRate() { return this.player?.getPlaybackRate?.() || 1; }

  play() { this.player?.playVideo?.(); }
  pause() { this.player?.pauseVideo?.(); }

  togglePlay() {
    const YT = window.YT;
    if (!YT) return;
    const state = this.getPlayerState();
    if (state === YT.PlayerState.PLAYING) this.pause();
    else this.play();
  }

  seekTo(seconds) {
    this.player?.seekTo?.(seconds, true);
    this._reportProgress();
  }

  seekRelative(deltaSeconds) {
    const next = Math.max(0, Math.min(this.getDuration(), this.getCurrentTime() + deltaSeconds));
    this.seekTo(next);
  }

  setVolume(volume) {
    this.player?.setVolume?.(volume);
  }

  setMuted(muted) {
    if (!this.player) return;
    muted ? this.player.mute() : this.player.unMute();
  }

  setPlaybackRate(rate) {
    this.player?.setPlaybackRate?.(rate);
  }

  requestFullscreen(el) {
    const target = el || document.getElementById(this.containerId)?.parentElement;
    target?.requestFullscreen?.();
  }

  destroy() {
    clearInterval(this.tickHandle);
    this._reportProgress();
    this.player?.destroy?.();
    this.player = null;
  }
}
