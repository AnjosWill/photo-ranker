/**
 * project-ui.js
 * Componentes UI para gerenciamento de projetos
 * Sprint 5 - F5.2
 */

import { getPhotosByProject, getContest, getProjectsByFolder } from '../../db.js';
import { getProjectStats, getAllFolders, moveProjectToFolder, createFolder, getAllProjects, updateFolder, deleteFolder } from './project-manager.js';

// Funções de modal - serão importadas dinamicamente quando necessário
let openConfirmFn = null;
let openAlertFn = null;

/**
 * Define as funções de modal (chamado pelo app.js)
 */
export function setModalFunctions(openConfirm, openAlert) {
  openConfirmFn = openConfirm;
  openAlertFn = openAlert;
}

/**
 * Abre modal de confirmação
 */
function openConfirm(options) {
  if (openConfirmFn) {
    openConfirmFn(options);
  } else {
    // Fallback: importar dinamicamente
    import('../../app.js').then(module => {
      if (module.openConfirm) {
        module.openConfirm(options);
      } else {
        // Último fallback: usar confirm nativo
        if (window.confirm(options.message || options.title)) {
          options.onConfirm?.();
        }
      }
    });
  }
}

/**
 * Abre modal de alerta
 */
function openAlert(options) {
  if (openAlertFn) {
    openAlertFn(options);
  } else {
    // Fallback: importar dinamicamente
    import('../../app.js').then(module => {
      if (module.openAlert) {
        module.openAlert(options);
      } else {
        // Último fallback: usar alert nativo
        window.alert(options.message || options.title);
      }
    });
  }
}

/**
 * Renderiza grid de projetos agrupados por pasta
 * @param {Array} projects - Array de projetos
 * @param {string} activeProjectId - ID do projeto ativo
 */
