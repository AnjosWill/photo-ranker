/**
 * project-manager.js
 * Gerencia CRUD de projetos/contests
 * Sprint 5 - F5.2
 */

import { getAllContests, getContest, saveContest, deleteContest, getPhotosByProject, getAllPhotos, savePhotos, getAllFolders as getAllFoldersDB, getFolder, saveFolder, deleteFolder as deleteFolderDB, getProjectsByFolder } from '../../db.js';

/**
 * Obtém todos os projetos
 * @returns {Promise<Array>} Array de contests
 */
export async function getAllProjects() {
  return await getAllContests();
}

/**
 * Obtém um projeto por ID
 * @param {string} id - ID do projeto
 * @returns {Promise<Object|undefined>} Projeto ou undefined
 */
export async function getProject(id) {
  return await getContest(id);
}

/**
 * Cria um novo projeto
 * @param {string} name - Nome do projeto
 * @param {string} description - Descrição (opcional)
 * @returns {Promise<Object>} Projeto criado
 */
export async function createProject(name, description = '') {
  const project = {
    id: `project-${Date.now()}`,
    name,
    description,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    folderId: null, // Sem pasta por padrão
    order: Date.now(), // Ordem inicial baseada em timestamp
    contestState: {
      phase: 'idle',
      eloScores: {},
      battleHistory: [],
      qualifying: null,
      final: null,
      championId: null
    },
    settings: {
      minRatingForBattle: 5,
      kFactor: 32
    }
  };
  
  await saveContest(project);
  return project;
}

/**
 * Atualiza um projeto
 * @param {string} id - ID do projeto
 * @param {Object} data - Dados para atualizar
 * @returns {Promise<void>}
 */
export async function updateProject(id, data) {
  const project = await getContest(id);
  if (!project) {
    throw new Error('Projeto não encontrado');
  }
  
  const updated = {
    ...project,
    ...data,
    updatedAt: Date.now()
  };
  
  await saveContest(updated);
  return updated;
}

/**
 * Remove um projeto e todas as fotos associadas
 * @param {string} id - ID do projeto
 * @returns {Promise<void>}
 */
export async function deleteProject(id) {
  // Deletar fotos do projeto
  const photos = await getPhotosByProject(id);
  if (photos.length > 0) {
    const photosToDelete = photos.map(p => ({ ...p, _delete: true }));
    await savePhotos(photosToDelete);
  }
  
  // Deletar projeto
  await deleteContest(id);
}

/**
 * Duplica um projeto (COM fotos, mas estado resetado - depois são independentes)
 * @param {string} sourceId - ID do projeto a duplicar
 * @returns {Promise<Object>} Novo projeto
 */
