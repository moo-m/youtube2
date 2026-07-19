// Sort comparators over videos-with-meta.

const comparators = {
  newest: (a, b) => new Date(b.publishedAt) - new Date(a.publishedAt),
  oldest: (a, b) => new Date(a.publishedAt) - new Date(b.publishedAt),
  "most-watched": (a, b) => (b.progress.playCount || 0) - (a.progress.playCount || 0),
  "least-watched": (a, b) => (a.progress.playCount || 0) - (b.progress.playCount || 0),
  alphabetical: (a, b) => a.title.localeCompare(b.title),
  "recently-watched": (a, b) => new Date(b.progress.lastWatched || 0) - new Date(a.progress.lastWatched || 0),
  progress: (a, b) => (b.progress.pct || 0) - (a.progress.pct || 0),
  duration: (a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0),
  "recently-added": (a, b) => new Date(b.importedAt) - new Date(a.importedAt),
};

export function applySort(videos, sortKey) {
  const comparator = comparators[sortKey] || comparators.newest;
  return [...videos].sort(comparator);
}
