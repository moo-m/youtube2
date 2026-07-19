// Renders the home area. For the "All Videos" nav item specifically, videos
// are browsed source-first: a grid of "container" cards (one per imported
// channel/playlist/video) is shown first; clicking one drills into that
// source's videos. Every other filter (Unwatched, Favorites, etc.) still
// shows a flat, filtered/sorted/searched grid directly, since grouping by
// source doesn't make sense for those views.

import { allVideosWithMeta } from "../library/libraryQuery.js";
import { applyFilter, filterByChannel, filterByPlaylist } from "../filters/filters.js";
import { applySort } from "../filters/sorting.js";
import { searchVideos } from "../search/search.js";
import { createVideoCard } from "../components/videoCard.js";
import { repo } from "../storage/repository.js";
import { el } from "../utils/helpers.js";
import { SOURCE_TYPES } from "../utils/constants.js";

const FILTER_LABELS = {
  all: "All Videos", unwatched: "Unwatched", watching: "Watching", completed: "Completed",
  favorites: "Favorites", watchlater: "Watch Later", hidden: "Hidden",
  "recently-watched": "Recently Watched", "recently-added": "Recently Added",
};

const TYPE_LABELS = { [SOURCE_TYPES.CHANNEL]: "Channel", [SOURCE_TYPES.PLAYLIST]: "Playlist", [SOURCE_TYPES.VIDEO]: "Video" };

const BATCH_SIZE = 24;

export class HomeView {
  constructor({ onOpenVideo }) {
    this.onOpenVideo = onOpenVideo;
    this.grid = document.getElementById("video-grid");
    this.containerGrid = document.getElementById("container-grid");
    this.backRow = document.getElementById("container-back-row");
    this.emptyState = document.getElementById("empty-state");
    this.titleEl = document.getElementById("view-title");
    this.countEl = document.getElementById("view-count");
    this.chipRow = document.getElementById("channel-playlist-filters");

    this.state = {
      filter: repo.settings.defaultFilter || "all",
      sort: repo.settings.defaultSort || "newest",
      query: "",
      channelId: null,
      playlistId: null,
      activeSourceId: null, // set when the user has drilled into a source container
    };

    this._observer = null;

    document.getElementById("container-back-btn").addEventListener("click", () => {
      this.state.activeSourceId = null;
      this.render();
    });
  }

  setFilter(filter) {
    this.state.filter = filter;
    this.state.channelId = null;
    this.state.playlistId = null;
    this.state.activeSourceId = null;
    this.state.query = "";
    this.render();
  }

  setSort(sort) {
    this.state.sort = sort;
    this.render();
  }

  setQuery(query) {
    this.state.query = query;
    if (query) this.state.activeSourceId = null; // searching always shows flat results
    this.render();
  }

  /** Container-first browsing only applies to the unfiltered "All Videos" view, with no active search. */
  get isContainerMode() {
    return this.state.filter === "all" && !this.state.query && !this.state.activeSourceId;
  }

  render() {
    if (this.isContainerMode) {
      this._renderContainers();
      return;
    }
    this._renderVideoGrid();
  }

  // ---------------------------------------------------------------------
  // Tier 1: source containers
  // ---------------------------------------------------------------------

  _renderContainers() {
    this.backRow.hidden = true;
    this.chipRow.innerHTML = "";
    this.grid.hidden = true;
    this.grid.innerHTML = "";
    this.containerGrid.hidden = false;
    this.containerGrid.innerHTML = "";

    const sources = repo.sources.filter((s) => !s.hidden);
    this.titleEl.textContent = "All Videos";

    const videos = repo.videos;
    this.countEl.textContent = sources.length ? `${sources.length} source${sources.length === 1 ? "" : "s"}` : "";
    this.emptyState.hidden = sources.length > 0;
    if (!sources.length) return;

    for (const source of sources) {
      const sourceVideos = videos.filter((v) => v.sourceId === source.id);
      this.containerGrid.appendChild(this._buildContainerCard(source, sourceVideos));
    }
  }

