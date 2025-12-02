/**
 * import-folder-selector.js
 * Modal de seleção de pasta ao importar projeto
 * Sprint 5 - F5.3
 */

/**
 * Abre modal para seleção de pasta ao importar projeto
 * @param {Array} folders - Array de pastas disponíveis
 * @returns {Promise<string|null|'cancel'>} ID da pasta selecionada, null para "Sem pasta", 'cancel' se cancelado
 */
export function openFolderSelectorModal(folders) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'folderSelectorTitle');
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1100;
    `;
    
    modal.innerHTML = `
      <div class="dialog" style="max-width: 400px; width: 92vw;">
        <h3 id="folderSelectorTitle">Selecionar Pasta</h3>
        <p>Em qual pasta deseja importar este projeto?</p>
        <div class="folder-selector-list" style="max-height: 300px; overflow-y: auto; margin: 1rem 0; display: flex; flex-direction: column; gap: 0.5rem;">
          <button class="folder-option" data-folder-id="null" style="width: 100%; padding: 0.75rem; text-align: left; border: 1px solid var(--border-color, #333); background: var(--bg-secondary, #1a1a1e); color: var(--fg, #fff); cursor: pointer; border-radius: 4px; transition: background 0.2s;">
            <strong>Sem pasta</strong>
          </button>
          ${folders.map(folder => `
            <button class="folder-option" data-folder-id="${escapeHtml(folder.id)}" style="width: 100%; padding: 0.75rem; text-align: left; border: 1px solid var(--border-color, #333); background: var(--bg-secondary, #1a1a1e); color: var(--fg, #fff); cursor: pointer; border-radius: 4px; transition: background 0.2s;">
              <strong>${escapeHtml(folder.name)}</strong>
            </button>
          `).join('')}
        </div>
        <div class="actions" style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255, 255, 255, 0.1);">
          <button class="btn btn-secondary" id="cancelImportBtn">Cancelar</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Adicionar estilos de hover
    const style = document.createElement('style');
    style.textContent = `
      .folder-option:hover {
        background: var(--bg-elev, #242428) !important;
      }
      .folder-option:focus {
        outline: 2px solid var(--accent, #4a9eff);
        outline-offset: 2px;
      }
    `;
    document.head.appendChild(style);
    
    const closeModal = (result) => {
      document.body.removeChild(modal);
      document.head.removeChild(style);
      resolve(result);
    };
    
    // Handlers
    modal.querySelectorAll('.folder-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const folderId = btn.dataset.folderId === 'null' ? null : btn.dataset.folderId;
        closeModal(folderId);
      });
    });
    
    const cancelBtn = modal.querySelector('#cancelImportBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        closeModal('cancel');
      });
    }
    
    // Fechar ao clicar no overlay
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal('cancel');
      }
    });
    
    // Fechar com ESC
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        closeModal('cancel');
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);
    
    // Focar no primeiro botão
    const firstOption = modal.querySelector('.folder-option');
    if (firstOption) {
      setTimeout(() => firstOption.focus(), 100);
    }
  });
}

/**
 * Escapa HTML para prevenir XSS
 * @param {string} text - Texto a escapar
 * @returns {string} Texto escapado
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
