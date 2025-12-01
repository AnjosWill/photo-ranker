/**
 * app.js - Photo Ranker MVP
 * Lógica principal da aplicação - Orquestração e UI
 * 
 * Features implementadas:
 * - Upload, grid, viewer, multi-select
 * - Detecção 2×2, cropper, zoom/pan
 * - Rating por estrelas, filtros, ordenação, aba "Avaliar"
 * - Contest Mode com sistema Elo-Based Non-Repeat Pairwise Ranking (Sprint 4)
 * 
 * Módulos:
 * - modules/contest/contest-manager.js: Gerenciamento de ciclo de vida
 * - modules/contest/contest-state.js: Validação e manipulação de estado
 * - modules/contest/contest-battle.js: Renderização e interação de batalhas
 * - modules/contest/contest-results.js: Exibição de resultados e rankings
 */

import { $, on } from "./ui.js";
import { calculateScoresAndTiers, calculateEloRange, normalizeEloToScore, getTierFromScore, TIERS } from "./tiers.js";
import { savePhotos, getAllPhotos, clearAll } from "./db.js";
import { filesToThumbs } from "./image-utils.js";
import { openCropper } from "./cropper.js";
import { createStarRating, updateStarRating } from "./rating.js";
import { 
  initializeEloScores, 
  updateEloScores
} from "./elo.js";
import { 
  startContest as startContestManager, 
  finishContest as finishContestManager, 
  saveContestState as saveContestStateManager, 
  loadContestState as loadContestStateManager 
} from "./modules/contest/contest-manager.js";
import {
  calculatePhotoStats as calculatePhotoStatsState,
  calculateRankingFromStats,
  validateContestState as validateContestStateState
} from "./modules/contest/contest-state.js";
import { createBattleModule } from "./modules/contest/contest-battle.js";
import { createResultsModule } from "./modules/contest/contest-results.js";

const MAX_SIZE_MB = 15;
const MAX_FILES_PER_BATCH = 300;
const ACCEPTED_TYPES = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i;

const routes = ["upload", "rate", "contest", "results"];

let confirmOpen = false;
let isResultsViewMode = false;
let resultsRankingList = [];

let currentFilter = 'all';
let currentSort = 'date-desc';
let allPhotos = [];
let rateViewIndex = 0;
let rateViewPhotos = [];
let rateViewOnlyUnrated = false;

let contestState = null;

// Módulos de Contest
let battleModule = null;
let resultsModule = null;

// Opções de ordenação
const SORT_OPTIONS = {
  'date-desc': { label: '📅 Data (mais recente)', fn: (a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0) },
  'date-asc': { label: '📅 Data (mais antiga)', fn: (a, b) => (a.uploadedAt || 0) - (b.uploadedAt || 0) },
  'rating-desc': { label: '⭐ Avaliação (maior)', fn: (a, b) => (b.rating || 0) - (a.rating || 0) },
  'rating-asc': { label: '⭐ Avaliação (menor)', fn: (a, b) => (a.rating || 0) - (b.rating || 0) },
  'size-desc': { label: '📦 Tamanho (maior)', fn: (a, b) => (b.w * b.h) - (a.w * a.h) },
  'size-asc': { label: '📦 Tamanho (menor)', fn: (a, b) => (a.w * a.h) - (b.w * b.h) },
  'dimension-desc': { label: '📏 Dimensão (maior)', fn: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) },
  'dimension-asc': { label: '📏 Dimensão (menor)', fn: (a, b) => Math.max(a.w, a.h) - Math.max(b.w, b.h) }
};

function setActiveRoute(name) {
  routes.forEach((r) => {
    const el = document.querySelector(`[data-route="${r}"]`);
    el.classList.toggle("active", r === name);
  });
  // tabs aria-selected
  document.querySelectorAll(".tabs a").forEach((a) => {
    a.setAttribute("aria-selected", a.getAttribute("href") === `#/${name}`);
  });
}

function router() {
  const hash = location.hash.replace("#/", "") || "upload";
  setActiveRoute(routes.includes(hash) ? hash : "upload");
}
window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", async () => {
  router();
  initUpload();
  initFilters();
  initRateView();
  
  // Inicializar módulos de Contest
  initializeContestModules();
  
  initContestView();
  initResultsView();
  
  const selectBtn = document.getElementById("selectModeBtn");
  selectBtn?.addEventListener("click", () => toggleSelectionMode());

  document.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    const typing =
      ["INPUT", "TEXTAREA", "SELECT"].includes(tag) ||
      (e.target && e.target.isContentEditable);
    if (typing) return;

    if (e.key?.toLowerCase() === "s") {
      e.preventDefault();
      toggleSelectionMode();
    }

    if (e.key === "Escape" && (selectionMode || selectedIds.size > 0)) {
      e.preventDefault();
      toggleSelectionMode(false); // ⬅️ sai do modo e limpa seleção
    }
    
    // Atalhos de rating (1-5, 0) - Globais
    // Apenas quando não está digitando E não está no viewer (viewer tem seus próprios handlers)
    const viewerOpen = $('#viewer')?.getAttribute('aria-hidden') === 'false';
    if (!viewerOpen && !typing && e.key >= '0' && e.key <= '5') {
      // Tentar avaliar foto em foco no grid
      const focusedCard = document.activeElement?.closest('.photo-card');
      if (focusedCard) {
        const photoId = focusedCard.dataset.id;
        const rating = parseInt(e.key, 10);
        setPhotoRating(photoId, rating);
      }
    }
  });

  allPhotos = await getAllPhotos();
  
  // Carregar ordenação salva do localStorage
  const savedSort = localStorage.getItem('photoranker-sort');
  if (savedSort && SORT_OPTIONS[savedSort]) {
    currentSort = savedSort;
  }
  
  renderGrid(allPhotos);
  updateFilterCounts(); // Atualizar contadores dos filtros
  updateSortSelect(); // Atualizar select de ordenação
});

function toggleSelectionMode(force) {
  selectionMode = typeof force === "boolean" ? force : !selectionMode;

  // aplica/retira classe global (controla visibilidade de checks/✕)
  document.body.classList.toggle("selection-mode", selectionMode);

  // saindo do modo → limpa seleção
  if (!selectionMode) selectedIds.clear();

  updateSelectBtn();
  updateMultiBar();

  // re-render garante remoção de .selected e esconde select-mark
  (async () => renderGrid(await getAllPhotos()))();
}

function updateSelectBtn() {
  const btn = document.getElementById("selectModeBtn");
  if (btn) {
    btn.setAttribute("aria-pressed", selectionMode ? "true" : "false");
    btn.textContent = selectionMode ? "Selecionando…" : "Selecionar";
  }
  const clear = document.getElementById("clearAll");
  if (clear) {
    if (selectionMode) {
      clear.textContent = "Remover selecionadas";
      clear.setAttribute("aria-label", "Remover imagens selecionadas");
    } else {
      clear.textContent = "Limpar";
      clear.setAttribute("aria-label", "Limpar todas as imagens");
    }
  }
}

document.addEventListener("keydown", (e) => {
  const tag = (e.target && e.target.tagName) || "";
  const typing =
    ["INPUT", "TEXTAREA", "SELECT"].includes(tag) ||
    (e.target && e.target.isContentEditable);
  if (typing) return;
  if (
    e.key &&
    e.key.toLowerCase() === "u" &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey
  ) {
    e.preventDefault();
    document.getElementById("fileInput").click();
  }
});

function initUpload() {
  const drop = $("#dropzone");
  const input = $("#fileInput");
  const label = input.closest("label"); // <label class="btn"> ... <input .../>

  drop.addEventListener("click", (e) => {
    // Se clicou em algo que NÃO é o label, aí sim abrimos o seletor
    if (!e.target.closest("label")) {
      input.click();
    }
  });

  // 2) Garanta que cliques no label NÃO borbulhem para a dropzone
  if (label) {
    label.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  // 3) Change handler
  input.addEventListener("change", async (e) => {
    await handleFiles(e.target.files);
    // Permite re-selecionar o MESMO arquivo novamente
    e.target.value = "";
  });

  // Drag & drop (mantido)
  ["dragenter", "dragover"].forEach((evt) =>
    drop.addEventListener(
      evt,
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        drop.style.borderColor = "#9f7aea";
      },
      { passive: false }
    )
  );

  ["dragleave", "drop"].forEach((evt) =>
    drop.addEventListener(
      evt,
      (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        drop.style.borderColor = "#5a5a66";
      },
      { passive: false }
    )
  );

  drop.addEventListener(
    "drop",
    (ev) => {
      const dt = ev.dataTransfer;
      if (dt?.files?.length) handleFiles(dt.files);
    },
    { passive: false }
  );

  // Limpar fotos (respeitando filtro ativo)
  $("#clearAll").addEventListener("click", async () => {
    if (selectedIds && selectedIds.size > 0) {
      // usa a função que já sai do modo após remover
      await removeSelected();
      return;
    }

    // sem seleção → modal para apagar fotos do filtro ativo
    const allPhotos = await getAllPhotos();
    let visiblePhotos = allPhotos.filter(p => !p._isSplit);
    
    // Aplicar ordenação ativa
    const sortFn = SORT_OPTIONS[currentSort]?.fn || SORT_OPTIONS['date-desc'].fn;
    visiblePhotos.sort(sortFn);
    
    const photosToDelete = applyCurrentFilter(visiblePhotos);
    
    if (photosToDelete.length === 0) {
      toast("Nenhuma foto para remover no filtro atual.");
      return;
    }
    
    // Mensagem contextual baseada no filtro
    let filterName = "todas as";
    let confirmMessage = "";
    
    if (currentFilter === 'rated5') {
      filterName = "com ⭐ 5 estrelas";
      confirmMessage = `Esta ação removerá ${photosToDelete.length} foto(s) ${filterName}.`;
    } else if (currentFilter === 'unrated') {
      filterName = "não avaliadas";
      confirmMessage = `Esta ação removerá ${photosToDelete.length} foto(s) ${filterName}.`;
    } else {
      filterName = "todas";
      confirmMessage = `Esta ação removerá TODAS as ${photosToDelete.length} fotos do projeto.`;
    }
    
    openConfirm({
      title: `Limpar ${photosToDelete.length} foto(s)?`,
      message: confirmMessage,
      confirmText: "Remover",
      onConfirm: async () => {
        // Marcar fotos para deletar
        const toDelete = photosToDelete.map(p => ({ ...p, _delete: true }));
        await savePhotos(toDelete);
        
        toggleSelectionMode(false); // garante modo normal
        renderGrid(await getAllPhotos());
        toast(`${photosToDelete.length} foto(s) removidas (${filterName}).`);
      },
    });
  });
}

async function handleFiles(fileList) {
  try {
    let files = [...fileList];
    if (files.length > MAX_FILES_PER_BATCH) {
      toast(
        `Limite de ${MAX_FILES_PER_BATCH} arquivos por lote. Carregando os primeiros...`
      );
      files = files.slice(0, MAX_FILES_PER_BATCH);
    }
    const valid = [];
    const rejected = [];
    for (const f of files) {
      const okType = ACCEPTED_TYPES.test(f.type) || /^image\//i.test(f.type);
      const okSize = f.size <= MAX_SIZE_MB * 1024 * 1024;
      if (okType && okSize) valid.push(f);
      else
        rejected.push({ name: f.name, reason: !okType ? "tipo" : "tamanho" });
    }
    if (rejected.length) {
      const tipos = rejected.filter((r) => r.reason === "tipo").length;
      const tamanhos = rejected.filter((r) => r.reason === "tamanho").length;
      toast(
        `Ignorados: ${rejected.length} (tipo inválido: ${tipos}, muito grandes: ${tamanhos})`
      );
    }
    if (!valid.length) {
      toast("Nenhuma imagem válida.");
      return;
    }

    showProgress(true);

    let lastPercent = 0;
    const newPhotos = await filesToThumbs(valid, {
      onProgress: ({ current, total, totalPercent }) => {
        if (totalPercent !== lastPercent) {
          lastPercent = totalPercent;
          updateProgress(
            `Processando ${current} de ${total} imagens…`,
            totalPercent
          );
        }
      },
    });
    const unsupported = Array.isArray(newPhotos._unsupported)
      ? newPhotos._unsupported
      : [];
    if (newPhotos.length === 0 && unsupported.length > 0) {
      toast(`Formato não suportado (ex.: HEIC). Converta para JPEG/PNG.`);
      showProgress(false);
      return;
    }
    if (unsupported.length > 0) {
      toast(
        `${unsupported.length} arquivo(s) não suportados (ex.: HEIC). Converta para JPEG/PNG.`
      );
    }

    // Análise de imagens 2×2 via worker
    updateProgress("Analisando imagens para detecção 2×2...", 90);
    const { normalPhotos, quadCandidates } = await analyzePhotosForQuad(newPhotos);
    
    // Salvar fotos normais imediatamente
    if (normalPhotos.length > 0) {
      await savePhotos(normalPhotos);
    }
    
    showProgress(false);
    
    // Processar candidatas 2×2 sequencialmente
    if (quadCandidates.length > 0) {
      const splitResults = await processCropQueue(quadCandidates);
      renderGrid(await getAllPhotos());
      
      const totalAdded = normalPhotos.length + splitResults.totalQuadrants;
      toast(`${totalAdded} imagem(ns) adicionadas (${splitResults.splitCount} divididas em 2×2).`);
    } else {
    renderGrid(await getAllPhotos());
    toast(`${newPhotos.length} imagem(ns) adicionadas.`);
    }
  } catch (err) {
    console.error(err);
    toast("Erro ao processar imagens. Veja o Console para detalhes.");
  } finally {
    showProgress(false);
  }
}

