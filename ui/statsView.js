import { allVideosWithMeta } from "../library/libraryQuery.js";
import { computeStatistics } from "../statistics/statistics.js";
import { el } from "../utils/helpers.js";
import { on } from "../storage/repository.js";

const CARDS = [
  { key: "total", label: "Total Videos" },
  { key: "completed", label: "Completed" },
  { key: "watching", label: "Watching" },
  { key: "unwatched", label: "Unwatched" },
  { key: "hidden", label: "Hidden" },
  { key: "favorites", label: "Favorites" },
  { key: "watchLater", label: "Watch Later" },
  { key: "totalWatchedHours", label: "Total Watched" },
  { key: "avgCompletionPct", label: "Avg Completion", suffix: "%" },
  { key: "avgWatchTime", label: "Avg Watch Time" },
  { key: "mostWatchedChannel", label: "Most Watched Channel" },
  { key: "mostWatchedPlaylist", label: "Most Watched Playlist" },
  { key: "mostWatchedVideo", label: "Most Watched Video" },
  { key: "longestVideo", label: "Longest Video" },
  { key: "newestImported", label: "Newest Imported" },
  { key: "oldestImported", label: "Oldest Imported" },
];

export class StatsView {
  constructor() {
    this.container = document.getElementById("stats-grid");
    on("videos:changed", () => this.render());
    on("progress:changed", () => this.render());
    on("flags:changed", () => this.render());
  }

  render() {
    const stats = computeStatistics(allVideosWithMeta());
    this.container.innerHTML = "";

    for (const card of CARDS) {
      const value = stats[card.key];
      const isLong = typeof value === "string" && value.length > 16;
      this.container.appendChild(el("div", { class: "stat-card" }, [
        el("div", { class: "stat-label" }, card.label),
        isLong
          ? el("div", { class: "stat-sub" }, value)
          : el("div", { class: "stat-value mono" }, `${value}${card.suffix || ""}`),
      ]));
    }
  }
}
