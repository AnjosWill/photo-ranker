/**
 * import-manager.js
 * Lógica de importação de projetos de ZIP
 * Sprint 5 - F5.3
 */

import { saveContest, savePhotos, getAllFolders } from '../../db.js';
import { openFolderSelectorModal } from './import-folder-selector.js';

/**
 * Importa um projeto de um arquivo ZIP
 * @param {File} file - Arquivo ZIP
 * @param {Function} onProgress - Callback de progresso (0-100)
 * @returns {Promise<Object>} Projeto importado
 */
export async function importProjectFromZIP(file, onProgress = null) {
  try {
    if (onProgress) onProgress(5);
    
    // Verificar se JSZip está disponível
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip não está disponível. Certifique-se de que a biblioteca está carregada.');
    }
    
    // Carregar ZIP
    const zip = await JSZip.loadAsync(file);
    
    if (onProgress) onProgress(10);
    
    // Ler project.json
    const jsonFile = zip.file('project.json');
    if (!jsonFile) {
      throw new Error('Arquivo project.json não encontrado no ZIP');
    }
    
    const jsonText = await jsonFile.async('string');
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch (error) {
      throw new Error('Formato JSON inválido no arquivo project.json');
    }
    
    if (onProgress) onProgress(15);
    
    // Validar estrutura
    validateImportData(data);
    
    // Selecionar pasta (se houver pastas)
    const folders = await getAllFolders();
    let selectedFolderId = null;
    
    if (folders.length > 0) {
      selectedFolderId = await openFolderSelectorModal(folders);
      if (selectedFolderId === 'cancel') {
        throw new Error('Importação cancelada pelo usuário');
      }
    }
    
    if (onProgress) onProgress(20);
    
    // Criar novo projeto
    const newProjectId = `project-${Date.now()}`;
    const newProject = {
      id: newProjectId,
      name: data.project.name,
      description: data.project.description || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      folderId: selectedFolderId,
      order: data.project.order || Date.now(),
      contestState: data.project.contestState || {
        phase: 'idle',
        eloScores: {},
        battleHistory: [],
        qualifying: null,
        final: null,
        championId: null,
        photoStats: {},
        eloRange: { min: 1500, max: 1500 },
        scoresAndTiers: {}
      },
      settings: data.project.settings || {
        minRatingForBattle: 5,
        kFactor: 32
      }
    };
    
    if (onProgress) onProgress(25);
    
    // Salvar projeto
    await saveContest(newProject);
    
    if (onProgress) onProgress(30);
    
    // Importar fotos
    const photosFolder = zip.folder('photos');
    const photos = [];
    const totalPhotos = data.photos.length;
    
    for (let i = 0; i < data.photos.length; i++) {
      const photoData = data.photos[i];
      
      // Tentar encontrar imagem no ZIP
      let imageBlob = null;
      const possibleExtensions = ['jpg', 'jpeg', 'png', 'webp'];
      
      for (const ext of possibleExtensions) {
        const imageFile = photosFolder.file(`${photoData.id}.${ext}`);
        if (imageFile) {
          imageBlob = await imageFile.async('blob');
          break;
        }
      }
      
      if (!imageBlob) {
        console.warn(`Imagem não encontrada para foto ${photoData.id}, pulando...`);
        continue;
      }
      
      // Converter blob para data URL
      const dataUrl = await blobToDataURL(imageBlob);
      
      photos.push({
        ...photoData,
        id: photoData.id,
        thumb: dataUrl,
        projectId: newProjectId
      });
      
      // Atualizar progresso
      if (onProgress) {
        const progress = 30 + Math.round(((i + 1) / totalPhotos) * 65);
        onProgress(progress);
      }
    }
    
    if (onProgress) onProgress(95);
    
    // Salvar fotos
    if (photos.length > 0) {
      await savePhotos(photos);
    }
    
    // Validar e corrigir referências no contestState
    const photoIds = new Set(photos.map(p => p.id));
    newProject.contestState = fixContestStateReferences(newProject.contestState, photoIds);
    
    // Atualizar projeto com contestState corrigido
    await saveContest(newProject);
    
    if (onProgress) onProgress(100);
    
    return newProject;
  } catch (error) {
    console.error('Erro ao importar projeto:', error);
    throw error;
  }
}

