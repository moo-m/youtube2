// Repository: the single source of truth for reading/writing app data.
// Wraps localStore with typed collection helpers and a small pub/sub so
// UI modules can react to changes without polling.

import { localStore } from "./localStore.js";
import { STORAGE_KEYS, DEFAULT_SETTINGS } from "../utils/constants.js";

const listeners = new Map(); // event name -> Set<fn>

function emit(event, payload) {
  (listeners.get(event) || new Set()).forEach((fn) => fn(payload));
}

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}

class Repository {
  constructor() {
    this.sources = localStore.get(STORAGE_KEYS.SOURCES, []);
    this.videos = localStore.get(STORAGE_KEYS.VIDEOS, []);
    this.favorites = new Set(localStore.get(STORAGE_KEYS.FAVORITES, []));
    this.watchLater = new Set(localStore.get(STORAGE_KEYS.WATCH_LATER, []));
    this.hidden = new Set(localStore.get(STORAGE_KEYS.HIDDEN, []));
    this.completed = new Set(localStore.get(STORAGE_KEYS.COMPLETED, []));
    this.progress = localStore.get(STORAGE_KEYS.PROGRESS, {}); // videoId -> {position,duration,pct,lastWatched,playCount}
    this.settings = { ...DEFAULT_SETTINGS, ...localStore.get(STORAGE_KEYS.SETTINGS, {}) };
    this.searchHistory = localStore.get(STORAGE_KEYS.SEARCH_HISTORY, []);
  }

  // ---------- persistence ----------
  persistSources() { localStore.set(STORAGE_KEYS.SOURCES, this.sources); }
  persistVideos() { localStore.set(STORAGE_KEYS.VIDEOS, this.videos); }
  persistFavorites() { localStore.set(STORAGE_KEYS.FAVORITES, [...this.favorites]); }
  persistWatchLater() { localStore.set(STORAGE_KEYS.WATCH_LATER, [...this.watchLater]); }
  persistHidden() { localStore.set(STORAGE_KEYS.HIDDEN, [...this.hidden]); }
  persistCompleted() { localStore.set(STORAGE_KEYS.COMPLETED, [...this.completed]); }
  persistProgress() { localStore.set(STORAGE_KEYS.PROGRESS, this.progress); }
  persistSettings() { localStore.set(STORAGE_KEYS.SETTINGS, this.settings); }
  persistSearchHistory() { localStore.set(STORAGE_KEYS.SEARCH_HISTORY, this.searchHistory); }

  // ---------- sources ----------
  addSource(source) {
    this.sources.push(source);
    this.persistSources();
    emit("sources:changed", this.sources);
  }

  removeSource(sourceId) {
    this.sources = this.sources.filter((s) => s.id !== sourceId);
    this.videos = this.videos.filter((v) => v.sourceId !== sourceId);
    this.persistSources();
    this.persistVideos();
    emit("sources:changed", this.sources);
    emit("videos:changed", this.videos);
  }

  updateSource(sourceId, patch) {
    const source = this.sources.find((s) => s.id === sourceId);
    if (!source) return;
    Object.assign(source, patch);
    this.persistSources();
    emit("sources:changed", this.sources);
  }

  getSource(sourceId) {
    return this.sources.find((s) => s.id === sourceId);
  }

  // ---------- videos ----------
  upsertVideos(newVideos) {
    const byId = new Map(this.videos.map((v) => [v.id, v]));
    for (const v of newVideos) byId.set(v.id, { ...byId.get(v.id), ...v });
    this.videos = [...byId.values()];
    this.persistVideos();
    emit("videos:changed", this.videos);
  }

  getVideo(videoId) {
    return this.videos.find((v) => v.id === videoId);
  }

  allVideos() {
    return this.videos;
  }

  // ---------- flags ----------
  toggleFlag(setName, videoId) {
    const set = this[setName];
    if (set.has(videoId)) set.delete(videoId); else set.add(videoId);
    this[`persist${capitalize(setName)}`]();
    emit("flags:changed", { setName, videoId, active: set.has(videoId) });
    return set.has(videoId);
  }

