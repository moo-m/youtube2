// Central constants used across the app.

export const STORAGE_KEYS = {
  SOURCES: "vl.sources",
  VIDEOS: "vl.videos",
  FAVORITES: "vl.favorites",
  WATCH_LATER: "vl.watchLater",
  HIDDEN: "vl.hidden",
  COMPLETED: "vl.completed",
  PROGRESS: "vl.progress",         // per-video: position, duration, pct, lastWatched, playCount
  SETTINGS: "vl.settings",
  SEARCH_HISTORY: "vl.searchHistory",
  API_KEY: "vl.apiKey",
  AI_CONFIG: "vl.aiConfig",        // { endpoint, apiKey, model }
  SIDEBAR_STATE: "vl.sidebarCollapsed",
};

export const SOURCE_TYPES = {
  CHANNEL: "channel",
  PLAYLIST: "playlist",
  VIDEO: "video",
};

export const COMPLETION_THRESHOLD = 0.9; // 90% watched = completed

export const DEFAULT_SETTINGS = {
  theme: "dark",          // dark | light | auto
  gridSize: "medium",     // small | medium | large
  density: "comfortable", // compact | comfortable | spacious
  animationSpeed: "normal", // reduced | normal | lively
  defaultSort: "newest",
  defaultFilter: "all",
  layout: "grid",         // grid | list
};

export const DEFAULT_AI_CONFIG = {
  endpoint: "",   // OpenAI-compatible chat completions URL, filled in later by the user
  apiKey: "",
  model: "",
};

export const YT_API_BASE = "https://www.googleapis.com/youtube/v3";

// ISO 8601 duration below this is very likely a Short; combined with
// vertical-aspect / #shorts URL heuristics in library/importer.js.
export const SHORTS_MAX_SECONDS = 180;

// ---------------------------------------------------------------------
// PWA / service worker
// ---------------------------------------------------------------------

export const SW_CACHE_VERSION = "v1";
export const SW_APP_SHELL_CACHE = `vl-app-shell-${SW_CACHE_VERSION}`;
export const SW_RUNTIME_CACHE = `vl-runtime-${SW_CACHE_VERSION}`;

// Known ad/tracking domains associated with YouTube's own ad delivery and
// third-party trackers. The service worker refuses any request matching
// these hosts. NOTE: this only affects requests that pass through *this
// app's* service worker (i.e. requests our own page/origin makes). Ads
// rendered inside the embedded YouTube <iframe> are loaded and requested
// by youtube.com's own frame, which the browser deliberately isolates
// from our service worker — that boundary can't be crossed from an
// embedding site, by design. See README for details.
export const AD_BLOCK_HOSTNAMES = [
  "doubleclick.net",
  "googleadservices.com",
  "googlesyndication.com",
  "google-analytics.com",
  "pagead2.googlesyndication.com",
  "adservice.google.com",
  "static.doubleclick.net",
  "youtube.com/ptracking",
  "youtube.com/api/stats/ads",
  "youtube.com/pagead",
];