export async function renderProjectsGrid(projects, activeProjectId = null) {
  const container = document.getElementById('projectsGrid');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (projects.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh;">
        <div class="empty-state-icon">📸</div>
        <h3>Nenhum projeto ainda</h3>
        <p>Crie seu primeiro projeto para começar a organizar e avaliar suas fotos!</p>
        <button class="btn btn-primary" id="newProjectBtnFromEmpty">
          <span>+</span> Criar Projeto
        </button>
      </div>
    `;
    // Adicionar listener ao botão
    const btn = document.getElementById('newProjectBtnFromEmpty');
    if (btn) {
      btn.addEventListener('click', () => {
        const newBtn = document.getElementById('newProjectBtn');
        if (newBtn) newBtn.click();
      });
    }
    return;
  }
  
  // Buscar todas as pastas
  const folders = await getAllFolders();
  
  // Agrupar projetos por pasta
  const projectsByFolder = {};
  const projectsWithoutFolder = [];
  
  for (const project of projects) {
    const folderId = project.folderId || null;
    if (folderId === null) {
      projectsWithoutFolder.push(project);
    } else {
      if (!projectsByFolder[folderId]) {
        projectsByFolder[folderId] = [];
      }
      projectsByFolder[folderId].push(project);
    }
  }
  
  // Ordenar projetos dentro de cada pasta por 'order'
  Object.keys(projectsByFolder).forEach(folderId => {
    projectsByFolder[folderId].sort((a, b) => (a.order || 0) - (b.order || 0));
  });
  projectsWithoutFolder.sort((a, b) => (a.order || a.createdAt || 0) - (b.order || b.createdAt || 0));
  
  // Renderizar grupos de pastas
  for (const folder of folders) {
    const folderProjects = projectsByFolder[folder.id] || [];
    if (folderProjects.length === 0) continue; // Não exibir pastas vazias
    
    // Cabeçalho da pasta
    const folderHeader = document.createElement('div');
    folderHeader.className = 'projects-folder-header';
    folderHeader.innerHTML = `
      <span class="folder-icon">📂</span>
      <span class="folder-name">${escapeHtml(folder.name)}</span>
      <span class="folder-count">${folderProjects.length} projeto${folderProjects.length !== 1 ? 's' : ''}</span>
    `;
    
    // Duplo clique para renomear no grid principal
    folderHeader.addEventListener('dblclick', async () => {
      const newName = await openFolderEditModal(folder.name);
      if (newName && newName !== folder.name) {
        try {
          await updateFolder(folder.id, { name: newName });
          const updatedProjects = await getAllProjects();
          await renderProjectsGrid(updatedProjects, activeProjectId);
          await renderSideMenu(updatedProjects, activeProjectId);
        } catch (error) {
          console.error('Erro ao renomear pasta:', error);
          openAlert({
            title: 'Erro',
            message: 'Erro ao renomear pasta. Tente novamente.',
            okText: 'OK'
          });
        }
      }
    });
    
    // Botão de deletar pasta no grid
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'folder-delete-btn';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = 'Deletar pasta';
    deleteBtn.style.cssText = 'background: none; border: none; color: var(--text-secondary, #999); cursor: pointer; padding: 4px; margin-left: auto; font-size: 14px; opacity: 0.6; transition: opacity 0.2s;';
    deleteBtn.addEventListener('mouseenter', () => { deleteBtn.style.opacity = '1'; });
    deleteBtn.addEventListener('mouseleave', () => { deleteBtn.style.opacity = '0.6'; });
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const confirmMsg = folderProjects.length > 0
        ? `Deletar pasta "${folder.name}"? Os ${folderProjects.length} projeto(s) serão movidos para "Sem pasta".`
        : `Deletar pasta "${folder.name}"?`;
      
      openConfirm({
        title: 'Deletar pasta?',
        message: confirmMsg,
        confirmText: 'Deletar',
        onConfirm: async () => {
          try {
            await deleteFolder(folder.id);
            const updatedProjects = await getAllProjects();
            await renderProjectsGrid(updatedProjects, activeProjectId);
            await renderSideMenu(updatedProjects, activeProjectId);
          } catch (error) {
            console.error('Erro ao deletar pasta:', error);
            openAlert({
              title: 'Erro',
              message: 'Erro ao deletar pasta. Tente novamente.',
              okText: 'OK'
            });
          }
        }
      });
    });
    folderHeader.appendChild(deleteBtn);
    
    // Configurar drag and drop para reordenar pastas no grid
    setupFolderDragAndDropGrid(folderHeader, folder.id, folders, activeProjectId);
    
    container.appendChild(folderHeader);
    
    // Grid de projetos da pasta
    const folderGrid = document.createElement('div');
    folderGrid.className = 'projects-folder-grid';
    
    for (const project of folderProjects) {
      const card = await renderProjectCard(project, activeProjectId === project.id);
      folderGrid.appendChild(card);
    }
    
    container.appendChild(folderGrid);
  }
  
  // Renderizar projetos sem pasta (se houver)
  if (projectsWithoutFolder.length > 0) {
    // Cabeçalho "Sem pasta"
    const noFolderHeader = document.createElement('div');
    noFolderHeader.className = 'projects-folder-header';
    noFolderHeader.innerHTML = `
      <span class="folder-icon">📁</span>
      <span class="folder-name">Sem pasta</span>
      <span class="folder-count">${projectsWithoutFolder.length} projeto${projectsWithoutFolder.length !== 1 ? 's' : ''}</span>
    `;
    container.appendChild(noFolderHeader);
    
    // Grid de projetos sem pasta
    const noFolderGrid = document.createElement('div');
    noFolderGrid.className = 'projects-folder-grid';
    
    for (const project of projectsWithoutFolder) {
      const card = await renderProjectCard(project, activeProjectId === project.id);
      noFolderGrid.appendChild(card);
    }
    
    container.appendChild(noFolderGrid);
  }
}

/**
 * Renderiza card de projeto
 * @param {Object} project - Projeto
 * @param {boolean} isActive - Se é o projeto ativo
 * @returns {Promise<HTMLElement>} Elemento do card
 */
export async function renderProjectCard(project, isActive = false) {
  const stats = await getProjectStats(project.id);
  const photos = await getPhotosByProject(project.id);
  const visiblePhotos = photos.filter(p => !p._isSplit);
  
  // Lógica inteligente de preview:
  // 1. Se há vencedor do contest: mostrar vencedor
  // 2. Se há avaliações: mostrar melhores avaliadas
  // 3. Se só upload: mostrar primeiras ordenadas por data
  let previewPhotos = [];
  let hasChampion = false;
  let championId = project.contestState?.championId;
  
  if (championId) {
    // Há vencedor: mostrar vencedor
    const champion = visiblePhotos.find(p => p.id === championId);
    if (champion) {
      previewPhotos = [champion];
      hasChampion = true;
    }
  } else if (stats.ratedPhotos > 0) {
    // Há avaliações: mostrar melhores avaliadas (ordenadas por rating desc, depois data desc)
    const ratedPhotos = visiblePhotos
      .filter(p => p.rating && p.rating > 0)
      .sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return (b.uploadedAt || 0) - (a.uploadedAt || 0);
      })
      .slice(0, 4);
    previewPhotos = ratedPhotos;
  } else if (visiblePhotos.length > 0) {
    // Só upload: mostrar primeiras ordenadas por data (mais recente primeiro)
    previewPhotos = visiblePhotos
      .sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0))
      .slice(0, 4);
  }
  
  const card = document.createElement('div');
  card.className = `project-card ${isActive ? 'active' : ''}`;
  card.dataset.projectId = project.id;
  
  // Preview de fotos (1-4 miniaturas)
  let previewHtml = '';
  if (previewPhotos.length === 0) {
    previewHtml = '<div class="preview-empty">Sem fotos</div>';
  } else if (previewPhotos.length === 1) {
    // 1 foto: ocupar todo o espaço
    previewHtml = `<img src="${previewPhotos[0].thumb}" alt="Preview" loading="lazy" style="grid-column: 1 / -1; grid-row: 1 / -1;" />`;
  } else if (previewPhotos.length === 2) {
    // 2 fotos: lado a lado
    previewHtml = previewPhotos.map((p, i) => 
      `<img src="${p.thumb}" alt="Preview ${i + 1}" loading="lazy" style="grid-column: ${i === 0 ? '1' : '2'}; grid-row: 1 / -1;" />`
    ).join('');
  } else if (previewPhotos.length === 3) {
    // 3 fotos: 2 em cima, 1 embaixo
    previewHtml = previewPhotos.map((p, i) => {
      if (i < 2) {
        return `<img src="${p.thumb}" alt="Preview ${i + 1}" loading="lazy" style="grid-column: ${i === 0 ? '1' : '2'}; grid-row: 1;" />`;
      } else {
        return `<img src="${p.thumb}" alt="Preview ${i + 1}" loading="lazy" style="grid-column: 1 / -1; grid-row: 2;" />`;
      }
    }).join('');
  } else {
    // 4 fotos: grid 2x2
    previewHtml = previewPhotos.map((p, i) => 
      `<img src="${p.thumb}" alt="Preview ${i + 1}" loading="lazy" />`
    ).join('');
  }
  
  // Adicionar ícone de troféu se há vencedor (no canto superior direito da primeira foto)
  if (hasChampion && previewPhotos.length > 0) {
    previewHtml += '<div class="preview-trophy">🏆</div>';
  }
  
  // Adicionar contador se houver mais fotos
  if (visiblePhotos.length > previewPhotos.length) {
    previewHtml += `<span class="preview-count">+${visiblePhotos.length - previewPhotos.length}</span>`;
  }
  
  card.innerHTML = `
    <div class="project-preview">
      ${previewHtml}
    </div>
    <div class="project-info">
      <h4>${escapeHtml(project.name)}</h4>
      ${project.description ? `<p class="project-description">${escapeHtml(project.description)}</p>` : ''}
      <div class="project-stats">
        <span>${stats.totalPhotos} fotos</span>
        <span>•</span>
        <span>${stats.ratedPhotos} avaliadas</span>
      </div>
      <div class="project-phase">
        <span class="badge badge-${stats.phaseValue}">${stats.phase}</span>
      </div>
    </div>
    <div class="project-actions">
      <button class="btn btn-sm btn-primary" data-action="open" data-project-id="${project.id}">
        Abrir
      </button>
      <button class="btn btn-sm" data-action="edit" data-project-id="${project.id}">
        Editar
      </button>
      <button class="btn btn-sm" data-action="export" data-project-id="${project.id}">
        Exportar
      </button>
      <button class="btn btn-sm" data-action="duplicate" data-project-id="${project.id}">
        Duplicar
      </button>
      <button class="btn btn-sm btn-danger" data-action="delete" data-project-id="${project.id}">
        Deletar
      </button>
    </div>
  `;
  
  return card;
}

/**
 * Obtém estado de expansão de pastas do localStorage
 */
function getFolderExpandedState() {
  try {
    const state = localStorage.getItem('photoranker-folder-expanded');
    return state ? JSON.parse(state) : {};
  } catch {
    return {};
  }
}

/**
 * Salva estado de expansão de pastas no localStorage
 */
function saveFolderExpandedState(state) {
  try {
    localStorage.setItem('photoranker-folder-expanded', JSON.stringify(state));
  } catch (e) {
    console.warn('Erro ao salvar estado de expansão:', e);
  }
}

/**
 * Alterna estado de expansão de uma pasta
 */
function toggleFolderExpanded(folderId) {
  const state = getFolderExpandedState();
  state[folderId] = !state[folderId];
  saveFolderExpandedState(state);
  return state[folderId];
}

/**
 * Renderiza side menu com pastas
 * @param {Array} projects - Array de projetos
 * @param {string} activeProjectId - ID do projeto ativo
 */
export async function renderSideMenu(projects, activeProjectId = null) {
  const menu = document.getElementById('sideMenu');
  if (!menu) return;
  
  const list = menu.querySelector('.side-menu-list');
  if (!list) return;
  
  list.innerHTML = '';
  
  // Buscar todas as pastas primeiro
  const folders = await getAllFolders();
  const expandedState = getFolderExpandedState();
  
  // Botão "Nova Pasta"
  const newFolderItem = document.createElement('button');
  newFolderItem.className = 'side-menu-item side-menu-new-folder';
  newFolderItem.innerHTML = '<span class="icon">➕</span> Nova Pasta';
  newFolderItem.addEventListener('click', async () => {
    const name = await openFolderCreateModal();
    if (name) {
      try {
        await createFolder(name);
        // Re-renderizar menu com projetos atualizados
        const updatedProjects = await getAllProjects();
        await renderSideMenu(updatedProjects, activeProjectId);
        // Atualizar grid principal se estiver na tela de projetos
        if (window.location.hash === '#/projects' || window.location.hash === '#') {
          const { renderProjectsGrid } = await import('./project-ui.js');
          await renderProjectsGrid(updatedProjects, activeProjectId);
        }
      } catch (error) {
        console.error('Erro ao criar pasta:', error);
        openAlert({
          title: 'Erro',
          message: 'Erro ao criar pasta. Tente novamente.',
          okText: 'OK'
        });
      }
    }
  });
  list.appendChild(newFolderItem);
  
  // Botão "Ver todos os projetos"
  const viewAllItem = document.createElement('button');
  viewAllItem.className = 'side-menu-item';
  viewAllItem.innerHTML = '<span class="icon">📋</span> Ver todos os projetos';
  viewAllItem.addEventListener('click', () => {
    window.location.hash = '#/projects';
    // Fechar menu após navegação
    const menu = document.getElementById('sideMenu');
    if (menu) {
      menu.setAttribute('aria-hidden', 'true');
      const overlay = document.getElementById('sideMenuOverlay');
      if (overlay) overlay.setAttribute('aria-hidden', 'true');
      const toggle = document.getElementById('sideMenuToggle');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
  });
  list.appendChild(viewAllItem);
  
  // Botão "Expandir Todas" / "Colapsar Todas"
  const allExpanded = folders.length > 0 && folders.every(f => expandedState[f.id] !== false) && expandedState['none'] !== false;
  const expandAllItem = document.createElement('button');
  expandAllItem.className = 'side-menu-item';
  expandAllItem.innerHTML = allExpanded 
    ? '<span class="icon">📁</span> Colapsar Todas'
    : '<span class="icon">📂</span> Expandir Todas';
  expandAllItem.addEventListener('click', async () => {
    const newState = {};
    const shouldExpand = !allExpanded;
    const currentFolders = await getAllFolders();
    currentFolders.forEach(f => {
      newState[f.id] = shouldExpand;
    });
    newState['none'] = shouldExpand;
    saveFolderExpandedState(newState);
    const updatedProjects = await getAllProjects();
    await renderSideMenu(updatedProjects, activeProjectId);
  });
  list.appendChild(expandAllItem);
  
  // Separador
  const separator = document.createElement('div');
  separator.className = 'side-menu-separator';
  list.appendChild(separator);
  
  // Agrupar projetos por pasta
  const projectsByFolder = {};
  const projectsWithoutFolder = [];
  
  for (const project of projects) {
    const folderId = project.folderId || null;
    if (folderId === null) {
      projectsWithoutFolder.push(project);
    } else {
      if (!projectsByFolder[folderId]) {
        projectsByFolder[folderId] = [];
      }
      projectsByFolder[folderId].push(project);
    }
  }
  
  // Ordenar projetos dentro de cada pasta por 'order'
  Object.keys(projectsByFolder).forEach(folderId => {
    projectsByFolder[folderId].sort((a, b) => (a.order || 0) - (b.order || 0));
  });
  projectsWithoutFolder.sort((a, b) => (a.order || a.createdAt || 0) - (b.order || b.createdAt || 0));
  
  // Renderizar pastas
  for (const folder of folders) {
    const folderProjects = projectsByFolder[folder.id] || [];
    const isExpanded = expandedState[folder.id] !== false; // Por padrão expandido
    
    // Item da pasta (NÃO é arrastável - apenas zona de drop)
    const folderItem = document.createElement('div');
    folderItem.className = 'side-menu-folder';
    folderItem.dataset.folderId = folder.id;
    
    const folderHeader = document.createElement('button');
    folderHeader.className = 'side-menu-folder-header';
    folderHeader.innerHTML = `
      <span class="folder-chevron ${isExpanded ? 'expanded' : ''}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 12l4-4-4-4"/>
        </svg>
      </span>
      <span class="folder-icon">${isExpanded ? '📂' : '📁'}</span>
      <span class="folder-name">${escapeHtml(folder.name)}</span>
      <span class="folder-count">${folderProjects.length}</span>
    `;
    
    folderHeader.addEventListener('click', (e) => {
      e.stopPropagation();
      const newExpanded = toggleFolderExpanded(folder.id);
      // Re-renderizar menu
      renderSideMenu(projects, activeProjectId);
    });
    
    // Duplo clique para renomear
    folderHeader.addEventListener('dblclick', async (e) => {
      e.stopPropagation();
      const newName = await openFolderEditModal(folder.name);
      if (newName && newName !== folder.name) {
        try {
          await updateFolder(folder.id, { name: newName });
          const updatedProjects = await getAllProjects();
          await renderSideMenu(updatedProjects, activeProjectId);
          if (window.location.hash === '#/projects' || window.location.hash === '#') {
            await renderProjectsGrid(updatedProjects, activeProjectId);
          }
        } catch (error) {
          console.error('Erro ao renomear pasta:', error);
          openAlert({
            title: 'Erro',
            message: 'Erro ao renomear pasta. Tente novamente.',
            okText: 'OK'
          });
        }
      }
    });
    
    // Botão de deletar pasta
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'folder-delete-btn';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = 'Deletar pasta';
    deleteBtn.style.cssText = 'background: none; border: none; color: var(--text-secondary, #999); cursor: pointer; padding: 4px; margin-left: auto; font-size: 14px; opacity: 0.6; transition: opacity 0.2s;';
    deleteBtn.addEventListener('mouseenter', () => { deleteBtn.style.opacity = '1'; });
    deleteBtn.addEventListener('mouseleave', () => { deleteBtn.style.opacity = '0.6'; });
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const projectsInFolder = projectsByFolder[folder.id] || [];
      const confirmMsg = projectsInFolder.length > 0
        ? `Deletar pasta "${folder.name}"? Os ${projectsInFolder.length} projeto(s) serão movidos para "Sem pasta".`
        : `Deletar pasta "${folder.name}"?`;
      
      openConfirm({
        title: 'Deletar pasta?',
        message: confirmMsg,
        confirmText: 'Deletar',
        onConfirm: async () => {
          try {
            await deleteFolder(folder.id);
            const updatedProjects = await getAllProjects();
            await renderSideMenu(updatedProjects, activeProjectId);
            if (window.location.hash === '#/projects' || window.location.hash === '#') {
              await renderProjectsGrid(updatedProjects, activeProjectId);
            }
          } catch (error) {
            console.error('Erro ao deletar pasta:', error);
            openAlert({
              title: 'Erro',
              message: 'Erro ao deletar pasta. Tente novamente.',
              okText: 'OK'
            });
          }
        }
      });
    });
    folderHeader.appendChild(deleteBtn);
    
    // IMPORTANTE: Apenas o HEADER da pasta é arrastável para reordenar pastas
    // O elemento completo (folderItem) é apenas zona de drop para projetos
    setupFolderDragAndDrop(folderHeader, folder.id, folders, activeProjectId);
    
    // Zona de drop para projetos (no elemento completo da pasta)
    setupFolderDropZone(folderItem, folder.id, projects, activeProjectId);
    
    folderItem.appendChild(folderHeader);
    
      // Lista de projetos dentro da pasta
      if (isExpanded && folderProjects.length > 0) {
        const folderProjectsList = document.createElement('div');
        folderProjectsList.className = 'side-menu-folder-projects';
        
        folderProjects.forEach(project => {
          const projectItem = document.createElement('button');
          projectItem.className = `side-menu-item side-menu-project ${activeProjectId === project.id ? 'active' : ''}`;
          projectItem.dataset.projectId = project.id;
          projectItem.dataset.folderId = folder.id;
          projectItem.draggable = true;
          projectItem.innerHTML = `<span class="icon">📄</span> ${escapeHtml(project.name)}`;
          projectItem.addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.hash = `#/project/${project.id}/upload`;
          });
          
          // Drag and drop handlers
          setupProjectDragAndDrop(projectItem, project.id, folder.id, projects, activeProjectId);
          
          folderProjectsList.appendChild(projectItem);
        });
        
        // Adicionar área de drop expandida no final da lista para facilitar arrastar para o final
        folderProjectsList.addEventListener('dragover', (e) => {
          // Só processar se estiver arrastando um projeto (não uma pasta)
          if (!window._draggingProjectId || window._draggingFolderId) {
            return;
          }
          
          const rect = folderProjectsList.getBoundingClientRect();
          const mouseY = e.clientY;
          
          // Área expandida no final (últimos 80px)
          if (mouseY > rect.bottom - 80) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            // Mostrar indicador no final
            const existingIndicator = folderProjectsList.querySelector('.drag-indicator-line');
            if (!existingIndicator || existingIndicator.nextSibling !== null) {
              removeAllDragIndicators();
              const indicator = document.createElement('div');
              indicator.className = 'drag-indicator-line';
              folderProjectsList.appendChild(indicator);
            }
          }
        });
        
        folderProjectsList.addEventListener('drop', async (e) => {
          // Só processar se estiver arrastando um projeto (não uma pasta)
          if (!window._draggingProjectId || window._draggingFolderId) {
            return;
          }
          
          const dragData = e.dataTransfer.getData('text/plain');
          if (!dragData || dragData.startsWith('folder:')) {
            removeAllDragIndicators();
            return;
          }
          
          const projectId = dragData;
          if (!projectId) {
            removeAllDragIndicators();
            return;
          }
          
          // Verificar se o projeto já está na pasta correta ANTES de processar
          const currentFolderIdStr = folder.id === null || folder.id === undefined ? 'none' : String(folder.id);
          const { getAllProjects } = await import('./project-manager.js');
          const allProjects = await getAllProjects();
          const project = allProjects.find(p => p.id === projectId);
          
          if (!project) {
            removeAllDragIndicators();
            return;
          }
          
          const projectFolderIdStr = (project.folderId || null) === null ? 'none' : String(project.folderId);
          
          // Se o projeto NÃO está na pasta correta, deixar o handler do folderElement processar
          if (currentFolderIdStr !== projectFolderIdStr) {
            // Não fazer preventDefault/stopPropagation - deixar evento propagar para folderElement
            return;
          }
          
          // PRIORIDADE: Verificar se há linha indicadora no final ANTES de verificar posição do mouse
          const allChildren = Array.from(folderProjectsList.children);
          const lastChild = allChildren[allChildren.length - 1];
          const indicatorAtEnd = lastChild && lastChild.classList.contains('drag-indicator-line');
          
          const rect = folderProjectsList.getBoundingClientRect();
          const mouseY = e.clientY;
          
          // Se há linha no final OU drop foi no final da lista (últimos 80px)
          if (indicatorAtEnd || mouseY > rect.bottom - 80) {
            e.preventDefault();
            e.stopPropagation(); // Parar propagação para não processar em elementos filhos
            
            // Projeto já está na pasta correta, apenas reordenar para o final
            try {
              const { reorderProjectsInFolder } = await import('./project-manager.js');
              const folderProjects = allProjects.filter(p => {
                const pFolderId = p.folderId || null;
                const compareFolderId = folder.id === null || folder.id === undefined ? null : folder.id;
                return pFolderId === compareFolderId;
              });
              
              const projectIds = folderProjects
                .map(p => p.id)
                .sort((a, b) => {
                  const projA = allProjects.find(p => p.id === a);
                  const projB = allProjects.find(p => p.id === b);
                  return (projA.order || 0) - (projB.order || 0);
                });
              
              // Mover para o final
              const draggedIndex = projectIds.indexOf(projectId);
              if (draggedIndex >= 0) {
                projectIds.splice(draggedIndex, 1);
                projectIds.push(projectId);
                await reorderProjectsInFolder(folder.id, projectIds);
                
                const finalProjects = await getAllProjects();
                await renderSideMenu(finalProjects, activeProjectId);
              }
            } catch (error) {
              console.error('Erro ao reordenar projeto:', error);
            }
            
            removeAllDragIndicators();
          }
        });
        
        folderItem.appendChild(folderProjectsList);
      }
    
    list.appendChild(folderItem);
  }
  
  // Renderizar projetos sem pasta
  if (projectsWithoutFolder.length > 0) {
    const noFolderHeader = document.createElement('div');
    noFolderHeader.className = 'side-menu-folder';
    noFolderHeader.dataset.folderId = 'none';
    
    const isNoFolderExpanded = expandedState['none'] !== false;
    
    const noFolderHeaderBtn = document.createElement('button');
    noFolderHeaderBtn.className = 'side-menu-folder-header';
    noFolderHeaderBtn.innerHTML = `
      <span class="folder-chevron ${isNoFolderExpanded ? 'expanded' : ''}">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 12l4-4-4-4"/>
        </svg>
      </span>
      <span class="folder-icon">${isNoFolderExpanded ? '📂' : '📁'}</span>
      <span class="folder-name">Sem pasta</span>
      <span class="folder-count">${projectsWithoutFolder.length}</span>
    `;
    
    noFolderHeaderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const newExpanded = toggleFolderExpanded('none');
      renderSideMenu(projects, activeProjectId);
    });
    
    // Drag and drop handlers para "Sem pasta"
    setupFolderDropZone(noFolderHeader, null, projects, activeProjectId);
    
    noFolderHeader.appendChild(noFolderHeaderBtn);
    
    if (isNoFolderExpanded) {
      const noFolderProjectsList = document.createElement('div');
      noFolderProjectsList.className = 'side-menu-folder-projects';
      
      projectsWithoutFolder.forEach(project => {
        const projectItem = document.createElement('button');
        projectItem.className = `side-menu-item side-menu-project ${activeProjectId === project.id ? 'active' : ''}`;
        projectItem.dataset.projectId = project.id;
        projectItem.dataset.folderId = 'none';
        projectItem.draggable = true;
        projectItem.innerHTML = `<span class="icon">📄</span> ${escapeHtml(project.name)}`;
        projectItem.addEventListener('click', (e) => {
          e.stopPropagation();
          window.location.hash = `#/project/${project.id}/upload`;
        });
        
        // Drag and drop handlers
        setupProjectDragAndDrop(projectItem, project.id, null, projects, activeProjectId);
        
        noFolderProjectsList.appendChild(projectItem);
      });
      
      // Permitir drop na lista de projetos para reordenação
      noFolderProjectsList.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      
      noFolderProjectsList.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // O drop será tratado pelo elemento filho (projectItem)
      });
      
      noFolderHeader.appendChild(noFolderProjectsList);
    }
    
    list.appendChild(noFolderHeader);
  }
}

