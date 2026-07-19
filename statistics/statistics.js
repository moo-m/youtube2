// Pure computation of dashboard statistics from videos-with-meta + progress.

import { formatHours } from "../utils/helpers.js";

export function computeStatistics(videosWithMeta) {
  const visible = videosWithMeta; // stats include hidden too, per spec ("Hidden" count)
  const total = visible.length;
  const completed = visible.filter((v) => v.state === "completed").length;
  const watching = visible.filter((v) => v.state === "watching").length;
  const unwatched = visible.filter((v) => v.state === "unwatched").length;
  const hidden = visible.filter((v) => v.isHidden).length;
  const favorites = visible.filter((v) => v.isFavorite).length;
  const watchLater = visible.filter((v) => v.isWatchLater).length;

  const totalWatchedSeconds = visible.reduce((sum, v) => sum + (v.progress.position || 0), 0);
  const avgCompletion = total ? visible.reduce((sum, v) => sum + (v.progress.pct || 0), 0) / total : 0;
  const watchedVideos = visible.filter((v) => (v.progress.playCount || 0) > 0);
  const avgWatchTime = watchedVideos.length
    ? watchedVideos.reduce((sum, v) => sum + (v.progress.position || 0), 0) / watchedVideos.length
    : 0;

  const mostWatched = [...visible].sort((a, b) => (b.progress.playCount || 0) - (a.progress.playCount || 0))[0];
  const longest = [...visible].sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0))[0];
  const newest = [...visible].sort((a, b) => new Date(b.importedAt) - new Date(a.importedAt))[0];
  const oldest = [...visible].sort((a, b) => new Date(a.importedAt) - new Date(b.importedAt))[0];

  const byChannel = groupSumPlayCount(visible, (v) => v.channelTitle);
  const byPlaylist = groupSumPlayCount(visible.filter((v) => v.playlistId), (v) => v.playlistId);

  return {
    total, completed, watching, unwatched, hidden, favorites, watchLater,
    totalWatchedHours: formatHours(totalWatchedSeconds),
    avgCompletionPct: Math.round(avgCompletion * 100),
    avgWatchTime: formatHours(avgWatchTime),
    mostWatchedChannel: topEntry(byChannel),
    mostWatchedPlaylist: topEntry(byPlaylist),
    mostWatchedVideo: mostWatched?.title || "—",
    longestVideo: longest?.title || "—",
    newestImported: newest?.title || "—",
    oldestImported: oldest?.title || "—",
  };
}

function groupSumPlayCount(videos, keyFn) {
  const map = new Map();
  for (const v of videos) {
    const key = keyFn(v);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + (v.progress.playCount || 0));
  }
  return map;
}

function topEntry(map) {
  let best = null, bestVal = -1;
  for (const [key, val] of map.entries()) {
    if (val > bestVal) { best = key; bestVal = val; }
  }
  return best || "—";
}
