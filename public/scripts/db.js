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

// ============================================
// Contests CRUD (Sprint 5 - F5.1)
// ============================================

/**
 * Busca todos os contests
 * @returns {Promise<Array>} Array de contests
 */
export async function getAllContests() {
  return tx('contests', 'readonly', (s) => {
    return new Promise((resolve, reject) => {
      const req = s.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Busca um contest por ID
 * @param {string} id - ID do contest
 * @returns {Promise<Object|undefined>} Contest ou undefined se não encontrado
 */
export async function getContest(id) {
  return tx('contests', 'readonly', (s) => {
    return new Promise((resolve, reject) => {
      const req = s.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Salva ou atualiza um contest
 * @param {Object} contest - Objeto contest completo
 * @returns {Promise<void>}
 */
export async function saveContest(contest) {
  return tx('contests', 'readwrite', (s) => {
    return new Promise((resolve, reject) => {
      const req = s.put(contest);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Remove um contest
 * @param {string} contestId - ID do contest a remover
 * @returns {Promise<void>}
 */
export async function deleteContest(contestId) {
  return tx('contests', 'readwrite', (s) => {
    return new Promise((resolve, reject) => {
      const req = s.delete(contestId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Busca fotos por projectId usando índice otimizado
 * @param {string} projectId - ID do projeto
 * @returns {Promise<Array>} Array de fotos do projeto
 */
export async function getPhotosByProject(projectId) {
  return tx('photos', 'readonly', (s) => {
    return new Promise((resolve, reject) => {
      const index = s.index('by-project');
      const req = index.getAll(projectId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

// ============================================
// Folders CRUD (Sistema de Pastas)
// ============================================

/**
 * Busca todas as pastas
 * @returns {Promise<Array>} Array de pastas
 */
export async function getAllFolders() {
  return tx('folders', 'readonly', (s) => {
    return new Promise((resolve, reject) => {
      const req = s.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Busca uma pasta por ID
 * @param {string} id - ID da pasta
 * @returns {Promise<Object|undefined>} Pasta ou undefined se não encontrada
 */
export async function getFolder(id) {
  return tx('folders', 'readonly', (s) => {
    return new Promise((resolve, reject) => {
      const req = s.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Salva ou atualiza uma pasta
 * @param {Object} folder - Objeto pasta completo
 * @returns {Promise<void>}
 */
export async function saveFolder(folder) {
  return tx('folders', 'readwrite', (s) => {
    return new Promise((resolve, reject) => {
      const req = s.put(folder);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Remove uma pasta
 * @param {string} folderId - ID da pasta a remover
 * @returns {Promise<void>}
 */
export async function deleteFolder(folderId) {
  return tx('folders', 'readwrite', (s) => {
    return new Promise((resolve, reject) => {
      const req = s.delete(folderId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Busca projetos por folderId usando índice otimizado
 * @param {string|null} folderId - ID da pasta (null para projetos sem pasta)
 * @returns {Promise<Array>} Array de projetos da pasta
 */
export async function getProjectsByFolder(folderId) {
  return tx('contests', 'readonly', (s) => {
    return new Promise((resolve, reject) => {
      const index = s.index('by-folder');
      const req = index.getAll(folderId);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}
