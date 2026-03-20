/* ============================================================
   db.js — IndexedDB wrapper
   Stores: photos, diaries
   ============================================================ */

const DB = (() => {
  const DB_NAME    = 'photodiary_v1';
  const DB_VERSION = 1;
  let _db = null;

  /* ── Open / Init ── */
  function init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('photos')) {
          db.createObjectStore('photos', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('diaries')) {
          db.createObjectStore('diaries', { keyPath: 'id' });
        }
      };

      req.onsuccess = (e) => {
        _db = e.target.result;
        resolve(_db);
      };

      req.onerror = () => reject(req.error);
    });
  }

  /* ── Helpers ── */
  function store(name, mode = 'readonly') {
    return _db.transaction(name, mode).objectStore(name);
  }

  function getAll(storeName) {
    return new Promise((resolve, reject) => {
      const req = store(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror  = () => reject(req.error);
    });
  }

  function get(storeName, id) {
    return new Promise((resolve, reject) => {
      const req = store(storeName).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror  = () => reject(req.error);
    });
  }

  function put(storeName, data) {
    return new Promise((resolve, reject) => {
      const req = store(storeName, 'readwrite').put(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror  = () => reject(req.error);
    });
  }

  function remove(storeName, id) {
    return new Promise((resolve, reject) => {
      const req = store(storeName, 'readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror  = () => reject(req.error);
    });
  }

  /* ── Public API ── */
  return {
    init,
    /* photos */
    getPhotos:   ()       => getAll('photos'),
    getPhoto:    (id)     => get('photos', id),
    savePhoto:   (photo)  => put('photos', photo),
    deletePhoto: (id)     => remove('photos', id),
    /* diaries */
    getDiaries:   ()       => getAll('diaries'),
    getDiary:     (id)     => get('diaries', id),
    saveDiary:    (diary)  => put('diaries', diary),
    deleteDiary:  (id)     => remove('diaries', id),
  };
})();
