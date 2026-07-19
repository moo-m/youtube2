// IndexedDB-backed store for data that's larger or more structured than a
// simple key/value pair — transcripts, AI conversation history, and the
// daily watch log. Running as an installed PWA gives us generous storage
// quota, so we use IndexedDB here instead of cramming everything into
// localStorage (which the repository module still uses for small,
// frequently-read flags/settings).

const DB_NAME = "video-library-db";
const DB_VERSION = 1;

const STORES = {
  TRANSCRIPTS: "transcripts",       // key: videoId -> { videoId, cues, lang, fetchedAt }
  AI_CONVERSATIONS: "aiConversations", // key: scopeId ("global" or videoId) -> { scopeId, messages }
  AI_INSIGHTS: "aiInsights",        // key: videoId -> { videoId, summary, keyIdeas, examples, generatedAt }
  DAILY_LOG: "dailyLog",           // autoIncrement -> { id, videoId, date, openedAt, secondsWatched, pctAtEnd }
};

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.TRANSCRIPTS)) {
        db.createObjectStore(STORES.TRANSCRIPTS, { keyPath: "videoId" });
      }
      if (!db.objectStoreNames.contains(STORES.AI_CONVERSATIONS)) {
        db.createObjectStore(STORES.AI_CONVERSATIONS, { keyPath: "scopeId" });
      }
      if (!db.objectStoreNames.contains(STORES.AI_INSIGHTS)) {
        db.createObjectStore(STORES.AI_INSIGHTS, { keyPath: "videoId" });
      }
      if (!db.objectStoreNames.contains(STORES.DAILY_LOG)) {
        const store = db.createObjectStore(STORES.DAILY_LOG, { keyPath: "id", autoIncrement: true });
        store.createIndex("date", "date", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function tx(storeName, mode) {
  return openDb().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const bigStore = {
  STORES,

  async get(storeName, key) {
    try {
      const store = await tx(storeName, "readonly");
      return await promisifyRequest(store.get(key));
    } catch (err) {
      console.error(`[bigStore] get(${storeName}, ${key}) failed`, err);
      return undefined;
    }
  },

  async put(storeName, value) {
    try {
      const store = await tx(storeName, "readwrite");
      return await promisifyRequest(store.put(value));
    } catch (err) {
      console.error(`[bigStore] put(${storeName}) failed`, err);
      return undefined;
    }
  },

  async delete(storeName, key) {
    try {
      const store = await tx(storeName, "readwrite");
      return await promisifyRequest(store.delete(key));
    } catch (err) {
      console.error(`[bigStore] delete(${storeName}, ${key}) failed`, err);
    }
  },

  async getAll(storeName) {
    try {
      const store = await tx(storeName, "readonly");
      return await promisifyRequest(store.getAll());
    } catch (err) {
      console.error(`[bigStore] getAll(${storeName}) failed`, err);
      return [];
    }
  },

  async clear(storeName) {
    try {
      const store = await tx(storeName, "readwrite");
      return await promisifyRequest(store.clear());
    } catch (err) {
      console.error(`[bigStore] clear(${storeName}) failed`, err);
    }
  },

  async clearAll() {
    for (const storeName of Object.values(STORES)) await this.clear(storeName);
  },

  async exportAll() {
    const out = {};
    for (const storeName of Object.values(STORES)) out[storeName] = await this.getAll(storeName);
    return out;
  },

  async importAll(data) {
    if (!data) return;
    for (const storeName of Object.values(STORES)) {
      if (!Array.isArray(data[storeName])) continue;
      await this.clear(storeName);
      const store = await tx(storeName, "readwrite");
      for (const record of data[storeName]) store.put(record);
    }
  },
};
