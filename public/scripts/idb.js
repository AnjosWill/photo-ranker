// Pequeno helper para IndexedDB (promisificado)
const DB_NAME = 'photoranker';
const DB_VERSION = 3; // Incrementado para adicionar store 'folders' e campos folderId/order nos projetos

export function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const transaction = e.target.transaction;
      
      // Object store 'photos' (já existe)
      if (!db.objectStoreNames.contains('photos')) {
        const photosStore = db.createObjectStore('photos', { keyPath: 'id' });
        photosStore.createIndex('rating', 'rating', { unique: false });
        photosStore.createIndex('parentId', 'parentId', { unique: false });
      }
      
      // Adicionar índice 'by-project' em 'photos' (se não existir)
      if (db.objectStoreNames.contains('photos')) {
        const photosStore = transaction.objectStore('photos');
        if (!photosStore.indexNames.contains('by-project')) {
          photosStore.createIndex('by-project', 'projectId', { unique: false });
        }
      }
      
      // ⬅️ NOVO: Object store 'contests'
      if (!db.objectStoreNames.contains('contests')) {
        const contestsStore = db.createObjectStore('contests', { keyPath: 'id' });
        contestsStore.createIndex('by-date', 'createdAt', { unique: false });
        contestsStore.createIndex('by-phase', 'contestState.phase', { unique: false });
      }
      
      // Adicionar índice 'by-folder' em 'contests' (se não existir)
      if (db.objectStoreNames.contains('contests')) {
        const contestsStore = transaction.objectStore('contests');
        if (!contestsStore.indexNames.contains('by-folder')) {
          contestsStore.createIndex('by-folder', 'folderId', { unique: false });
        }
      }
      
      // ⬅️ NOVO: Object store 'folders'
      if (!db.objectStoreNames.contains('folders')) {
        const foldersStore = db.createObjectStore('folders', { keyPath: 'id' });
        foldersStore.createIndex('by-order', 'order', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Função tx atualizada para aceitar nome do store
export async function tx(storeName, storeMode, fn) {
  // Compatibilidade: se chamado com apenas 2 argumentos, assume 'photos'
  if (typeof storeMode === 'function') {
    fn = storeMode;
    storeMode = storeName;
    storeName = 'photos';
  }
  
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, storeMode);
    const s = t.objectStore(storeName);
    const res = fn(s);
    t.oncomplete = () => resolve(res);
    t.onerror = () => reject(t.error);
  });
}