/**
 * Valida dados de importação
 * @param {Object} data - Dados do JSON
 * @throws {Error} Se dados inválidos
 */
function validateImportData(data) {
  if (!data.project) {
    throw new Error('Formato inválido: campo "project" não encontrado');
  }
  
  if (!data.project.name || typeof data.project.name !== 'string') {
    throw new Error('Formato inválido: campo "project.name" obrigatório');
  }
  
  if (!data.project.contestState || typeof data.project.contestState !== 'object') {
    throw new Error('Formato inválido: campo "project.contestState" obrigatório');
  }
  
  if (!data.project.settings || typeof data.project.settings !== 'object') {
    throw new Error('Formato inválido: campo "project.settings" obrigatório');
  }
  
  if (!Array.isArray(data.photos)) {
    throw new Error('Formato inválido: campo "photos" deve ser um array');
  }
}

/**
 * Corrige referências de IDs de fotos no contestState
 * @param {Object} contestState - Estado do contest
 * @param {Set<string>} validPhotoIds - Set de IDs válidos
 * @returns {Object} Estado corrigido
 */
function fixContestStateReferences(contestState, validPhotoIds) {
  const fixed = { ...contestState };
  
  // Corrigir championId
  if (fixed.championId && !validPhotoIds.has(fixed.championId)) {
    fixed.championId = null;
  }
  
  // Corrigir eloScores
  if (fixed.eloScores) {
    const fixedEloScores = {};
    for (const [photoId, score] of Object.entries(fixed.eloScores)) {
      if (validPhotoIds.has(photoId)) {
        fixedEloScores[photoId] = score;
      }
    }
    fixed.eloScores = fixedEloScores;
  }
  
  // Corrigir photoStats
  if (fixed.photoStats) {
    const fixedPhotoStats = {};
    for (const [photoId, stats] of Object.entries(fixed.photoStats)) {
      if (validPhotoIds.has(photoId)) {
        fixedPhotoStats[photoId] = stats;
      }
    }
    fixed.photoStats = fixedPhotoStats;
  }
  
  // Corrigir battleHistory
  if (Array.isArray(fixed.battleHistory)) {
    fixed.battleHistory = fixed.battleHistory.filter(battle => 
      validPhotoIds.has(battle.photoA) && validPhotoIds.has(battle.photoB)
    );
  }
  
  // Corrigir qualifying
  if (fixed.qualifying) {
    if (fixed.qualifying.currentMatch) {
      if (!validPhotoIds.has(fixed.qualifying.currentMatch.photoA) || 
          !validPhotoIds.has(fixed.qualifying.currentMatch.photoB)) {
        fixed.qualifying.currentMatch = null;
      }
    }
  }
  
  // Corrigir final
  if (fixed.final) {
    if (Array.isArray(fixed.final.finalPhotoIds)) {
      fixed.final.finalPhotoIds = fixed.final.finalPhotoIds.filter(id => 
        validPhotoIds.has(id)
      );
    }
    if (Array.isArray(fixed.final.pendingMatches)) {
      fixed.final.pendingMatches = fixed.final.pendingMatches.filter(match =>
        validPhotoIds.has(match.photoA) && validPhotoIds.has(match.photoB)
      );
    }
    if (fixed.final.currentMatch) {
      if (!validPhotoIds.has(fixed.final.currentMatch.photoA) || 
          !validPhotoIds.has(fixed.final.currentMatch.photoB)) {
        fixed.final.currentMatch = null;
      }
    }
  }
  
  return fixed;
}

/**
 * Converte blob para data URL
 * @param {Blob} blob - Blob da imagem
 * @returns {Promise<string>} Data URL
 */
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