/**
 * Remove todas as linhas indicadoras de drag
 */
function removeAllDragIndicators() {
  document.querySelectorAll('.drag-indicator-line').forEach(el => el.remove());
}

/**
 * Insere linha indicadora antes ou depois de um elemento
 */
function insertDragIndicator(element, position = 'after') {
  removeAllDragIndicators();
  const indicator = document.createElement('div');
  indicator.className = 'drag-indicator-line';
  if (position === 'before') {
    element.parentNode.insertBefore(indicator, element);
  } else {
    element.parentNode.insertBefore(indicator, element.nextSibling);
  }
}

/**
 * Configura drag-and-drop para um projeto
 * Permite: 1) Reordenar dentro da mesma pasta, 2) Mover para outra pasta
 */
function setupProjectDragAndDrop(element, projectId, currentFolderId, allProjects, activeProjectId) {
  element.addEventListener('dragstart', (e) => {
    e.stopPropagation(); // Evitar propagação
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', projectId);
    element.classList.add('dragging');
    // Armazenar globalmente
    window._draggingProjectId = projectId;
    window._draggingProjectFolderId = currentFolderId;
    window._draggingFolderId = null; // Limpar pasta se houver
  });
  
  element.addEventListener('dragend', (e) => {
    element.classList.remove('dragging');
    removeAllDragIndicators();
    // Remover highlights
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    document.querySelectorAll('.drag-over-folder').forEach(el => el.classList.remove('drag-over-folder'));
    // Limpar variáveis globais
    window._draggingProjectId = null;
    window._draggingProjectFolderId = null;
  });
  
  element.addEventListener('dragover', (e) => {
    // Só processar se estiver arrastando um projeto (não uma pasta)
    if (!window._draggingProjectId || window._draggingFolderId) {
      return;
    }
    
    e.preventDefault();
    // NÃO usar stopPropagation aqui - permite que o evento chegue aos elementos pais (pastas)
    e.dataTransfer.dropEffect = 'move';
    
    const targetProjectId = e.currentTarget.dataset.projectId;
    const targetFolderId = e.currentTarget.dataset.folderId;
    
    if (!targetProjectId) return;
    
    // Comparar folderId corretamente (considerando null e 'none')
    const currentFolderIdStr = currentFolderId === null || currentFolderId === undefined ? 'none' : String(currentFolderId);
    const targetFolderIdStr = targetFolderId === null || targetFolderId === undefined ? 'none' : String(targetFolderId);
    
    // Se arrastando sobre outro projeto na mesma pasta, mostrar linha indicadora
    if (targetProjectId !== projectId && targetFolderIdStr === currentFolderIdStr) {
      const rect = e.currentTarget.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const mouseY = e.clientY;
      
      // Determinar se está acima ou abaixo do meio do elemento
      // Se o mouse está na metade superior (incluindo exatamente no meio), mostrar linha acima
      // Se o mouse está na metade inferior, mostrar linha abaixo
      if (mouseY <= midpoint) {
        insertDragIndicator(e.currentTarget, 'before');
      } else {
        insertDragIndicator(e.currentTarget, 'after');
      }
      e.currentTarget.classList.add('drag-over');
    }
  });
  
  element.addEventListener('dragleave', (e) => {
    // Só remover se realmente saiu (não apenas entrou em um filho)
    if (!e.currentTarget.contains(e.relatedTarget)) {
      e.currentTarget.classList.remove('drag-over');
    }
  });
  
  element.addEventListener('drop', async (e) => {
    // Só processar se estiver arrastando um projeto (não uma pasta)
    if (!window._draggingProjectId || window._draggingFolderId) {
      return;
    }
    
    const targetProjectId = e.currentTarget.dataset.projectId;
    const targetFolderId = e.currentTarget.dataset.folderId;
    
    if (!targetProjectId) {
      return; // Não processar, deixar outros handlers lidarem
    }
    
    // Comparar folderId corretamente (considerando null e 'none')
    const currentFolderIdStr = currentFolderId === null || currentFolderId === undefined ? 'none' : String(currentFolderId);
    const targetFolderIdStr = targetFolderId === null || targetFolderId === undefined ? 'none' : String(targetFolderId);
    
    // Se soltou sobre outro projeto na mesma pasta, reordenar
    if (targetProjectId !== projectId && targetFolderIdStr === currentFolderIdStr) {
      // IMPORTANTE: Verificar PRIMEIRO se há linha indicadora no final da lista
      // Se houver, o handler da lista deve processar (não fazer stopPropagation aqui)
      const parentContainer = e.currentTarget.parentNode;
      const allChildren = Array.from(parentContainer.children);
      const lastChild = allChildren[allChildren.length - 1];
      const indicatorAtEnd = lastChild && lastChild.classList.contains('drag-indicator-line');
      
      // Se a linha está no final, deixar o handler da lista processar
      if (indicatorAtEnd) {
        return; // Não processar aqui, deixar handler da lista lidar
      }
      
      // Se não é linha no final, processar normalmente
      e.preventDefault();
      e.stopPropagation(); // Parar propagação para não processar em elementos pais
      e.currentTarget.classList.remove('drag-over');
      try {
        // Usar parentContainer e allChildren já obtidos acima
        const targetDomIndex = allChildren.indexOf(e.currentTarget);
        
        // PRIORIDADE 1: Verificar se há linha indicadora no container (LINHA TEM PRIORIDADE ABSOLUTA)
        const allIndicators = allChildren.filter(child => child.classList.contains('drag-indicator-line'));
        const lastChild = allChildren[allChildren.length - 1];
        const indicatorAtEnd = lastChild && lastChild.classList.contains('drag-indicator-line');
        
        // Procurar linha indicadora antes ou depois do elemento alvo
        let insertBefore = false;
        let insertAtEnd = false;
        let indicatorFound = false;
        
        // PRIORIDADE 1.1: Linha indicadora no final da lista
        if (indicatorAtEnd) {
          insertAtEnd = true;
          indicatorFound = true;
        } 
        // PRIORIDADE 1.2: Linha indicadora antes do elemento
        else if (targetDomIndex > 0 && allChildren[targetDomIndex - 1]?.classList.contains('drag-indicator-line')) {
          insertBefore = true;
          indicatorFound = true;
        }
        // PRIORIDADE 1.3: Linha indicadora depois do elemento
        else if (targetDomIndex < allChildren.length - 1 && allChildren[targetDomIndex + 1]?.classList.contains('drag-indicator-line')) {
          insertBefore = false;
          indicatorFound = true;
        }
        // PRIORIDADE 1.4: Se há linha indicadora em outro lugar (pode estar depois do último projeto)
        else if (allIndicators.length > 0) {
          const indicator = allIndicators[0];
          const indicatorIndex = allChildren.indexOf(indicator);
          
          // Se a linha está depois do elemento atual, inserir depois (ou no final se for o último)
          if (indicatorIndex > targetDomIndex) {
            // Verificar se é o último projeto
            const projectItems = allChildren.filter(child => child.dataset.projectId);
            const isLastProject = projectItems.indexOf(e.currentTarget) === projectItems.length - 1;
            
            if (isLastProject) {
              insertAtEnd = true;
            } else {
              insertBefore = false;
            }
            indicatorFound = true;
          }
          // Se a linha está antes do elemento atual, inserir antes
          else if (indicatorIndex < targetDomIndex) {
            insertBefore = true;
            indicatorFound = true;
          }
        }
        
        // PRIORIDADE 2: Se NÃO encontrou linha indicadora, usar posição do mouse como fallback
        if (!indicatorFound) {
          const indicatorBefore = targetDomIndex > 0 && allChildren[targetDomIndex - 1]?.classList.contains('drag-indicator-line');
          const indicatorAfter = targetDomIndex < allChildren.length - 1 && allChildren[targetDomIndex + 1]?.classList.contains('drag-indicator-line');
          
          // Se ainda não encontrou linha, usar mouse
          if (!indicatorBefore && !indicatorAfter) {
            // Verificar se está sobre o último projeto e mouse está na área do final
            const projectItems = allChildren.filter(child => child.dataset.projectId);
            const isLastProject = projectItems.indexOf(e.currentTarget) === projectItems.length - 1;
            
            if (isLastProject) {
              const rect = parentContainer.getBoundingClientRect();
              const mouseY = e.clientY;
              if (mouseY > rect.bottom - 80) {
                insertAtEnd = true;
              } else {
                const itemRect = e.currentTarget.getBoundingClientRect();
                const midpoint = itemRect.top + itemRect.height / 2;
                insertBefore = mouseY <= midpoint;
              }
            } else {
              const rect = e.currentTarget.getBoundingClientRect();
              const midpoint = rect.top + rect.height / 2;
              const mouseY = e.clientY;
              insertBefore = mouseY <= midpoint;
            }
          }
        }
        
        // Remover indicadores após determinar a posição
        removeAllDragIndicators();
        
        const { reorderProjectsInFolder } = await import('./project-manager.js');
        const updatedProjects = await getAllProjects();
        const folderProjects = updatedProjects.filter(p => {
          const pFolderId = p.folderId || null;
          const compareFolderId = currentFolderId === null || currentFolderId === undefined ? null : currentFolderId;
          return pFolderId === compareFolderId;
        });
        
        // Ordenar por ordem atual
        const projectIds = folderProjects
          .map(p => p.id)
          .sort((a, b) => {
            const projA = updatedProjects.find(p => p.id === a);
            const projB = updatedProjects.find(p => p.id === b);
            return (projA.order || 0) - (projB.order || 0);
          });
        
        // Mover projeto arrastado para posição do alvo
        const draggedIndex = projectIds.indexOf(projectId);
        let targetIndex = projectIds.indexOf(targetProjectId);
        
        if (draggedIndex >= 0 && targetIndex >= 0) {
          // Remover o projeto arrastado da lista primeiro
          projectIds.splice(draggedIndex, 1);
          
          if (insertAtEnd) {
            // Inserir no final da lista
            projectIds.push(projectId);
            // Sempre reordenar quando inserir no final
            await reorderProjectsInFolder(currentFolderId, projectIds);
            
            // Re-renderizar menu
            const finalProjects = await getAllProjects();
            await renderSideMenu(finalProjects, activeProjectId);
          } else if (draggedIndex !== targetIndex) {
            // Ajustar índice do alvo após remover o arrastado
            if (targetIndex > draggedIndex) {
              targetIndex--;
            }
            
            // Inserir antes ou depois baseado na posição determinada
            if (insertBefore) {
              // Inserir antes do alvo
              projectIds.splice(targetIndex, 0, projectId);
            } else {
              // Inserir depois do alvo
              projectIds.splice(targetIndex + 1, 0, projectId);
            }
            
            await reorderProjectsInFolder(currentFolderId, projectIds);
            
            // Re-renderizar menu
            const finalProjects = await getAllProjects();
            await renderSideMenu(finalProjects, activeProjectId);
          }
          // Se draggedIndex === targetIndex e não é insertAtEnd, não fazer nada
        }
      } catch (error) {
        console.error('Erro ao reordenar projetos:', error);
        removeAllDragIndicators();
      }
    } else {
      removeAllDragIndicators();
    }
  });
}