export async function duplicateProject(sourceId) {
  const source = await getContest(sourceId);
  if (!source) {
    throw new Error('Projeto não encontrado');
  }
  
  // Criar novo projeto com estado resetado
  const newProject = {
    ...source,
    id: `project-${Date.now()}`,
    name: `${source.name} (Cópia)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    folderId: source.folderId || null, // Manter pasta do original
    order: Date.now(), // Nova ordem
    contestState: {
      phase: 'idle',
      eloScores: {},
      battleHistory: [],
      qualifying: null,
      final: null,
      championId: null
    }
  };
  
  await saveContest(newProject);
  
  // Duplicar fotos do projeto original (com novos IDs, mas mantendo dados)
  const sourcePhotos = await getPhotosByProject(sourceId);
  if (sourcePhotos.length > 0) {
    const baseTime = Date.now();
    const duplicatedPhotos = sourcePhotos.map((photo, index) => ({
      ...photo,
      id: `photo-${baseTime}-${index}-${Math.random().toString(36).substr(2, 9)}`,
      projectId: newProject.id,
      uploadedAt: baseTime + index // Nova data de upload (mantém ordem)
    }));
    
    await savePhotos(duplicatedPhotos);
  }
  
  return newProject;
}

/**
 * Calcula estatísticas de um projeto
 * @param {string} id - ID do projeto
 * @returns {Promise<Object>} Estatísticas
 */
export async function getProjectStats(id) {
  const photos = await getPhotosByProject(id);
  const visiblePhotos = photos.filter(p => !p._isSplit);
  const ratedPhotos = visiblePhotos.filter(p => p.rating && p.rating > 0);
  const rated5Photos = visiblePhotos.filter(p => p.rating === 5);
  
  const project = await getContest(id);
  const phase = project?.contestState?.phase || 'idle';
  
  let phaseLabel = 'Em avaliação';
  if (phase === 'qualifying' || phase === 'final') {
    phaseLabel = 'Em contest';
  } else if (phase === 'finished') {
    phaseLabel = 'Finalizado';
  }
  
  return {
    totalPhotos: visiblePhotos.length,
    ratedPhotos: ratedPhotos.length,
    rated5Photos: rated5Photos.length,
    phase: phaseLabel,
    phaseValue: phase
  };
}

// ============================================
// Folders CRUD
// ============================================

/**
 * Obtém todas as pastas
 * @returns {Promise<Array>} Array de pastas ordenadas
 */
export async function getAllFolders() {
  const folders = await getAllFoldersDB();
  // Ordenar por campo 'order' ou por nome se order não existir
  return folders.sort((a, b) => {
    if (a.order !== undefined && b.order !== undefined) {
      return a.order - b.order;
    }
    return (a.name || '').localeCompare(b.name || '');
  });
}

/**
 * Cria uma nova pasta
 * @param {string} name - Nome da pasta
 * @returns {Promise<Object>} Pasta criada
 */
export async function createFolder(name) {
  const folders = await getAllFolders();
  const maxOrder = folders.length > 0 
    ? Math.max(...folders.map(f => f.order || 0)) 
    : 0;
  
  const folder = {
    id: `folder-${Date.now()}`,
    name: name.trim(),
    order: maxOrder + 1,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  await saveFolder(folder);
  return folder;
}

/**
 * Atualiza uma pasta
 * @param {string} id - ID da pasta
 * @param {Object} data - Dados para atualizar
 * @returns {Promise<Object>} Pasta atualizada
 */
export async function updateFolder(id, data) {
  const folder = await getFolder(id);
  if (!folder) {
    throw new Error('Pasta não encontrada');
  }
  
  const updated = {
    ...folder,
    ...data,
    updatedAt: Date.now()
  };
  
  await saveFolder(updated);
  return updated;
}

/**
 * Remove uma pasta e move projetos para "Sem pasta"
 * @param {string} id - ID da pasta
 * @returns {Promise<void>}
 */
export async function deleteFolder(id) {
  // Buscar todos os projetos da pasta
  const projects = await getProjectsByFolder(id);
  
  // Mover projetos para "Sem pasta" (folderId = null)
  if (projects.length > 0) {
    const updatedProjects = projects.map(project => ({
      ...project,
      folderId: null,
      updatedAt: Date.now()
    }));
    
    for (const project of updatedProjects) {
      await saveContest(project);
    }
  }
  
  // Deletar pasta
  await deleteFolderDB(id);
}

/**
 * Move um projeto para uma pasta (ou remove de pasta)
 * @param {string} projectId - ID do projeto
 * @param {string|null} folderId - ID da pasta (null para remover de pasta)
 * @returns {Promise<void>}
 */
export async function moveProjectToFolder(projectId, folderId) {
  const project = await getContest(projectId);
  if (!project) {
    throw new Error('Projeto não encontrado');
  }
  
  // Se movendo para uma pasta, definir ordem como último da pasta
  let order = Date.now();
  if (folderId !== null) {
    const projectsInFolder = await getProjectsByFolder(folderId);
    if (projectsInFolder.length > 0) {
      const maxOrder = Math.max(...projectsInFolder.map(p => p.order || 0));
      order = maxOrder + 1;
    }
  }
  
  const updated = {
    ...project,
    folderId: folderId,
    order: order,
    updatedAt: Date.now()
  };
  
  await saveContest(updated);
  return updated;
}

/**
 * Reordena projetos dentro de uma pasta
 * @param {string} folderId - ID da pasta (null para projetos sem pasta)
 * @param {Array<string>} projectIds - Array de IDs na nova ordem
 * @returns {Promise<void>}
 */
export async function reorderProjectsInFolder(folderId, projectIds) {
  const updates = projectIds.map((projectId, index) => ({
    projectId,
    order: index
  }));
  
  for (const update of updates) {
    const project = await getContest(update.projectId);
    if (project && project.folderId === folderId) {
      await saveContest({
        ...project,
        order: update.order,
        updatedAt: Date.now()
      });
    }
  }
}

/**
 * Reordena pastas
 * @param {Array<string>} folderIds - Array de IDs de pastas na nova ordem
 * @returns {Promise<void>}
 */
export async function reorderFolders(folderIds) {
  for (let i = 0; i < folderIds.length; i++) {
    const folder = await getFolder(folderIds[i]);
    if (folder) {
      await saveFolder({
        ...folder,
        order: i,
        updatedAt: Date.now()
      });
    }
  }
}
