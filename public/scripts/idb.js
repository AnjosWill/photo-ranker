// Pequeno helper para IndexedDB (promisificado)
const DB_NAME = 'photoranker';
const DB_VERSION = 1;
const STORE = 'photos';

export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('rating', 'rating', { unique: false });
        os.createIndex('parentId', 'parentId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function tx(storeMode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, storeMode);
    const s = t.objectStore(STORE);
    const res = fn(s);
    t.oncomplete = () => resolve(res);
    t.onerror = () => reject(t.error);
  });
}