/**
 * Configura drag-and-drop para reordenar pastas
 * IMPORTANTE: Esta função deve ser aplicada apenas ao HEADER da pasta, não ao elemento completo
 */
function setupFolderDragAndDrop(folderHeader, folderId, allFolders, activeProjectId) {
  // Apenas o header é arrastável
  folderHeader.draggable = true;
  
  folderHeader.addEventListener('dragstart', (e) => {
    e.stopPropagation(); // Evitar propagação para elementos pais
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `folder:${folderId}`);
    folderHeader.classList.add('dragging');
    // Armazenar globalmente para verificar em outros elementos
    window._draggingFolderId = folderId;
    window._draggingProjectId = null; // Limpar projeto se houver
  });
  
  folderHeader.addEventListener('dragend', (e) => {
    folderHeader.classList.remove('dragging');
    window._draggingFolderId = null;
    removeAllDragIndicators();
    // Remover highlights
    document.querySelectorAll('.drag-over-folder').forEach(el => el.classList.remove('drag-over-folder'));
  });
  
  folderHeader.addEventListener('dragover', (e) => {
    // Só processar se estiver arrastando uma pasta
    if (!window._draggingFolderId) {
      // Não é uma pasta sendo arrastada - deixar evento passar para elementos pais
      // NÃO fazer preventDefault nem stopPropagation aqui
      return;
    }
    
    // É uma pasta sendo arrastada - processar
    e.preventDefault();
    e.stopPropagation(); // Pastas não devem permitir drop de projetos nelas
    
    const draggedFolderId = window._draggingFolderId;
    const targetFolderId = folderHeader.closest('.side-menu-folder')?.dataset.folderId;
    
    // IMPORTANTE: Pastas só podem ser reordenadas (acima/abaixo), NUNCA dropadas dentro de outras
    // Se arrastando sobre o HEADER de outra pasta, permitir reordenar e mostrar linha
    if (targetFolderId && targetFolderId !== draggedFolderId) {
      e.dataTransfer.dropEffect = 'move';
      const folderElement = folderHeader.closest('.side-menu-folder');
      if (folderElement) {
        folderElement.classList.add('drag-over-folder');
      }
      
      // Mostrar linha indicadora (acima ou abaixo do header)
      const rect = folderHeader.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const mouseY = e.clientY;
      
      if (mouseY < midpoint) {
        insertDragIndicator(folderHeader, 'before');
      } else {
        insertDragIndicator(folderHeader, 'after');
      }
    }
  });
  
  folderHeader.addEventListener('dragleave', (e) => {
    // Só remover se realmente saiu (não apenas entrou em um filho)
    if (!folderHeader.contains(e.relatedTarget)) {
      const folderElement = folderHeader.closest('.side-menu-folder');
      if (folderElement) {
        folderElement.classList.remove('drag-over-folder');
      }
    }
  });
  
  folderHeader.addEventListener('drop', async (e) => {
    // Só processar se estiver arrastando uma pasta
    if (!window._draggingFolderId) {
      // Não é uma pasta sendo arrastada - deixar evento passar para elementos pais (folderElement)
      // NÃO fazer preventDefault nem stopPropagation aqui
      return;
    }
    
    // É uma pasta sendo arrastada - processar
    e.preventDefault();
    e.stopPropagation(); // Parar propagação para não processar em elementos pais
    
    const dragData = e.dataTransfer.getData('text/plain');
    if (!dragData || !dragData.startsWith('folder:')) {
      return; // Não é uma pasta sendo arrastada
    }
    
    const draggedFolderId = dragData.replace('folder:', '');
    const targetFolderId = folderHeader.closest('.side-menu-folder')?.dataset.folderId;
    
    if (!targetFolderId || targetFolderId === draggedFolderId) {
      return; // Mesma pasta ou inválido
    }
    
    const folderElement = folderHeader.closest('.side-menu-folder');
    if (folderElement) {
      folderElement.classList.remove('drag-over-folder');
    }
    
    // PRIORIDADE 1: Verificar se há linha indicadora (LINHA TEM PRIORIDADE ABSOLUTA)
    const parentContainer = folderHeader.parentNode;
    const allChildren = Array.from(parentContainer.children);
    const targetIndex = allChildren.indexOf(folderHeader);
    
    let insertBefore = false;
    let indicatorFound = false;
    
    // Verificar se há linha indicadora antes ou depois do header
    if (targetIndex > 0 && allChildren[targetIndex - 1]?.classList.contains('drag-indicator-line')) {
      insertBefore = true;
      indicatorFound = true;
    } else if (targetIndex < allChildren.length - 1 && allChildren[targetIndex + 1]?.classList.contains('drag-indicator-line')) {
      insertBefore = false;
      indicatorFound = true;
    }
    
    // Remover indicadores após determinar a posição
    removeAllDragIndicators();
    
    // PRIORIDADE 2: Se NÃO encontrou linha indicadora, usar posição do mouse como fallback
    if (!indicatorFound) {
      const rect = folderHeader.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const mouseY = e.clientY;
      insertBefore = mouseY < midpoint;
    }
    
    try {
      const { reorderFolders } = await import('./project-manager.js');
      const updatedFolders = await getAllFolders();
      
      // Ordenar pastas por ordem atual
      const folderIds = updatedFolders
        .map(f => f.id)
        .sort((a, b) => {
          const folderA = updatedFolders.find(f => f.id === a);
          const folderB = updatedFolders.find(f => f.id === b);
          return (folderA.order || 0) - (folderB.order || 0);
        });
      
      // Mover pasta arrastada para posição do alvo
      const draggedIndex = folderIds.indexOf(draggedFolderId);
      let targetIndex = folderIds.indexOf(targetFolderId);
      
      if (draggedIndex >= 0 && targetIndex >= 0 && draggedIndex !== targetIndex) {
        folderIds.splice(draggedIndex, 1);
        // Ajustar índice se estava depois do arrastado
        if (targetIndex > draggedIndex) {
          targetIndex--;
        }
        // Inserir antes ou depois baseado na posição
        if (insertBefore) {
          folderIds.splice(targetIndex, 0, draggedFolderId);
        } else {
          folderIds.splice(targetIndex + 1, 0, draggedFolderId);
        }
        
        await reorderFolders(folderIds);
        
        // Re-renderizar menu e grid
        const finalProjects = await getAllProjects();
        await renderSideMenu(finalProjects, activeProjectId);
        if (window.location.hash === '#/projects' || window.location.hash === '#') {
          await renderProjectsGrid(finalProjects, activeProjectId);
        }
      }
    } catch (error) {
      console.error('Erro ao reordenar pastas:', error);
      openAlert({
        title: 'Erro',
        message: 'Erro ao reordenar pastas. Tente novamente.',
        okText: 'OK'
      });
    }
  });
}

