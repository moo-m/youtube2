// Tracks a lightweight "session" each time a video is watched, so the
// Daily Log view can show what was watched, and for how long, on each day.

import { bigStore } from "../storage/bigStore.js";

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

export const dailyLog = {
  /** Record a viewing session. Call this when leaving a video page. */
  async recordSession({ videoId, secondsWatched, pctAtEnd }) {
    if (!secondsWatched || secondsWatched < 3) return; // ignore negligible/no-op sessions
    await bigStore.put(bigStore.STORES.DAILY_LOG, {
      videoId,
      date: todayKey(),
      openedAt: new Date().toISOString(),
      secondsWatched: Math.round(secondsWatched),
      pctAtEnd,
    });
  },

  /** All log entries, grouped by day (most recent day first, entries newest first within a day). */
  async getGroupedByDay() {
    const entries = await bigStore.getAll(bigStore.STORES.DAILY_LOG);
    const byDay = new Map();

    for (const entry of entries) {
      if (!byDay.has(entry.date)) byDay.set(entry.date, []);
      byDay.get(entry.date).push(entry);
    }

    const days = [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, dayEntries]) => ({
        date,
        totalSeconds: dayEntries.reduce((sum, e) => sum + e.secondsWatched, 0),
        entries: dayEntries.sort((a, b) => new Date(b.openedAt) - new Date(a.openedAt)),
      }));

    return days;
  },

  async clear() {
    await bigStore.clear(bigStore.STORES.DAILY_LOG);
  },
};
