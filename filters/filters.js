// Pure filter predicates over videos-with-meta (see library/libraryQuery.js).
// Each filter is a function (video) => boolean, composed by ui/homeView.js.

export const FILTERS = {
  all: (v) => !v.isHidden,
  unwatched: (v) => !v.isHidden && v.state === "unwatched",
  watching: (v) => !v.isHidden && v.state === "watching",
  completed: (v) => !v.isHidden && v.state === "completed",
  favorites: (v) => !v.isHidden && v.isFavorite,
  watchlater: (v) => !v.isHidden && v.isWatchLater,
  hidden: (v) => v.isHidden,
  "recently-watched": (v) => !v.isHidden && Boolean(v.progress.lastWatched),
  "recently-added": () => true, // ordering handled by sort, no extra predicate
};

export function applyFilter(videos, filterKey) {
  const predicate = FILTERS[filterKey] || FILTERS.all;
  return videos.filter(predicate);
}

export function filterByChannel(videos, channelId) {
  if (!channelId) return videos;
  return videos.filter((v) => v.channelId === channelId);
}

export function filterByPlaylist(videos, playlistId) {
  if (!playlistId) return videos;
  return videos.filter((v) => v.playlistId === playlistId);
}