/**
 * Analisa fotos via worker para detectar padrão 2×2
 */
async function analyzePhotosForQuad(photos) {
  const normalPhotos = [];
  const quadCandidates = [];
  
  // Criar workers para análise paralela
  const analyses = photos.map(photo => analyzePhoto(photo));
  const results = await Promise.all(analyses);
  
  results.forEach(({ photo, isQuad, analysis }) => {
    if (isQuad) {
      quadCandidates.push({ photo, analysis });
    } else {
      normalPhotos.push(photo);
    }
  });
  
  return { normalPhotos, quadCandidates };
}

/**
 * Analisa uma foto individual via worker
 */
function analyzePhoto(photo) {
  return new Promise((resolve) => {
    let workerResolved = false;
    
    try {
      const worker = new Worker('./scripts/quad-worker.js');
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        
        worker.postMessage({
          imageData: imageData.data,
          id: photo.id,
          width: img.width,
          height: img.height
        });
        
        worker.onmessage = (e) => {
          if (workerResolved) return;
          workerResolved = true;
          worker.terminate();
          resolve({
            photo,
            isQuad: e.data.isQuad,
            analysis: e.data
          });
        };
        
        worker.onerror = (err) => {
          if (workerResolved) return;
          workerResolved = true;
          console.error(`Erro no worker de análise:`, err);
          worker.terminate();
          resolve({ photo, isQuad: false, analysis: null });
        };
        
        // Timeout de segurança (500ms)
        setTimeout(() => {
          if (workerResolved) return;
          workerResolved = true;
          worker.terminate();
          resolve({ photo, isQuad: false, analysis: null });
        }, 500);
      };
      
      img.onerror = () => {
        resolve({ photo, isQuad: false, analysis: null });
      };
      
      img.src = photo.thumb;
      
    } catch (error) {
      console.error(`Erro ao criar worker de análise:`, error);
      resolve({ photo, isQuad: false, analysis: null });
    }
  });
}

/**
 * Restaura foto original removendo todas as fotos cortadas
 * @param {Object} croppedPhoto - Uma das fotos cortadas (com _parentId)
 */
async function handleRevert(croppedPhoto) {
  if (!croppedPhoto._parentId) return;
  
  try {
    const allPhotos = await getAllPhotos();
    const parentId = croppedPhoto._parentId;
    
    // Encontrar foto original
    const originalPhoto = allPhotos.find(p => p.id === parentId);
    if (!originalPhoto) {
      toast('Erro: Foto original não encontrada.');
      return;
    }
    
    // Encontrar todas as fotos irmãs (com mesmo _parentId)
    const siblings = allPhotos.filter(p => p._parentId === parentId);
    
    // Confirmar ação com o usuário
    return new Promise((resolve) => {
      openConfirm({
        title: 'Restaurar foto original?',
        message: `Isso irá remover as ${siblings.length} fotos cortadas e restaurar a imagem original.`,
        confirmText: 'Restaurar',
        onConfirm: async () => {
          try {
            // Remover todas as fotos cortadas
            const photosToDelete = siblings.map(p => ({ ...p, _delete: true }));
            
            // Restaurar original (remover flag _isSplit)
            const restoredOriginal = { ...originalPhoto, _isSplit: false };
            
            // Salvar alterações
            await savePhotos([...photosToDelete, restoredOriginal]);
            
            // Re-renderizar grid mantendo foco na foto restaurada
            const updatedPhotos = await getAllPhotos();
            renderGrid(updatedPhotos, restoredOriginal.id);
            
            toast(`Foto original restaurada. ${siblings.length} cortes removidos.`);
            resolve(true);
          } catch (err) {
            console.error('Erro ao restaurar foto:', err);
            toast('Erro ao restaurar foto.');
            resolve(false);
          }
        },
        onCancel: () => resolve(false)
      });
    });
    
  } catch (err) {
    console.error('Erro na reversão:', err);
    toast('Erro ao reverter foto.');
  }
}

/**
 * Divisão manual de uma foto em 2×2 (botão na galeria)
 * @returns {Array|null} Array com as novas fotos se confirmado, null se cancelado
 */
async function handleManualSplit(photo) {
  try {
    const imageSource = photo.dataURL || photo.thumb;
    
    if (!imageSource) {
      toast('Erro: Imagem não encontrada.');
      return null;
    }
    
    // Abrir cropper e aguardar resultado (sem sugerir regiões - divisão manual)
    const quadrants = await openCropper(imageSource);
    
    if (!quadrants || quadrants.length === 0) {
      return null; // Cancelado pelo usuário
    }
    
    // Preparar novas fotos (4 quadrantes)
    const newPhotos = quadrants.map((q, i) => ({
      id: crypto.randomUUID(),
      dataURL: q.dataURL,
      thumb: q.dataURL,
      w: q.width,
      h: q.height,
      uploadedAt: Date.now() + i,
      rating: null,
      _parentId: photo.id,
      _quadrant: q.quadrant
    }));
    
    // Marcar original como dividida
    const updatedOriginal = { ...photo, _isSplit: true };
    
    // Salvar tudo: original atualizada + 4 novas
    await savePhotos([updatedOriginal, ...newPhotos]);
    
    // Re-renderizar grid mantendo foco na primeira foto cortada
    renderGrid(await getAllPhotos(), newPhotos[0].id);
    
    toast(`Foto dividida manualmente em 4 quadrantes.`);
    
    return newPhotos;
    
  } catch (err) {
    console.error('Erro ao dividir foto:', err);
    toast('Erro ao dividir foto.');
    return null;
  }
}

async function processCropQueue(candidates) {
  let splitCount = 0;
  let totalQuadrants = 0;
  
  for (let i = 0; i < candidates.length; i++) {
    const { photo, analysis } = candidates[i];
    
    // Mostrar progresso
    if (candidates.length > 1) {
      toast(`Ajustando imagem ${i + 1} de ${candidates.length}...`);
    } else {
      toast(`Imagem 2×2 detectada. Ajuste o corte.`);
    }
    
    try {
      // Converter thumb para Blob
      const response = await fetch(photo.thumb);
      const blob = await response.blob();
      
      // Abrir cropper e aguardar usuário
      const quadrants = await openCropper(blob, analysis.suggestedRegions);
      
      if (quadrants && quadrants.length === 4) {
        // Usuário confirmou: salvar 4 fotos
        const quadrantPhotos = quadrants.map(({ dataURL, width, height, quadrant }, idx) => ({
          id: crypto.randomUUID(),
          dataURL: dataURL,
          thumb: dataURL,
          w: width,
          h: height,
          uploadedAt: Date.now() + idx,
          rating: null,
          _parentId: photo.id,
          _quadrant: quadrant
        }));
        
        // Marcar original como dividida
        photo._isSplit = true;
        
        // Salvar original (oculta) e quadrantes
        await savePhotos([photo, ...quadrantPhotos]);
        
        splitCount++;
        totalQuadrants += 4;
      } else {
        // Usuário cancelou: salvar original normalmente
        await savePhotos([photo]);
      }
    } catch (error) {
      console.error('Erro ao processar cropper:', error);
      // Em caso de erro, salvar original
      await savePhotos([photo]);
    }
  }
  
  return { splitCount, totalQuadrants };
}

// Helpers de progresso
function showProgress(show) {
  const el = document.getElementById("progress");
  el?.setAttribute("aria-hidden", show ? "false" : "true");
  if (show) updateProgress("Iniciando…", 0);
}
function updateProgress(text, pct) {
  const t = document.getElementById("progressText");
  const b = document.getElementById("progressBar");
  if (t) t.textContent = text;
  if (b) b.style.width = `${Math.max(0, Math.min(100, pct || 0))}%`;
}

let selectionMode = false;
let selectedIds = new Set();

function renderGrid(photos, keepFocusOnPhotoId = null) {
  // Salvar posição atual do scroll ANTES de qualquer modificação
  const savedScrollTop = window.pageYOffset || document.documentElement.scrollTop;
  
  // Atualizar cache global
  allPhotos = photos;
  
  // Filtrar fotos divididas (originais com _isSplit)
  let visiblePhotos = photos.filter(p => !p._isSplit);
  
  // Aplicar ordenação ativa
  const sortFn = SORT_OPTIONS[currentSort]?.fn || SORT_OPTIONS['date-desc'].fn;
  visiblePhotos.sort(sortFn);
  
  // Aplicar filtro ativo
  const filteredPhotos = applyCurrentFilter(visiblePhotos);
  
  // Toast se filtro vazio (mas há fotos no total)
  if (filteredPhotos.length === 0 && visiblePhotos.length > 0) {
    if (currentFilter === 'rated5') {
      toast('Nenhuma foto com 5 estrelas ainda.');
    } else if (currentFilter === 'unrated') {
      toast('Todas as fotos já foram avaliadas!');
    }
  }
  
  const grid = $("#grid");
  grid.innerHTML = "";
  $("#countInfo").textContent = `${filteredPhotos.length} imagens`;

  // habilita ou desabilita o botão "Limpar" conforme existência de fotos
  const clearBtn = $("#clearAll");
  if (clearBtn) clearBtn.disabled = filteredPhotos.length === 0;

  visiblePhotos = filteredPhotos; // Usar lista filtrada
  
  visiblePhotos.forEach((p, idx) => {
    const badges = [];
    // Badge "Cortado" para fotos geradas por divisão 2×2
    if (p._parentId)
      badges.push('<span class="badge badge-split">Cortado</span>');
    // Badge de rating (quando implementado)
    if (typeof p.rating === "number" && p.rating > 0)
      badges.push(`<span class="badge badge-rated">★ ${p.rating}</span>`);
    // Badge "Novo" para fotos sem rating (independente se é cortada ou não)
    if (!p.rating) 
      badges.push('<span class="badge badge-new">Novo</span>');

    const card = document.createElement("article");
    card.className = "photo-card";
    card.dataset.id = p.id;
    card.tabIndex = 0;
    // Marcar se está avaliada para controlar opacidade das estrelas
    if (p.rating > 0) card.dataset.rated = "true";
    if (selectedIds.has(p.id)) card.classList.add("selected");
    
    // Decidir botão de ação: Dividir ou Restaurar
    const isCropped = !!p._parentId;
    const actionButton = isCropped ? `
      <button class="icon-btn revert-btn" data-tooltip="Restaurar foto original" aria-label="Restaurar original" data-action="revert">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
          <path d="M3 3v5h5"></path>
        </svg>
      </button>
    ` : `
      <button class="icon-btn split-btn" data-tooltip="Dividir manualmente em 2×2" aria-label="Dividir em 2×2" data-action="split">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="8" height="8" rx="1"/>
          <rect x="13" y="3" width="8" height="8" rx="1"/>
          <rect x="3" y="13" width="8" height="8" rx="1"/>
          <rect x="13" y="13" width="8" height="8" rx="1"/>
        </svg>
      </button>
    `;
    
    card.innerHTML = `
      <img src="${
        p.thumb
      }" alt="Foto importada" loading="lazy" decoding="async">
      <div class="photo-meta">${Math.round(p.w)}×${Math.round(p.h)}</div>
      <div class="photo-actions">
        ${actionButton}
        <button class="icon-btn remove-btn" data-tooltip="Remover" aria-label="Remover" data-action="remove"><span class="x">✕</span></button>
      </div>
      <div class="photo-badges">${badges.join("")}</div>
    `;
    
    // Adicionar estrelas de rating
    const ratingContainer = document.createElement("div");
    ratingContainer.className = "photo-rating";
    const starRating = createStarRating(p.rating || 0, (newRating) => {
      setPhotoRating(p.id, newRating);
    });
    ratingContainer.appendChild(starRating);
    card.appendChild(ratingContainer);

    const mark = document.createElement("div");
    mark.className = "select-mark";
    mark.textContent = selectedIds.has(p.id) ? "✓" : "";
    card.appendChild(mark);

    // abrir viewer OU selecionar, conforme modo
    card.addEventListener("click", (ev) => {
      // Ignorar cliques em botões de ação e estrelas
      if (ev.target.closest(".icon-btn") || ev.target.closest(".star-rating")) return;

      if (selectionMode) {
        // toggle seleção
        toggleSelect(p.id, ev);
      } else {
        // ação primária: abrir viewer usando o ID da foto (não o índice)
        openViewerByPhotoId(p.id);
      }
    });

    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        if (selectionMode) toggleSelect(p.id, ev);
        else openViewerByPhotoId(p.id);
      }
    });

    // dividir manualmente em 2×2
    const splitBtn = card.querySelector(".split-btn");
    if (splitBtn) {
      splitBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await handleManualSplit(p);
      });
    }
    
    // restaurar foto original (reverter corte)
    const revertBtn = card.querySelector(".revert-btn");
    if (revertBtn) {
      revertBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await handleRevert(p);
      });
    }

    // remover individual (sem afetar seleção)
    const removeBtn = card.querySelector(".remove-btn");
    removeBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      card.classList.add("removing");
      removeBtn.innerHTML = '<span class="spinner" aria-hidden="true"></span>';
      try {
        await savePhotos([{ ...p, _delete: true }]);
        renderGrid(await getAllPhotos());
        toast("Imagem removida.");
      } catch {
        card.classList.remove("removing");
        removeBtn.innerHTML = '<span class="x">✕</span>';
        toast("Falha ao remover.");
      }
    });

    grid.appendChild(card);
    if (selectedIds.has(p.id)) card.classList.add("selected");
  });

  // Restaurar scroll e foco após renderização
  requestAnimationFrame(() => {
    if (keepFocusOnPhotoId) {
      // Manter foco na foto específica
      const targetCard = document.querySelector(`.photo-card[data-id="${keepFocusOnPhotoId}"]`);
      if (targetCard) {
        // Calcular posição antes de scrollar
        const rect = targetCard.getBoundingClientRect();
        const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const targetPosition = rect.top + currentScrollTop - 100; // 100px de offset do topo
        
        // Scroll até a posição
        window.scrollTo({
          top: Math.max(0, targetPosition),
          behavior: 'auto'
        });
        
        // Opcional: fazer o card piscar brevemente para indicar onde está
        targetCard.style.transition = 'box-shadow 0.3s ease';
        targetCard.style.boxShadow = '0 0 0 3px rgba(106, 163, 255, 0.6)';
        setTimeout(() => {
          targetCard.style.boxShadow = '';
        }, 600);
      }
    } else {
      // Restaurar scroll original
      window.scrollTo(0, savedScrollTop);
      
      // Focar primeiro card se não estiver em modo seleção
  const first = !selectionMode && grid.querySelector(".photo-card");
      if (first && savedScrollTop === 0) {
        // Apenas focar se estava no topo (comportamento original)
        first.focus();
      }
    }
  });
  
  updateMultiBar();
}

