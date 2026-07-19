// Searches only within already-imported videos. Never calls YouTube search.

import { getSourceLabel } from "../library/libraryQuery.js";

export function searchVideos(videos, query) {
  const q = query.trim().toLowerCase();
  if (!q) return videos;

  return videos.filter((v) => {
    const playlistLabel = v.playlistId ? getSourceLabel(v.sourceId) : "";
    const haystack = [v.title, v.channelTitle, v.description, playlistLabel]
      .join(" \n ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

/** Lightweight suggestion list (titles + channels) for the search dropdown. */
export function suggest(videos, query, limit = 6) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const matches = videos.filter((v) => v.title.toLowerCase().includes(q));
  return matches.slice(0, limit);
}