  isFlagged(setName, videoId) {
    return this[setName].has(videoId);
  }

  // ---------- progress ----------
  getProgress(videoId) {
    return this.progress[videoId] || { position: 0, duration: 0, pct: 0, lastWatched: null, playCount: 0 };
  }

  setProgress(videoId, patch) {
    const existing = this.getProgress(videoId);
    this.progress[videoId] = { ...existing, ...patch };
    this.persistProgress();
    emit("progress:changed", { videoId, progress: this.progress[videoId] });
  }

  incrementPlayCount(videoId) {
    const existing = this.getProgress(videoId);
    this.setProgress(videoId, { playCount: (existing.playCount || 0) + 1 });
  }

  // ---------- settings ----------
  updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    this.persistSettings();
    emit("settings:changed", this.settings);
  }

  // ---------- search history ----------
  addSearchTerm(term) {
    if (!term) return;
    this.searchHistory = [term, ...this.searchHistory.filter((t) => t !== term)].slice(0, 10);
    this.persistSearchHistory();
  }

  // ---------- bulk clear operations ----------
  clearHistory() {
    for (const id of Object.keys(this.progress)) {
      this.progress[id].lastWatched = null;
    }
    this.persistProgress();
    emit("progress:changed", { bulk: true });
  }
  clearProgress() {
    this.progress = {};
    this.completed = new Set();
    this.persistProgress();
    this.persistCompleted();
    emit("progress:changed", { bulk: true });
  }
  clearFavorites() { this.favorites = new Set(); this.persistFavorites(); emit("flags:changed", { bulk: true }); }
  clearWatchLater() { this.watchLater = new Set(); this.persistWatchLater(); emit("flags:changed", { bulk: true }); }
  clearHidden() { this.hidden = new Set(); this.persistHidden(); emit("flags:changed", { bulk: true }); }

  resetLibrary() {
    this.sources = [];
    this.videos = [];
    this.favorites = new Set();
    this.watchLater = new Set();
    this.hidden = new Set();
    this.completed = new Set();
    this.progress = {};
    this.searchHistory = [];
    this.persistSources();
    this.persistVideos();
    this.persistFavorites();
    this.persistWatchLater();
    this.persistHidden();
    this.persistCompleted();
    this.persistProgress();
    this.persistSearchHistory();
    emit("sources:changed", this.sources);
    emit("videos:changed", this.videos);
    emit("flags:changed", { bulk: true });
    emit("progress:changed", { bulk: true });
  }

  // ---------- import / export ----------
  exportAll() {
    return {
      exportedAt: new Date().toISOString(),
      version: 1,
      sources: this.sources,
      videos: this.videos,
      favorites: [...this.favorites],
      watchLater: [...this.watchLater],
      hidden: [...this.hidden],
      completed: [...this.completed],
      progress: this.progress,
      settings: this.settings,
      searchHistory: this.searchHistory,
    };
  }

  importAll(data) {
    if (!data || typeof data !== "object") throw new Error("Invalid import file");
    this.sources = data.sources || [];
    this.videos = data.videos || [];
    this.favorites = new Set(data.favorites || []);
    this.watchLater = new Set(data.watchLater || []);
    this.hidden = new Set(data.hidden || []);
    this.completed = new Set(data.completed || []);
    this.progress = data.progress || {};
    this.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    this.searchHistory = data.searchHistory || [];

    this.persistSources();
    this.persistVideos();
    this.persistFavorites();
    this.persistWatchLater();
    this.persistHidden();
    this.persistCompleted();
    this.persistProgress();
    this.persistSettings();
    this.persistSearchHistory();

    emit("sources:changed", this.sources);
    emit("videos:changed", this.videos);
    emit("flags:changed", { bulk: true });
    emit("progress:changed", { bulk: true });
    emit("settings:changed", this.settings);
  }
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

export const repo = new Repository();