function toggleSelect(id, ev) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  const card = document.querySelector(`.photo-card[data-id="${id}"]`);
  if (card) card.classList.toggle("selected");
  const mark = card.querySelector(".select-mark");
  if (mark) mark.textContent = selectedIds.has(id) ? "✓" : "";
  updateMultiBar();
}

function updateMultiBar() {
  const bar = $("#multiBar");
  const count = $("#multiCount");
  if (selectedIds.size > 0) {
    bar.setAttribute("aria-hidden", "false");
    count.textContent = `${selectedIds.size} selecionada${
      selectedIds.size > 1 ? "s" : ""
    }`;
  } else {
    bar.setAttribute("aria-hidden", "true");
  }
}

async function removeSelected() {
  if (!selectedIds.size) return;

  const ids = Array.from(selectedIds);
  const all = await getAllPhotos();
  const toDelete = all
    .filter((p) => ids.includes(p.id))
    .map((p) => ({ ...p, _delete: true }));

  await savePhotos(toDelete);

  // limpa seleção e sai do modo
  selectedIds.clear();
  toggleSelectionMode(false); // ⬅️ sai do modo e ajusta UI (labels/botões)
  
  // Re-renderizar mantendo scroll (sem keepFocusOnPhotoId, usa savedScrollTop)
  renderGrid(await getAllPhotos());
  
  toast(`${toDelete.length} imagem(ns) removida(s).`);
}

// botões da multi-bar
$("#multiRemove").addEventListener("click", removeSelected);

$("#multiClear").addEventListener("click", () => {
  toggleSelectionMode(false);
});

// feedback simples
let toastTimer = null;
function toast(msg) {
  clearTimeout(toastTimer);
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = "1";
  toastTimer = setTimeout(() => (t.style.opacity = "0"), 1800);
}

let currentIndex = -1;
let currentList = [];

/**
 * Abre viewer pelo ID da foto (mais confiável que usar índice)
 */
async function openViewerByPhotoId(photoId) {
  // Limpar modo resultados se estiver ativo
  if (isResultsViewMode) {
    isResultsViewMode = false;
    resultsRankingList = [];
    const v = document.getElementById("viewer");
    if (v) {
      v.classList.remove("results-mode");
      const infoElement = document.getElementById("viewerResultsInfo");
      if (infoElement) infoElement.remove();
    }
  }
  
  // Garantir que botões estejam visíveis ao abrir viewer na aba Upload
  showViewerButtons();
  
  const allPhotos = await getAllPhotos();
  // Aplicar mesma ordenação e filtro do grid
  let visiblePhotos = allPhotos.filter(p => !p._isSplit);
  const sortFn = SORT_OPTIONS[currentSort]?.fn || SORT_OPTIONS['date-desc'].fn;
  visiblePhotos.sort(sortFn);
  currentList = applyCurrentFilter(visiblePhotos);
  
  if (!currentList.length) return;
  
  // Encontrar índice da foto pelo ID
  const index = currentList.findIndex(p => p.id === photoId);
  if (index < 0) return; // Foto não encontrada na lista filtrada
  
  currentIndex = index;
  const v = document.getElementById("viewer");
  const img = document.getElementById("viewerImg");
  img.src = currentList[currentIndex].thumb;
  v.setAttribute("aria-hidden", "false");
  // teclas
  document.addEventListener("keydown", viewerKeys);
  // resetar zoom ao abrir/trocar imagem
  resetZoom();
  // atualizar botão dividir/restaurar
  updateViewerSplitButton();
  // Atualizar estrelas de rating
  updateViewerRating();
}

/**
 * Abre viewer pelo índice (mantido para compatibilidade)
 */
async function openViewer(index) {
  // Limpar modo resultados se estiver ativo
  if (isResultsViewMode) {
    isResultsViewMode = false;
    resultsRankingList = [];
    const v = document.getElementById("viewer");
    if (v) {
      v.classList.remove("results-mode");
      const infoElement = document.getElementById("viewerResultsInfo");
      if (infoElement) infoElement.remove();
    }
  }
  
  // Garantir que botões estejam visíveis ao abrir viewer na aba Upload
  showViewerButtons();
  
  const allPhotos = await getAllPhotos();
  // Aplicar mesma ordenação e filtro do grid
  let visiblePhotos = allPhotos.filter(p => !p._isSplit);
  const sortFn = SORT_OPTIONS[currentSort]?.fn || SORT_OPTIONS['date-desc'].fn;
  visiblePhotos.sort(sortFn);
  currentList = applyCurrentFilter(visiblePhotos);
  
  if (!currentList.length) return;
  currentIndex = Math.max(0, Math.min(index, currentList.length - 1));
  const v = document.getElementById("viewer");
  const img = document.getElementById("viewerImg");
  img.src = currentList[currentIndex].thumb;
  v.setAttribute("aria-hidden", "false");
  // teclas
  document.addEventListener("keydown", viewerKeys);
  // resetar zoom ao abrir/trocar imagem
  resetZoom();
  // atualizar botão dividir/restaurar
  updateViewerSplitButton();
  // Atualizar estrelas de rating
  updateViewerRating();
}

/**
 * Abre visualizador na aba Resultados
 * @param {string} photoId - ID da foto a ser visualizada
 * @param {Array} rankingList - Lista de fotos do ranking ordenadas
 */
function openResultsViewer(photoId, rankingList) {
  if (!rankingList || rankingList.length === 0) return;
  
  isResultsViewMode = true;
  resultsRankingList = rankingList;
  currentList = rankingList;
  
  // Encontrar índice da foto pelo ID
  const index = rankingList.findIndex(p => p.id === photoId);
  if (index < 0) return;
  
  currentIndex = index;
  const v = document.getElementById("viewer");
  const img = document.getElementById("viewerImg");
  img.src = rankingList[currentIndex].thumb;
  v.setAttribute("aria-hidden", "false");
  v.classList.add("results-mode");
  
  document.addEventListener("keydown", viewerKeys);
  resetZoom();
  updateResultsViewerInfo();
  
  setTimeout(() => {
    hideResultsViewerButtons();
  }, 0);
}

/**
 * Atualiza informações exibidas no visualizador de resultados
 */
function updateResultsViewerInfo() {
  if (!isResultsViewMode || !resultsRankingList.length || currentIndex < 0) return;
  
  const photo = resultsRankingList[currentIndex];
  const displayRank = photo.stats?.rank || (currentIndex + 1);
  const scoreData = photo.scoreData;
  const isChampion = photo.id === contestState?.championId;
  
  // Criar ou atualizar elemento de informações
  let infoElement = document.getElementById("viewerResultsInfo");
  if (!infoElement) {
    infoElement = document.createElement("div");
    infoElement.id = "viewerResultsInfo";
    infoElement.className = "viewer-results-info";
    const viewer = document.getElementById("viewer");
    if (viewer) viewer.appendChild(infoElement);
  }
  
  const badges = [];
  if (photo._parentId) badges.push('<span class="badge badge-split">Cortado</span>');
  if (typeof photo.rating === "number" && photo.rating > 0) {
    badges.push(`<span class="badge badge-rated">★ ${photo.rating}</span>`);
  }
  if (!photo.rating) badges.push('<span class="badge badge-new">Novo</span>');
  
  infoElement.innerHTML = `
    <div class="viewer-results-rank">#${displayRank}${isChampion ? ' 🏆' : ''}</div>
    <div class="viewer-results-badges">${badges.join('')}</div>
    <div class="viewer-results-stats">
      <div class="tier-badge tier-badge-small">
        <div class="tier-icon">${scoreData.tier.icon}</div>
        <div class="tier-score">${scoreData.score}/100</div>
        <div class="tier-label">${scoreData.tier.label}</div>
      </div>
      <div class="viewer-results-record">
        ${photo.stats.wins}V - ${photo.stats.losses}D
      </div>
    </div>
  `;
}

function updateViewerSplitButton() {
  if (isResultsViewMode) return; // Não atualizar no modo resultados
  if (currentIndex < 0 || !currentList.length) return;
  
  const photo = currentList[currentIndex];
  const isCropped = !!photo._parentId;
  const btn = document.querySelector(".viewer-split");
  
  if (!btn) return;
  
  if (isCropped) {
    // Mudar para ícone de restaurar (undo)
    btn.setAttribute('data-tooltip', 'Restaurar foto original');
    btn.setAttribute('aria-label', 'Restaurar original');
    btn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
        <path d="M3 3v5h5"></path>
      </svg>
    `;
  } else {
    // Ícone padrão de dividir
    btn.setAttribute('data-tooltip', 'Dividir em 2×2');
    btn.setAttribute('aria-label', 'Dividir em 2×2');
    btn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="8" height="8" rx="1"/>
        <rect x="13" y="3" width="8" height="8" rx="1"/>
        <rect x="3" y="13" width="8" height="8" rx="1"/>
        <rect x="13" y="13" width="8" height="8" rx="1"/>
      </svg>
    `;
  }
}
function closeViewer() {
  const v = document.getElementById("viewer");
  v.setAttribute("aria-hidden", "true");
  document.removeEventListener("keydown", viewerKeys);
  
  // Limpar modo resultados
  if (isResultsViewMode) {
    isResultsViewMode = false;
    resultsRankingList = [];
    v.classList.remove("results-mode");
    
    // Remover elemento de informações
    const infoElement = document.getElementById("viewerResultsInfo");
    if (infoElement) infoElement.remove();
  }
  
  // Sempre restaurar botões quando fechar viewer (independente do modo)
  showViewerButtons();
  
  if (!isResultsViewMode) {
    // Ao fechar viewer, fazer scroll até a última foto visualizada
    if (currentIndex >= 0 && currentList[currentIndex]) {
      const lastViewedPhotoId = currentList[currentIndex].id;
      
      // Fazer scroll até a foto no grid
      setTimeout(() => {
        const targetCard = document.querySelector(`.photo-card[data-id="${lastViewedPhotoId}"]`);
        if (targetCard) {
          const rect = targetCard.getBoundingClientRect();
          const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const targetPosition = rect.top + currentScrollTop - 100;
          
          window.scrollTo({
            top: Math.max(0, targetPosition),
            behavior: 'smooth'
          });
          
          // Destaque visual
          targetCard.style.transition = 'box-shadow 0.3s ease';
          targetCard.style.boxShadow = '0 0 0 3px rgba(106, 163, 255, 0.6)';
          setTimeout(() => {
            targetCard.style.boxShadow = '';
          }, 600);
        }
      }, 100);
    }
  }
}
function viewerPrev() {
  if (isResultsViewMode) {
    if (currentIndex > 0) {
      currentIndex--;
      const img = document.getElementById("viewerImg");
      img.src = resultsRankingList[currentIndex].thumb;
      resetZoom();
      updateResultsViewerInfo();
      // Garantir que botões continuem escondidos
      hideResultsViewerButtons();
    }
  } else {
    if (currentIndex > 0) {
      openViewer(currentIndex - 1);
    }
  }
}
function viewerNext() {
  if (isResultsViewMode) {
    if (currentIndex < resultsRankingList.length - 1) {
      currentIndex++;
      const img = document.getElementById("viewerImg");
      img.src = resultsRankingList[currentIndex].thumb;
      resetZoom();
      updateResultsViewerInfo();
      // Garantir que botões continuem escondidos
      hideResultsViewerButtons();
    }
  } else {
    if (currentIndex < currentList.length - 1) {
      openViewer(currentIndex + 1);
    }
  }
}

/**
 * Esconde botões de dividir, restaurar e excluir no modo resultados
 */
function hideResultsViewerButtons() {
  if (!isResultsViewMode) return;
  
  const deleteBtn = document.querySelector(".viewer-delete");
  const splitBtn = document.querySelector(".viewer-split");
  if (deleteBtn) {
    deleteBtn.style.display = "none";
    deleteBtn.style.visibility = "hidden";
  }
  if (splitBtn) {
    splitBtn.style.display = "none";
    splitBtn.style.visibility = "hidden";
  }
}