/**
 * Configura zona de drop para uma pasta (receber projetos)
 * IMPORTANTE: Esta função deve ser aplicada ao elemento completo da pasta, não ao header
 */
function setupFolderDropZone(folderElement, folderId, allProjects, activeProjectId) {
  folderElement.addEventListener('dragover', (e) => {
    // PRIORIDADE 1: Se estiver arrastando uma pasta, não processar aqui
    // Pastas não podem ser dropadas dentro de outras pastas
    if (window._draggingFolderId) {
      return; // Deixar setupFolderDragAndDrop lidar com isso (apenas reordenação)
    }
    
    // PRIORIDADE 2: Se estiver arrastando um projeto
    if (window._draggingProjectId) {
      e.preventDefault();
      // NÃO usar stopPropagation aqui - permite que projetos individuais também processem
      e.dataTransfer.dropEffect = 'move';
      folderElement.classList.add('drag-over-folder');
      
      // Mostrar linha indicadora dentro da pasta
      const folderProjectsList = folderElement.querySelector('.side-menu-folder-projects');
      if (folderProjectsList) {
        const projectItems = folderProjectsList.querySelectorAll('.side-menu-item[data-project-id]');
        
        // Verificar se o mouse está sobre algum projeto específico
        const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
        const projectItemBelow = elementBelow?.closest('.side-menu-item[data-project-id]');
        
        if (projectItemBelow) {
          // Se está sobre um projeto, deixar o handler do projeto lidar com a linha
          // Não fazer nada aqui
        } else if (projectItems.length === 0) {
          // Lista vazia - mostrar indicador no início
          removeAllDragIndicators();
          const indicator = document.createElement('div');
          indicator.className = 'drag-indicator-line';
          folderProjectsList.insertBefore(indicator, folderProjectsList.firstChild);
        } else {
          // Verificar se está sobre área vazia no final da lista ou entre projetos
          const rect = folderProjectsList.getBoundingClientRect();
          const mouseY = e.clientY;
          
          // Aumentar área sensível no final da lista (de 30px para 80px)
          // Isso facilita arrastar projetos para o final
          if (mouseY > rect.bottom - 80) {
            removeAllDragIndicators();
            const indicator = document.createElement('div');
            indicator.className = 'drag-indicator-line';
            folderProjectsList.appendChild(indicator);
          } else {
            // Tentar encontrar o projeto mais próximo e mostrar linha antes ou depois dele
            let closestItem = null;
            let closestDistance = Infinity;
            
            projectItems.forEach(item => {
              const itemRect = item.getBoundingClientRect();
              const itemMidpoint = itemRect.top + itemRect.height / 2;
              const distance = Math.abs(e.clientY - itemMidpoint);
              
              if (distance < closestDistance) {
                closestDistance = distance;
                closestItem = item;
              }
            });
            
            if (closestItem) {
              const itemRect = closestItem.getBoundingClientRect();
              const itemMidpoint = itemRect.top + itemRect.height / 2;
              
              if (e.clientY < itemMidpoint) {
                insertDragIndicator(closestItem, 'before');
              } else {
                insertDragIndicator(closestItem, 'after');
              }
            }
          }
        }
      } else {
        // Lista não existe (pasta colapsada ou vazia) - não mostrar indicador aqui
        // O drop funcionará mesmo sem a lista visível
      }
    }
  });
  
  folderElement.addEventListener('dragleave', (e) => {
    // Só remover se realmente saiu da pasta (não apenas entrou em um filho)
    if (!folderElement.contains(e.relatedTarget)) {
      folderElement.classList.remove('drag-over-folder');
      removeAllDragIndicators();
    }
  });
  
  folderElement.addEventListener('drop', async (e) => {
    // PRIORIDADE 1: Se estiver arrastando uma pasta, não processar aqui
    // Pastas NUNCA podem ser dropadas dentro de outras pastas
    if (window._draggingFolderId) {
      return; // Deixar setupFolderDragAndDrop lidar com isso (apenas reordenação)
    }
    
    // PRIORIDADE 2: Se estiver arrastando um projeto
    if (!window._draggingProjectId) {
      return; // Não é um projeto sendo arrastado
    }
    
    e.preventDefault();
    e.stopPropagation(); // Parar propagação para não processar em elementos filhos
    folderElement.classList.remove('drag-over-folder');
    
    const dragData = e.dataTransfer.getData('text/plain');
    if (!dragData || dragData.startsWith('folder:')) {
      removeAllDragIndicators();
      return; // Não é um projeto ou é uma pasta
    }
    
    const projectId = dragData;
    if (!projectId) {
      removeAllDragIndicators();
      return;
    }
    
    // IMPORTANTE: Verificar a posição da linha indicadora ANTES de remover
    const folderProjectsList = folderElement.querySelector('.side-menu-folder-projects');
    let indicatorPosition = null; // null = no final, 0 = no início, {projectId, insertAfter} = referência
    
    if (folderProjectsList) {
      const allChildren = Array.from(folderProjectsList.children);
      const lastChild = allChildren[allChildren.length - 1];
      const indicatorAtEnd = lastChild && lastChild.classList.contains('drag-indicator-line');
      
      // PRIORIDADE 1: Verificar se linha está no final (último elemento)
      if (indicatorAtEnd) {
        indicatorPosition = null; // null = inserir no final
      } else {
        // PRIORIDADE 2: Procurar linha indicadora em outros lugares
        const indicator = folderProjectsList.querySelector('.drag-indicator-line');
        if (indicator) {
          // Encontrar posição do indicador
          const indicatorIndex = allChildren.indexOf(indicator);
          
          if (indicatorIndex >= 0) {
            // Verificar o item antes e depois do indicador
            const prevItem = indicatorIndex > 0 ? allChildren[indicatorIndex - 1] : null;
            const nextItem = indicatorIndex < allChildren.length - 1 ? allChildren[indicatorIndex + 1] : null;
            
            if (indicatorIndex === 0) {
              // Indicador no início - inserir no início
              indicatorPosition = 0;
            } else if (prevItem && prevItem.dataset.projectId) {
              // Há um projeto antes do indicador
              // A linha está DEPOIS deste projeto, então inserir DEPOIS dele
              indicatorPosition = {
                projectId: prevItem.dataset.projectId,
                insertAfter: true
              };
            } else if (nextItem && nextItem.dataset.projectId) {
              // Há um projeto depois do indicador
              // A linha está ANTES deste projeto, então inserir ANTES dele
              indicatorPosition = {
                projectId: nextItem.dataset.projectId,
                insertAfter: false
              };
            } else {
              // Fallback: inserir no final
              indicatorPosition = null;
            }
          }
        } else {
          // Não há indicador visível, mas pode estar no final da lista
          // Verificar se o drop foi na área do final (últimos 80px)
          const rect = folderProjectsList.getBoundingClientRect();
          const mouseY = e.clientY;
          if (mouseY > rect.bottom - 80) {
            // Drop no final, indicatorPosition permanece null (será tratado como final)
            indicatorPosition = null;
          }
        }
      }
    }
    
    // Agora remover indicadores após capturar a posição
    removeAllDragIndicators();
    
    // Mover projeto para a pasta
    try {
      await moveProjectToFolder(projectId, folderId);
      
      // Se a pasta tem projetos, reordenar baseado na posição da linha indicadora
      // IMPORTANTE: Processar mesmo quando indicatorPosition === null (inserir no final)
      if (folderProjectsList) {
        const { reorderProjectsInFolder } = await import('./project-manager.js');
        const updatedProjects = await getAllProjects();
        const folderProjects = updatedProjects.filter(p => {
          const pFolderId = p.folderId || null;
          const compareFolderId = folderId === null || folderId === undefined ? null : folderId;
          return pFolderId === compareFolderId;
        });
        
        const projectIds = folderProjects
          .map(p => p.id)
          .sort((a, b) => {
            const projA = updatedProjects.find(p => p.id === a);
            const projB = updatedProjects.find(p => p.id === b);
            return (projA.order || 0) - (projB.order || 0);
          });
        
        const draggedIndex = projectIds.indexOf(projectId);
        
        if (draggedIndex >= 0) {
          projectIds.splice(draggedIndex, 1);
          
          // Inserir na posição indicada
          if (indicatorPosition === 0) {
            // Inserir no início
            projectIds.unshift(projectId);
          } else if (indicatorPosition && typeof indicatorPosition === 'object' && indicatorPosition.projectId) {
            // Encontrar o projeto de referência
            const targetIndex = projectIds.indexOf(indicatorPosition.projectId);
            if (targetIndex >= 0) {
              if (indicatorPosition.insertAfter) {
                // Inserir depois do projeto de referência
                projectIds.splice(targetIndex + 1, 0, projectId);
              } else {
                // Inserir antes do projeto de referência
                projectIds.splice(targetIndex, 0, projectId);
              }
            } else {
              // Fallback: adicionar no final
              projectIds.push(projectId);
            }
          } else {
            // indicatorPosition === null significa inserir no final
            projectIds.push(projectId);
          }
          
          await reorderProjectsInFolder(folderId, projectIds);
          
          // Re-renderizar menu
          const finalProjects = await getAllProjects();
          await renderSideMenu(finalProjects, activeProjectId);
          
          // Atualizar grid principal se estiver na tela de projetos
          if (window.location.hash === '#/projects' || window.location.hash === '#') {
            await renderProjectsGrid(finalProjects, activeProjectId);
          }
        }
      } else if (folderProjectsList) {
        // Não havia indicador, mas pode ser que a pasta esteja vazia ou o drop foi no final
        // Nesse caso, o projeto já foi movido para a pasta, só precisa reordenar se necessário
        const { reorderProjectsInFolder } = await import('./project-manager.js');
        const updatedProjects = await getAllProjects();
        const folderProjects = updatedProjects.filter(p => {
          const pFolderId = p.folderId || null;
          const compareFolderId = folderId === null || folderId === undefined ? null : folderId;
          return pFolderId === compareFolderId;
        });
        
        // Se há mais de um projeto, garantir ordem (adicionar no final)
        if (folderProjects.length > 1) {
          const projectIds = folderProjects
            .map(p => p.id)
            .sort((a, b) => {
              const projA = updatedProjects.find(p => p.id === a);
              const projB = updatedProjects.find(p => p.id === b);
              return (projA.order || 0) - (projB.order || 0);
            });
          
          // Se o projeto arrastado não está no final, movê-lo para o final
          const draggedIndex = projectIds.indexOf(projectId);
          if (draggedIndex >= 0 && draggedIndex !== projectIds.length - 1) {
            projectIds.splice(draggedIndex, 1);
            projectIds.push(projectId);
            await reorderProjectsInFolder(folderId, projectIds);
          }
        }
      }
      
      // Expandir pasta se estiver colapsada
      if (folderId !== null) {
        const expandedState = getFolderExpandedState();
        expandedState[folderId] = true;
        saveFolderExpandedState(expandedState);
      } else {
        const expandedState = getFolderExpandedState();
        expandedState['none'] = true;
        saveFolderExpandedState(expandedState);
      }
      
      // Re-renderizar menu
      const updatedProjects = await getAllProjects();
      await renderSideMenu(updatedProjects, activeProjectId);
      
      // Atualizar grid principal se estiver na tela de projetos
      if (window.location.hash === '#/projects' || window.location.hash === '#') {
        await renderProjectsGrid(updatedProjects, activeProjectId);
      }
    } catch (error) {
      console.error('Erro ao mover projeto:', error);
      openAlert({
        title: 'Erro',
        message: 'Erro ao mover projeto. Tente novamente.',
        okText: 'OK'
      });
    }
  });
}

