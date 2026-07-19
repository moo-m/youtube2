// Handles turning a pasted YouTube URL into a stored Source + set of
// imported Videos. This is the only place new videos enter the library —
// the app never browses YouTube outside of what's explicitly added here.

import { parseYouTubeUrl } from "../utils/youtubeUrl.js";
import { youtubeApi } from "../api/youtubeApi.js";
import { repo } from "../storage/repository.js";
import { parseISODuration } from "../utils/helpers.js";
import { SOURCE_TYPES, SHORTS_MAX_SECONDS } from "../utils/constants.js";
import { uid } from "../utils/helpers.js";

/**
 * Decide whether a raw YouTube API video item is a Short and should be
 * excluded. Shorts are near-universally: vertical/square aspect ratio AND
 * short duration (typically <= 60s, we allow up to 3 min for safety), and
 * are frequently tagged #shorts in the title/description.
 */
function isShort(item, { forcedShort = false } = {}) {
  if (forcedShort) return true;

  const seconds = parseISODuration(item.contentDetails?.duration);
  const title = (item.snippet?.title || "").toLowerCase();
  const description = (item.snippet?.description || "").toLowerCase();
  const taggedShort = /#shorts?\b/.test(title) || /#shorts?\b/.test(description);

  // Vertical/square thumbnails: width <= height is a strong Shorts signal.
  const thumb = item.snippet?.thumbnails?.high || item.snippet?.thumbnails?.medium || item.snippet?.thumbnails?.default;
  const isVerticalThumb = thumb ? thumb.width <= thumb.height : false;

  if (taggedShort) return true;
  if (isVerticalThumb) return true;
  if (seconds > 0 && seconds <= SHORTS_MAX_SECONDS && (taggedShort || isVerticalThumb)) return true;

  // Conservative fallback: very short + no other signal is still likely a Short
  // only when duration is extremely small (<= 60s), to avoid excluding
  // legitimate short-form long-form content.
  if (seconds > 0 && seconds <= 60) return true;

  return false;
}

function mapVideoItem(item, { sourceId, playlistId } = {}) {
  return {
    id: item.id,
    title: item.snippet.title,
    description: item.snippet.description || "",
    channelId: item.snippet.channelId,
    channelTitle: item.snippet.channelTitle,
    thumbnail:
      item.snippet.thumbnails?.high?.url ||
      item.snippet.thumbnails?.medium?.url ||
      item.snippet.thumbnails?.default?.url,
    publishedAt: item.snippet.publishedAt,
    durationSeconds: parseISODuration(item.contentDetails?.duration),
    sourceId,
    playlistId: playlistId || null,
    importedAt: new Date().toISOString(),
  };
}

export const importer = {
  /**
   * Add a source from a raw pasted URL. Returns { source, addedCount, skippedShorts }.
   */
  async addFromUrl(rawUrl) {
    const parsed = parseYouTubeUrl(rawUrl);
    if (!parsed) throw new Error("That doesn't look like a valid YouTube URL.");

    if (parsed.type === SOURCE_TYPES.VIDEO) return this.importSingleVideo(parsed);
    if (parsed.type === SOURCE_TYPES.PLAYLIST) return this.importPlaylist(parsed.id);
    if (parsed.type === SOURCE_TYPES.CHANNEL) return this.importChannel(parsed);

    throw new Error("Unsupported URL type.");
  },

  async importSingleVideo({ id, isShort: forcedShort }) {
    const item = await youtubeApi.fetchVideo(id);
    if (isShort(item, { forcedShort })) {
      throw new Error("This video is a YouTube Short and can't be added.");
    }

    const sourceId = uid("src");
    const source = {
      id: sourceId,
      type: SOURCE_TYPES.VIDEO,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails?.medium?.url,
      refId: id,
      addedAt: new Date().toISOString(),
      hidden: false,
    };
    repo.addSource(source);
    repo.upsertVideos([mapVideoItem(item, { sourceId })]);
    return { source, addedCount: 1, skippedShorts: 0 };
  },

  async importPlaylist(playlistId) {
    const meta = await youtubeApi.resolvePlaylist(playlistId);
    const videoIds = await youtubeApi.fetchPlaylistVideoIds(playlistId);
    const items = await youtubeApi.fetchVideosByIds(videoIds);

    const sourceId = uid("src");
    const source = {
      id: sourceId,
      type: SOURCE_TYPES.PLAYLIST,
      title: meta.title,
      thumbnail: meta.thumbnail,
      refId: playlistId,
      channelTitle: meta.channelTitle,
      addedAt: new Date().toISOString(),
      hidden: false,
    };

    const kept = [];
    let skipped = 0;
    for (const item of items) {
      if (isShort(item)) { skipped++; continue; }
      kept.push(mapVideoItem(item, { sourceId, playlistId }));
    }

    repo.addSource(source);
    repo.upsertVideos(kept);
    return { source, addedCount: kept.length, skippedShorts: skipped };
  },

  async importChannel({ id, handle }) {
    const meta = await youtubeApi.resolveChannel({ id, handle });
    const videoIds = await youtubeApi.fetchPlaylistVideoIds(meta.uploadsPlaylistId);
    const items = await youtubeApi.fetchVideosByIds(videoIds);

    const sourceId = uid("src");
    const source = {
      id: sourceId,
      type: SOURCE_TYPES.CHANNEL,
      title: meta.title,
      thumbnail: meta.thumbnail,
      refId: meta.id,
      uploadsPlaylistId: meta.uploadsPlaylistId,
      addedAt: new Date().toISOString(),
      hidden: false,
    };

    const kept = [];
    let skipped = 0;
    for (const item of items) {
      if (isShort(item)) { skipped++; continue; }
      kept.push(mapVideoItem(item, { sourceId }));
    }

    repo.addSource(source);
    repo.upsertVideos(kept);
    return { source, addedCount: kept.length, skippedShorts: skipped };
  },

  /** Re-fetch a source's videos and merge in anything new (skips Shorts as usual). */
  async refreshSource(source) {
    if (source.type === SOURCE_TYPES.VIDEO) {
      const item = await youtubeApi.fetchVideo(source.refId);
      if (isShort(item)) return { addedCount: 0, skippedShorts: 1 };
      repo.upsertVideos([mapVideoItem(item, { sourceId: source.id })]);
      return { addedCount: 1, skippedShorts: 0 };
    }

    const playlistId = source.type === SOURCE_TYPES.PLAYLIST ? source.refId : source.uploadsPlaylistId;
    const videoIds = await youtubeApi.fetchPlaylistVideoIds(playlistId);
    const items = await youtubeApi.fetchVideosByIds(videoIds);

    const kept = [];
    let skipped = 0;
    for (const item of items) {
      if (isShort(item)) { skipped++; continue; }
      kept.push(mapVideoItem(item, {
        sourceId: source.id,
        playlistId: source.type === SOURCE_TYPES.PLAYLIST ? source.refId : null,
      }));
    }
    repo.upsertVideos(kept);
    return { addedCount: kept.length, skippedShorts: skipped };
  },
};