/**
 * Mostra botões de dividir, restaurar e excluir (restaura visibilidade)
 */
function showViewerButtons() {
  const deleteBtn = document.querySelector(".viewer-delete");
  const splitBtn = document.querySelector(".viewer-split");
  if (deleteBtn) {
    deleteBtn.style.display = "";
    deleteBtn.style.visibility = "";
  }
  if (splitBtn) {
    splitBtn.style.display = "";
    splitBtn.style.visibility = "";
  }
}
function viewerKeys(e) {
  if (confirmOpen) {
    e.preventDefault();
    return;
  } // ⬅️ trava tudo no viewer
  if (e.key === "Escape") closeViewer();
  if (e.key === "ArrowLeft") viewerPrev();
  if (e.key === "ArrowRight") viewerNext();
  if (
    e.key === "Delete" ||
    e.key === "Backspace" ||
    (e.key && e.key.toLowerCase() === "d")
  ) {
    e.preventDefault();
    onViewerDelete();
  }
  // Atalhos de rating no viewer (1-5 para avaliar, 0 para remover)
  if (e.key >= '1' && e.key <= '5') {
    e.preventDefault();
    const rating = parseInt(e.key, 10);
    if (currentIndex >= 0 && currentList[currentIndex]) {
      setPhotoRating(currentList[currentIndex].id, rating, false); // NÃO scroll - closeViewer já faz
    }
  }
  // Atalhos de zoom (0 só reseta zoom se não houver rating ativo - já tratado acima)
  if (e.key === "+" || e.key === "=") {
    e.preventDefault();
    zoomBy(ZOOM_STEP);
  }
  if (e.key === "-" || e.key === "_") {
    e.preventDefault();
    zoomBy(-ZOOM_STEP);
  }
  // 0 agora conflita com rating - manter apenas para resetar zoom quando shift pressionado
  if (e.key === "0" && e.shiftKey) {
    e.preventDefault();
    resetZoom();
  }
}

document.querySelector(".viewer-close")?.addEventListener("click", (e) => {
  if (confirmOpen) {
    e.preventDefault();
    return;
  } // ⬅️ trava
  closeViewer();
});

document.querySelector(".viewer-prev")?.addEventListener("click", (e) => {
  if (confirmOpen) {
    e.preventDefault();
    return;
  } // ⬅️ trava
  viewerPrev();
});
document.querySelector(".viewer-next")?.addEventListener("click", (e) => {
  if (confirmOpen) {
    e.preventDefault();
    return;
  } // ⬅️ trava
  viewerNext();
});
// clique no backdrop do viewer
document.getElementById("viewer")?.addEventListener("click", (e) => {
  if (confirmOpen) {
    e.preventDefault();
    return;
  } // ⬅️ não fecha viewer durante confirmação
  if (e.target.id === "viewer") closeViewer();
});
document
  .querySelector(".viewer-delete")
  ?.addEventListener("click", onViewerDelete);

document
  .querySelector(".viewer-split")
  ?.addEventListener("click", onViewerSplit);

function onViewerDelete() {
  if (currentIndex < 0 || !currentList.length) return;
  const photo = currentList[currentIndex];
  // Confirmação usando o mesmo modal
  openConfirm({
    title: "Remover esta imagem?",
    message: "Esta ação é permanente para esta imagem.",
    confirmText: "Remover",
    onConfirm: () => deleteCurrentAndAdvance(),
  });
}

async function onViewerSplit() {
  if (currentIndex < 0 || !currentList.length) return;
  const photo = currentList[currentIndex];
  const isCropped = !!photo._parentId;
  
  if (isCropped) {
    // Reverter: restaurar original
    const reverted = await handleRevert(photo);
    
    if (reverted) {
      // Foto foi revertida: abrir a original no viewer usando ID
      openViewerByPhotoId(photo._parentId);
    }
  } else {
    // Dividir: cortar em 2×2
    const newPhotos = await handleManualSplit(photo);
    
    // Atualizar viewer apenas se confirmou
    if (newPhotos && newPhotos.length > 0) {
      // Abrir primeira foto cortada usando ID
      openViewerByPhotoId(newPhotos[0].id);
    }
  }
}

async function deleteCurrentAndAdvance() {
  try {
    // 1) deleta atual
    const victim = currentList[currentIndex];
    await savePhotos([{ ...victim, _delete: true }]);

    // 2) recarrega lista global
    const allPhotos = await getAllPhotos();
    
    // Filtrar e aplicar ordenação/filtro
    let visiblePhotos = allPhotos.filter(p => !p._isSplit);
    const sortFn = SORT_OPTIONS[currentSort]?.fn || SORT_OPTIONS['date-desc'].fn;
    visiblePhotos.sort(sortFn);
    const filteredPhotos = applyCurrentFilter(visiblePhotos);

    if (!filteredPhotos.length) {
      // nada restou: fecha viewer e re-renderiza grid
      renderGrid(allPhotos);
      toast("Imagem removida.");
      closeViewer();
      return;
    }

    // 3) recalcula índice seguro
    const newIndex = Math.min(currentIndex, filteredPhotos.length - 1);
    currentList = filteredPhotos;
    currentIndex = newIndex;

    // 4) atualiza imagem exibida
    const img = document.getElementById("viewerImg");
    img.src = currentList[currentIndex].thumb;
    
    // 5) re-renderiza grid mantendo foco na próxima foto
    renderGrid(allPhotos, currentList[currentIndex].id);
    
    // Atualizar botão split e rating
    updateViewerSplitButton();
    updateViewerRating();

    toast("Imagem removida.");
  } catch (e) {
    console.error(e);
    toast("Falha ao remover a imagem.");
  }
}

// ===== Modal de confirmação =====
let lastFocusedEl = null;

function openConfirm({ title, message, confirmText = "Confirmar", onConfirm }) {
  const m = $("#confirmModal");
  $("#confirmTitle").textContent = title || "Confirmar ação";
  $("#confirmMsg").textContent = message || "Tem certeza?";
  $("#confirmOk").textContent = confirmText;

  // listeners (limpa anteriores para evitar múltiplos binds)
  $("#confirmOk").onclick = async () => {
    try {
      await onConfirm?.();
    } finally {
      closeConfirm();
    }
  };
  $("#confirmCancel").onclick = () => closeConfirm();

  confirmOpen = true; // ⬅️ trava navegação do viewer
  document.body.classList.add("confirm-open"); // para estilizar botões

  function onKey(e) {
    // Bloqueia TODAS as teclas para não chegarem ao viewer (ou outros handlers)
    e.stopImmediatePropagation();
    e.preventDefault();

    if (e.key === "Escape") {
      // Fecha só o modal; como bloqueamos a propagação, o viewer não vê este Esc
      closeConfirm();
      return;
    }

    if (e.key === "Enter") {
      $("#confirmOk").click();
      return;
    }

    if (e.key === "Tab") {
      // trap de foco entre os botões
      const focusables = [$("#confirmCancel"), $("#confirmOk")];
      const idx = focusables.indexOf(document.activeElement);
      const next = e.shiftKey ? (idx <= 0 ? 1 : 0) : idx >= 1 ? 0 : 1;
      focusables[next].focus();
      return;
    }

    // Qualquer outra tecla é simplesmente ignorada
  }

  document.addEventListener("keydown", onKey, { capture: true });

  m.dataset.keyHandler = "true";
  document.addEventListener("keydown", onKey, { capture: true });

  // fechar clicando fora da caixa
  m.addEventListener(
    "click",
    (e) => {
      if (e.target === m) closeConfirm();
    },
    { once: true }
  );

  // foco
  lastFocusedEl = document.activeElement;
  m.setAttribute("aria-hidden", "false");
  $("#confirmCancel").focus();

  // guarda o remover para retirar depois
  m._cleanup = () =>
    document.removeEventListener("keydown", onKey, { capture: true });
}

function closeConfirm() {
  const m = $("#confirmModal");
  if (!m || m.getAttribute("aria-hidden") === "true") return;
  confirmOpen = false; // ⬅️ libera navegação do viewer
  document.body.classList.remove("confirm-open");
  m.setAttribute("aria-hidden", "true");
  m._cleanup?.();
  m._cleanup = null;
  if (lastFocusedEl?.focus) setTimeout(() => lastFocusedEl.focus(), 0);
}

// ========================================
//  ZOOM E PAN NO VIEWER
// ========================================

let zoomScale = 1;
let zoomTranslateX = 0;
let zoomTranslateY = 0;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let lastTouchDistance = 0;

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.3;

function initViewerZoom() {
  const container = $('#viewerImgContainer');
  const img = $('#viewerImg');
  const zoomInBtn = $('#zoomIn');
  const zoomOutBtn = $('#zoomOut');
  const zoomResetBtn = $('#zoomReset');
  const zoomLevelEl = $('#zoomLevel');
  
  if (!container || !img) return;
  
  // Botões de zoom
  zoomInBtn?.addEventListener('click', () => zoomBy(ZOOM_STEP));
  zoomOutBtn?.addEventListener('click', () => zoomBy(-ZOOM_STEP));
  zoomResetBtn?.addEventListener('click', resetZoom);
  
  // Scroll do mouse para zoom
  container.addEventListener('wheel', handleWheel, { passive: false });
  
  // Pan (arrastar) quando com zoom
  container.addEventListener('mousedown', handlePanStart);
  document.addEventListener('mousemove', handlePanMove);
  document.addEventListener('mouseup', handlePanEnd);
  
  // Touch: pinch-to-zoom e pan
  container.addEventListener('touchstart', handleTouchStart, { passive: false });
  container.addEventListener('touchmove', handleTouchMove, { passive: false });
  container.addEventListener('touchend', handleTouchEnd);
  
  // Resetar zoom ao trocar de imagem
  document.addEventListener('viewerImageChanged', resetZoom);
}

function handleWheel(e) {
  if (!$('#viewer').matches('[aria-hidden="false"]')) return;
  
  e.preventDefault();
  const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
  zoomBy(delta, e.clientX, e.clientY);
}

function zoomBy(delta, clientX, clientY) {
  const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomScale + delta));
  
  if (newScale === zoomScale) return;
  
  const container = $('#viewerImgContainer');
  const rect = container.getBoundingClientRect();
  
  // Zoom em direção ao ponto do cursor (se fornecido)
  if (clientX !== undefined && clientY !== undefined) {
    const x = clientX - rect.left - rect.width / 2;
    const y = clientY - rect.top - rect.height / 2;
    
    const factor = newScale / zoomScale;
    zoomTranslateX = x - (x - zoomTranslateX) * factor;
    zoomTranslateY = y - (y - zoomTranslateY) * factor;
  }
  
  zoomScale = newScale;
  updateZoom();
}

function resetZoom() {
  zoomScale = 1;
  zoomTranslateX = 0;
  zoomTranslateY = 0;
  updateZoom();
}

function updateZoom() {
  const img = $('#viewerImg');
  const zoomLevelEl = $('#zoomLevel');
  const zoomInBtn = $('#zoomIn');
  const zoomOutBtn = $('#zoomOut');
  
  if (!img) return;
  
  // Aplicar transformação
  img.style.transform = `scale(${zoomScale}) translate(${zoomTranslateX / zoomScale}px, ${zoomTranslateY / zoomScale}px)`;
  
  // Atualizar UI
  if (zoomLevelEl) {
    zoomLevelEl.textContent = `${Math.round(zoomScale * 100)}%`;
  }
  
  // Habilitar/desabilitar botões
  if (zoomInBtn) zoomInBtn.disabled = zoomScale >= MAX_ZOOM;
  if (zoomOutBtn) zoomOutBtn.disabled = zoomScale <= MIN_ZOOM;
  
  // Cursor
  const container = $('#viewerImgContainer');
  if (container) {
    container.style.cursor = zoomScale > 1 ? 'grab' : 'default';
  }
}

// Pan (arrastar)
function handlePanStart(e) {
  if (zoomScale <= 1) return;
  
  isPanning = true;
  panStartX = e.clientX - zoomTranslateX;
  panStartY = e.clientY - zoomTranslateY;
  
  const container = $('#viewerImgContainer');
  container.classList.add('grabbing');
  container.style.cursor = 'grabbing';
}

function handlePanMove(e) {
  if (!isPanning) return;
  
  e.preventDefault();
  const newX = e.clientX - panStartX;
  const newY = e.clientY - panStartY;
  
  // Aplicar limites para não arrastar muito além das bordas
  const container = $('#viewerImgContainer');
  const img = $('#viewerImg');
  if (container && img) {
    const containerRect = container.getBoundingClientRect();
    const maxTranslate = Math.max(containerRect.width, containerRect.height) * (zoomScale - 1) * 0.6;
    
    zoomTranslateX = Math.max(-maxTranslate, Math.min(maxTranslate, newX));
    zoomTranslateY = Math.max(-maxTranslate, Math.min(maxTranslate, newY));
  } else {
    zoomTranslateX = newX;
    zoomTranslateY = newY;
  }
  
  updateZoom();
}

function handlePanEnd() {
  if (!isPanning) return;
  
  isPanning = false;
  const container = $('#viewerImgContainer');
  container.classList.remove('grabbing');
  container.style.cursor = zoomScale > 1 ? 'grab' : 'default';
}

