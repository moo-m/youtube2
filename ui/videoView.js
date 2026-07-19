// Controls the video detail page: mounts the custom-controlled IFrame
// player, resumes progress, wires action buttons (including "Ask AI"),
// renders the "related" rail (playlist / channel / library only — never
// YouTube recommendations), loads/display the transcript, and logs the
// viewing session to the daily log when the user leaves the page.

import { repo } from "../storage/repository.js";
import { withMeta, relatedByPlaylist, relatedByChannel, relatedByLibrary } from "../library/libraryQuery.js";
import { VideoPlayer } from "../player/videoPlayer.js";
import { CustomControls } from "../player/customControls.js";
import { TranscriptPanel } from "../components/transcriptPanel.js";
import { dailyLog } from "../library/dailyLog.js";
import { el, formatDuration, formatDate, clamp } from "../utils/helpers.js";
import { showToast } from "../components/toast.js";

export class VideoView {
  constructor({ onOpenVideo, onAskAi }) {
    this.onOpenVideo = onOpenVideo;
    this.onAskAi = onAskAi || (() => {});
    this.playerWrap = document.querySelector(".player-wrap");

    this.player = new VideoPlayer("yt-player", {
      onProgress: (state) => this._onProgress(state),
      onCompleted: () => this._onCompleted(),
    });
    this.customControls = null;
    this.transcriptPanel = new TranscriptPanel(document.getElementById("transcript-section"), (seconds) => this.player.seekTo(seconds));

    this.currentVideoId = null;
    this.relatedTab = "playlist";
    this.sessionStartPosition = 0;

    document.querySelectorAll(".related-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".related-tab").forEach((t) => t.classList.remove("is-active"));
        tab.classList.add("is-active");
        this.relatedTab = tab.dataset.related;
        this._renderRelated();
      });
    });

    document.getElementById("vp-favorite").addEventListener("click", () => this._toggle("favorites", "vp-favorite", "Added to favorites", "Removed from favorites"));
    document.getElementById("vp-watchlater").addEventListener("click", () => this._toggle("watchLater", "vp-watchlater", "Added to Watch Later", "Removed from Watch Later"));
    document.getElementById("vp-hide").addEventListener("click", () => this._toggle("hidden", "vp-hide", "Hidden from library", "Unhidden"));
    document.getElementById("vp-complete").addEventListener("click", () => this._toggleComplete());
    document.getElementById("vp-ask-ai").addEventListener("click", () => {
      const video = repo.getVideo(this.currentVideoId);
      if (video) this.onAskAi(video);
    });
  }

  async open(videoId) {
    // Log the previous session (if any) before switching to the new video.
    this._logSessionIfNeeded();

    const video = repo.getVideo(videoId);
    if (!video) {
      showToast("That video isn't in your library anymore.", { type: "error" });
      return;
    }
    this.currentVideoId = videoId;
    const meta = withMeta(video);
    this.sessionStartPosition = meta.progress.position || 0;

    document.getElementById("vp-title").textContent = video.title;
    document.getElementById("vp-channel").textContent = video.channelTitle;
    document.getElementById("vp-date").textContent = formatDate(video.publishedAt);
    document.getElementById("vp-duration").textContent = formatDuration(video.durationSeconds);
    document.getElementById("vp-description").textContent = video.description || "No description provided.";

    this._syncActionButton("vp-favorite", meta.isFavorite);
    this._syncActionButton("vp-watchlater", meta.isWatchLater);
    this._syncActionButton("vp-hide", meta.isHidden);
    this._syncActionButton("vp-complete", meta.isCompleted);
    this._updateProgressBar(meta.progress.pct || 0);

    this._renderRelated();

    repo.incrementPlayCount(videoId);
    await this.player.loadVideo(videoId, { startSeconds: meta.progress.position || 0 });

    // (Re)build the custom glass control bar for this player instance.
    this.customControls?.destroy();
    this.customControls = new CustomControls(this.playerWrap, this.player, (seconds) => this.transcriptPanel.setActiveTime(seconds));

    this.transcriptPanel.load(videoId);
  }

  destroy() {
    this._logSessionIfNeeded();
    this.customControls?.destroy();
    this.customControls = null;
    this.player.destroy();
    this.currentVideoId = null;
  }

  _logSessionIfNeeded() {
    if (!this.currentVideoId) return;
    const current = repo.getProgress(this.currentVideoId).position || 0;
    const secondsWatched = current - this.sessionStartPosition;
    const pctAtEnd = repo.getProgress(this.currentVideoId).pct || 0;
    dailyLog.recordSession({ videoId: this.currentVideoId, secondsWatched, pctAtEnd });
  }

  _toggle(setName, buttonId, onMsg, offMsg) {
    if (!this.currentVideoId) return;
    const active = repo.toggleFlag(setName, this.currentVideoId);
    this._syncActionButton(buttonId, active);
    showToast(active ? onMsg : offMsg);
  }

  _toggleComplete() {
    if (!this.currentVideoId) return;
    const wasCompleted = repo.isFlagged("completed", this.currentVideoId);
    const active = repo.toggleFlag("completed", this.currentVideoId);
    this._syncActionButton("vp-complete", active);
    showToast(active ? "Marked completed" : "Marked incomplete");
    if (active && !wasCompleted) this._updateProgressBar(1);
  }

  _syncActionButton(id, active) {
    document.getElementById(id).dataset.active = String(active);
  }

  _updateProgressBar(pct) {
    const clamped = clamp(pct, 0, 1);
    document.getElementById("vp-progress-fill").style.width = `${clamped * 100}%`;
    document.getElementById("vp-progress-pct").textContent = `${Math.round(clamped * 100)}%`;
  }

  _onProgress({ position, duration, pct }) {
    if (!this.currentVideoId || !duration) return;
    repo.setProgress(this.currentVideoId, {
      position, duration, pct,
      lastWatched: new Date().toISOString(),
    });
    this._updateProgressBar(pct);
  }

  _onCompleted() {
    if (!this.currentVideoId) return;
    if (!repo.isFlagged("completed", this.currentVideoId)) {
      repo.toggleFlag("completed", this.currentVideoId);
      this._syncActionButton("vp-complete", true);
      showToast("Marked completed automatically");
    }
  }

  _renderRelated() {
    const video = repo.getVideo(this.currentVideoId);
    if (!video) return;

    let list;
    if (this.relatedTab === "playlist") list = relatedByPlaylist(video);
    else if (this.relatedTab === "channel") list = relatedByChannel(video);
    else list = relatedByLibrary(video);

    const container = document.getElementById("related-list");
    container.innerHTML = "";

    if (!list.length) {
      container.appendChild(el("p", { class: "field-hint" },
        this.relatedTab === "playlist" ? "This video isn't part of an imported playlist." : "Nothing else to show here yet."));
      return;
    }

    for (const item of list.slice(0, 40)) {
      const thumb = el("div", { class: "related-thumb" }, [
        el("img", { src: item.thumbnail, alt: "", loading: "lazy" }),
        el("span", { class: "related-duration" }, formatDuration(item.durationSeconds)),
      ]);
      const row = el("div", {
        class: "related-item",
        onClick: () => this.onOpenVideo(item.id),
      }, [
        thumb,
        el("div", {}, [
          el("div", { class: "related-title" }, item.title),
          el("div", { class: "related-channel" }, item.channelTitle),
        ]),
      ]);
      container.appendChild(row);
    }
  }
}
