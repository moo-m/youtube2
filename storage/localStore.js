// Thin, safe wrapper around localStorage. All persistence goes through here
// so the rest of the app never touches window.localStorage directly.

export const localStore = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error(`[localStore] failed to write "${key}"`, err);
      return false;
    }
  },

  remove(key) {
    localStorage.removeItem(key);
  },

  keys() {
    return Object.keys(localStorage);
  },
};
