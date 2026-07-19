// Transcript retrieval.
//
// YouTube does not offer transcript download through the public, key-based
// Data API v3 for arbitrary videos — the official `captions.download`
// endpoint requires OAuth authorization from the video's own channel owner.
// What we do here is a best-effort attempt against YouTube's own (public,
// but undocumented) timedtext endpoint, which is what YouTube's website
// itself calls to render the "Show transcript" panel. It works for a lot
// of videos, but isn't guaranteed: some browsers/videos block it via CORS,
// since the endpoint doesn't consistently send permissive CORS headers.
//
// So this module always degrades gracefully, and also accepts a manually
// pasted transcript (e.g. copied from YouTube's own transcript panel) as a
// reliable fallback that always works regardless of CORS.

import { bigStore } from "../storage/bigStore.js";

const TIMEDTEXT_BASE = "https://www.youtube.com/api/timedtext";

/** Decode a handful of HTML entities that show up in timedtext XML. */
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n/g, " ");
}

function parseTimedTextXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  if (doc.querySelector("parsererror")) return [];
  const nodes = [...doc.querySelectorAll("text")];
  return nodes.map((node) => ({
    start: parseFloat(node.getAttribute("start") || "0"),
    duration: parseFloat(node.getAttribute("dur") || "2"),
    text: decodeEntities(node.textContent || "").trim(),
  })).filter((cue) => cue.text.length > 0);
}

/** Try to auto-fetch a transcript straight from YouTube. May legitimately fail (see header note). */
async function tryAutoFetch(videoId) {
  try {
    const listUrl = `${TIMEDTEXT_BASE}?type=list&v=${encodeURIComponent(videoId)}`;
    const listRes = await fetch(listUrl);
    if (!listRes.ok) return null;
    const listXml = await listRes.text();
    const listDoc = new DOMParser().parseFromString(listXml, "text/xml");
    const tracks = [...listDoc.querySelectorAll("track")];
    if (!tracks.length) return null;

    const preferredLang = (navigator.language || "en").slice(0, 2);
    const track =
      tracks.find((t) => t.getAttribute("lang_code") === preferredLang) ||
      tracks.find((t) => t.getAttribute("lang_code") === "en") ||
      tracks[0];

    const lang = track.getAttribute("lang_code");
    const name = track.getAttribute("name") || "";
    const trackUrl = `${TIMEDTEXT_BASE}?lang=${encodeURIComponent(lang)}&v=${encodeURIComponent(videoId)}${name ? `&name=${encodeURIComponent(name)}` : ""}`;
    const textRes = await fetch(trackUrl);
    if (!textRes.ok) return null;
    const textXml = await textRes.text();
    const cues = parseTimedTextXml(textXml);
    return cues.length ? { cues, lang, source: "auto" } : null;
  } catch {
    // Network error, CORS rejection, or malformed response — treated as
    // "unavailable", not a crash.
    return null;
  }
}

/**
 * Parse a manually pasted transcript. Supports YouTube's own copy format
 * (lines like "0:15" followed by a text line, or "0:15 some text" inline).
 * Falls back to plain paragraphs (no seek capability) if no timestamps
 * are found at all.
 */
function parsePastedTranscript(raw) {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const timeLineRe = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;
  const inlineTimeRe = /^((?:\d{1,2}:)?\d{1,2}:\d{2})\s+(.*)$/;

  const toSeconds = (t) => {
    const parts = t.split(":").map(Number);
    return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  };

  const cues = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (timeLineRe.test(line) && lines[i + 1]) {
      cues.push({ start: toSeconds(line), duration: 4, text: lines[i + 1] });
      i++;
      continue;
    }
    const inline = line.match(inlineTimeRe);
    if (inline) {
      cues.push({ start: toSeconds(inline[1]), duration: 4, text: inline[2] });
      continue;
    }
  }

  if (cues.length) return { cues, lang: "pasted", source: "manual" };

  // No timestamps found at all: still show it, just without seek support.
  const paragraphs = raw.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return {
    cues: paragraphs.map((text) => ({ start: null, duration: null, text })),
    lang: "pasted",
    source: "manual-untimed",
  };
}

export const transcriptService = {
  /** Returns a cached transcript if we have one, else null. */
  async getCached(videoId) {
    return (await bigStore.get(bigStore.STORES.TRANSCRIPTS, videoId)) || null;
  },

  /** Attempt automatic retrieval; caches on success. Returns null if unavailable. */
  async fetchAuto(videoId) {
    const cached = await this.getCached(videoId);
    if (cached) return cached;

    const result = await tryAutoFetch(videoId);
    if (!result) return null;

    const record = { videoId, cues: result.cues, lang: result.lang, source: result.source, fetchedAt: new Date().toISOString() };
    await bigStore.put(bigStore.STORES.TRANSCRIPTS, record);
    return record;
  },

  /** Save a manually pasted transcript for a video. */
  async saveManual(videoId, rawText) {
    const { cues, lang, source } = parsePastedTranscript(rawText);
    const record = { videoId, cues, lang, source, fetchedAt: new Date().toISOString() };
    await bigStore.put(bigStore.STORES.TRANSCRIPTS, record);
    return record;
  },

  async remove(videoId) {
    await bigStore.delete(bigStore.STORES.TRANSCRIPTS, videoId);
  },

  /** Flatten cues into plain text, useful as AI context. */
  toPlainText(record, maxChars = 6000) {
    if (!record?.cues?.length) return "";
    const text = record.cues.map((c) => c.text).join(" ");
    return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
  },
};