// Touch: pinch-to-zoom
function handleTouchStart(e) {
  if (e.touches.length === 2) {
    e.preventDefault();
    const dist = getTouchDistance(e.touches);
    lastTouchDistance = dist;
  } else if (e.touches.length === 1 && zoomScale > 1) {
    // Pan com um dedo (se tiver zoom)
    isPanning = true;
    panStartX = e.touches[0].clientX - zoomTranslateX;
    panStartY = e.touches[0].clientY - zoomTranslateY;
  }
}

function handleTouchMove(e) {
  if (e.touches.length === 2) {
    e.preventDefault();
    const dist = getTouchDistance(e.touches);
    const delta = (dist - lastTouchDistance) * 0.01;
    lastTouchDistance = dist;
    
    const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    
    zoomBy(delta, centerX, centerY);
  } else if (e.touches.length === 1 && isPanning) {
    e.preventDefault();
    const newX = e.touches[0].clientX - panStartX;
    const newY = e.touches[0].clientY - panStartY;
    
    // Aplicar limites para não arrastar muito além das bordas
    const container = $('#viewerImgContainer');
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const maxTranslate = Math.max(containerRect.width, containerRect.height) * (zoomScale - 1) * 0.6;
      
      zoomTranslateX = Math.max(-maxTranslate, Math.min(maxTranslate, newX));
      zoomTranslateY = Math.max(-maxTranslate, Math.min(maxTranslate, newY));
    } else {
      zoomTranslateX = newX;
      zoomTranslateY = newY;
    }
    
    updateZoom();
  }
}

function handleTouchEnd(e) {
  if (e.touches.length < 2) {
    lastTouchDistance = 0;
  }
  if (e.touches.length === 0) {
    isPanning = false;
  }
}

function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// Inicializar zoom quando o documento carregar
document.addEventListener('DOMContentLoaded', initViewerZoom);

// ========================================
// ===== RATING E FILTROS =====
// ========================================

/**
 * Define rating de uma foto e persiste no IndexedDB
 * @param {string} photoId - ID da foto
 * @param {number} rating - Rating (0-5, onde 0 = remover avaliação)
 * @param {boolean} scrollToPhoto - Se true, faz scroll até a foto (padrão: false)
 */
async function setPhotoRating(photoId, rating, scrollToPhoto = false) {
  try {
    const photos = await getAllPhotos();
    const photo = photos.find(p => p.id === photoId);
    
    if (!photo) {
      console.error('Foto não encontrada:', photoId);
      return;
    }
    
    // Atualizar rating e timestamp
    photo.rating = rating;
    photo.evaluatedAt = rating > 0 ? Date.now() : undefined;
    
    // Salvar no IndexedDB
    await savePhotos([photo]);
    
    // Atualizar cache global
    allPhotos = await getAllPhotos();
    
    // Atualizar currentList também (para sincronizar viewer)
    if (currentList && currentList.length > 0) {
      const photoInList = currentList.find(p => p.id === photoId);
      if (photoInList) {
        photoInList.rating = rating;
        photoInList.evaluatedAt = photo.evaluatedAt;
      }
    }
    
    // Re-renderizar grid
    // Se scrollToPhoto=true: faz scroll até a foto (usado quando vem do viewer)
    // Se scrollToPhoto=false: mantém scroll atual (usado quando vem das miniaturas)
    renderGrid(allPhotos, scrollToPhoto ? photoId : null);
    
    // Atualizar contadores dos filtros
    updateFilterCounts();
    
    // Toast de feedback
    if (rating === 0) {
      toast('Avaliação removida');
    } else {
      toast(`Avaliada com ${rating} estrela${rating > 1 ? 's' : ''}!`);
    }
    
    // Atualizar viewer se estiver aberto (mas NÃO re-renderizar, apenas atualizar estrelas)
    if ($('#viewer')?.getAttribute('aria-hidden') === 'false') {
      updateViewerRating();
    }
    
    // Atualizar aba "Avaliar" se estiver ativa (mas NÃO re-renderizar - será feito no callback)
    // O callback do createStarRating na aba "Avaliar" já lida com isso
    
  } catch (err) {
    console.error('Erro ao salvar rating:', err);
    toast('Erro ao salvar avaliação.');
  }
}

/**
 * Aplica filtro atual à lista de fotos
 * @param {Array} photos - Lista de fotos
 * @returns {Array} - Lista filtrada
 */
function applyCurrentFilter(photos) {
  switch (currentFilter) {
    case 'rated5':
      return photos.filter(p => p.rating === 5);
    case 'unrated':
      return photos.filter(p => !p.rating || p.rating === 0);
    case 'all':
    default:
      return photos;
  }
}

/**
 * Atualiza contadores dos filtros
 */
function updateFilterCounts() {
  const photos = allPhotos.filter(p => !p._isSplit); // Apenas visíveis
  
  const counts = {
    all: photos.length,
    rated5: photos.filter(p => p.rating === 5).length,
    unrated: photos.filter(p => !p.rating || p.rating === 0).length
  };
  
  // Atualizar UI
  $('#filterCountAll').textContent = counts.all;
  $('#filterCountRated5').textContent = counts.rated5;
  $('#filterCountUnrated').textContent = counts.unrated;
}

/**
 * Inicializa event listeners dos filtros
 */
function initFilters() {
  const filterTabs = document.querySelectorAll('.filter-tab');
  
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const filter = tab.dataset.filter;
      
      // Atualizar estado
      currentFilter = filter;
      
      // Atualizar UI dos tabs
      filterTabs.forEach(t => {
        t.classList.toggle('active', t.dataset.filter === filter);
        t.setAttribute('aria-selected', t.dataset.filter === filter ? 'true' : 'false');
      });
      
      // Re-renderizar grid
      renderGrid(allPhotos);
    });
  });
  
  // Ordenação
  const sortSelect = $('#sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      
      // Salvar preferência no localStorage
      localStorage.setItem('photoranker-sort', currentSort);
      
      // Re-renderizar grid
      renderGrid(allPhotos);
    });
  }
}

/**
 * Atualiza select de ordenação com valor atual
 */
function updateSortSelect() {
  const sortSelect = $('#sortSelect');
  if (sortSelect) {
    sortSelect.value = currentSort;
  }
}

// ========================================
// ===== ABA "AVALIAR" =====
// ========================================

/**
 * Inicializa aba "Avaliar"
 */
function initRateView() {
  // Será renderizada dinamicamente quando aba for aberta
  // Observar mudança de hash para detectar abertura
  window.addEventListener('hashchange', () => {
    if (location.hash === '#/rate') {
      renderRateView();
    }
  });
  
  // Se já estiver na aba ao carregar
  if (location.hash === '#/rate') {
    setTimeout(() => renderRateView(), 100);
  }
}

// ========================================
// ===== CONTEST MODE =====
// ========================================

/**
 * Inicializa módulos de Contest
 */
function initializeContestModules() {
  // Helpers para acesso ao contestState
  const getContestState = () => contestState;
  const setContestState = (state) => { contestState = state; };
  
  // Criar módulo de batalhas
  battleModule = createBattleModule({
    getContestState,
    setContestState,
    renderContestView,
    finishContest,
    saveContestState,
    toast,
    confirmCancelContest,
    generateNextPairwiseMatch
  });
  
  // Criar módulo de resultados
  resultsModule = createResultsModule({
    getContestState,
    setContestState,
    saveContestState,
    openConfirm,
    toast,
    openResultsViewer,
    renderHeatmap
  });
}

/**
 * Inicializa aba "Contest"
 */
function initContestView() {
  // Renderizar quando aba for aberta
  window.addEventListener('hashchange', () => {
    if (location.hash === '#/contest') {
      renderContestView();
    }
  });
  
  if (location.hash === '#/contest') {
    setTimeout(() => renderContestView(), 100);
  }
  
  setTimeout(() => {
    const contestSection = document.querySelector('[data-route="contest"]');
    const contestView = $('#contestView');
    if (contestSection && contestSection.classList.contains('active') && contestView && !contestView.innerHTML.trim()) {
      renderContestView();
    }
  }, 500);
}

/**
 * Renderiza aba "Contest"
 */
async function renderContestView() {
  const container = $('#contestView');
  if (!container) {
    return;
  }
  
  allPhotos = await getAllPhotos();
  const visiblePhotos = allPhotos.filter(p => !p._isSplit);
  
  loadContestState();
  
  // Sistema pairwise: apenas fase 'qualifying' (fase 'final' é legado para migração)
  if (contestState && contestState.phase === 'qualifying') {
    await renderBattle();
    return;
  }
  
  const qualifiedPhotos = visiblePhotos.filter(p => p.rating === 5);
  const qualifiedCount = qualifiedPhotos.length;
  
  // Verificar se há contest finalizado
  const hasFinishedContest = contestState && contestState.phase === 'finished';
  const buttonText = hasFinishedContest ? 'Refazer Contest' : 'Iniciar Contest';
  const buttonClass = hasFinishedContest ? 'btn btn-warning' : 'btn';
  
  container.innerHTML = `
    <div class="contest-empty">
      <div class="contest-empty-icon">🏆</div>
      <h3>Contest Mode</h3>
      <p>Compare fotos lado a lado e escolha a melhor!</p>
      
      ${hasFinishedContest ? '<p class="muted" style="color: #ffa500; margin-bottom: var(--gap-2);">⚠️ Você já possui um contest finalizado. Refazer irá apagar os resultados anteriores.</p>' : ''}
      
      <div class="contest-stats">
        <div class="contest-stat">
          <strong>${qualifiedCount}</strong>
          <span>foto${qualifiedCount !== 1 ? 's' : ''} qualificada${qualifiedCount !== 1 ? 's' : ''} (⭐5)</span>
        </div>
      </div>
      
      <button id="startContest" class="${buttonClass}" ${qualifiedCount < 2 ? 'disabled' : ''}>
        ${buttonText}
      </button>
      
      <p class="muted">
        ${qualifiedCount < 2 
          ? 'Você precisa de pelo menos 2 fotos com ⭐5 para iniciar' 
          : hasFinishedContest 
            ? 'Clique para refazer o contest (resultados anteriores serão apagados)'
            : 'Clique para começar os confrontos'}
      </p>
    </div>
  `;
  
  const startBtn = $('#startContest');
  if (startBtn && !startBtn.disabled) {
    startBtn.addEventListener('click', async () => {
      // Se há contest finalizado, mostrar modal de confirmação
      if (hasFinishedContest) {
        openConfirm({
          title: 'Refazer Contest?',
          message: 'Ao refazer o contest, todos os resultados anteriores, histórico de batalhas e colocações das fotos serão apagados permanentemente. Deseja realmente continuar?',
          confirmText: 'Sim, Refazer',
          onConfirm: async () => {
            try {
              // Limpar estado anterior antes de iniciar novo
              contestState = null;
              saveContestState();
              await startContest();
            } catch (error) {
              console.error('Erro ao refazer contest:', error);
              toast('Erro ao refazer contest. Verifique o console para mais detalhes.');
            }
          }
        });
      } else {
        // Contest novo, iniciar normalmente
        try {
          await startContest();
        } catch (error) {
          console.error('Erro ao iniciar contest:', error);
          toast('Erro ao iniciar contest. Verifique o console para mais detalhes.');
        }
      }
    });
  }
}

/**
 * Gera próximo par único para confronto pairwise (sistema non-repeat)
 * Estratégia híbrida: Elo similar (60%) + balanceamento de batalhas (40%)
 * @param {Array} photos - Fotos participantes
 * @param {Object} eloScores - Scores Elo atuais
 * @param {Array} battleHistory - Histórico de batalhas
 * @returns {Object|null} {photoA, photoB} ou null se todas as combinações foram esgotadas
 */
function generateNextPairwiseMatch(photos, eloScores, battleHistory) {
  if (photos.length < 2) return null;
  
  // Criar Set de pares já batalhados
  const battledPairs = new Set();
  battleHistory.forEach(b => {
    const pairKey = [b.photoA, b.photoB].sort().join('-');
    battledPairs.add(pairKey);
  });
  
  // Contar batalhas por foto
  const photoBattleCount = {};
  photos.forEach(p => {
    photoBattleCount[p.id] = battleHistory.filter(b => 
      b.photoA === p.id || b.photoB === p.id
    ).length;
  });
  
  // Ordenar por Elo
  const ranked = [...photos].sort((a, b) => 
    (eloScores[b.id] || 1500) - (eloScores[a.id] || 1500)
  );
  
  // Calcular todos os pares possíveis com scores
  const candidatePairs = [];
  
  for (let i = 0; i < ranked.length; i++) {
    for (let j = i + 1; j < ranked.length; j++) {
      const photoA = ranked[i];
      const photoB = ranked[j];
      const pairKey = [photoA.id, photoB.id].sort().join('-');
      
      // Pular se já batalharam
      if (battledPairs.has(pairKey)) continue;
      
      // Calcular scores
      const eloA = eloScores[photoA.id] || 1500;
      const eloB = eloScores[photoB.id] || 1500;
      const eloDiff = Math.abs(eloA - eloB);
      
      // Score de similaridade de Elo (menor diferença = maior score)
      // Normalizar: diferença 0 = score 1.0, diferença 500+ = score próximo de 0
      const maxEloDiff = 1000; // Diferença máxima esperada
      const eloSimilarityScore = 1 - Math.min(eloDiff / maxEloDiff, 1);
      
      // Score de balanceamento (fotos com menos batalhas = maior score)
      const maxBattles = Math.max(...Object.values(photoBattleCount), 1);
      const avgBattles = Object.values(photoBattleCount).reduce((a, b) => a + b, 0) / photos.length;
      const battlesA = photoBattleCount[photoA.id] || 0;
      const battlesB = photoBattleCount[photoB.id] || 0;
      const balanceScore = 1 - (Math.abs(battlesA - avgBattles) + Math.abs(battlesB - avgBattles)) / (maxBattles * 2);
      
      // Score combinado (60% Elo similar, 40% balanceamento)
      const totalScore = eloSimilarityScore * 0.6 + balanceScore * 0.4;
      
      candidatePairs.push({
        photoA,
        photoB,
        eloSimilarityScore,
        balanceScore,
        totalScore,
        eloDiff
      });
    }
  }
  
  // Se não há mais pares disponíveis, retornar null
  if (candidatePairs.length === 0) {
    return null;
  }
  
  // Ordenar por score total (maior primeiro)
  candidatePairs.sort((a, b) => b.totalScore - a.totalScore);
  
  // Retornar o melhor par
  const bestPair = candidatePairs[0];
  return {
    photoA: bestPair.photoA,
    photoB: bestPair.photoB
  };
}

