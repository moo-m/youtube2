// Thin client around YouTube Data API v3. Every method returns plain
// JS objects; no DOM or storage concerns live here.

import { YT_API_BASE, STORAGE_KEYS } from "../utils/constants.js";
import { localStore } from "../storage/localStore.js";

class ApiKeyMissingError extends Error {
  constructor() {
    super("YouTube Data API key is not set.");
    this.name = "ApiKeyMissingError";
  }
}

function getApiKey() {
  return localStore.get(STORAGE_KEYS.API_KEY, "");
}

export function hasApiKey() {
  return Boolean(getApiKey());
}

export function saveApiKey(key) {
  localStore.set(STORAGE_KEYS.API_KEY, key.trim());
}

async function ytFetch(path, params) {
  const key = getApiKey();
  if (!key) throw new ApiKeyMissingError();

  const url = new URL(`${YT_API_BASE}/${path}`);
  url.searchParams.set("key", key);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body?.error?.message || `YouTube API error (${res.status})`;
    throw new Error(message);
  }
  return res.json();
}

export const youtubeApi = {
  ApiKeyMissingError,

  /** Resolve a channel by id or @handle, returns { id, title, thumbnail, uploadsPlaylistId }. */
  async resolveChannel({ id, handle }) {
    const params = id
      ? { part: "snippet,contentDetails", id }
      : { part: "snippet,contentDetails", forHandle: handle.replace(/^@/, "") };
    const data = await ytFetch("channels", params);
    const item = data.items?.[0];
    if (!item) throw new Error("Channel not found.");
    return {
      id: item.id,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
      uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
    };
  },

  /** Resolve playlist metadata. */
  async resolvePlaylist(playlistId) {
    const data = await ytFetch("playlists", { part: "snippet", id: playlistId });
    const item = data.items?.[0];
    if (!item) throw new Error("Playlist not found.");
    return {
      id: item.id,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
      channelTitle: item.snippet.channelTitle,
    };
  },

  /** Fetch all playlist item video IDs (handles pagination). */
  async fetchPlaylistVideoIds(playlistId, { maxItems = 500 } = {}) {
    let ids = [];
    let pageToken;
    do {
      const data = await ytFetch("playlistItems", {
        part: "contentDetails",
        playlistId,
        maxResults: 50,
        pageToken,
      });
      ids.push(...(data.items || []).map((it) => it.contentDetails.videoId));
      pageToken = data.nextPageToken;
    } while (pageToken && ids.length < maxItems);
    return ids.slice(0, maxItems);
  },

  /** Fetch full video details (snippet, contentDetails) for up to 50 ids per call, batched. */
  async fetchVideosByIds(videoIds) {
    const results = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50);
      const data = await ytFetch("videos", {
        part: "snippet,contentDetails,statistics",
        id: batch.join(","),
      });
      results.push(...(data.items || []));
    }
    return results;
  },

  /** Fetch a single video's details. */
  async fetchVideo(videoId) {
    const items = await this.fetchVideosByIds([videoId]);
    if (!items.length) throw new Error("Video not found.");
    return items[0];
  },
};
