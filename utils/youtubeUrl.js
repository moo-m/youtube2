// Parses a pasted YouTube URL into a typed reference the importer can use.
// Never fetches anything here — pure string parsing.

import { SOURCE_TYPES } from "./constants.js";

/**
 * @param {string} rawUrl
 * @returns {{ type: string, id: string, handle?: string } | null}
 */
export function parseYouTubeUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "");
  if (!/youtube\.com$|youtu\.be$/.test(host)) return null;

  const params = url.searchParams;

  // youtu.be/VIDEO_ID
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    if (id) return { type: SOURCE_TYPES.VIDEO, id };
  }

  // /watch?v=VIDEO_ID (ignore #shorts style query, still a video)
  if (params.has("v")) {
    return { type: SOURCE_TYPES.VIDEO, id: params.get("v") };
  }

  // /shorts/VIDEO_ID -- we still resolve the id, importer will exclude by duration/flag
  const shortsMatch = url.pathname.match(/^\/shorts\/([\w-]+)/);
  if (shortsMatch) {
    return { type: SOURCE_TYPES.VIDEO, id: shortsMatch[1], isShort: true };
  }

  // /playlist?list=PLAYLIST_ID
  if (params.has("list")) {
    return { type: SOURCE_TYPES.PLAYLIST, id: params.get("list") };
  }

  // /channel/UC...
  const channelMatch = url.pathname.match(/^\/channel\/([\w-]+)/);
  if (channelMatch) {
    return { type: SOURCE_TYPES.CHANNEL, id: channelMatch[1] };
  }

  // /@handle
  const handleMatch = url.pathname.match(/^\/@([\w.-]+)/);
  if (handleMatch) {
    return { type: SOURCE_TYPES.CHANNEL, handle: `@${handleMatch[1]}` };
  }

  // /c/CustomName or /user/Username (legacy) — treat as handle-like lookup
  const legacyMatch = url.pathname.match(/^\/(?:c|user)\/([\w.-]+)/);
  if (legacyMatch) {
    return { type: SOURCE_TYPES.CHANNEL, handle: legacyMatch[1] };
  }

  return null;
}