/**
 * Configura drag-and-drop para reordenar pastas no grid principal
 * IMPORTANTE: Esta função deve ser aplicada apenas ao HEADER da pasta no grid
 */
function setupFolderDragAndDropGrid(folderHeader, folderId, allFolders, activeProjectId) {
  // Apenas o header é arrastável
  folderHeader.draggable = true;
  
  folderHeader.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `folder:${folderId}`);
    folderHeader.classList.add('dragging');
    // Armazenar globalmente
    window._draggingFolderId = folderId;
    window._draggingProjectId = null; // Limpar projeto se houver
  });
  
  folderHeader.addEventListener('dragend', (e) => {
    folderHeader.classList.remove('dragging');
    window._draggingFolderId = null;
    removeAllDragIndicators();
    // Remover highlights
    document.querySelectorAll('.drag-over-folder').forEach(el => el.classList.remove('drag-over-folder'));
  });
  
  folderHeader.addEventListener('dragover', (e) => {
    // Só processar se estiver arrastando uma pasta
    if (!window._draggingFolderId) {
      // Não é uma pasta sendo arrastada - deixar evento passar para elementos pais
      // NÃO fazer preventDefault nem stopPropagation aqui
      return;
    }
    
    // É uma pasta sendo arrastada - processar
    e.preventDefault();
    e.stopPropagation(); // Pastas não devem permitir drop de projetos nelas
    
    const draggedFolderId = window._draggingFolderId;
    const targetFolderId = folderHeader.dataset.folderId;
    
    // IMPORTANTE: Pastas só podem ser reordenadas (acima/abaixo), NUNCA dropadas dentro de outras
    // Se arrastando sobre o HEADER de outra pasta, permitir reordenar e mostrar linha
    if (targetFolderId && targetFolderId !== draggedFolderId) {
      e.dataTransfer.dropEffect = 'move';
      folderHeader.classList.add('drag-over-folder');
      
      // Mostrar linha indicadora (acima ou abaixo do header)
      const rect = folderHeader.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const mouseY = e.clientY;
      
      if (mouseY < midpoint) {
        insertDragIndicator(folderHeader, 'before');
      } else {
        insertDragIndicator(folderHeader, 'after');
      }
    }
  });
  
  folderHeader.addEventListener('dragleave', (e) => {
    // Só remover se realmente saiu (não apenas entrou em um filho)
    if (!folderHeader.contains(e.relatedTarget)) {
      folderHeader.classList.remove('drag-over-folder');
    }
  });
  
  folderHeader.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const dragData = e.dataTransfer.getData('text/plain');
    if (!dragData || !dragData.startsWith('folder:')) {
      return; // Não é uma pasta sendo arrastada
    }
    
    const draggedFolderId = dragData.replace('folder:', '');
    const targetFolderId = folderHeader.dataset.folderId;
    
    if (!targetFolderId || targetFolderId === draggedFolderId) {
      return; // Mesma pasta ou inválido
    }
    
    folderHeader.classList.remove('drag-over-folder');
    
    // PRIORIDADE 1: Verificar se há linha indicadora (LINHA TEM PRIORIDADE ABSOLUTA)
    const parentContainer = folderHeader.parentNode;
    const allChildren = Array.from(parentContainer.children);
    const targetIndex = allChildren.indexOf(folderHeader);
    
    let insertBefore = false;
    let indicatorFound = false;
    
    // Verificar se há linha indicadora antes ou depois do header
    if (targetIndex > 0 && allChildren[targetIndex - 1]?.classList.contains('drag-indicator-line')) {
      insertBefore = true;
      indicatorFound = true;
    } else if (targetIndex < allChildren.length - 1 && allChildren[targetIndex + 1]?.classList.contains('drag-indicator-line')) {
      insertBefore = false;
      indicatorFound = true;
    }
    
    // Remover indicadores após determinar a posição
    removeAllDragIndicators();
    
    // PRIORIDADE 2: Se NÃO encontrou linha indicadora, usar posição do mouse como fallback
    if (!indicatorFound) {
      const rect = folderHeader.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      const mouseY = e.clientY;
      insertBefore = mouseY < midpoint;
    }
    
    try {
      const { reorderFolders } = await import('./project-manager.js');
      const updatedFolders = await getAllFolders();
      
      // Ordenar pastas por ordem atual
      const folderIds = updatedFolders
        .map(f => f.id)
        .sort((a, b) => {
          const folderA = updatedFolders.find(f => f.id === a);
          const folderB = updatedFolders.find(f => f.id === b);
          return (folderA.order || 0) - (folderB.order || 0);
        });
      
      // Mover pasta arrastada para posição do alvo
      const draggedIndex = folderIds.indexOf(draggedFolderId);
      let targetIndex = folderIds.indexOf(targetFolderId);
      
      if (draggedIndex >= 0 && targetIndex >= 0 && draggedIndex !== targetIndex) {
        folderIds.splice(draggedIndex, 1);
        // Ajustar índice se estava depois do arrastado
        if (targetIndex > draggedIndex) {
          targetIndex--;
        }
        // Inserir antes ou depois baseado na posição
        if (insertBefore) {
          folderIds.splice(targetIndex, 0, draggedFolderId);
        } else {
          folderIds.splice(targetIndex + 1, 0, draggedFolderId);
        }
        
        await reorderFolders(folderIds);
        
        // Re-renderizar grid e menu
        const finalProjects = await getAllProjects();
        await renderProjectsGrid(finalProjects, activeProjectId);
        await renderSideMenu(finalProjects, activeProjectId);
      }
    } catch (error) {
      console.error('Erro ao reordenar pastas:', error);
      openAlert({
        title: 'Erro',
        message: 'Erro ao reordenar pastas. Tente novamente.',
        okText: 'OK'
      });
    }
  });
}

