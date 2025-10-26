// Persistência via IndexedDB (mantendo a mesma API pública)
import { tx } from './idb.js';

// ⚠️ API preservada:
// getAllPhotos(): Promise<Photo[]>
// savePhotos(items: Array<{...photo, _delete?: boolean}>): Promise<void>
// clearAll(): Promise<void>

export async function getAllPhotos() {
  return tx('readonly', (s) => {
    return new Promise((resolve, reject) => {
      const req = s.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

export async function savePhotos(items) {
  return tx('readwrite', (s) => {
    for (const it of items) {
      if (it._delete) {
        s.delete(it.id);
      } else {
        s.put(it);
      }
    }
  });
}

export async function clearAll() {
  return tx('readwrite', (s) => s.clear());
}
