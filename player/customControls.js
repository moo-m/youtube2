// Builds a custom, glass-styled control bar over the embedded YouTube
// player (whose native controls are hidden — see player/videoPlayer.js).
// This gives the embed a more polished, "Apple-like" feel than YouTube's
// stock chrome, while still using the official IFrame Player API under
// the hood for every action (play/pause/seek/volume/rate/fullscreen).

import { el, formatDuration, clamp } from "../utils/helpers.js";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export class CustomControls {
  /**
   * @param {HTMLElement} wrapEl - the .player-wrap element (positioned, overlays go inside it)
   * @param {import("./videoPlayer.js").VideoPlayer} videoPlayer
   * @param {(seconds: number) => void} onTimeUpdate - for syncing e.g. the transcript panel
   */
  constructor(wrapEl, videoPlayer, onTimeUpdate) {
    this.wrap = wrapEl;
    this.player = videoPlayer;
    this.onTimeUpdate = onTimeUpdate || (() => {});
    this.dragging = false;
    this.hideTimer = null;

    this._build();
    this._bind();
    this.pollHandle = setInterval(() => this._poll(), 200);
  }

  _build() {
    this.playBtn = el("button", { class: "pc-btn pc-play", "aria-label": "Play/Pause" }, "▶");
    this.backBtn = el("button", { class: "pc-btn pc-skip", "aria-label": "Back 10 seconds" }, "⟲10");
    this.fwdBtn = el("button", { class: "pc-btn pc-skip", "aria-label": "Forward 10 seconds" }, "10⟳");
    this.timeLabel = el("span", { class: "pc-time mono" }, "0:00");
    this.durationLabel = el("span", { class: "pc-time mono" }, "0:00");

    this.scrubberFill = el("div", { class: "pc-scrubber-fill" });
    this.scrubberHandle = el("div", { class: "pc-scrubber-handle" });
    this.scrubberTrack = el("div", { class: "pc-scrubber-track" }, [this.scrubberFill, this.scrubberHandle]);

    this.muteBtn = el("button", { class: "pc-btn pc-mute", "aria-label": "Mute/Unmute" }, "🔊");
    this.volumeSlider = el("input", { type: "range", min: "0", max: "100", value: "100", class: "pc-volume" });

    this.speedBtn = el("button", { class: "pc-btn pc-speed", "aria-label": "Playback speed" }, "1×");
    this.speedMenu = el("div", { class: "pc-speed-menu", hidden: "true" },
      SPEEDS.map((s) => el("button", { class: "pc-speed-option", onClick: () => this._setSpeed(s) }, `${s}×`)));

    this.fullscreenBtn = el("button", { class: "pc-btn pc-fullscreen", "aria-label": "Fullscreen" }, "⤢");

    this.centerTapZone = el("div", { class: "pc-center-tap", "aria-hidden": "true" });

    this.bar = el("div", { class: "player-controls" }, [
      this.scrubberTrack,
      el("div", { class: "pc-row" }, [
        el("div", { class: "pc-row-left" }, [this.backBtn, this.playBtn, this.fwdBtn, this.timeLabel, el("span", { class: "pc-time-sep" }, "/"), this.durationLabel]),
        el("div", { class: "pc-row-right" }, [
          this.muteBtn, this.volumeSlider,
          el("div", { class: "pc-speed-wrap" }, [this.speedBtn, this.speedMenu]),
          this.fullscreenBtn,
        ]),
      ]),
    ]);

    this.wrap.classList.add("has-custom-controls");
    this.wrap.append(this.centerTapZone, this.bar);
  }

  _bind() {
    this.playBtn.addEventListener("click", () => this.player.togglePlay());
    this.centerTapZone.addEventListener("click", () => this.player.togglePlay());
    this.backBtn.addEventListener("click", () => this.player.seekRelative(-10));
    this.fwdBtn.addEventListener("click", () => this.player.seekRelative(10));

    this.muteBtn.addEventListener("click", () => {
      const muted = !this.player.isMuted();
      this.player.setMuted(muted);
      this.muteBtn.textContent = muted ? "🔇" : "🔊";
    });
    this.volumeSlider.addEventListener("input", (e) => {
      this.player.setVolume(Number(e.target.value));
      if (Number(e.target.value) > 0) { this.player.setMuted(false); this.muteBtn.textContent = "🔊"; }
    });

    this.speedBtn.addEventListener("click", () => { this.speedMenu.hidden = !this.speedMenu.hidden; });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".pc-speed-wrap")) this.speedMenu.hidden = true;
    });

    this.fullscreenBtn.addEventListener("click", () => this.player.requestFullscreen(this.wrap));

    // Scrubbing
    const seekFromEvent = (clientX) => {
      const rect = this.scrubberTrack.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      return ratio * this.player.getDuration();
    };

    this.scrubberTrack.addEventListener("pointerdown", (e) => {
      this.dragging = true;
      this._setScrubberVisual(seekFromEvent(e.clientX) / (this.player.getDuration() || 1));
      this.scrubberTrack.setPointerCapture(e.pointerId);
    });
    this.scrubberTrack.addEventListener("pointermove", (e) => {
      if (!this.dragging) return;
      this._setScrubberVisual(seekFromEvent(e.clientX) / (this.player.getDuration() || 1));
    });
    this.scrubberTrack.addEventListener("pointerup", (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.player.seekTo(seekFromEvent(e.clientX));
    });

    // Auto-hide while playing
    this.wrap.addEventListener("pointermove", () => this._revealControls());
    this.wrap.addEventListener("pointerleave", () => this._scheduleHide());
    this._revealControls();
  }

  _revealControls() {
    this.wrap.classList.add("controls-visible");
    clearTimeout(this.hideTimer);
    this._scheduleHide();
  }

  _scheduleHide() {
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      const YT = window.YT;
      if (YT && this.player.getPlayerState() === YT.PlayerState.PLAYING) {
        this.wrap.classList.remove("controls-visible");
      }
    }, 2600);
  }

  _setSpeed(speed) {
    this.player.setPlaybackRate(speed);
    this.speedBtn.textContent = `${speed}×`;
    this.speedMenu.hidden = true;
  }

  _setScrubberVisual(ratio) {
    const pct = clamp(ratio, 0, 1) * 100;
    this.scrubberFill.style.width = `${pct}%`;
    this.scrubberHandle.style.left = `${pct}%`;
  }

  _poll() {
    const YT = window.YT;
    if (!this.player.player || !YT) return;

    const duration = this.player.getDuration();
    const current = this.player.getCurrentTime();
    const state = this.player.getPlayerState();

    this.playBtn.textContent = state === YT.PlayerState.PLAYING ? "⏸" : "▶";
    this.durationLabel.textContent = formatDuration(duration);

    if (!this.dragging) {
      this.timeLabel.textContent = formatDuration(current);
      this._setScrubberVisual(duration ? current / duration : 0);
    }

    this.onTimeUpdate(current);
  }

  destroy() {
    clearInterval(this.pollHandle);
    clearTimeout(this.hideTimer);
    this.bar.remove();
    this.centerTapZone.remove();
    this.wrap.classList.remove("has-custom-controls", "controls-visible");
  }
}