/**
 * Inicia um novo contest (Sistema Pairwise)
 */
async function startContest() {
  const context = {
    contestState: { current: contestState },
    renderBattle: async () => {
      // Atualizar contestState global antes de renderizar
      contestState = context.contestState.current;
      if (battleModule) {
        return battleModule.renderBattle();
      }
      return renderBattle();
    },
    toast,
    allPhotos
  };
  await startContestManager(context);
  // Atualizar referência global após startContest
  contestState = context.contestState.current;
  
  // Garantir que o estado foi salvo
  saveContestState();
}


/**
 * Organiza batalhas em rodadas de eliminatória progressiva
 * Rastreia vencedores e perdedores, mostrando como avançam
 */
function organizeBattlesIntoRounds(battleHistory, qualifiedPhotos) {
  if (battleHistory.length === 0) return { rounds: [] };
  
  const rounds = [];
  let processedBattles = 0;
  let currentRound = 1;
  let currentWinners = new Set(qualifiedPhotos.map(p => p.id)); // Todos começam como "vencedores" (ainda não perderam)
  let currentLosers = new Set();
  
  // Rodada 1: primeiras batalhas (todos contra todos iniciais)
  const initialBattles = Math.min(qualifiedPhotos.length - 1, battleHistory.length);
  const round1 = battleHistory.slice(0, initialBattles);
  
  if (round1.length > 0) {
    const r1Winners = new Set();
    const r1Losers = new Set();
    
    round1.forEach(b => {
      r1Winners.add(b.winner);
      const loser = b.photoA === b.winner ? b.photoB : b.photoA;
      r1Losers.add(loser);
    });
    
    rounds.push({
      round: 1,
      battles: round1,
      winners: r1Winners,
      losers: r1Losers,
      label: 'Rodada 1'
    });
    
    currentWinners = r1Winners;
    currentLosers = r1Losers;
    processedBattles = round1.length;
    currentRound = 2;
  }
  
  // Rodadas seguintes: organizar por vencedores e perdedores
  while (processedBattles < battleHistory.length) {
    const roundWinners = [];
    const roundLosers = [];
    const nextWinners = new Set();
    const nextLosers = new Set();
    
    // Processar batalhas restantes
    for (let i = processedBattles; i < battleHistory.length; i++) {
      const battle = battleHistory[i];
      const photoA = battle.photoA;
      const photoB = battle.photoB;
      
      const bothWinners = currentWinners.has(photoA) && currentWinners.has(photoB);
      const bothLosers = currentLosers.has(photoA) && currentLosers.has(photoB);
      
      if (bothWinners) {
        roundWinners.push(battle);
        nextWinners.add(battle.winner);
        const loser = photoA === battle.winner ? photoB : photoA;
        nextLosers.add(loser);
        processedBattles++;
      } else if (bothLosers) {
        roundLosers.push(battle);
        nextWinners.add(battle.winner); // Vencedor entre perdedores avança
        const loser = photoA === battle.winner ? photoB : photoA;
        nextLosers.add(loser);
        processedBattles++;
      } else {
        // Batalha mista ou fora de ordem - pular por enquanto
        break;
      }
    }
    
    // Adicionar rodadas
    if (roundWinners.length > 0) {
      rounds.push({
        round: currentRound,
        battles: roundWinners,
        winners: nextWinners,
        losers: nextLosers,
        label: `Rodada ${currentRound} - Vencedores`
      });
      currentWinners = nextWinners;
      currentRound++;
    }
    
    if (roundLosers.length > 0) {
      rounds.push({
        round: currentRound,
        battles: roundLosers,
        winners: nextWinners,
        losers: nextLosers,
        label: `Rodada ${currentRound} - Perdedores`
      });
      currentRound++;
    }
    
    // Se não processou nenhuma batalha, parar
    if (roundWinners.length === 0 && roundLosers.length === 0) {
      break;
    }
  }
  
  // Batalhas restantes (fora de ordem ou mistas)
  const remainingBattles = battleHistory.slice(processedBattles);
  if (remainingBattles.length > 0) {
    rounds.push({
      round: currentRound,
      battles: remainingBattles,
      winners: new Set(),
      losers: new Set(),
      label: 'Batalhas Adicionais'
    });
  }
  
  return { rounds };
}

/**
 * Renderiza bracket visual mostrando lógica de eliminatória
 * Vencedores avançam, perdedores batalham entre si
 * @returns {string} HTML do bracket
 */
function renderBracket() {
  if (!contestState) return '';
  
  const { currentMatch, battleHistory, eloScores, qualifiedPhotos } = contestState;
  
  // Calcular estatísticas
  const photoStats = calculatePhotoStatsState(qualifiedPhotos, eloScores, battleHistory, contestState);
  
  // Organizar batalhas em rodadas
  const { rounds } = organizeBattlesIntoRounds(battleHistory, qualifiedPhotos);
  
  let html = '<div class="bracket-diagram">';
  
  // Renderizar cada rodada
  rounds.forEach((round, roundIdx) => {
    html += `<div class="bracket-column ${roundIdx === 0 ? 'active' : ''}" data-round="${roundIdx}">`;
    html += `<div class="bracket-column-label">${round.label}</div>`;
    html += `<div class="bracket-column-content">`;
    
    round.battles.forEach((battle, battleIdx) => {
      const photoA = qualifiedPhotos.find(p => p.id === battle.photoA);
      const photoB = qualifiedPhotos.find(p => p.id === battle.photoB);
      
      if (!photoA || !photoB) return;
      
      const winnerId = battle.winner;
      const photoAWon = winnerId === photoA.id;
      const photoBWon = winnerId === photoB.id;
      const isCurrentBattle = currentMatch && 
        ((currentMatch.photoA.id === photoA.id && currentMatch.photoB.id === photoB.id) ||
         (currentMatch.photoA.id === photoB.id && currentMatch.photoB.id === photoA.id));
      
      const statsA = photoStats[photoA.id];
      const statsB = photoStats[photoB.id];
      
      // Container único para cada batalha
      html += `<div class="bracket-battle-container ${isCurrentBattle ? 'current' : ''} decided ${round.type}" data-battle-id="${battle.photoA}-${battle.photoB}">`;
      
      // Obter scores e tiers
      const scoreA = contestState.scoresAndTiers[photoA.id] || { score: 50, tier: TIERS[4] };
      const scoreB = contestState.scoresAndTiers[photoB.id] || { score: 50, tier: TIERS[4] };
      
      // Slot Foto A
      html += `<div class="bracket-slot ${photoAWon ? 'winner' : 'loser'}">`;
      html += `<img src="${photoA.thumb}" alt="Foto A" class="bracket-thumb">`;
      html += `<div class="bracket-info">`;
      html += `<div class="tier-badge tier-badge-small">`;
      html += `<div class="tier-icon">${scoreA.tier.icon}</div>`;
      html += `<div class="tier-score">${scoreA.score}/100</div>`;
      html += `<div class="tier-label">${scoreA.tier.label}</div>`;
      html += `</div>`;
      if (photoAWon) html += '<span class="bracket-check">✓</span>';
      html += `</div></div>`;
      
      // Linha horizontal entre fotos
      html += `<div class="bracket-line-h"></div>`;
      
      // Slot Foto B
      html += `<div class="bracket-slot ${photoBWon ? 'winner' : 'loser'}">`;
      html += `<img src="${photoB.thumb}" alt="Foto B" class="bracket-thumb">`;
      html += `<div class="bracket-info">`;
      html += `<div class="tier-badge tier-badge-small">`;
      html += `<div class="tier-icon">${scoreB.tier.icon}</div>`;
      html += `<div class="tier-score">${scoreB.score}/100</div>`;
      html += `<div class="tier-label">${scoreB.tier.label}</div>`;
      html += `</div>`;
      if (photoBWon) html += '<span class="bracket-check">✓</span>';
      html += `</div></div>`;
      
      // Flecha para próxima rodada (sempre mostrar para vencedor)
      if (photoAWon && roundIdx < rounds.length - 1) {
        html += `<div class="bracket-arrow" data-winner="${photoA.id}" title="Vencedor avança para próxima rodada"></div>`;
      } else if (photoBWon && roundIdx < rounds.length - 1) {
        html += `<div class="bracket-arrow" data-winner="${photoB.id}" title="Vencedor avança para próxima rodada"></div>`;
      }
      
      html += `</div>`; // Fecha bracket-battle-container
    });
    
    html += `</div></div>`;
  });
  
  // Mostrar confronto atual se ainda não foi adicionado
  if (currentMatch && !battleHistory.some(b => 
    (b.photoA === currentMatch.photoA.id && b.photoB === currentMatch.photoB.id) ||
    (b.photoA === currentMatch.photoB.id && b.photoB === currentMatch.photoA.id)
  )) {
    const photoA = currentMatch.photoA;
    const photoB = currentMatch.photoB;
    const statsA = photoStats[photoA.id];
    const statsB = photoStats[photoB.id];
    
    html += `<div class="bracket-column active">`;
    html += `<div class="bracket-column-label">Próxima Batalha</div>`;
    html += `<div class="bracket-column-content">`;
    html += `<div class="bracket-battle-container current">`;
    
    html += `<div class="bracket-slot">`;
    html += `<img src="${photoA.thumb}" alt="Foto A" class="bracket-thumb">`;
    html += `<div class="bracket-info">`;
    html += `<div class="bracket-elo">${Math.round(eloScores[photoA.id] || 1500)}</div>`;
    html += `</div></div>`;
    
    html += `<div class="bracket-line-h"></div>`;
    
    html += `<div class="bracket-slot">`;
    html += `<img src="${photoB.thumb}" alt="Foto B" class="bracket-thumb">`;
    html += `<div class="bracket-info">`;
    html += `<div class="bracket-elo">${Math.round(eloScores[photoB.id] || 1500)}</div>`;
    html += `</div></div>`;
    
    html += `</div></div></div>`;
  }
  
  html += '</div>';
  return html;
}

/**
 * Renderiza interface de confronto (suporta qualifying e bracket)
 */
async function renderBattle() {
  if (battleModule) {
    return battleModule.renderBattle();
  }
}

/**
 * Renderiza batalha da fase classificatória
 */
async function renderQualifyingBattle() {
  if (battleModule) {
    return battleModule.renderQualifyingBattle();
  }
}


/**
 * Renderiza ranking dinâmico
 */
