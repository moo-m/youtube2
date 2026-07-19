// Renders the transcript panel beneath the video player: clickable cues
// (word-level spans, each jumping to that cue's timestamp — YouTube only
// gives per-cue timing, not per-word, so a word click seeks to the start
// of the cue containing it), a live-highlighted "now playing" cue, and a
// manual-paste fallback for when automatic retrieval isn't available.

import { el, formatDuration } from "../utils/helpers.js";
import { transcriptService } from "../captions/transcriptService.js";

export class TranscriptPanel {
  /**
   * @param {HTMLElement} container
   * @param {(seconds: number) => void} onSeek
   */
  constructor(container, onSeek) {
    this.container = container;
    this.onSeek = onSeek;
    this.record = null;
    this.cueEls = [];
    this.activeIndex = -1;
  }

  async load(videoId) {
    this.videoId = videoId;
    this._renderLoading();

    let record = await transcriptService.getCached(videoId);
    if (!record) record = await transcriptService.fetchAuto(videoId);

    this.record = record;
    this._render();
  }

  setActiveTime(seconds) {
    if (!this.record?.cues?.length || seconds == null) return;
    const cues = this.record.cues;
    let idx = -1;
    for (let i = 0; i < cues.length; i++) {
      const start = cues[i].start;
      if (start == null) continue;
      const end = cues[i + 1]?.start ?? Infinity;
      if (seconds >= start && seconds < end) { idx = i; break; }
    }
    if (idx === this.activeIndex) return;
    if (this.cueEls[this.activeIndex]) this.cueEls[this.activeIndex].classList.remove("is-active");
    if (this.cueEls[idx]) {
      this.cueEls[idx].classList.add("is-active");
      this.cueEls[idx].scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    this.activeIndex = idx;
  }

  _renderLoading() {
    this.container.innerHTML = "";
    for (let i = 0; i < 3; i++) {
      this.container.appendChild(el("div", { class: "transcript-skeleton-line skeleton" }));
    }
  }

  _render() {
    this.container.innerHTML = "";
    this.cueEls = [];
    this.activeIndex = -1;

    const header = el("div", { class: "transcript-header" }, [
      el("h3", { class: "transcript-title" }, "Transcript"),
      this.record ? el("span", { class: "transcript-source-badge" },
        this.record.source === "auto" ? "Auto-detected" : this.record.source === "manual" ? "Pasted" : "Pasted (no timestamps)") : null,
      el("button", { class: "btn btn-ghost transcript-edit-btn", onClick: () => this._openPasteForm() },
        this.record ? "Replace" : "Paste transcript"),
    ]);
    this.container.appendChild(header);

    if (!this.record) {
      this.container.appendChild(el("p", { class: "field-hint transcript-empty-hint" },
        "No transcript could be found automatically for this video. If YouTube shows one (via the “…” menu → Show transcript), you can paste it here."));
      return;
    }

    const body = el("div", { class: "transcript-body" });
    const seekable = this.record.cues.some((c) => c.start != null);

    this.record.cues.forEach((cue, i) => {
      const words = cue.text.split(/\s+/).filter(Boolean);
      const wordEls = words.map((word) =>
        el("span", {
          class: "transcript-word",
          onClick: seekable ? () => this.onSeek(cue.start) : undefined,
        }, `${word} `)
      );

      const row = el("div", { class: `transcript-cue${seekable ? "" : " transcript-cue-untimed"}` }, [
        seekable ? el("button", {
          class: "transcript-timestamp mono",
          onClick: () => this.onSeek(cue.start),
          "aria-label": `Jump to ${formatDuration(cue.start)}`,
        }, formatDuration(cue.start)) : null,
        el("p", { class: "transcript-text" }, wordEls),
      ]);

      this.cueEls.push(row);
      body.appendChild(row);
    });

    this.container.appendChild(body);
  }

  _openPasteForm() {
    const overlay = el("div", { class: "transcript-paste-overlay" });
    const textarea = el("textarea", {
      class: "transcript-paste-textarea",
      placeholder: "Paste the transcript here — with or without timestamps.",
    });
    const cancel = el("button", { class: "btn btn-ghost", onClick: () => overlay.remove() }, "Cancel");
    const save = el("button", {
      class: "btn btn-brass",
      onClick: async () => {
        const text = textarea.value.trim();
        if (!text) return;
        this.record = await transcriptService.saveManual(this.videoId, text);
        overlay.remove();
        this._render();
      },
    }, "Save transcript");

    overlay.append(
      el("div", { class: "transcript-paste-box" }, [
        el("h4", {}, "Paste transcript"),
        textarea,
        el("div", { class: "transcript-paste-actions" }, [cancel, save]),
      ])
    );
    this.container.appendChild(overlay);
    textarea.focus();
  }
}