/**
 * Renderiza breadcrumb
 * @param {string} projectId - ID do projeto (null se na tela inicial)
 * @param {string} currentTab - Aba atual
 */
export async function renderBreadcrumb(projectId, currentTab = null) {
  const breadcrumb = document.getElementById('breadcrumb');
  if (!breadcrumb) return;
  
  if (!projectId) {
    // Tela inicial
    breadcrumb.innerHTML = '<span class="breadcrumb-item active">Projetos</span>';
    return;
  }
  
  const project = await getContest(projectId);
  if (!project) {
    breadcrumb.innerHTML = '<span class="breadcrumb-item active">Projetos</span>';
    return;
  }
  
  const tabLabels = {
    'upload': 'Upload',
    'rate': 'Avaliar',
    'contest': 'Contest',
    'results': 'Resultados',
    'settings': 'Projeto'
  };
  
  breadcrumb.innerHTML = `
    <a href="#/projects" class="breadcrumb-item">Projetos</a>
    <span class="breadcrumb-separator">›</span>
    <span class="breadcrumb-item active">${escapeHtml(project.name)}</span>
    ${currentTab ? `<span class="breadcrumb-separator">›</span><span class="breadcrumb-item active">${tabLabels[currentTab] || currentTab}</span>` : ''}
  `;
}