  _buildContainerCard(source, videos) {
    const thumbs = videos.slice(0, 3).map((v) => v.thumbnail);
    while (thumbs.length < 1) thumbs.push(source.thumbnail || "");

    const stack = el("div", { class: "container-stack" }, [
      thumbs[2] ? el("img", { class: "stack-layer-2", src: thumbs[2], alt: "" }) : null,
      thumbs[1] ? el("img", { class: "stack-layer-1", src: thumbs[1], alt: "" }) : null,
      el("img", { class: "stack-layer-0", src: thumbs[0], alt: "" }),
      el("span", { class: "container-type-badge" }, TYPE_LABELS[source.type]),
      el("span", { class: "container-count mono" }, `${videos.length} video${videos.length === 1 ? "" : "s"}`),
    ]);

    return el("article", {
      class: "container-card",
      tabindex: "0",
      role: "button",
      "aria-label": `Open ${source.title}`,
      onClick: () => { this.state.activeSourceId = source.id; this.render(); },
      onKeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.state.activeSourceId = source.id; this.render(); } },
    }, [
      stack,
      el("div", { class: "container-body" }, [
        el("h3", { class: "container-title" }, source.title),
        el("div", { class: "container-sub" }, source.channelTitle || "Imported source"),
      ]),
    ]);
  }

  // ---------------------------------------------------------------------
  // Tier 2: flat, filtered video grid (also used for every non-"all" filter)
  // ---------------------------------------------------------------------

  _renderVideoGrid() {
    this.containerGrid.hidden = true;
    this.containerGrid.innerHTML = "";
    this.grid.hidden = false;

    const drillingIntoSource = Boolean(this.state.activeSourceId) && this.state.filter === "all" && !this.state.query;
    this.backRow.hidden = !drillingIntoSource;

    let videos = allVideosWithMeta();
    if (drillingIntoSource) {
      videos = videos.filter((v) => v.sourceId === this.state.activeSourceId);
    } else {
      videos = applyFilter(videos, this.state.filter);
    }
    videos = filterByChannel(videos, this.state.channelId);
    videos = filterByPlaylist(videos, this.state.playlistId);
    if (this.state.query) videos = searchVideos(videos, this.state.query);
    videos = applySort(videos, this.state.sort);

    if (drillingIntoSource) {
      const source = repo.getSource(this.state.activeSourceId);
      this.titleEl.textContent = source ? source.title : "Source";
    } else {
      this.titleEl.textContent = this.state.query
        ? `Results for "${this.state.query}"`
        : (FILTER_LABELS[this.state.filter] || "All Videos");
    }
    this.countEl.textContent = videos.length ? `${videos.length} video${videos.length === 1 ? "" : "s"}` : "";

    this.grid.innerHTML = "";
    this.emptyState.hidden = videos.length > 0;
    this.renderChips(drillingIntoSource);

    if (!videos.length) return;
    this._appendBatched(videos, 0);
  }

  _appendBatched(videos, startIndex) {
    if (this._observer) this._observer.disconnect();

    const frag = document.createDocumentFragment();
    const end = Math.min(startIndex + BATCH_SIZE, videos.length);
    for (let i = startIndex; i < end; i++) {
      frag.appendChild(createVideoCard(videos[i], this.onOpenVideo));
    }
    this.grid.appendChild(frag);

    if (end < videos.length) {
      const sentinel = el("div", { class: "grid-sentinel", "aria-hidden": "true" });
      this.grid.appendChild(sentinel);
      this._observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          sentinel.remove();
          this._appendBatched(videos, end);
        }
      });
      this._observer.observe(sentinel);
    }
  }

  renderChips(drillingIntoSource) {
    this.chipRow.innerHTML = "";
    if (drillingIntoSource) return; // channel chips don't add much once already inside one source

    const videos = allVideosWithMeta().filter((v) => !v.isHidden || this.state.filter === "hidden");
    const channels = uniqueBy(videos, (v) => v.channelId, (v) => v.channelTitle);

    if (channels.length <= 1) return;

    const allChip = el("button", {
      class: `chip${!this.state.channelId ? " is-active" : ""}`,
      onClick: () => { this.state.channelId = null; this.render(); },
    }, "All Channels");
    this.chipRow.appendChild(allChip);

    for (const { key, label } of channels) {
      const chip = el("button", {
        class: `chip${this.state.channelId === key ? " is-active" : ""}`,
        onClick: () => { this.state.channelId = key; this.render(); },
      }, label);
      this.chipRow.appendChild(chip);
    }
  }
}

function uniqueBy(items, keyFn, labelFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (key && !map.has(key)) map.set(key, labelFn(item));
  }
  return [...map.entries()].map(([key, label]) => ({ key, label }));
}