function renderDynamicRanking(photos, photoStats) {
  // Ranking baseado apenas em Elo (sistema pairwise)
  if (!contestState) return '';
  
  const { eloScores, scoresAndTiers } = contestState;
  
  const ranked = [...photos]
    .map(p => ({ 
      ...p, 
      stats: photoStats[p.id],
      scoreData: scoresAndTiers[p.id] || { score: 50, tier: TIERS[4] },
      elo: eloScores[p.id] || 1500
    }))
    .sort((a, b) => {
      // Ordenar por Elo (maior = melhor)
      if (b.elo !== a.elo) return b.elo - a.elo;
      return a.id.localeCompare(b.id);
    });
  
  return ranked.map((photo, index) => {
    const { wins, losses, rank } = photo.stats;
    const { score, tier } = photo.scoreData;
    return `
      <div class="ranking-item ${index < 3 ? 'top-' + (index + 1) : ''}">
        <span class="ranking-position">#${rank}</span>
        <img src="${photo.thumb}" alt="Foto" class="ranking-thumb">
        <div class="ranking-details">
          <div class="tier-badge tier-badge-small">
            <div class="tier-icon">${tier.icon}</div>
            <div class="tier-score">${score}/100</div>
            <div class="tier-label">${tier.label}</div>
          </div>
          <div class="ranking-record">${wins}W-${losses}L</div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Toggle overlay genérico
 */
function toggleOverlay(overlayId) {
  const overlay = $(overlayId);
  if (!overlay) return;
  
  const isHidden = overlay.getAttribute('aria-hidden') === 'true';
  overlay.setAttribute('aria-hidden', isHidden ? 'false' : 'true');
  
  if (!isHidden && overlayId === 'heatmapOverlay') {
    // Atualizar heatmap
    const container = $('#heatmapContent');
    if (container) {
      container.innerHTML = renderHeatmap();
    }
  }
}

/**
 * Renderiza overlay de ranking completo
 */
function renderRankingOverlay() {
  if (!contestState || contestState.phase !== 'qualifying') return '';
  
  // Sistema pairwise: usar apenas qualifiedPhotos
  const photos = contestState.qualifiedPhotos;
  
  const { eloScores, battleHistory, scoresAndTiers } = contestState;
  const photoStats = calculatePhotoStatsState(photos, eloScores, battleHistory, contestState, contestState.photoStats);
  contestState.photoStats = photoStats;
  
  // Ranking baseado apenas em Elo (sistema pairwise)
  const ranked = [...photos]
    .map(p => ({ 
      ...p, 
      stats: photoStats[p.id],
      scoreData: scoresAndTiers[p.id] || { score: 50, tier: TIERS[4] }
    }))
    .sort((a, b) => {
      // Ordenar por Elo (maior = melhor)
      const eloA = eloScores[a.id] || 1500;
      const eloB = eloScores[b.id] || 1500;
      if (eloB !== eloA) return eloB - eloA;
      return a.id.localeCompare(b.id);
    });
  
  return `
    <div class="contest-overlay" id="rankingOverlay" aria-hidden="true">
      <div class="overlay-header">
        <h3>Ranking Completo</h3>
        <button class="overlay-close" onclick="toggleOverlay('rankingOverlay')" aria-label="Fechar">&times;</button>
      </div>
      <div class="overlay-content">
        <div class="full-ranking-list">
          ${ranked.map((photo, idx) => {
            const { score, tier } = photo.scoreData;
            const recentBattles = battleHistory
              .filter(b => b.photoA === photo.id || b.photoB === photo.id)
              .slice(-3);
            const scoreChange = recentBattles.length > 0 
              ? recentBattles.reduce((sum, b) => {
                  const isWinner = b.winner === photo.id;
                  return sum + (isWinner ? (b.eloChange?.winner || 0) : (b.eloChange?.loser || 0));
                }, 0)
              : 0;
            
            const displayRank = photo.stats?.rank || (idx + 1);
            
            return `
            <div class="full-ranking-item ${idx < 3 ? 'top-' + (idx + 1) : ''}" data-photo-id="${photo.id}">
              <span class="ranking-position-large">#${displayRank}</span>
              <img src="${photo.thumb}" alt="Foto" class="ranking-thumb-large">
              <div class="ranking-details-large">
                <div class="tier-badge tier-badge-large">
                  <div class="tier-icon">${tier.icon}</div>
                  <div class="tier-score">${score}/100</div>
                  <div class="tier-label">${tier.label}</div>
                </div>
                <div class="ranking-record-large">${photo.stats.wins}W - ${photo.stats.losses}L</div>
                ${recentBattles.length > 0 ? `<div class="ranking-change">${scoreChange > 0 ? '+' : ''}${Math.round(scoreChange)} score</div>` : ''}
              </div>
              <button class="btn-view-details" data-photo-id="${photo.id}" onclick="showPhotoDetails('${photo.id}')">
                Ver Detalhes
              </button>
            </div>
          `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

/**
 * Renderiza prévia do bracket (antes de fechar classificatória)
 */
function renderBracketPreview() {
  // Função legada: não mais usada no sistema pairwise
  // Mantida apenas para compatibilidade com código que pode chamá-la
  return '<p class="muted">Prévia de bracket não disponível no sistema pairwise atual.</p>';
}

/**
 * Renderiza heatmap de confrontos
 */
function renderHeatmap() {
  if (!contestState) {
    return '<p class="muted">Nenhum contest disponível.</p>';
  }
  
  const { qualifiedPhotos, battleHistory } = contestState;
  
  if (!qualifiedPhotos || qualifiedPhotos.length === 0) {
    return '<p class="muted">Nenhuma foto participante.</p>';
  }
  
  if (!battleHistory || battleHistory.length === 0) {
    return '<p class="muted">Nenhuma batalha registrada ainda.</p>';
  }
  
  // Criar matriz de confrontos
  const matrix = {};
  qualifiedPhotos.forEach(p => {
    matrix[p.id] = {};
    qualifiedPhotos.forEach(p2 => {
      if (p.id !== p2.id) {
        matrix[p.id][p2.id] = 0; // 0 = não batalharam
      }
    });
  });
  
  // Preencher com histórico
  battleHistory.forEach(b => {
    if (matrix[b.photoA] && matrix[b.photoA][b.photoB] !== undefined) {
      matrix[b.photoA][b.photoB] = 1; // 1 = batalharam
      matrix[b.photoB][b.photoA] = 1;
    }
  });
  
  let html = '<div class="heatmap-container">';
  html += '<div class="heatmap-legend">';
  html += '<span class="legend-item"><span class="legend-color" style="background: rgba(61, 220, 151, 0.3)"></span> Batalharam</span>';
  html += '<span class="legend-item"><span class="legend-color" style="background: rgba(255, 255, 255, 0.05)"></span> Não batalharam</span>';
  html += '</div>';
  
  html += '<div class="heatmap-table">';
  html += '<div class="heatmap-row heatmap-header-row">';
  html += '<div class="heatmap-cell heatmap-corner"></div>';
  qualifiedPhotos.forEach(p => {
    html += `<div class="heatmap-cell heatmap-header-cell" title="${p.id}">`;
    html += `<img src="${p.thumb}" class="heatmap-thumb-small" data-photo-id="${p.id}" style="cursor: pointer;" alt="Foto ${p.id}">`;
    html += `</div>`;
  });
  html += '</div>';
  
  qualifiedPhotos.forEach((photoA, idxA) => {
    html += '<div class="heatmap-row">';
    html += `<div class="heatmap-cell heatmap-header-cell" title="${photoA.id}">`;
    html += `<img src="${photoA.thumb}" class="heatmap-thumb-small" data-photo-id="${photoA.id}" style="cursor: pointer;" alt="Foto ${photoA.id}">`;
    html += `</div>`;
    
    qualifiedPhotos.forEach((photoB, idxB) => {
      if (photoA.id === photoB.id) {
        html += '<div class="heatmap-cell heatmap-diagonal"></div>';
      } else {
        const hasBattled = matrix[photoA.id][photoB.id] === 1;
        html += `<div class="heatmap-cell ${hasBattled ? 'heatmap-battled' : 'heatmap-not-battled'}" 
                      title="${photoA.id} vs ${photoB.id}: ${hasBattled ? 'Batalharam' : 'Não batalharam'}">
                  ${hasBattled ? '✓' : ''}
                </div>`;
      }
    });
    
    html += '</div>';
  });
  
  html += '</div></div>';
  return html;
}

/**
 * Renderiza overlay do heatmap
 */
function renderHeatmapOverlay() {
  if (!contestState || contestState.phase !== 'qualifying') return '';
  
  return `
    <div class="contest-overlay" id="heatmapOverlay" aria-hidden="true">
      <div class="overlay-header">
        <h3>Heatmap de Confrontos</h3>
        <button class="overlay-close" onclick="toggleOverlay('heatmapOverlay')" aria-label="Fechar">&times;</button>
      </div>
      <div class="overlay-content" id="heatmapContent">
        ${renderHeatmap()}
      </div>
    </div>
  `;
}

/**
 * Renderiza overlay de prévia do bracket
 */
function renderBracketPreviewOverlay() {
  if (!contestState || contestState.phase !== 'qualifying') return '';
  
  return `
    <div class="contest-overlay" id="bracketPreviewOverlay" aria-hidden="true">
      <div class="overlay-header">
        <h3>Prévia do Bracket Final</h3>
        <button class="overlay-close" onclick="toggleOverlay('bracketPreviewOverlay')" aria-label="Fechar">&times;</button>
      </div>
      <div class="overlay-content" id="bracketPreviewContent">
        ${renderBracketPreview()}
      </div>
    </div>
  `;
}

/**
 * Renderiza árvore visual do bracket (fase bracket)
 */
function renderBracketTree() {
  // Função legada: não mais usada no sistema pairwise
  // Mantida apenas para compatibilidade com código que pode chamá-la
  return '<p class="muted">Árvore de bracket não disponível no sistema pairwise atual.</p>';
}

/**
 * Renderiza overlay da árvore do bracket
 */
function renderBracketTreeOverlay() {
  if (!contestState || contestState.phase !== 'bracket') return '';
  
  return `
    <div class="contest-overlay" id="bracketTreeOverlay" aria-hidden="true">
      <div class="overlay-header">
        <h3>Bracket Final - Árvore Completa</h3>
        <button class="overlay-close" onclick="toggleOverlay('bracketTreeOverlay')" aria-label="Fechar">&times;</button>
      </div>
      <div class="overlay-content" id="bracketTreeContent">
        ${renderBracketTree()}
      </div>
    </div>
  `;
}

/**
 * Mostra detalhes de uma foto (gráfico Elo, timeline, etc)
 * Função global para ser chamada via onclick
 */
window.showPhotoDetails = function(photoId) {
  if (!contestState) return;
  
  const photo = contestState.qualifiedPhotos.find(p => p.id === photoId);
  if (!photo) return;
  
  const { eloScores, battleHistory, qualifying, scoresAndTiers, eloRange } = contestState;
  const eloHistory = qualifying?.eloHistory?.[photoId] || [];
  const photoBattles = battleHistory.filter(b => 
    b.photoA === photoId || b.photoB === photoId
  );
  
  const photoStats = calculatePhotoStatsState([photo], eloScores, battleHistory, contestState, contestState.photoStats);
  const stats = photoStats[photoId];
  const scoreData = scoresAndTiers[photoId] || { score: 50, tier: TIERS[4] };
  
  // Converter eloHistory para scoreHistory
  const scoreHistory = eloHistory.map(h => ({
    score: normalizeEloToScore(h.elo, eloRange.min, eloRange.max),
    timestamp: h.timestamp,
    battleId: h.battleId
  }));
  
  // Criar modal de detalhes
  const modal = document.createElement('div');
  modal.className = 'photo-details-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>Detalhes da Foto</h3>
        <button class="modal-close" onclick="this.closest('.photo-details-modal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="photo-details-main">
          <img src="${photo.thumb}" alt="Foto" class="details-main-image">
          <div class="details-stats">
            <div class="stat-item">
              <strong>Score:</strong> ${scoreData.score}/100 ${scoreData.tier.icon}
            </div>
            <div class="stat-item">
              <strong>Tier:</strong> ${scoreData.tier.label}
            </div>
            <div class="stat-item">
              <strong>Ranking:</strong> #${stats?.rank || 'N/A'}
            </div>
            <div class="stat-item">
              <strong>Recorde:</strong> ${stats?.wins || 0}W - ${stats?.losses || 0}L
            </div>
          </div>
        </div>
        
        <div class="details-section">
          <h4>Evolução do Score</h4>
          <canvas id="scoreChart-${photoId}" width="800" height="200"></canvas>
        </div>
        
        <div class="details-section">
          <h4>Histórico de Batalhas</h4>
          <div class="battle-timeline">
            ${renderBattleTimeline(photoId, photoBattles, eloScores, scoresAndTiers, eloRange)}
          </div>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Renderizar gráfico
  setTimeout(() => {
    renderScoreChart(`scoreChart-${photoId}`, scoreHistory);
  }, 100);
}

/**
 * Renderiza gráfico de evolução do Score (0-100)
 */
function renderScoreChart(canvasId, scoreHistory) {
  const canvas = $(canvasId);
  if (!canvas) return;
  
  // Se histórico insuficiente, mostrar mensagem
  if (scoreHistory.length < 2) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Histórico insuficiente para gráfico', canvas.width / 2, canvas.height / 2);
    return;
  }
  
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const padding = 40;
  
  // Limpar canvas
  ctx.clearRect(0, 0, width, height);
  
  // Calcular escala (sempre 0-100)
  const minScore = 0;
  const maxScore = 100;
  const range = maxScore - minScore;
  const scaleY = (height - padding * 2) / range;
  const scaleX = (width - padding * 2) / (scoreHistory.length - 1);
  
  // Desenhar eixos
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();
  
  // Desenhar linha do gráfico
  ctx.strokeStyle = '#6aa3ff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  
  scoreHistory.forEach((point, idx) => {
    const x = padding + idx * scaleX;
    const y = height - padding - (point.score - minScore) * scaleY;
    
    if (idx === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  
  ctx.stroke();
  
  // Desenhar pontos
  ctx.fillStyle = '#6aa3ff';
  scoreHistory.forEach((point, idx) => {
    const x = padding + idx * scaleX;
    const y = height - padding - (point.score - minScore) * scaleY;
    
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
  
  // Labels do eixo Y (0, 25, 50, 75, 100)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  [0, 25, 50, 75, 100].forEach(score => {
    const y = height - padding - (score - minScore) * scaleY;
    ctx.fillText(score.toString(), padding - 5, y + 3);
  });
  
  // Label do eixo X
  ctx.fillStyle = '#fff';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Score (0-100)', width / 2, height - 10);
}

/**
 * Renderiza timeline de batalhas
 */
function renderBattleTimeline(photoId, battles, eloScores, scoresAndTiers = null, eloRange = null) {
  // Ordenar por timestamp (mais antiga → mais recente)
  const sortedBattles = [...battles].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  
  return sortedBattles.map((battle, idx) => {
    const opponentId = battle.photoA === photoId ? battle.photoB : battle.photoA;
    const opponent = contestState.qualifiedPhotos.find(p => p.id === opponentId);
    const won = battle.winner === photoId;
    
    // Calcular variação de score
    let scoreBefore = 50;
    let scoreAfter = 50;
    let scoreChange = 0;
    
    if (eloRange && scoresAndTiers && battle.eloChange) {
      // Calcular Elo antes e depois
      const eloChange = won 
        ? (battle.eloChange?.winner || 0)
        : (battle.eloChange?.loser || 0);
      const eloBefore = (eloScores[photoId] || 1500) - eloChange;
      const eloAfter = eloScores[photoId] || 1500;
      
      // Converter para score
      scoreBefore = normalizeEloToScore(eloBefore, eloRange.min, eloRange.max);
      scoreAfter = normalizeEloToScore(eloAfter, eloRange.min, eloRange.max);
      scoreChange = scoreAfter - scoreBefore;
    } else {
      // Usar score atual
      const currentScore = scoresAndTiers?.[photoId]?.score || 50;
      scoreAfter = currentScore;
      scoreBefore = currentScore;
    }
    
    const tierAfter = getTierFromScore(scoreAfter);
    
    return `
      <div class="timeline-item ${won ? 'won' : 'lost'}">
        <div class="timeline-marker"></div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="timeline-battle-num">Batalha ${idx + 1}</span>
            <span class="timeline-result ${won ? 'win' : 'loss'}">${won ? 'Vitória' : 'Derrota'}</span>
          </div>
          <div class="timeline-opponent">
            <img src="${opponent?.thumb || ''}" alt="Oponente" class="timeline-opponent-thumb">
            <span>vs ${opponentId}</span>
          </div>
          <div class="timeline-score">
            <span class="score-before">${scoreBefore}/100</span>
            <span class="score-arrow">→</span>
            <span class="score-after">${scoreAfter}/100 ${tierAfter.icon}</span>
            <span class="score-change ${scoreChange > 0 ? 'positive' : 'negative'}">
              (${scoreChange > 0 ? '+' : ''}${Math.round(scoreChange)})
            </span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Variável para rastrear se o listener de teclado já foi adicionado
// Gerenciado pelo módulo contest-battle.js
let battleKeysHandler = null;

/**
 * Handler de atalhos de teclado na batalha
 */
function handleBattleKeys(e) {
  if (battleModule) {
    return battleModule.handleBattleKeys(e);
  }
}

/**
 * Registra vencedor de um confronto
 */
async function chooseBattleWinner(winner) {
  if (battleModule) {
    return battleModule.chooseBattleWinner(winner);
  }
}

/**
 * Processa batalha da fase classificatória
 */
async function handleQualifyingBattle(winner) {
  if (battleModule) {
    return battleModule.handleQualifyingBattle(winner);
  }
}



/**
 * Finaliza contest e vai para resultados
 */
function finishContest() {
  const context = {
    contestState: { current: contestState },
    toast
  };
  finishContestManager(context);
  contestState = context.contestState.current;
}

/**
 * Confirma cancelamento do contest
 */
function confirmCancelContest() {
  openConfirm({
    title: 'Cancelar Contest?',
    message: 'Todo o progresso será perdido. Deseja cancelar?',
    confirmText: 'Cancelar Contest',
    onConfirm: () => {
      contestState = null;
      saveContestState();
      renderContestView();
      toast('Contest cancelado.');
    }
  });
}

/**
 * Salva estado do contest no localStorage
 */
function saveContestState() {
  const context = {
    contestState: { current: contestState }
  };
  saveContestStateManager(context);
}

/**
 * Carrega estado do contest do localStorage
 */
function loadContestState() {
  const context = {
    contestState: { current: contestState },
    allPhotos
  };
  loadContestStateManager(context);
  contestState = context.contestState.current;
}

/**
 * Inicializa aba "Resultados"
 */
function initResultsView() {
  window.addEventListener('hashchange', () => {
    if (location.hash === '#/results') {
      renderResultsView();
    }
  });
  
  if (location.hash === '#/results') {
    setTimeout(() => renderResultsView(), 100);
  }
}

/**
 * Renderiza aba "Resultados"
 */
async function renderResultsView() {
  // Carregar fotos atualizadas PRIMEIRO
  allPhotos = await getAllPhotos();
  
  // Carregar estado do contest
  loadContestState();
  
  if (resultsModule) {
    return resultsModule.renderResultsView();
  }
}

/**
 * Renderiza histórico completo de batalhas em brackets para a tela de resultados
 */
function renderBracketHistory() {
  if (resultsModule) {
    return resultsModule.renderBracketHistory();
  }
  return '<p class="muted">Módulo de resultados não inicializado.</p>';
}


/**
 * Confirma recomeço do contest
 */
function confirmRestartContest() {
  if (resultsModule) {
    return resultsModule.confirmRestartContest();
  }
}

/**
 * Renderiza interface da aba "Avaliar"
 */
async function renderRateView() {
  const container = $('#rateView');
  if (!container) return;
  
  // Carregar fotos atualizadas
  allPhotos = await getAllPhotos();
  let allVisiblePhotos = allPhotos.filter(p => !p._isSplit); // Todas visíveis
  
  // Aplicar ordenação ativa
  const sortFn = SORT_OPTIONS[currentSort]?.fn || SORT_OPTIONS['date-desc'].fn;
  allVisiblePhotos.sort(sortFn);
  
  // Guardar ID da foto atual (para manter foco ao alternar checkbox)
  const currentPhotoId = rateViewPhotos[rateViewIndex]?.id;
  
  // Aplicar filtro "apenas não avaliadas" se ativo
  rateViewPhotos = rateViewOnlyUnrated 
    ? allVisiblePhotos.filter(p => !p.rating || p.rating === 0)
    : allVisiblePhotos;
  
  // Estado vazio
  if (rateViewPhotos.length === 0) {
    container.innerHTML = `
      <div class="rate-empty">
        <div class="rate-empty-icon">🎉</div>
        <h3>${rateViewOnlyUnrated ? 'Todas as fotos já foram avaliadas!' : 'Nenhuma foto para avaliar'}</h3>
        <p>${rateViewOnlyUnrated ? 'Você concluiu a avaliação de todas as fotos.' : 'Faça upload de fotos primeiro para começar a avaliar.'}</p>
        <button class="btn" onclick="location.hash = '#/upload'">
          ${rateViewOnlyUnrated ? 'Ver todas as fotos' : 'Ir para Upload'}
        </button>
      </div>
    `;
    return;
  }
  
  // Tentar manter foco na mesma foto ao alternar checkbox
  if (currentPhotoId) {
    const newIndex = rateViewPhotos.findIndex(p => p.id === currentPhotoId);
    if (newIndex >= 0) {
      rateViewIndex = newIndex;
    } else {
      // Foto atual não está mais na lista filtrada, ir para próxima disponível
      rateViewIndex = Math.min(rateViewIndex, rateViewPhotos.length - 1);
    }
  }
  
  if (rateViewIndex < 0) rateViewIndex = 0;
  if (rateViewIndex >= rateViewPhotos.length) rateViewIndex = rateViewPhotos.length - 1;
  
  const currentPhoto = rateViewPhotos[rateViewIndex];
  const totalPhotos = allVisiblePhotos.length;
  const ratedCount = allVisiblePhotos.filter(p => p.rating > 0).length;
  const currentPosition = rateViewIndex + 1;
  const listSize = rateViewPhotos.length;
  
  container.innerHTML = `
    <div class="rate-container">
      <div class="rate-progress">
        ${rateViewOnlyUnrated 
          ? `Não avaliada <span class="current">${currentPosition}</span> de ${listSize} • Total: ${totalPhotos} fotos (<span class="current">${ratedCount}</span> avaliadas)`
          : `Foto <span class="current">${currentPosition}</span> de ${totalPhotos} (<span class="current">${ratedCount}</span> avaliadas)`
        }
      </div>
      
      <div class="rate-image-wrapper">
        <img src="${currentPhoto.thumb}" alt="Foto para avaliar" id="rateImage">
      </div>
      
      <div class="rate-controls" id="rateControls"></div>
      
      <div class="rate-navigation">
        <button class="btn btn-secondary rate-nav-btn" id="ratePrev" ${rateViewIndex === 0 ? 'disabled' : ''}>
          ← Anterior
        </button>
        <button class="btn btn-secondary rate-nav-btn" id="rateNext" ${rateViewIndex === listSize - 1 ? 'disabled' : ''}>
          Próxima →
        </button>
      </div>
      
      <div class="rate-options">
        <label class="rate-option-checkbox">
          <input type="checkbox" id="rateOnlyUnrated" ${rateViewOnlyUnrated ? 'checked' : ''}>
          Mostrar apenas não avaliadas
        </label>
      </div>
    </div>
  `;
  
  // Adicionar estrelas
  const controlsContainer = $('#rateControls');
  const starRating = createStarRating(currentPhoto.rating || 0, async (newRating) => {
    await setPhotoRating(currentPhoto.id, newRating);
    
    // Delay de 300ms antes de avançar automaticamente (para dar tempo do feedback visual)
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Se marcou "apenas não avaliadas" e avaliou a foto, avançar automaticamente
    if (rateViewOnlyUnrated && newRating > 0) {
      if (rateViewIndex < rateViewPhotos.length - 1) {
        rateViewIndex++;
        renderRateView();
      } else {
        // Era a última, re-renderizar para mostrar estado vazio
        renderRateView();
      }
    }
  });
  controlsContainer.appendChild(starRating);
  
  // Event listeners de navegação
  $('#ratePrev')?.addEventListener('click', () => {
    if (rateViewIndex > 0) {
      rateViewIndex--;
      renderRateView();
    }
  });
  
  $('#rateNext')?.addEventListener('click', () => {
    if (rateViewIndex < listSize - 1) {
      rateViewIndex++;
      renderRateView();
    }
  });
  
  $('#rateOnlyUnrated')?.addEventListener('change', (e) => {
    rateViewOnlyUnrated = e.target.checked;
    // Não resetar índice - será ajustado no próximo render
    renderRateView();
  });
  
  // Atalhos de teclado (←/→, 1-5, 0, Esc)
  document.addEventListener('keydown', handleRateViewKeys);
}

/**
 * Handler de atalhos de teclado na aba "Avaliar"
 */
function handleRateViewKeys(e) {
  // Apenas se estiver na aba "Avaliar"
  if (location.hash !== '#/rate') return;
  
  const tag = (e.target && e.target.tagName) || "";
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
  if (typing) return;
  
  // Navegação ←/→
  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    $('#ratePrev')?.click();
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    $('#rateNext')?.click();
  }
  
  // Rating 1-5 - simular click na estrela correspondente
  if (e.key >= '1' && e.key <= '5') {
    e.preventDefault();
    const rating = parseInt(e.key, 10);
    const starRatingContainer = $('#rateControls .star-rating');
    if (starRatingContainer) {
      const targetStar = starRatingContainer.querySelector(`.star[data-value="${rating}"]`);
      if (targetStar) {
        targetStar.click(); // Dispara o callback do createStarRating
      }
    }
  }
  
  // Remover rating (0) - simular click na 1ª estrela com rating 0
  if (e.key === '0') {
    e.preventDefault();
    const currentPhoto = rateViewPhotos[rateViewIndex];
    if (currentPhoto) {
      // Atualizar rating para 0
      rateCurrentPhoto(0);
    }
  }
  
  // Voltar para Upload (Esc)
  if (e.key === 'Escape') {
    e.preventDefault();
    location.hash = '#/upload';
  }
}

/**
 * Avalia foto atual na aba "Avaliar" (usado por atalhos de teclado)
 */
async function rateCurrentPhoto(rating) {
  if (!rateViewPhotos[rateViewIndex]) return;
  
  const currentPhoto = rateViewPhotos[rateViewIndex];
  
  // Atualizar rating
  await setPhotoRating(currentPhoto.id, rating);
  
  // Atualizar estrelas visualmente
  const starRatingContainer = $('#rateControls .star-rating');
  if (starRatingContainer) {
    updateStarRating(starRatingContainer, rating);
  }
  
  // Delay de 300ms antes de avançar automaticamente
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // Se marcou "apenas não avaliadas" e avaliou a foto, avançar automaticamente
  if (rateViewOnlyUnrated && rating > 0) {
    // Recarregar lista (foto avaliada sai do filtro)
    const allPhotos = await getAllPhotos();
    let allVisiblePhotos = allPhotos.filter(p => !p._isSplit);
    
    // Aplicar ordenação
    const sortFn = SORT_OPTIONS[currentSort]?.fn || SORT_OPTIONS['date-desc'].fn;
    allVisiblePhotos.sort(sortFn);
    
    rateViewPhotos = allVisiblePhotos.filter(p => !p.rating || p.rating === 0);
    
    if (rateViewPhotos.length === 0) {
      // Todas avaliadas
      renderRateView();
    } else {
      // Manter no mesmo índice (ou ajustar se necessário)
      if (rateViewIndex >= rateViewPhotos.length) {
        rateViewIndex = rateViewPhotos.length - 1;
      }
      renderRateView();
    }
  }
}

// ========================================
// ===== RATING NO VIEWER =====
// ========================================

/**
 * Atualiza estrelas de rating no viewer fullscreen
 */
function updateViewerRating() {
  if (currentIndex < 0 || !currentList.length) return;
  
  const photo = currentList[currentIndex];
  const ratingContainer = $('#viewerRating');
  
  if (!ratingContainer) return;
  
  // Limpar container
  ratingContainer.innerHTML = '';
  
  // Criar estrelas - scrollToPhoto = false, closeViewer já faz o scroll
  const starRating = createStarRating(photo.rating || 0, (newRating) => {
    setPhotoRating(photo.id, newRating, false);
  });
  
  ratingContainer.appendChild(starRating);
}
