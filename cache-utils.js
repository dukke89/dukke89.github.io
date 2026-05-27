/**
 * cache-utils.js — Shared IndexedDB caching utility.
 * 
 * Stores fetched text responses in IndexedDB so that navigating
 * between tabs (separate HTML pages) does not re-download the same
 * CSV/JSON data files.
 * 
 * The cache key is the full URL (including the CACHE_BUSTER query param
 * generated per session in last-update.js).  A new browser session
 * produces a new CACHE_BUSTER → old entries are ignored automatically.
 *
 * Usage:
 *   fetchWithCache(url)          → Promise<string>  (response text)
 *   clearDataCache()             → Promise<void>    (wipe all entries)
 */

(function () {
  const DB_NAME = "appDataCache";
  const DB_VERSION = 1;
  const STORE_NAME = "responses";

  /** Open (or create) the database once and reuse the handle. */
  let _dbPromise = null;
  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "url" });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => {
        console.warn("[cache-utils] IndexedDB open failed, caching disabled.", e.target.error);
        _dbPromise = null;
        reject(e.target.error);
      };
    });
    return _dbPromise;
  }

  /**
   * Fetch a URL with IndexedDB caching.
   * Returns a Promise that resolves to the response **text**.
   * On cache hit the network is skipped entirely.
   */
  window.fetchWithCache = async function fetchWithCache(url) {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);

      const cached = await new Promise((resolve) => {
        const getReq = store.get(url);
        getReq.onsuccess = (e) => resolve(e.target.result);
        getReq.onerror = () => resolve(null);
      });

      if (cached && cached.data) {
        return cached.data;
      }
    } catch (_) {
      // IndexedDB unavailable — fall through to network
    }

    // Network fetch
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`No pude abrir ${url} (HTTP ${resp.status})`);
    const data = await resp.text();

    // Store in cache (fire-and-forget)
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put({ url, data });
    } catch (_) {
      // silently ignore cache-write errors
    }

    return data;
  };

  /**
   * Wipe all cached entries.  Called by forceRefreshData() in last-update.js.
   */
  window.clearDataCache = async function clearDataCache() {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
    } catch (_) {
      // ignore
    }
  };
})();
