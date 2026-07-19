// Renders the Sources list: refresh, hide, rename, delete, and per-source
// statistics (video count, total duration).

import { repo, on } from "../storage/repository.js";
import { importer } from "../library/importer.js";
import { el, formatHours } from "../utils/helpers.js";
import { showToast } from "../components/toast.js";
import { SOURCE_TYPES } from "../utils/constants.js";

const TYPE_LABELS = { [SOURCE_TYPES.CHANNEL]: "Channel", [SOURCE_TYPES.PLAYLIST]: "Playlist", [SOURCE_TYPES.VIDEO]: "Video" };

export class SourcesView {
  constructor() {
    this.container = document.getElementById("sources-list");
    on("sources:changed", () => this.render());
    on("videos:changed", () => this.render());
  }

  render() {
    this.container.innerHTML = "";
    const sources = repo.sources;

    if (!sources.length) {
      this.container.appendChild(el("div", { class: "empty-state" }, [
        el("p", { class: "empty-title" }, "No sources yet"),
        el("p", { class: "empty-body" }, "Add a channel, playlist, or video to start importing."),
      ]));
      return;
    }

    for (const source of sources) {
      const videoCount = repo.videos.filter((v) => v.sourceId === source.id).length;
      const totalSeconds = repo.videos.filter((v) => v.sourceId === source.id).reduce((s, v) => s + (v.durationSeconds || 0), 0);

      const row = el("div", { class: "source-row" }, [
        el("img", { class: "source-thumb", src: source.thumbnail || "", alt: "" }),
        el("div", {}, [
          el("div", { class: "source-name" }, source.title),
          el("div", { class: "source-sub" }, [
            el("span", { class: "source-type-badge" }, TYPE_LABELS[source.type]),
            el("span", {}, `${videoCount} video${videoCount === 1 ? "" : "s"}`),
            el("span", {}, formatHours(totalSeconds)),
            source.hidden ? el("span", {}, "Hidden") : null,
          ]),
        ]),
        el("div", { class: "source-actions" }, [
          el("button", {
            class: "icon-btn", "aria-label": "Refresh source",
            onClick: () => this._refresh(source),
          }, "⟳"),
          el("button", {
            class: "icon-btn", "aria-label": "Rename source",
            onClick: () => this._rename(source),
          }, "✎"),
          el("button", {
            class: "icon-btn", "aria-label": source.hidden ? "Unhide source" : "Hide source",
            onClick: () => { repo.updateSource(source.id, { hidden: !source.hidden }); },
          }, source.hidden ? "◌" : "◌̸"),
          el("button", {
            class: "icon-btn", "aria-label": "Delete source",
            onClick: () => this._remove(source),
          }, "🗑"),
        ]),
      ]);

      this.container.appendChild(row);
    }
  }

  async _refresh(source) {
    showToast(`Refreshing "${source.title}"…`);
    try {
      const { addedCount, skippedShorts } = await importer.refreshSource(source);
      showToast(`Refreshed: ${addedCount} video${addedCount === 1 ? "" : "s"} up to date${skippedShorts ? `, ${skippedShorts} Short${skippedShorts === 1 ? "" : "s"} skipped` : ""}.`);
    } catch (err) {
      showToast(err.message || "Refresh failed.", { type: "error" });
    }
  }

  _rename(source) {
    const name = prompt("Rename source", source.title);
    if (name && name.trim()) {
      repo.updateSource(source.id, { title: name.trim() });
      showToast("Source renamed");
    }
  }

  _remove(source) {
    if (!confirm(`Remove "${source.title}" and all its imported videos?`)) return;
    repo.removeSource(source.id);
    showToast("Source removed");
  }
}
