/**
 * export-manager.js
 * Lógica de exportação de projetos para ZIP
 * Sprint 5 - F5.3
 */

import { getContest, getPhotosByProject } from '../../db.js';

/**
 * Exporta um projeto completo para ZIP
 * @param {string} projectId - ID do projeto
 * @param {Function} onProgress - Callback de progresso (0-100)
 * @returns {Promise<Blob>} Blob do arquivo ZIP
 */
export async function exportProjectToZIP(projectId, onProgress = null) {
  const project = await getContest(projectId);
  if (!project) {
    throw new Error('Projeto não encontrado');
  }
  
  const photos = await getPhotosByProject(projectId);
  
  // Verificar se JSZip está disponível
  if (typeof JSZip === 'undefined') {
    throw new Error('JSZip não está disponível. Certifique-se de que a biblioteca está carregada.');
  }
  
  const zip = new JSZip();
  
  // Preparar dados do projeto para exportação
  const exportData = {
    version: '1.0',
    exportedAt: Date.now(),
    project: {
      id: project.id,
      name: project.name,
      description: project.description || '',
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      folderId: project.folderId || null,
      order: project.order || project.createdAt,
      contestState: project.contestState || {
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
      settings: project.settings || {
        minRatingForBattle: 5,
        kFactor: 32
      }
    },
    photos: photos.map(p => ({
      id: p.id,
      w: p.w,
      h: p.h,
      rating: p.rating || 0,
      uploadedAt: p.uploadedAt || Date.now(),
      parentId: p.parentId || null,
      _isSplit: p._isSplit || false,
      _parentId: p._parentId || null,
      _quadrant: p._quadrant || null
    }))
  };
  
  if (onProgress) onProgress(5);
  
  // Adicionar JSON ao ZIP
  zip.file('project.json', JSON.stringify(exportData, null, 2));
  
  if (onProgress) onProgress(10);
  
  // Adicionar imagens
  const photosFolder = zip.folder('photos');
  const totalPhotos = photos.length;
  
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    
    try {
      // Converter data URL para blob
      const response = await fetch(photo.thumb);
      const blob = await response.blob();
      
      // Determinar extensão do arquivo
      const mimeType = blob.type || 'image/jpeg';
      const extension = mimeType === 'image/png' ? 'png' : 
                       mimeType === 'image/webp' ? 'webp' : 'jpg';
      
      photosFolder.file(`${photo.id}.${extension}`, blob);
    } catch (error) {
      console.warn(`Erro ao processar foto ${photo.id}:`, error);
      // Continuar com outras fotos mesmo se uma falhar
    }
    
    // Atualizar progresso
    if (onProgress) {
      const progress = 10 + Math.round(((i + 1) / totalPhotos) * 85);
      onProgress(progress);
    }
  }
  
  // Gerar ZIP
  if (onProgress) onProgress(95);
  const zipBlob = await zip.generateAsync({ 
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  
  if (onProgress) onProgress(100);
  
  return zipBlob;
}

/**
 * Inicia download do ZIP exportado
 * @param {string} projectId - ID do projeto
 * @param {Function} onProgress - Callback de progresso
 */
export async function downloadProjectExport(projectId, onProgress = null) {
  try {
    const project = await getContest(projectId);
    if (!project) {
      throw new Error('Projeto não encontrado');
    }
    
    const zipBlob = await exportProjectToZIP(projectId, onProgress);
    
    // Criar nome de arquivo seguro
    const safeName = project.name.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-');
    const dateStr = new Date().toISOString().split('T')[0];
    
    // Criar URL e iniciar download
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}-${dateStr}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Erro ao exportar projeto:', error);
    throw error;
  }
}
