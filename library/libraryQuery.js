// Derives view-ready video records by combining raw video data with the
// user's flags (favorite/watchLater/hidden/completed) and progress.

import { repo } from "../storage/repository.js";

/** Watch state bucket for a video, used by filters + card badges. */
export function watchState(videoId) {
  const progress = repo.getProgress(videoId);
  if (repo.isFlagged("completed", videoId)) return "completed";
  if (progress.pct > 0) return "watching";
  return "unwatched";
}

/** Combine a raw stored video with derived flags/progress for rendering. */
export function withMeta(video) {
  const progress = repo.getProgress(video.id);
  return {
    ...video,
    isFavorite: repo.isFlagged("favorites", video.id),
    isWatchLater: repo.isFlagged("watchLater", video.id),
    isHidden: repo.isFlagged("hidden", video.id),
    isCompleted: repo.isFlagged("completed", video.id),
    progress,
    state: watchState(video.id),
  };
}

export function allVideosWithMeta() {
  return repo.allVideos().map(withMeta);
}

export function getSourceLabel(sourceId) {
  const source = repo.getSource(sourceId);
  return source ? source.title : "Unknown source";
}

/** Videos belonging to the same playlist as the given video. */
export function relatedByPlaylist(video) {
  if (!video.playlistId) return [];
  return repo.allVideos().filter((v) => v.playlistId === video.playlistId && v.id !== video.id).map(withMeta);
}

/** Videos from the same channel as the given video. */
export function relatedByChannel(video) {
  return repo.allVideos().filter((v) => v.channelId === video.channelId && v.id !== video.id).map(withMeta);
}

/** The user's whole library, excluding the current video. */
export function relatedByLibrary(video) {
  return repo.allVideos().filter((v) => v.id !== video.id).map(withMeta);
}
