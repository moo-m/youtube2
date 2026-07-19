# Video Library — PWA Edition

A personal, offline-capable streaming library for YouTube videos you explicitly import.
Built with pure Vanilla JS (ES modules), HTML5, and CSS3. No frameworks, no build step, no backend.

---

## Quick start

Any static-file server works — ES modules require HTTP, not `file://`:

```bash
cd video-library
python3 -m http.server 8080
# open http://localhost:8080
```

Install as a PWA from the browser's "Add to Home Screen" or "Install app" prompt to get
offline access, a standalone window, and the full-screen player experience.

---

## Features

### ① Source containers
On the home screen, every imported channel/playlist/video is shown as a stacked card.
Clicking a card drills into that source's videos. Every other filter (Favorites, Watching, etc.)
jumps directly to the flat grid.

### ② PWA + Service Worker
- Full app-shell precaching: every JS/CSS file and icon is cached on first load — opens
  instantly offline for everything already in your library.
- Runtime thumbnail caching (stale-while-revalidate, capped at 300 entries).
- Ad/tracker domains (`doubleclick.net`, `googlesyndication.com`, etc.) are blocked at the
  service-worker level for this app's own requests.
- **Note on YouTube ad blocking inside the player:** The YouTube `<iframe>` is a separate
  origin. Browsers enforce strict cross-origin isolation — a parent page's service worker
  cannot intercept requests made inside a cross-origin iframe. This is a security boundary of
  the web platform, not something configurable by an embedding site.

### ③ Transcript panel
- Attempts automatic retrieval from YouTube's undocumented `timedtext` endpoint (works for
  many public videos; may be blocked by CORS on some).
- Always falls back gracefully to a "Paste transcript" button — copy from YouTube's own
  "Show transcript" panel (⋯ → Show transcript) and paste it in. Timestamps are auto-parsed.
- Clicking any word in a timed transcript seeks the player to that cue's position.
- The live-playing cue is highlighted and scrolled into view automatically.
- Transcripts are stored in IndexedDB and survive page refresh.

### ④ AI Assistant
Open with the **✦** floating button or the **Ask AI** button on any video page.

**Per-video Insights** (generated on demand, cached permanently in IndexedDB):
- **Summary** — a short paragraph about the video
- **Key Ideas** — bulleted takeaways
- **Enrichment Examples** — follow-up concepts and questions for deeper learning

**Chat** — free-form Q&A, scoped to the current video (with title/description/transcript as
context) or globally. All conversation history is persisted.

**To configure:**
1. Go to Settings → AI Assistant
2. Enter any OpenAI-compatible chat completions URL, your API key, and optionally a model name
3. Save — the assistant is immediately available

### ⑤ Daily Watch Log
Settings → Daily Log shows every video you've watched, grouped by calendar day, with per-session
watch time. Sessions are recorded automatically when you leave a video page.

### ⑥ Custom glass player controls
The YouTube native chrome is hidden; a custom, iOS-inspired floating glass control bar is layered
over the embed: scrubber, play/pause, ±10 s skip, volume, playback speed (0.5×–2×), fullscreen.
Controls auto-hide while playing and reveal on hover/tap.

---

## YouTube Data API key

Importing channels and playlists needs a
[YouTube Data API v3 key](https://console.cloud.google.com/apis/library/youtube.googleapis.com)
(free tier; generous quota for personal use). The app prompts for one the first time you add a
source. Stored only in `localStorage` — never leaves your browser except in calls to Google's API.

---

## Data persistence

| Data | Storage |
|------|---------|
| Sources, videos, flags, settings | `localStorage` |
| Transcripts, AI conversations, AI insights, daily log | `IndexedDB` |

Everything is exportable as a single JSON file (Settings → Export library) and re-importable to
restore the full library on another device or after clearing browser data.

---

## Project structure

```
ai/                  OpenAI-compatible AI client
api/                 YouTube Data API v3 thin wrapper
captions/            Transcript fetch + parse (auto + manual paste)
components/          Reusable render fragments (card, toast, transcript panel, AI panel)
filters/             Filter predicates and sort comparators
library/             Import pipeline (Shorts filter), library queries, daily log
player/              IFrame Player API wrapper + custom glass control bar
search/              In-library text search
settings/            Theme/density/grid application to DOM
statistics/          Dashboard stat computations
storage/             localStorage wrapper, repository (single source of truth), IndexedDB wrapper
styles/              Design tokens (Liquid Glass) + all component stylesheets
ui/                  View controllers (home, video, sources, daily log, stats, settings)
utils/               Constants, helpers, YouTube URL parser
service-worker.js    PWA caching + origin-scoped ad/tracker blocking
manifest.webmanifest PWA installation manifest
```
# youtube2