/**
 * Abre modal de edição de projeto
 * @param {Object} project - Projeto a editar
 * @returns {Promise<Object|null>} Dados atualizados ou null se cancelado
 */
export function openProjectEditModal(project) {
  return new Promise((resolve) => {
    const modal = document.getElementById('projectEditModal');
    if (!modal) {
      resolve(null);
      return;
    }
    
    const nameInput = modal.querySelector('#projectEditName');
    const descInput = modal.querySelector('#projectEditDescription');
    const cancelBtn = modal.querySelector('#projectEditCancel');
    const saveBtn = modal.querySelector('#projectEditSave');
    
    if (nameInput) nameInput.value = project.name || '';
    if (descInput) descInput.value = project.description || '';
    
    const cleanup = () => {
      cancelBtn?.removeEventListener('click', onCancel);
      saveBtn?.removeEventListener('click', onSave);
      modal.removeEventListener('click', onBackdropClick);
      document.removeEventListener('keydown', onKeyDown);
      modal.setAttribute('aria-hidden', 'true');
    };
    
    const onCancel = () => {
      cleanup();
      resolve(null);
    };
    
    const onSave = () => {
      const name = nameInput?.value.trim();
      if (!name) {
        openAlert({
          title: 'Campo obrigatório',
          message: 'Nome é obrigatório',
          okText: 'OK'
        });
        return;
      }
      
      cleanup();
      resolve({
        name,
        description: descInput?.value.trim() || ''
      });
    };
    
    const onBackdropClick = (e) => {
      if (e.target === modal) {
        onCancel();
      }
    };
    
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onSave();
      }
    };
    
    cancelBtn?.addEventListener('click', onCancel);
    saveBtn?.addEventListener('click', onSave);
    modal.addEventListener('click', onBackdropClick);
    document.addEventListener('keydown', onKeyDown);
    
    modal.setAttribute('aria-hidden', 'false');
    nameInput?.focus();
    nameInput?.select();
  });
}

/**
 * Abre modal de edição de nome de pasta
 * @param {string} currentName - Nome atual da pasta
 * @returns {Promise<string|null>} Novo nome ou null se cancelado
 */
export function openFolderEditModal(currentName) {
  return new Promise((resolve) => {
    const modal = document.getElementById('folderEditModal');
    if (!modal) {
      resolve(null);
      return;
    }
    
    const nameInput = modal.querySelector('#folderEditName');
    const cancelBtn = modal.querySelector('#folderEditCancel');
    const saveBtn = modal.querySelector('#folderEditSave');
    
    if (nameInput) nameInput.value = currentName || '';
    
    const cleanup = () => {
      cancelBtn?.removeEventListener('click', onCancel);
      saveBtn?.removeEventListener('click', onSave);
      modal.removeEventListener('click', onBackdropClick);
      document.removeEventListener('keydown', onKeyDown);
      modal.setAttribute('aria-hidden', 'true');
    };
    
    const onCancel = () => {
      cleanup();
      resolve(null);
    };
    
    const onSave = () => {
      const name = nameInput?.value.trim();
      if (!name) {
        openAlert({
          title: 'Campo obrigatório',
          message: 'Nome é obrigatório',
          okText: 'OK'
        });
        return;
      }
      
      if (name === currentName) {
        // Nome não mudou, apenas fechar
        cleanup();
        resolve(null);
        return;
      }
      
      cleanup();
      resolve(name);
    };
    
    const onBackdropClick = (e) => {
      if (e.target === modal) {
        onCancel();
      }
    };
    
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === 'Enter' && document.activeElement === nameInput) {
        // Enter no input salva (não é textarea, então Enter é seguro)
        e.preventDefault();
        onSave();
      }
    };
    
    cancelBtn?.addEventListener('click', onCancel);
    saveBtn?.addEventListener('click', onSave);
    modal.addEventListener('click', onBackdropClick);
    document.addEventListener('keydown', onKeyDown);
    
    modal.setAttribute('aria-hidden', 'false');
    nameInput?.focus();
    nameInput?.select();
  });
}

/**
 * Abre modal de criação de nova pasta
 * @returns {Promise<string|null>} Nome da pasta ou null se cancelado
 */
export function openFolderCreateModal() {
  return new Promise((resolve) => {
    const modal = document.getElementById('folderCreateModal');
    if (!modal) {
      resolve(null);
      return;
    }
    
    const nameInput = modal.querySelector('#folderCreateName');
    const cancelBtn = modal.querySelector('#folderCreateCancel');
    const saveBtn = modal.querySelector('#folderCreateSave');
    
    if (nameInput) nameInput.value = '';
    
    const cleanup = () => {
      cancelBtn?.removeEventListener('click', onCancel);
      saveBtn?.removeEventListener('click', onSave);
      modal.removeEventListener('click', onBackdropClick);
      document.removeEventListener('keydown', onKeyDown);
      modal.setAttribute('aria-hidden', 'true');
    };
    
    const onCancel = () => {
      cleanup();
      resolve(null);
    };
    
    const onSave = () => {
      const name = nameInput?.value.trim();
      if (!name) {
        openAlert({
          title: 'Campo obrigatório',
          message: 'Nome é obrigatório',
          okText: 'OK'
        });
        return;
      }
      
      cleanup();
      resolve(name);
    };
    
    const onBackdropClick = (e) => {
      if (e.target === modal) {
        onCancel();
      }
    };
    
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === 'Enter' && document.activeElement === nameInput) {
        // Enter no input salva (não é textarea, então Enter é seguro)
        e.preventDefault();
        onSave();
      }
    };
    
    cancelBtn?.addEventListener('click', onCancel);
    saveBtn?.addEventListener('click', onSave);
    modal.addEventListener('click', onBackdropClick);
    document.addEventListener('keydown', onKeyDown);
    
    modal.setAttribute('aria-hidden', 'false');
    nameInput?.focus();
  });
}

/**
 * Utilitário para escapar HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
