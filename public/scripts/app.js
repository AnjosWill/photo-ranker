/**
 * app.js - Photo Ranker MVP
 * Lógica principal da aplicação
 * 
 * Sprint 1: Upload, grid, viewer, multi-select
 * Sprint 2: Detecção 2×2, cropper, zoom/pan
 * Sprint 3: Rating por estrelas, filtros, ordenação, aba "Avaliar"
 * Sprint 4: Contest com sistema de tiers temáticos (0-100)
 */

import { $, on } from "./ui.js";
import { calculateScoresAndTiers, calculateEloRange, normalizeEloToScore, getTierFromScore, TIERS } from "./tiers.js";
import { savePhotos, getAllPhotos, clearAll } from "./db.js";
import { filesToThumbs } from "./image-utils.js";
import { openCropper } from "./cropper.js";
import { createStarRating, updateStarRating } from "./rating.js";
import { 
  calculateElo, 
  initializeEloScores, 
  generateRoundRobin,
  updateEloScores,
  getChampion,
  generateRanking
} from "./elo.js";

const MAX_SIZE_MB = 15;
const MAX_FILES_PER_BATCH = 300;
const ACCEPTED_TYPES = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i; // aceitamos HEIC/HEIF, mas validaremos decodificação

const routes = ["upload", "rate", "contest", "results"];

let confirmOpen = false; // ⬅️ novo: bloqueia navegação do viewer quando true

// Sprint 3: Estado de filtros e rating
let currentFilter = 'all'; // 'all' | 'rated5' | 'unrated'
let currentSort = 'date-desc'; // Ordenação ativa
let allPhotos = []; // Cache de todas as fotos
let rateViewIndex = 0; // Índice atual na aba "Avaliar"
let rateViewPhotos = []; // Lista de fotos para avaliar (filtrada)
let rateViewOnlyUnrated = false; // Filtro "apenas não avaliadas"

// Sprint 4: Estado do Contest (Sistema Completo: Classificatória + Bracket)
let contestState = null; 
// {
//   phase: 'qualifying' | 'final' | 'finished',
//   qualifiedPhotos: Photo[],
//   
//   // Fase Classificatória
//   qualifying: {
//     totalBattles: number,        // Total de batalhas planejadas
//     completedBattles: number,    // Batalhas realizadas
//     battlesPerPhoto: number,     // Batalhas por foto (ex: 5)
//     currentMatch: {photoA, photoB} | null,
//     pendingMatches: [{photoA, photoB}],
//     eloHistory: { photoId: [{elo, timestamp, battleId}] }  // Histórico de Elo por foto
//   },
//   
//   // Fase Bracket
//   bracket: {
//     seeds: Photo[],              // Top N do ranking (ordenado)
//     rounds: [{round: number, matches: [{photoA, photoB, winner?, votesA?, votesB?}]}],
//     currentRound: number,
//     currentMatchIndex: number
//   },
//   
//   // Estado Global
//   eloScores: { photoId: rating },
//   battleHistory: [{ photoA, photoB, winner, timestamp, eloChange, phase, votesA?, votesB? }],
//   photoStats: { photoId: {wins, losses, elo, rank} }
// }

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
  initFilters(); // Sprint 3
  initRateView(); // Sprint 3
  initContestView(); // Sprint 4
  initResultsView(); // Sprint 4
  
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
    
    // Sprint 3: Atalhos de rating (1-5, 0) - Globais
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

    // Sprint 2: Análise de imagens 2×2 via worker
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
  
  // Sprint 2: Filtrar fotos divididas (originais com _isSplit)
  let visiblePhotos = photos.filter(p => !p._isSplit);
  
  // Sprint 3: Aplicar ordenação ativa
  const sortFn = SORT_OPTIONS[currentSort]?.fn || SORT_OPTIONS['date-desc'].fn;
  visiblePhotos.sort(sortFn);
  
  // Sprint 3: Aplicar filtro ativo
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
    // Sprint 3: Marcar se está avaliada para controlar opacidade das estrelas
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
    
    // Sprint 3: Adicionar estrelas de rating
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
  const allPhotos = await getAllPhotos();
  // Sprint 3: Aplicar mesma ordenação e filtro do grid
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
  // Sprint 3: Atualizar estrelas de rating
  updateViewerRating();
}

/**
 * Abre viewer pelo índice (mantido para compatibilidade)
 */
async function openViewer(index) {
  const allPhotos = await getAllPhotos();
  // Sprint 3: Aplicar mesma ordenação e filtro do grid
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
  // Sprint 3: Atualizar estrelas de rating
  updateViewerRating();
}

function updateViewerSplitButton() {
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
  
  // Sprint 3: Ao fechar viewer, fazer scroll até a última foto visualizada
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
function viewerPrev() {
  if (currentIndex > 0) {
    openViewer(currentIndex - 1);
  }
}
function viewerNext() {
  if (currentIndex < currentList.length - 1) {
    openViewer(currentIndex + 1);
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
  // Sprint 3: Atalhos de rating no viewer (1-5 para avaliar, 0 para remover)
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
//  SPRINT 3: RATING E FILTROS
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
//  SPRINT 3: ABA "AVALIAR"
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
//  SPRINT 4: CONTEST MODE
// ========================================

/**
 * Inicializa aba "Contest"
 */
function initContestView() {
  // Renderizar quando aba for aberta
  window.addEventListener('hashchange', () => {
    if (location.hash === '#/contest') {
      console.log('[DEBUG] hashchange detectado, renderizando contest');
      renderContestView();
    }
  });
  
  // Se já estiver na aba ao carregar
  if (location.hash === '#/contest') {
    console.log('[DEBUG] Já está na aba contest ao carregar');
    setTimeout(() => renderContestView(), 100);
  }
  
  // Fallback: verificar se a rota está ativa mas não renderizou
  setTimeout(() => {
    const contestSection = document.querySelector('[data-route="contest"]');
    const contestView = $('#contestView');
    if (contestSection && contestSection.classList.contains('active') && contestView && !contestView.innerHTML.trim()) {
      console.log('[DEBUG] Fallback: contest ativo mas vazio, renderizando...');
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
    console.error('[DEBUG] contestView container não encontrado!');
    return;
  }
  
  console.log('[DEBUG] renderContestView chamado');
  
  // Carregar fotos atualizadas PRIMEIRO (antes de loadContestState)
  allPhotos = await getAllPhotos();
  console.log('[DEBUG] allPhotos carregadas:', allPhotos.length);
  
  const visiblePhotos = allPhotos.filter(p => !p._isSplit);
  console.log('[DEBUG] visiblePhotos:', visiblePhotos.length);
  
  // Carregar ou inicializar estado do contest (agora que allPhotos está disponível)
  loadContestState();
  console.log('[DEBUG] contestState após load:', contestState ? contestState.phase : 'null');
  
  // Verificar se há contest ativo
  if (contestState && (contestState.phase === 'qualifying' || contestState.phase === 'final')) {
    console.log('[DEBUG] Contest ativo encontrado, renderizando batalha');
    await renderBattle();
    return;
  }
  
  // Estado inicial: sem contest ativo
  const qualifiedPhotos = visiblePhotos.filter(p => p.rating === 5);
  const qualifiedCount = qualifiedPhotos.length;
  
  console.log('[DEBUG] Renderizando estado inicial, qualifiedCount:', qualifiedCount);
  
  container.innerHTML = `
    <div class="contest-empty">
      <div class="contest-empty-icon">🏆</div>
      <h3>Contest Mode</h3>
      <p>Compare fotos lado a lado e escolha a melhor!</p>
      
      <div class="contest-stats">
        <div class="contest-stat">
          <strong>${qualifiedCount}</strong>
          <span>foto${qualifiedCount !== 1 ? 's' : ''} qualificada${qualifiedCount !== 1 ? 's' : ''} (⭐5)</span>
        </div>
      </div>
      
      <button id="startContest" class="btn" ${qualifiedCount < 2 ? 'disabled' : ''}>
        Iniciar Contest
      </button>
      
      <p class="muted">
        ${qualifiedCount < 2 
          ? 'Você precisa de pelo menos 2 fotos com ⭐5 para iniciar' 
          : 'Clique para começar os confrontos'}
      </p>
    </div>
  `;
  
  // Event listener para iniciar contest
  const startBtn = $('#startContest');
  if (startBtn && !startBtn.disabled) {
    startBtn.addEventListener('click', startContest);
  }
  
  console.log('[DEBUG] renderContestView concluído');
}

/**
 * Gera próximo confronto baseado no ranking atual
 * @param {Array} photos - Fotos participantes
 * @param {Object} eloScores - Scores Elo atuais
 * @param {Array} battleHistory - Histórico de batalhas
 * @returns {{photoA, photoB} | null} Próximo confronto ou null se não há mais
 */
function generateNextMatch(photos, eloScores, battleHistory) {
  // Ordenar por Elo (ranking atual)
  const ranked = [...photos].sort((a, b) => 
    (eloScores[b.id] || 1500) - (eloScores[a.id] || 1500)
  );
  
  // Estratégia: parear fotos próximas no ranking que ainda não batalharam
  for (let i = 0; i < ranked.length - 1; i++) {
    for (let j = i + 1; j < ranked.length; j++) {
      const photoA = ranked[i];
      const photoB = ranked[j];
      
      // Verificar se já batalharam
      const pairKey = [photoA.id, photoB.id].sort().join('-');
      const alreadyFaced = battleHistory.some(b => {
        const battleKey = [b.photoA, b.photoB].sort().join('-');
        return battleKey === pairKey;
      });
      
      if (!alreadyFaced) {
        return { photoA, photoB };
      }
    }
  }
  
  return null; // Todas as fotos já batalharam entre si
}

/**
 * Calcula estatísticas de cada foto
 * OTIMIZADO: Usa cache se disponível, atualiza incrementalmente
 * @param {Array} photos - Fotos participantes
 * @param {Object} eloScores - Scores Elo
 * @param {Array} battleHistory - Histórico de batalhas
 * @param {Object} cachedStats - Stats em cache (opcional)
 * @returns {Object} { photoId: {wins, losses, elo, rank} }
 */
function calculatePhotoStats(photos, eloScores, battleHistory, cachedStats = null) {
  // Calcular do zero (sempre recalcular para garantir consistência)
  // Cache será usado apenas para atualização incremental em handleQualifyingBattle
  const stats = {};
  
  photos.forEach(p => {
    stats[p.id] = {
      wins: 0,
      losses: 0,
      elo: eloScores[p.id] || 1500
    };
  });
  
  battleHistory.forEach(battle => {
    if (stats[battle.winner]) stats[battle.winner].wins++;
    
    const loser = battle.photoA === battle.winner ? battle.photoB : battle.photoA;
    if (stats[loser]) stats[loser].losses++;
  });
  
  // Na fase final, priorizar W-L sobre Elo
  const prioritizeWL = contestState?.phase === 'final';
  return calculateRankingFromStats(stats, prioritizeWL);
}

/**
 * Calcula ranking a partir de stats (com critério de desempate)
 * @param {Object} stats - { photoId: {wins, losses, elo} }
 * @param {boolean} prioritizeWL - Se true, prioriza W-L sobre Elo (para fase final)
 * @returns {Object} Stats com rank adicionado
 */
function calculateRankingFromStats(stats, prioritizeWL = false) {
  // Ordenar com critério de desempate:
  // Se prioritizeWL (fase final):
  //   1. W-L (vitórias - perdas, maior → menor)
  //   2. Mais vitórias (maior → menor)
  //   3. Elo (maior → menor)
  //   4. ID (para consistência)
  // Senão (fase classificatória):
  //   1. Elo (maior → menor)
  //   2. Mais vitórias (maior → menor)
  //   3. Menos derrotas (menor → maior)
  //   4. ID (para consistência)
  const ranked = Object.entries(stats)
    .sort((a, b) => {
      const [idA, statsA] = a;
      const [idB, statsB] = b;
      
      if (prioritizeWL) {
        // Fase final: priorizar W-L
        const wlA = statsA.wins - statsA.losses;
        const wlB = statsB.wins - statsB.losses;
        
        // 1. W-L (vitórias - perdas)
        if (wlB !== wlA) {
          return wlB - wlA;
        }
        
        // 2. Mais vitórias
        if (statsB.wins !== statsA.wins) {
          return statsB.wins - statsA.wins;
        }
        
        // 3. Elo
        if (statsB.elo !== statsA.elo) {
          return statsB.elo - statsA.elo;
        }
        
        // 4. ID (para consistência)
        return idA.localeCompare(idB);
      } else {
        // Fase classificatória: priorizar Elo
        // 1. Elo
        if (statsB.elo !== statsA.elo) {
          return statsB.elo - statsA.elo;
        }
        
        // 2. Mais vitórias
        if (statsB.wins !== statsA.wins) {
          return statsB.wins - statsA.wins;
        }
        
        // 3. Menos derrotas
        if (statsA.losses !== statsB.losses) {
          return statsA.losses - statsB.losses;
        }
        
        // 4. ID (para consistência)
        return idA.localeCompare(idB);
      }
    })
    .map(([id], index) => ({ id, rank: index + 1 }));
  
  ranked.forEach(({ id, rank }) => {
    if (stats[id]) stats[id].rank = rank;
  });
  
  return stats;
}

/**
 * Valida consistência do estado do contest
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateContestState() {
  const errors = [];
  
  if (!contestState) {
    return { valid: false, errors: ['contestState não existe'] };
  }
  
  const { eloScores, battleHistory, qualifiedPhotos } = contestState;
  
  // Validar: soma de wins/losses = total de batalhas
  const totalBattles = battleHistory.length;
  const totalWins = Object.values(contestState.photoStats || {}).reduce((sum, s) => sum + (s.wins || 0), 0);
  const totalLosses = Object.values(contestState.photoStats || {}).reduce((sum, s) => sum + (s.losses || 0), 0);
  
  if (totalWins + totalLosses !== totalBattles * 2) {
    errors.push(`Inconsistência: wins (${totalWins}) + losses (${totalLosses}) ≠ batalhas × 2 (${totalBattles * 2})`);
  }
  
  // Validar: todas as fotos têm Elo
  qualifiedPhotos.forEach(p => {
    if (!eloScores[p.id] && eloScores[p.id] !== 0) {
      errors.push(`Foto ${p.id} não tem Elo definido`);
    }
  });
  
  // Validar: battleHistory tem todas as informações necessárias
  battleHistory.forEach((battle, idx) => {
    if (!battle.photoA || !battle.photoB || !battle.winner) {
      errors.push(`Batalha ${idx} está incompleta`);
    }
    if (battle.winner !== battle.photoA && battle.winner !== battle.photoB) {
      errors.push(`Batalha ${idx}: winner não é photoA nem photoB`);
    }
  });
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * Calcula número de batalhas por foto na fase classificatória
 * @param {number} totalPhotos - Total de fotos
 * @returns {number} Batalhas por foto
 */
function calculateBattlesPerPhoto(totalPhotos) {
  // Fórmula: garantir que cada foto batalhe o suficiente para ranking confiável
  // Mínimo 3, máximo 8 batalhas por foto
  if (totalPhotos <= 4) return Math.min(3, totalPhotos - 1);
  if (totalPhotos <= 8) return 4;
  if (totalPhotos <= 16) return 5;
  return 6; // Para 17+ fotos
}

/**
 * Verifica se duas fotos já batalharam (helper)
 */
function haveAlreadyBattled(photoAId, photoBId, battleHistory) {
  const pairKey = [photoAId, photoBId].sort().join('-');
  return battleHistory.some(b => {
    const battleKey = [b.photoA, b.photoB].sort().join('-');
    return battleKey === pairKey;
  });
}

/**
 * Gera batalhas da fase classificatória (número controlado)
 * IMPORTANTE: Nunca gera confrontos repetidos - uma vez que duas fotos batalharam, nunca mais batalham
 * @param {Array} photos - Fotos participantes
 * @param {number} battlesPerPhoto - Batalhas por foto
 * @param {Object} eloScores - Scores Elo atuais
 * @param {Array} battleHistory - Histórico de batalhas
 * @returns {Array} [{photoA, photoB}, ...] Confrontos planejados
 */
/**
 * Gera batalhas da fase classificatória com pareamento inteligente por Elo
 * Pareia fotos com Elo similar para ranquear de forma eficiente
 * @param {Array} photos - Fotos participantes
 * @param {number} battlesPerPhoto - Batalhas por foto (pode ser menor que total)
 * @param {Object} eloScores - Scores Elo atuais
 * @param {Array} battleHistory - Histórico de batalhas
 * @returns {Array} [{photoA, photoB}, ...] Confrontos planejados
 */
function generateQualifyingBattles(photos, battlesPerPhoto, eloScores, battleHistory) {
  const matches = [];
  const photoBattleCount = {}; // Contador de batalhas por foto
  photos.forEach(p => photoBattleCount[p.id] = 0);
  
  // Criar conjunto de pares que já batalharam (para busca rápida)
  const battledPairs = new Set();
  battleHistory.forEach(b => {
    const pairKey = [b.photoA, b.photoB].sort().join('-');
    battledPairs.add(pairKey);
  });
  
  // Ordenar por Elo (maior → menor)
  const ranked = [...photos].sort((a, b) => 
    (eloScores[b.id] || 1500) - (eloScores[a.id] || 1500)
  );
  
  // ESTRATÉGIA: Parear fotos com Elo similar (não todos contra todos)
  // Para cada foto, tentar parear com fotos próximas no ranking
  for (let i = 0; i < ranked.length; i++) {
    const photoA = ranked[i];
    
    // Se já tem batalhas suficientes, pular
    if (photoBattleCount[photoA.id] >= battlesPerPhoto) continue;
    
    // Tentar parear com fotos próximas no ranking (Elo similar)
    // Buscar em uma janela ao redor da posição atual
    const windowSize = Math.min(5, ranked.length - 1); // Janela de ±5 posições
    const candidates = [];
    
    // Adicionar candidatos próximos (antes e depois no ranking)
    for (let offset = 1; offset <= windowSize; offset++) {
      if (i - offset >= 0) {
        candidates.push({ photo: ranked[i - offset], distance: offset });
      }
      if (i + offset < ranked.length) {
        candidates.push({ photo: ranked[i + offset], distance: offset });
      }
    }
    
    // Ordenar candidatos por distância (mais próximo primeiro)
    candidates.sort((a, b) => a.distance - b.distance);
    
    // Tentar parear com o melhor candidato disponível
    for (const candidate of candidates) {
      const photoB = candidate.photo;
      
      // Se photoB já tem batalhas suficientes, pular
      if (photoBattleCount[photoB.id] >= battlesPerPhoto) continue;
      
      // Verificar se já batalharam
      const pairKey = [photoA.id, photoB.id].sort().join('-');
      if (battledPairs.has(pairKey)) {
        continue; // Já batalharam, pular
      }
      
      // Verificar se já está nas matches geradas
      const alreadyInMatches = matches.some(m => {
        const matchPair = [m.photoA.id, m.photoB.id].sort().join('-');
        return matchPair === pairKey;
      });
      
      if (alreadyInMatches) {
        continue; // Já está na lista, pular
      }
      
      // Encontrou um par válido!
      matches.push({ photoA, photoB });
      photoBattleCount[photoA.id]++;
      photoBattleCount[photoB.id]++;
      battledPairs.add(pairKey); // Marcar como batalhado
      break; // Parar após encontrar um par para esta foto
    }
  }
  
  // Se ainda há fotos que precisam de mais batalhas, tentar parear com qualquer disponível
  const needsMore = ranked.filter(p => photoBattleCount[p.id] < battlesPerPhoto);
  if (needsMore.length >= 2) {
    for (let i = 0; i < needsMore.length; i++) {
      const photoA = needsMore[i];
      if (photoBattleCount[photoA.id] >= battlesPerPhoto) continue;
      
      for (let j = i + 1; j < needsMore.length; j++) {
        const photoB = needsMore[j];
        if (photoBattleCount[photoB.id] >= battlesPerPhoto) continue;
        
        const pairKey = [photoA.id, photoB.id].sort().join('-');
        if (battledPairs.has(pairKey)) continue;
        
        const alreadyInMatches = matches.some(m => {
          const matchPair = [m.photoA.id, m.photoB.id].sort().join('-');
          return matchPair === pairKey;
        });
        
        if (alreadyInMatches) continue;
        
        matches.push({ photoA, photoB });
        photoBattleCount[photoA.id]++;
        photoBattleCount[photoB.id]++;
        battledPairs.add(pairKey);
        break;
      }
    }
  }
  
  console.log('[DEBUG] generateQualifyingBattles: Geradas', matches.length, 'batalhas');
  console.log('[DEBUG] generateQualifyingBattles: Batalhas por foto:', photoBattleCount);
  
  return matches;
}

/**
 * Inicia um novo contest (Sistema Completo: Classificatória + Bracket)
 */
async function startContest() {
  const allPhotos = await getAllPhotos();
  const visiblePhotos = allPhotos.filter(p => !p._isSplit);
  const qualifiedPhotos = visiblePhotos.filter(p => p.rating === 5);
  
  if (qualifiedPhotos.length < 2) {
    toast('Você precisa de pelo menos 2 fotos com ⭐5');
    return;
  }
  
  // Inicializar scores Elo (todos começam iguais)
  const eloScores = initializeEloScores(qualifiedPhotos);
  
  // Calcular batalhas por foto
  const battlesPerPhoto = calculateBattlesPerPhoto(qualifiedPhotos.length);
  const totalBattles = Math.ceil((qualifiedPhotos.length * battlesPerPhoto) / 2);
  
  // Sistema Elo/MMR: Não gerar todas as batalhas de uma vez
  // Gerar batalhas dinamicamente conforme o Elo evolui
  // Iniciar com algumas batalhas iniciais para começar o ranking
  const initialMatches = generateQualifyingBattles(
    qualifiedPhotos, 
    Math.min(2, battlesPerPhoto), // Começar com 2 batalhas por foto
    eloScores, 
    []
  );
  
  console.log('[DEBUG] startContest - initialMatches geradas:', initialMatches.length);
  console.log('[DEBUG] startContest - primeira batalha:', initialMatches[0]);
  
  if (initialMatches.length === 0) {
    toast('Erro: Não foi possível gerar batalhas. Verifique se há fotos suficientes.');
    return;
  }
  
  // Inicializar histórico de Elo por foto
  const eloHistory = {};
  qualifiedPhotos.forEach(p => {
    eloHistory[p.id] = [{ elo: 1500, timestamp: Date.now(), battleId: null }];
  });
  
  contestState = {
    phase: 'qualifying',
    qualifiedPhotos: qualifiedPhotos,
    
    qualifying: {
      totalBattles: totalBattles,
      completedBattles: 0,
      battlesPerPhoto: battlesPerPhoto,
      currentMatch: initialMatches[0] || null,
      pendingMatches: initialMatches.slice(1),
      eloHistory: eloHistory,
      // Sistema dinâmico: gerar mais batalhas conforme Elo evolui
      dynamicMatching: true
    },
    
    bracket: null, // Será preenchido ao finalizar classificatória
    
    eloScores: eloScores,
    battleHistory: [],
    photoStats: {}, // Cache de stats para performance
    eloRange: { min: 1500, max: 1500 }, // Range inicial (todos começam iguais)
    scoresAndTiers: {}, // Cache de scores e tiers
    frozen: false // Se true, Elo e score estão congelados
  };
  
  // Calcular range inicial e scores/tiers
  contestState.eloRange = calculateEloRange(eloScores);
  contestState.scoresAndTiers = calculateScoresAndTiers(eloScores, contestState.eloRange.min, contestState.eloRange.max);
  
  saveContestState();
  renderBattle();
  
  toast(`Contest iniciado! ${qualifiedPhotos.length} participantes. Fase Classificatória: ${battlesPerPhoto} batalhas por foto (${totalBattles} total).`);
}

/**
 * Verifica se duas fotos já batalharam antes e retorna a vencedora
 * IMPORTANTE: Só verifica batalhas da fase 'qualifying', não do bracket
 * @param {string} photoAId - ID da foto A
 * @param {string} photoBId - ID da foto B
 * @param {Array} battleHistory - Histórico de batalhas
 * @returns {string|null} 'A' ou 'B' se já batalharam na qualifying, null caso contrário
 */
function getPreviousWinner(photoAId, photoBId, battleHistory) {
  for (const battle of battleHistory) {
    // Só considerar batalhas da fase qualifying (bracket permite re-batalhas)
    if (battle.phase && battle.phase !== 'qualifying') {
      continue;
    }
    
    const battleIds = [battle.photoA, battle.photoB].sort();
    const currentIds = [photoAId, photoBId].sort();
    
    // Verificar se são as mesmas fotos (ordem não importa)
    if (battleIds[0] === currentIds[0] && battleIds[1] === currentIds[1]) {
      // Retornar 'A' se photoA venceu, 'B' se photoB venceu
      return battle.winner === photoAId ? 'A' : 'B';
    }
  }
  return null;
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
      
      // Verificar se ambas são vencedoras ou ambas são perdedoras
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
  const photoStats = calculatePhotoStats(qualifiedPhotos, eloScores, battleHistory);
  
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
  const container = $('#contestView');
  if (!container) {
    console.error('[DEBUG] renderBattle: contestView container não encontrado!');
    return;
  }
  
  if (!contestState) {
    console.error('[DEBUG] renderBattle: contestState não existe!');
    // Se não há contestState, renderizar estado inicial
    await renderContestView();
    return;
  }
  
  console.log('[DEBUG] renderBattle chamado, phase:', contestState.phase);
  
  // Verificar se contest terminou
  if (contestState.phase === 'finished') {
    finishContest();
    return;
  }
  
  if (contestState.phase === 'qualifying') {
    await renderQualifyingBattle();
  } else if (contestState.phase === 'final') {
    await renderFinalBattle();
  } else {
    console.error('[DEBUG] renderBattle: phase desconhecida:', contestState.phase);
    // Se phase é desconhecida, renderizar estado inicial
    await renderContestView();
  }
}

/**
 * Renderiza batalha da fase classificatória
 */
async function renderQualifyingBattle() {
  const container = $('#contestView');
  if (!container) {
    console.error('[DEBUG] renderQualifyingBattle: container não encontrado!');
    return;
  }
  
  if (!contestState || !contestState.qualifying) {
    console.error('[DEBUG] renderQualifyingBattle: contestState ou qualifying não existe!');
    await renderContestView();
    return;
  }
  
  const { qualifying, eloScores, battleHistory, qualifiedPhotos } = contestState;
  
  console.log('[DEBUG] renderQualifyingBattle - qualifying:', qualifying);
  console.log('[DEBUG] renderQualifyingBattle - currentMatch:', qualifying?.currentMatch);
  console.log('[DEBUG] renderQualifyingBattle - pendingMatches:', qualifying?.pendingMatches?.length);
  
  // Se não há currentMatch, tentar pegar da fila
  if (!qualifying.currentMatch && qualifying.pendingMatches && qualifying.pendingMatches.length > 0) {
    console.log('[DEBUG] currentMatch vazio, pegando da fila');
    qualifying.currentMatch = qualifying.pendingMatches.shift() || null;
  }
  
  const { currentMatch } = qualifying;
  
  if (!currentMatch) {
    console.log('[DEBUG] Sem mais batalhas - finalizando classificatória');
    // Sem mais batalhas - finalizar classificatória
    await finishQualifyingAndStartBracket();
    return;
  }
  
  if (!currentMatch.photoA || !currentMatch.photoB) {
    console.error('[DEBUG] renderQualifyingBattle: currentMatch inválido!', currentMatch);
    await renderContestView();
    return;
  }
  
  const photoA = currentMatch.photoA;
  const photoB = currentMatch.photoB;
  
  // Verificar se já batalharam (apenas na fase classificatória, não no bracket)
  // No bracket, fotos podem batalhar novamente em rodadas diferentes
  // IMPORTANTE: Só verificar se o usuário ainda não votou manualmente
  // Se o usuário clicou, processar o voto normalmente (não usar confronto automático)
  // O confronto automático só deve ser usado quando renderiza a batalha, não quando processa o voto
  
  // Calcular estatísticas (usar cache se disponível)
  const photoStats = calculatePhotoStats(qualifiedPhotos, eloScores, battleHistory, contestState.photoStats);
  // Atualizar cache
  contestState.photoStats = photoStats;
  const statsA = photoStats[photoA.id];
  const statsB = photoStats[photoB.id];
  
  // Obter scores e tiers
  const scoreA = contestState.scoresAndTiers[photoA.id] || { score: 50, tier: TIERS[4] };
  const scoreB = contestState.scoresAndTiers[photoB.id] || { score: 50, tier: TIERS[4] };
  
  const progress = Math.round((qualifying.completedBattles / qualifying.totalBattles) * 100);
  
  container.innerHTML = `
    <div class="contest-battle">
      <div class="contest-progress">
        <strong>Fase Classificatória</strong><br>
        Batalha <span class="current">${qualifying.completedBattles + 1}</span> de ${qualifying.totalBattles} 
        <span class="progress-bar-mini">
          <span class="progress-fill" style="width: ${progress}%"></span>
        </span>
      </div>
      
      <div class="battle-with-ranking">
        <div class="battle-container">
          <!-- Foto A -->
          <div class="battle-photo" id="battlePhotoA" tabindex="0" role="button" aria-label="Escolher Foto A (1 ou ←)">
            <img src="${photoA.thumb}" alt="Foto A">
            <div class="battle-label">1</div>
            <div class="battle-info">
              <div class="battle-rank">#${statsA.rank} | ${statsA.wins}W-${statsA.losses}L</div>
            </div>
          </div>
          
          <!-- VS -->
          <div class="battle-vs">
            <span>VS</span>
          </div>
          
          <!-- Foto B -->
          <div class="battle-photo" id="battlePhotoB" tabindex="0" role="button" aria-label="Escolher Foto B (2 ou →)">
            <img src="${photoB.thumb}" alt="Foto B">
            <div class="battle-label">2</div>
            <div class="battle-info">
              <div class="battle-rank">#${statsB.rank} | ${statsB.wins}W-${statsB.losses}L</div>
            </div>
          </div>
        </div>
        
        <!-- Ranking dinâmico -->
        <div class="dynamic-ranking">
          <h4>Ranking</h4>
          <div class="ranking-list">
            ${renderDynamicRanking(qualifiedPhotos, photoStats)}
          </div>
        </div>
      </div>
      
      <div class="battle-actions">
        <button class="btn btn-secondary" id="toggleRankingView" data-tooltip="Ver Ranking Completo">
          📊 Ranking
        </button>
        <button class="btn btn-secondary" id="toggleHeatmap" data-tooltip="Heatmap de Confrontos">
          🔥 Heatmap
        </button>
        <button class="btn btn-secondary" id="toggleBracket" data-tooltip="Prévia do Bracket">
          🏆 Prévia Bracket
        </button>
        <button class="btn btn-secondary" id="cancelContest">Cancelar Contest</button>
      </div>
    </div>
    
    <!-- Overlays -->
    ${renderRankingOverlay()}
    ${renderHeatmapOverlay()}
    ${renderBracketPreviewOverlay()}
  `;
  
  // Remover listener antigo se existir
  if (battleKeysHandler) {
    document.removeEventListener('keydown', battleKeysHandler);
  }
  
  // Criar novo handler e adicionar
  battleKeysHandler = handleBattleKeys;
  document.addEventListener('keydown', battleKeysHandler);
  
  // Event listeners para cliques - usar event delegation para evitar problemas
  const battleContainer = $('.battle-container');
  if (battleContainer) {
    // Remover listeners antigos
    const newContainer = battleContainer.cloneNode(true);
    battleContainer.replaceWith(newContainer);
    
    // Adicionar listener no container (event delegation)
    newContainer.addEventListener('click', (e) => {
      const target = e.target.closest('#battlePhotoA, #battlePhotoB');
      if (!target) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      if (target.id === 'battlePhotoA') {
        console.log('[DEBUG] Clique detectado na Foto A');
        chooseBattleWinner('A');
      } else if (target.id === 'battlePhotoB') {
        console.log('[DEBUG] Clique detectado na Foto B');
        chooseBattleWinner('B');
      }
    });
  }
  
  $('#cancelContest')?.addEventListener('click', confirmCancelContest);
  $('#toggleRankingView')?.addEventListener('click', () => toggleOverlay('rankingOverlay'));
  $('#toggleHeatmap')?.addEventListener('click', () => toggleOverlay('heatmapOverlay'));
  $('#toggleBracket')?.addEventListener('click', () => toggleOverlay('bracketPreviewOverlay'));
}

/**
 * Renderiza batalha da fase final (todas contra todas entre fotos com score > 50)
 */
async function renderFinalBattle() {
  const container = $('#contestView');
  if (!container) {
    console.error('[DEBUG] renderFinalBattle: container não encontrado!');
    return;
  }
  
  if (!contestState || !contestState.final) {
    console.error('[DEBUG] renderFinalBattle: contestState ou final não existe!');
    await renderContestView();
    return;
  }
  
  const { final, eloScores, battleHistory } = contestState;
  const { finalPhotos } = final;
  
  console.log('[DEBUG] renderFinalBattle - final:', final);
  console.log('[DEBUG] renderFinalBattle - currentMatch:', final?.currentMatch);
  console.log('[DEBUG] renderFinalBattle - pendingMatches:', final?.pendingMatches?.length);
  
  // Se não há currentMatch, tentar pegar da fila
  if (!final.currentMatch && final.pendingMatches && final.pendingMatches.length > 0) {
    console.log('[DEBUG] currentMatch vazio, pegando da fila');
    final.currentMatch = final.pendingMatches.shift() || null;
  }
  
  const { currentMatch } = final;
  
  if (!currentMatch) {
    console.log('[DEBUG] Sem mais batalhas - finalizando contest');
    // Sem mais batalhas - finalizar contest
    await finishFinalPhase();
    return;
  }
  
  if (!currentMatch.photoA || !currentMatch.photoB) {
    console.error('[DEBUG] renderFinalBattle: currentMatch inválido!', currentMatch);
    await renderContestView();
    return;
  }
  
  const photoA = currentMatch.photoA;
  const photoB = currentMatch.photoB;
  
  // Calcular estatísticas (usar cache se disponível)
  const photoStats = calculatePhotoStats(finalPhotos, eloScores, battleHistory, contestState.photoStats);
  // Atualizar cache
  contestState.photoStats = photoStats;
  const statsA = photoStats[photoA.id];
  const statsB = photoStats[photoB.id];
  
  // Obter scores e tiers (valores congelados da classificatória)
  const scoreA = contestState.scoresAndTiers[photoA.id] || { score: 50, tier: TIERS[4] };
  const scoreB = contestState.scoresAndTiers[photoB.id] || { score: 50, tier: TIERS[4] };
  
  const progress = Math.round((final.completedBattles / final.totalBattles) * 100);
  
  container.innerHTML = `
    <div class="contest-battle">
      <div class="contest-progress">
        <strong>Fase Final - Todas Contra Todas</strong><br>
        Batalha <span class="current">${final.completedBattles + 1}</span> de ${final.totalBattles} 
        <span class="progress-bar-mini">
          <span class="progress-fill" style="width: ${progress}%"></span>
        </span>
      </div>
      
      <div class="battle-with-ranking">
        <div class="battle-container">
          <!-- Foto A -->
          <div class="battle-photo" id="battlePhotoA" tabindex="0" role="button" aria-label="Escolher Foto A (1 ou ←)">
            <img src="${photoA.thumb}" alt="Foto A">
            <div class="battle-label">1</div>
            <div class="battle-info">
              <div class="battle-rank">#${statsA.rank} | ${statsA.wins}W-${statsA.losses}L</div>
            </div>
          </div>
          
          <!-- VS -->
          <div class="battle-vs">
            <span>VS</span>
          </div>
          
          <!-- Foto B -->
          <div class="battle-photo" id="battlePhotoB" tabindex="0" role="button" aria-label="Escolher Foto B (2 ou →)">
            <img src="${photoB.thumb}" alt="Foto B">
            <div class="battle-label">2</div>
            <div class="battle-info">
              <div class="battle-rank">#${statsB.rank} | ${statsB.wins}W-${statsB.losses}L</div>
            </div>
          </div>
        </div>
        
        <!-- Ranking dinâmico -->
        <div class="dynamic-ranking">
          <h4>Ranking Final</h4>
          <div class="ranking-list">
            ${renderDynamicRanking(finalPhotos, photoStats)}
          </div>
        </div>
      </div>
      
      <div class="battle-actions">
        <button class="btn btn-secondary" id="toggleRankingView" data-tooltip="Ver Ranking Completo">
          📊 Ranking
        </button>
        <button class="btn btn-secondary" id="cancelContest">Cancelar Contest</button>
      </div>
    </div>
    
    <!-- Overlays -->
    ${renderRankingOverlay()}
    ${renderHeatmapOverlay()}
  `;
  
  // Remover listener antigo se existir
  if (battleKeysHandler) {
    document.removeEventListener('keydown', battleKeysHandler);
  }
  
  // Criar novo handler e adicionar
  battleKeysHandler = handleBattleKeys;
  document.addEventListener('keydown', battleKeysHandler);
  
  // Event listeners para cliques - usar event delegation
  const battleContainer = $('.battle-container');
  if (battleContainer) {
    const newContainer = battleContainer.cloneNode(true);
    battleContainer.replaceWith(newContainer);
    
    newContainer.addEventListener('click', (e) => {
      const target = e.target.closest('#battlePhotoA, #battlePhotoB');
      if (!target) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      if (target.id === 'battlePhotoA') {
        console.log('[DEBUG] Clique detectado na Foto A (final)');
        chooseBattleWinner('A');
      } else if (target.id === 'battlePhotoB') {
        console.log('[DEBUG] Clique detectado na Foto B (final)');
        chooseBattleWinner('B');
      }
    });
  }
  
  $('#cancelContest')?.addEventListener('click', confirmCancelContest);
  $('#toggleRankingView')?.addEventListener('click', () => toggleOverlay('rankingOverlay'));
}

/**
 * Renderiza batalha da fase bracket (LEGADO - não usado mais)
 */
async function renderBracketBattle() {
  const container = $('#contestView');
  const { bracket, eloScores, qualifiedPhotos } = contestState;
  const currentRound = bracket.rounds[bracket.currentRound - 1];
  const currentMatch = currentRound.matches[bracket.currentMatchIndex];
  
  if (!currentMatch) {
    finishContest();
    return;
  }
  
  const photoA = currentMatch.photoA;
  const photoB = currentMatch.photoB;
  
  // Obter scores e tiers (usar valores congelados se frozen)
  const scoreA = contestState.scoresAndTiers[photoA.id] || { score: 50, tier: TIERS[4] };
  const scoreB = contestState.scoresAndTiers[photoB.id] || { score: 50, tier: TIERS[4] };
  
  container.innerHTML = `
    <div class="contest-battle">
      <div class="contest-progress">
        <strong>Bracket Final - Rodada ${bracket.currentRound}</strong><br>
        Confronto <span class="current">${bracket.currentMatchIndex + 1}</span> de ${currentRound.matches.length}
      </div>
      
      <div class="battle-container">
        <!-- Foto A -->
        <div class="battle-photo" id="battlePhotoA" tabindex="0" role="button" aria-label="Escolher Foto A (1 ou ←)">
          <img src="${photoA.thumb}" alt="Foto A">
          <div class="battle-label">1</div>
          <div class="battle-info">
            <!-- Tier badge removido - apenas no ranking -->
          </div>
        </div>
        
        <!-- VS -->
        <div class="battle-vs">
          <span>VS</span>
        </div>
        
        <!-- Foto B -->
        <div class="battle-photo" id="battlePhotoB" tabindex="0" role="button" aria-label="Escolher Foto B (2 ou →)">
          <img src="${photoB.thumb}" alt="Foto B">
          <div class="battle-label">2</div>
          <div class="battle-info">
            <!-- Tier badge removido - apenas no ranking -->
          </div>
        </div>
      </div>
      
      <div class="battle-actions">
        <button class="btn btn-secondary" id="toggleBracket" data-tooltip="Ver Bracket Completo">
          🏆 Bracket
        </button>
        <button class="btn btn-secondary" id="cancelContest">Cancelar Contest</button>
      </div>
    </div>
    
    <!-- Bracket Tree Overlay -->
    ${renderBracketTreeOverlay()}
  `;
  
  // Remover listener antigo se existir
  if (battleKeysHandler) {
    document.removeEventListener('keydown', battleKeysHandler);
  }
  
  // Criar novo handler e adicionar
  battleKeysHandler = handleBattleKeys;
  document.addEventListener('keydown', battleKeysHandler);
  
  // Event listeners para cliques - usar event delegation
  const battleContainer = $('.battle-container');
  if (battleContainer) {
    const newContainer = battleContainer.cloneNode(true);
    battleContainer.replaceWith(newContainer);
    
    newContainer.addEventListener('click', (e) => {
      const target = e.target.closest('#battlePhotoA, #battlePhotoB');
      if (!target) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      if (target.id === 'battlePhotoA') {
        console.log('[DEBUG] Clique detectado na Foto A (bracket)');
        chooseBattleWinner('A');
      } else if (target.id === 'battlePhotoB') {
        console.log('[DEBUG] Clique detectado na Foto B (bracket)');
        chooseBattleWinner('B');
      }
    });
  }
  
  $('#cancelContest')?.addEventListener('click', confirmCancelContest);
  $('#toggleBracket')?.addEventListener('click', () => toggleOverlay('bracketTreeOverlay'));
}

/**
 * Renderiza ranking dinâmico
 */
function renderDynamicRanking(photos, photoStats) {
  // Na fase final, ordenar por W-L primeiro; senão, por score
  const isFinal = contestState?.phase === 'final';
  
  const ranked = [...photos]
    .map(p => ({ 
      ...p, 
      stats: photoStats[p.id],
      scoreData: contestState.scoresAndTiers[p.id] || { score: 50, tier: TIERS[4] }
    }))
    .sort((a, b) => {
      if (isFinal) {
        // Fase final: ordenar por W-L primeiro
        const wlA = a.stats.wins - a.stats.losses;
        const wlB = b.stats.wins - b.stats.losses;
        
        // 1. W-L (vitórias - perdas)
        if (wlB !== wlA) {
          return wlB - wlA;
        }
        
        // 2. Mais vitórias
        if (b.stats.wins !== a.stats.wins) {
          return b.stats.wins - a.stats.wins;
        }
        
        // 3. Score
        if (b.scoreData.score !== a.scoreData.score) {
          return b.scoreData.score - a.scoreData.score;
        }
      } else {
        // Fase classificatória: ordenar por score primeiro
        if (b.scoreData.score !== a.scoreData.score) {
          return b.scoreData.score - a.scoreData.score;
        }
        // Desempate: mais vitórias
        if (b.stats.wins !== a.stats.wins) {
          return b.stats.wins - a.stats.wins;
        }
      }
      
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
  
  if (!isHidden && overlayId === 'bracketPreviewOverlay') {
    // Atualizar prévia do bracket
    const container = $('#bracketPreviewContent');
    if (container) {
      container.innerHTML = renderBracketPreview();
    }
  } else if (!isHidden && overlayId === 'bracketTreeOverlay') {
    // Atualizar árvore do bracket
    const container = $('#bracketTreeContent');
    if (container) {
      container.innerHTML = renderBracketTree();
    }
  } else if (!isHidden && overlayId === 'heatmapOverlay') {
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
  if (!contestState || (contestState.phase !== 'qualifying' && contestState.phase !== 'final')) return '';
  
  // Usar fotos da fase atual
  const photos = contestState.phase === 'final' 
    ? (contestState.final?.finalPhotos || [])
    : contestState.qualifiedPhotos;
  
  const { eloScores, battleHistory, scoresAndTiers } = contestState;
  const photoStats = calculatePhotoStats(photos, eloScores, battleHistory, contestState.photoStats);
  // Atualizar cache
  contestState.photoStats = photoStats;
  
  // Na fase final, ordenar por W-L primeiro; senão, por score
  const isFinal = contestState.phase === 'final';
  
  const ranked = [...photos]
    .map(p => ({ 
      ...p, 
      stats: photoStats[p.id],
      scoreData: scoresAndTiers[p.id] || { score: 50, tier: TIERS[4] }
    }))
    .sort((a, b) => {
      if (isFinal) {
        // Fase final: ordenar por W-L primeiro
        const wlA = a.stats.wins - a.stats.losses;
        const wlB = b.stats.wins - b.stats.losses;
        
        // 1. W-L (vitórias - perdas)
        if (wlB !== wlA) {
          return wlB - wlA;
        }
        
        // 2. Mais vitórias
        if (b.stats.wins !== a.stats.wins) {
          return b.stats.wins - a.stats.wins;
        }
        
        // 3. Score
        if (b.scoreData.score !== a.scoreData.score) {
          return b.scoreData.score - a.scoreData.score;
        }
      } else {
        // Fase classificatória: ordenar por score primeiro
        if (b.scoreData.score !== a.scoreData.score) {
          return b.scoreData.score - a.scoreData.score;
        }
        // Desempate: mais vitórias
        if (b.stats.wins !== a.stats.wins) {
          return b.stats.wins - a.stats.wins;
        }
      }
      
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
            // Calcular variação de score (últimas 3 batalhas)
            const recentBattles = battleHistory
              .filter(b => b.photoA === photo.id || b.photoB === photo.id)
              .slice(-3);
            const scoreChange = recentBattles.length > 0 
              ? recentBattles.reduce((sum, b) => {
                  const isWinner = b.winner === photo.id;
                  return sum + (isWinner ? (b.eloChange?.winner || 0) : (b.eloChange?.loser || 0));
                }, 0)
              : 0;
            
            return `
            <div class="full-ranking-item ${idx < 3 ? 'top-' + (idx + 1) : ''}" data-photo-id="${photo.id}">
              <span class="ranking-position-large">#${idx + 1}</span>
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
  if (!contestState || contestState.phase !== 'qualifying') return '';
  
  const { qualifiedPhotos, scoresAndTiers } = contestState;
  const ranked = [...qualifiedPhotos]
    .map(p => ({
      ...p,
      scoreData: scoresAndTiers[p.id] || { score: 50, tier: TIERS[4] }
    }))
    .sort((a, b) => {
      // Ordenar por score (maior → menor)
      if (b.scoreData.score !== a.scoreData.score) {
        return b.scoreData.score - a.scoreData.score;
      }
      return a.id.localeCompare(b.id);
    });
  
  // Top K (potência de 2)
  const bracketSize = Math.min(16, Math.pow(2, Math.floor(Math.log2(ranked.length))));
  const seeds = ranked.slice(0, bracketSize);
  
  // Gerar preview do bracket
  const bracket = generateBracketFromSeeds(seeds);
  
  let html = '<div class="bracket-preview">';
  html += `<div class="preview-info">Top ${bracketSize} do ranking atual (por score) avançam para o Bracket Final</div>`;
  html += '<div class="bracket-preview-diagram">';
  
  bracket.rounds.forEach((round, roundIdx) => {
    html += `<div class="preview-round">`;
    html += `<div class="preview-round-label">Rodada ${round.round}</div>`;
    html += `<div class="preview-matches">`;
    
    round.matches.forEach(match => {
      const seedA = seeds.findIndex(s => s.id === match.photoA.id) + 1;
      const seedB = seeds.findIndex(s => s.id === match.photoB.id) + 1;
      const scoreA = scoresAndTiers[match.photoA.id] || { score: 50, tier: TIERS[4] };
      const scoreB = scoresAndTiers[match.photoB.id] || { score: 50, tier: TIERS[4] };
      
      html += `<div class="preview-match">`;
      html += `<div class="preview-seed-info">`;
      html += `<div class="preview-seed">#${seedA}</div>`;
      html += `<div class="preview-score">${scoreA.score}/100 ${scoreA.tier.icon}</div>`;
      html += `</div>`;
      html += `<img src="${match.photoA.thumb}" class="preview-thumb">`;
      html += `<span class="preview-vs">VS</span>`;
      html += `<img src="${match.photoB.thumb}" class="preview-thumb">`;
      html += `<div class="preview-seed-info">`;
      html += `<div class="preview-seed">#${seedB}</div>`;
      html += `<div class="tier-badge tier-badge-small">`;
      html += `<div class="tier-icon">${scoreB.tier.icon}</div>`;
      html += `<div class="tier-score">${scoreB.score}/100</div>`;
      html += `<div class="tier-label">${scoreB.tier.label}</div>`;
      html += `</div>`;
      html += `</div>`;
      html += `</div>`;
    });
    
    html += `</div></div>`;
  });
  
  html += '</div></div>';
  return html;
}

/**
 * Renderiza heatmap de confrontos
 */
function renderHeatmap() {
  if (!contestState) return '';
  // Permitir renderizar em qualquer fase (qualifying, bracket, finished)
  
  const { qualifiedPhotos, battleHistory } = contestState;
  
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
  html += '<div class="heatmap-header">';
  html += '<div class="heatmap-legend">';
  html += '<span class="legend-item"><span class="legend-color" style="background: rgba(61, 220, 151, 0.3)"></span> Batalharam</span>';
  html += '<span class="legend-item"><span class="legend-color" style="background: rgba(255, 255, 255, 0.05)"></span> Não batalharam</span>';
  html += '</div>';
  html += '</div>';
  
  html += '<div class="heatmap-table">';
  html += '<div class="heatmap-row heatmap-header-row">';
  html += '<div class="heatmap-cell heatmap-corner"></div>';
  qualifiedPhotos.forEach(p => {
    html += `<div class="heatmap-cell heatmap-header-cell" title="${p.id}">`;
    html += `<img src="${p.thumb}" class="heatmap-thumb-small">`;
    html += `</div>`;
  });
  html += '</div>';
  
  qualifiedPhotos.forEach((photoA, idxA) => {
    html += '<div class="heatmap-row">';
    html += `<div class="heatmap-cell heatmap-header-cell" title="${photoA.id}">`;
    html += `<img src="${photoA.thumb}" class="heatmap-thumb-small">`;
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
  if (!contestState || !contestState.bracket) return '';
  
  const { bracket, eloScores, battleHistory } = contestState;
  const { rounds, seeds } = bracket;
  
  let html = '<div class="bracket-tree">';
  
  rounds.forEach((round, roundIdx) => {
    const isCurrentRound = roundIdx === bracket.currentRound - 1;
    
    html += `<div class="tree-column ${isCurrentRound ? 'active' : ''}" data-round="${round.round}">`;
    html += `<div class="tree-column-label">Rodada ${round.round}</div>`;
    html += `<div class="tree-matches">`;
    
    round.matches.forEach((match, matchIdx) => {
      const isCurrentMatch = isCurrentRound && matchIdx === bracket.currentMatchIndex;
      const photoA = match.photoA;
      const photoB = match.photoB;
      const scoreA = contestState.scoresAndTiers[photoA.id] || { score: 50, tier: TIERS[4] };
      const scoreB = contestState.scoresAndTiers[photoB.id] || { score: 50, tier: TIERS[4] };
      
      // Buscar resultado se já foi decidido
      const battle = battleHistory.find(b => 
        b.phase === 'bracket' &&
        ((b.photoA === photoA.id && b.photoB === photoB.id) ||
         (b.photoA === photoB.id && b.photoB === photoA.id))
      );
      
      const winnerId = battle ? battle.winner : null;
      const photoAWon = winnerId === photoA.id;
      const photoBWon = winnerId === photoB.id;
      const totalVotes = (battle?.votesA || 0) + (battle?.votesB || 0);
      const votesA = battle?.votesA || 0;
      const votesB = battle?.votesB || 0;
      const votePercentA = totalVotes > 0 ? Math.round((votesA / totalVotes) * 100) : 0;
      const votePercentB = totalVotes > 0 ? Math.round((votesB / totalVotes) * 100) : 0;
      
      html += `<div class="tree-match ${isCurrentMatch ? 'current' : ''} ${battle ? 'decided' : ''}" 
                data-match-id="${photoA.id}-${photoB.id}">`;
      
      // Foto A
      html += `<div class="tree-slot ${photoAWon ? 'winner' : ''} ${photoBWon ? 'loser' : ''}">`;
      html += `<img src="${photoA.thumb}" alt="Foto A" class="tree-thumb">`;
      html += `<div class="tree-info">`;
      html += `<div class="tier-badge tier-badge-small">`;
      html += `<div class="tier-icon">${scoreA.tier.icon}</div>`;
      html += `<div class="tier-score">${scoreA.score}/100</div>`;
      html += `<div class="tier-label">${scoreA.tier.label}</div>`;
      html += `</div>`;
      if (battle) {
        html += `<div class="tree-votes">${votePercentA}% (${votesA} votos)</div>`;
        if (battle.eloChange && !contestState.frozen) {
          // Calcular variação de score se não estiver congelado
          const eloChangeA = photoAWon ? battle.eloChange.winner : battle.eloChange.loser;
          const eloBeforeA = (eloScores[photoA.id] || 1500) - eloChangeA;
          const eloAfterA = eloScores[photoA.id] || 1500;
          const scoreBeforeA = normalizeEloToScore(eloBeforeA, contestState.eloRange.min, contestState.eloRange.max);
          const scoreAfterA = normalizeEloToScore(eloAfterA, contestState.eloRange.min, contestState.eloRange.max);
          const scoreChangeA = scoreAfterA - scoreBeforeA;
          html += `<div class="tree-score-change ${scoreChangeA > 0 ? 'positive' : 'negative'}">${scoreChangeA > 0 ? '+' : ''}${Math.round(scoreChangeA)} score</div>`;
        }
      }
      if (photoAWon) html += '<span class="tree-check">✓</span>';
      html += `</div></div>`;
      
      html += `<div class="tree-line-h"></div>`;
      
      // Foto B
      html += `<div class="tree-slot ${photoBWon ? 'winner' : ''} ${photoAWon ? 'loser' : ''}">`;
      html += `<img src="${photoB.thumb}" alt="Foto B" class="tree-thumb">`;
      html += `<div class="tree-info">`;
      html += `<div class="tier-badge tier-badge-small">`;
      html += `<div class="tier-icon">${scoreB.tier.icon}</div>`;
      html += `<div class="tier-score">${scoreB.score}/100</div>`;
      html += `<div class="tier-label">${scoreB.tier.label}</div>`;
      html += `</div>`;
      if (battle) {
        html += `<div class="tree-votes">${votePercentB}% (${votesB} votos)</div>`;
        if (battle.eloChange && !contestState.frozen) {
          // Calcular variação de score se não estiver congelado
          const eloChangeB = photoBWon ? battle.eloChange.winner : battle.eloChange.loser;
          const eloBeforeB = (eloScores[photoB.id] || 1500) - eloChangeB;
          const eloAfterB = eloScores[photoB.id] || 1500;
          const scoreBeforeB = normalizeEloToScore(eloBeforeB, contestState.eloRange.min, contestState.eloRange.max);
          const scoreAfterB = normalizeEloToScore(eloAfterB, contestState.eloRange.min, contestState.eloRange.max);
          const scoreChangeB = scoreAfterB - scoreBeforeB;
          html += `<div class="tree-score-change ${scoreChangeB > 0 ? 'positive' : 'negative'}">${scoreChangeB > 0 ? '+' : ''}${Math.round(scoreChangeB)} score</div>`;
        }
      }
      if (photoBWon) html += '<span class="tree-check">✓</span>';
      html += `</div></div>`;
      
      // Linha conectora para próxima rodada (se vencedor)
      if (battle && roundIdx < rounds.length - 1) {
        const winner = photoAWon ? photoA : photoB;
        html += `<div class="tree-connector" data-winner="${winner.id}"></div>`;
      }
      
      html += `</div>`;
    });
    
    html += `</div></div>`;
  });
  
  html += '</div>';
  return html;
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
  
  const photoStats = calculatePhotoStats([photo], eloScores, battleHistory, contestState.photoStats);
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
      // Fallback: usar score atual
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
let battleKeysHandler = null;

/**
 * Handler de atalhos de teclado na batalha
 */
function handleBattleKeys(e) {
  if (location.hash !== '#/contest' || !contestState) {
    return;
  }
  
  // Verificar se está em fase de batalha (qualifying ou final)
  if (contestState.phase !== 'qualifying' && contestState.phase !== 'final') {
    return;
  }
  
  const tag = (e.target && e.target.tagName) || "";
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
  if (typing) return;
  
  // Teclas 1 ou ← → Foto A vence
  if (e.key === '1' || e.key === 'ArrowLeft') {
    e.preventDefault();
    e.stopPropagation();
    chooseBattleWinner('A');
  }
  
  // Teclas 2 ou → → Foto B vence
  if (e.key === '2' || e.key === 'ArrowRight') {
    e.preventDefault();
    e.stopPropagation();
    chooseBattleWinner('B');
  }
  
  // Esc → Cancelar contest
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    confirmCancelContest();
  }
}

/**
 * Registra vencedor de um confronto
 * IMPORTANTE: Esta função é chamada quando o usuário vota MANUALMENTE
 * Não deve verificar confronto automático aqui - isso só acontece ao renderizar
 */
async function chooseBattleWinner(winner) {
  console.log('[DEBUG] chooseBattleWinner chamado (voto manual):', winner);
  
  if (!contestState) {
    console.error('[DEBUG] contestState não existe!');
    return;
  }
  
  if (contestState.phase === 'finished') {
    console.log('[DEBUG] Contest já finalizado');
    return;
  }
  
  console.log('[DEBUG] Phase atual:', contestState.phase);
  
  // Processar voto diretamente, sem verificar confronto automático
  // (o confronto automático só é verificado ao renderizar a batalha, não ao votar)
  if (contestState.phase === 'qualifying') {
    console.log('[DEBUG] Processando batalha da fase classificatória (voto manual)');
    await handleQualifyingBattle(winner);
  } else if (contestState.phase === 'final') {
    console.log('[DEBUG] Processando batalha da fase final (voto manual)');
    await handleFinalBattle(winner);
  } else {
    console.error('[DEBUG] Fase desconhecida:', contestState.phase);
  }
}

/**
 * Processa batalha da fase classificatória
 */
async function handleQualifyingBattle(winner) {
  console.log('[DEBUG] handleQualifyingBattle iniciado');
  console.log('[DEBUG] contestState.qualifying:', contestState.qualifying);
  console.log('[DEBUG] contestState.qualifying.currentMatch:', contestState.qualifying.currentMatch);
  
  try {
    // Verificar se currentMatch existe, se não, tentar pegar da fila
    if (!contestState.qualifying.currentMatch) {
      console.log('[DEBUG] currentMatch vazio, tentando pegar da fila');
      if (contestState.qualifying.pendingMatches.length > 0) {
        contestState.qualifying.currentMatch = contestState.qualifying.pendingMatches.shift();
        console.log('[DEBUG] Novo currentMatch da fila:', contestState.qualifying.currentMatch);
      } else {
        console.error('[DEBUG] Não há mais batalhas na fila!');
        await finishQualifyingAndStartBracket();
        return;
      }
    }
    
    // IMPORTANTE: pegar currentMatch de qualifying, não de contestState diretamente!
    const currentMatch = contestState.qualifying.currentMatch;
    const eloScores = contestState.eloScores;
    const qualifying = contestState.qualifying;
    
    console.log('[DEBUG] currentMatch após pegar:', currentMatch);
    
    if (!currentMatch) {
      console.error('[DEBUG] currentMatch ainda não existe após tentar pegar da fila!');
      console.error('[DEBUG] Estado completo:', contestState);
      return;
    }
    
    console.log('[DEBUG] currentMatch:', currentMatch);
    
    const winnerPhoto = winner === 'A' ? currentMatch.photoA : currentMatch.photoB;
    const loserPhoto = winner === 'A' ? currentMatch.photoB : currentMatch.photoA;
    const winnerId = winnerPhoto.id;
    const loserId = loserPhoto.id;
    
    console.log('[DEBUG] Winner:', winnerId, 'Loser:', loserId);
    
    // Calcular novos ratings
    const winnerElo = eloScores[winnerId] || 1500;
    const loserElo = eloScores[loserId] || 1500;
    console.log('[DEBUG] Elos antes:', { winnerElo, loserElo });
    
    const result = calculateElo(winnerElo, loserElo, 32);
    console.log('[DEBUG] Resultado Elo:', result);
    
    // Atualizar scores (se não estiver congelado)
    if (!contestState.frozen) {
      contestState.eloScores = updateEloScores(winnerId, loserId, contestState.eloScores, 32);
      console.log('[DEBUG] Elos atualizados:', contestState.eloScores[winnerId], contestState.eloScores[loserId]);
      
      // Atualizar range e scores/tiers
      contestState.eloRange = calculateEloRange(contestState.eloScores);
      contestState.scoresAndTiers = calculateScoresAndTiers(
        contestState.eloScores, 
        contestState.eloRange.min, 
        contestState.eloRange.max
      );
    }
    
    // Atualizar histórico de Elo
    const battleId = `battle-${Date.now()}`;
    if (!contestState.qualifying.eloHistory[winnerId]) {
      contestState.qualifying.eloHistory[winnerId] = [];
    }
    if (!contestState.qualifying.eloHistory[loserId]) {
      contestState.qualifying.eloHistory[loserId] = [];
    }
    
    contestState.qualifying.eloHistory[winnerId].push({
      elo: contestState.eloScores[winnerId],
      timestamp: Date.now(),
      battleId: battleId
    });
    contestState.qualifying.eloHistory[loserId].push({
      elo: contestState.eloScores[loserId],
      timestamp: Date.now(),
      battleId: battleId
    });
    
    // Salvar no histórico
    contestState.battleHistory.push({
      photoA: currentMatch.photoA.id,
      photoB: currentMatch.photoB.id,
      winner: winnerId,
      timestamp: Date.now(),
      eloChange: result.change,
      phase: 'qualifying'
    });
    
  // Atualizar cache de stats incrementalmente
  if (!contestState.photoStats[winnerId]) {
    contestState.photoStats[winnerId] = { wins: 0, losses: 0, elo: contestState.eloScores[winnerId] };
  }
  if (!contestState.photoStats[loserId]) {
    contestState.photoStats[loserId] = { wins: 0, losses: 0, elo: contestState.eloScores[loserId] };
  }
  contestState.photoStats[winnerId].wins++;
  contestState.photoStats[winnerId].elo = contestState.eloScores[winnerId];
  contestState.photoStats[loserId].losses++;
  contestState.photoStats[loserId].elo = contestState.eloScores[loserId];
  
  // Recalcular ranking
  // Na fase final, priorizar W-L sobre Elo
  const prioritizeWL = contestState.phase === 'final';
  contestState.photoStats = calculateRankingFromStats(contestState.photoStats, prioritizeWL);
  
  // IMPORTANTE: Na fase final, o score permanece congelado (não atualizar baseado em Elo)
  // O ranking é determinado por W-L, não por Elo/score
    
    // Validar consistência (apenas em desenvolvimento)
    if (console && console.warn) {
      const validation = validateContestState();
      if (!validation.valid) {
        console.warn('[DEBUG] Inconsistências detectadas:', validation.errors);
      }
    }
    
    console.log('[DEBUG] Batalha salva no histórico');
    
    // Feedback visual
    const winnerElement = winner === 'A' ? $('#battlePhotoA') : $('#battlePhotoB');
    if (winnerElement) {
      winnerElement.style.borderColor = '#3ddc97';
      winnerElement.style.transform = 'scale(1.05)';
      console.log('[DEBUG] Feedback visual aplicado');
    } else {
      console.warn('[DEBUG] winnerElement não encontrado');
    }
    
    // Calcular variação de score para toast
    const winnerScoreBefore = contestState.scoresAndTiers[winnerId]?.score || 50;
    // Atualizar scores/tiers se não estiver congelado (já foi feito acima)
    const winnerScoreAfter = contestState.scoresAndTiers[winnerId]?.score || 50;
    const scoreChange = winnerScoreAfter - winnerScoreBefore;
    const tierAfter = contestState.scoresAndTiers[winnerId]?.tier || TIERS[4];
    
    toast(`Foto ${winner} venceu! ${scoreChange > 0 ? '+' : ''}${Math.round(scoreChange)} score (${winnerScoreAfter}/100 ${tierAfter.icon})`);
    
    // Avançar para próxima batalha
    contestState.qualifying.completedBattles++;
    console.log('[DEBUG] Batalhas completadas:', contestState.qualifying.completedBattles, '/', contestState.qualifying.totalBattles);
    console.log('[DEBUG] Batalhas pendentes:', contestState.qualifying.pendingMatches.length);
    
    // Verificar se fase classificatória terminou
    if (contestState.qualifying.completedBattles >= contestState.qualifying.totalBattles ||
        contestState.qualifying.pendingMatches.length === 0) {
      console.log('[DEBUG] Finalizando classificatória e iniciando bracket');
      await finishQualifyingAndStartBracket();
      return;
    }
    
    // Sistema Elo/MMR: Gerar próxima batalha dinamicamente baseado no Elo atual
    // Filtrar matches pendentes que já foram batalhadas
    let remainingMatches = contestState.qualifying.pendingMatches.filter(match => {
      const pairKey = [match.photoA.id, match.photoB.id].sort().join('-');
      return !contestState.battleHistory.some(b => {
        const battleKey = [b.photoA, b.photoB].sort().join('-');
        return battleKey === pairKey;
      });
    });
    
    // Se não há matches na fila ou fila está baixa, gerar novas batalhas dinamicamente
    if (remainingMatches.length < 3 && contestState.qualifying.dynamicMatching) {
      console.log('[DEBUG] Gerando novas batalhas dinamicamente baseado no Elo atual');
      
      // Calcular quantas batalhas cada foto ainda precisa
      const photoBattleCount = {};
      contestState.qualifiedPhotos.forEach(p => {
        const battles = contestState.battleHistory.filter(b => 
          (b.photoA === p.id || b.photoB === p.id) && b.phase === 'qualifying'
        ).length;
        photoBattleCount[p.id] = battles;
      });
      
      // Gerar novas batalhas baseadas no Elo atual (pareamento por Elo similar)
      const newMatches = generateQualifyingBattles(
        contestState.qualifiedPhotos,
        contestState.qualifying.battlesPerPhoto,
        contestState.eloScores, // Usar Elo ATUAL (já atualizado)
        contestState.battleHistory.filter(b => b.phase === 'qualifying')
      );
      
      // Adicionar apenas matches que ainda não estão na fila
      newMatches.forEach(match => {
        const pairKey = [match.photoA.id, match.photoB.id].sort().join('-');
        const alreadyInQueue = remainingMatches.some(m => {
          const matchPair = [m.photoA.id, m.photoB.id].sort().join('-');
          return matchPair === pairKey;
        });
        if (!alreadyInQueue) {
          remainingMatches.push(match);
        }
      });
      
      console.log('[DEBUG] Novas batalhas geradas:', newMatches.length);
    }
    
    contestState.qualifying.pendingMatches = remainingMatches;
    contestState.qualifying.currentMatch = remainingMatches.shift() || null;
    
    console.log('[DEBUG] Próxima batalha:', contestState.qualifying.currentMatch);
    console.log('[DEBUG] Batalhas restantes na fila:', remainingMatches.length);
    
    // Verificar se classificatória terminou (todas as fotos têm batalhas suficientes)
    const allPhotosHaveEnoughBattles = contestState.qualifiedPhotos.every(p => {
      const battles = contestState.battleHistory.filter(b => 
        (b.photoA === p.id || b.photoB === p.id) && b.phase === 'qualifying'
      ).length;
      return battles >= contestState.qualifying.battlesPerPhoto;
    });
    
    // Se não há mais batalhas válidas ou todas as fotos têm batalhas suficientes, finalizar
    if ((!contestState.qualifying.currentMatch && remainingMatches.length === 0) || allPhotosHaveEnoughBattles) {
      console.log('[DEBUG] Classificatória completa - finalizando');
      await finishQualifyingAndStartBracket();
      return;
    }
    
    saveContestState();
    console.log('[DEBUG] Estado salvo');
    
    await new Promise(resolve => setTimeout(resolve, 800));
    console.log('[DEBUG] Chamando renderBattle()');
    await renderBattle();
    console.log('[DEBUG] renderBattle() concluído');
    
  } catch (error) {
    console.error('[DEBUG] Erro em handleQualifyingBattle:', error);
    console.error('[DEBUG] Stack:', error.stack);
  }
}

/**
 * Finaliza fase classificatória e inicia fase final
 * Filtra fotos com score > 50 e faz todas contra todas
 */
async function finishQualifyingAndStartBracket() {
  const { qualifiedPhotos, eloScores, scoresAndTiers } = contestState;
  
  // CONGELAR Elo e scores da classificatória
  contestState.frozen = true;
  
  // Calcular ranking final baseado em score (não Elo)
  const ranked = [...qualifiedPhotos]
    .map(p => ({
      ...p,
      scoreData: scoresAndTiers[p.id] || { score: 50, tier: TIERS[4] }
    }))
    .sort((a, b) => {
      // Ordenar por score (maior → menor)
      if (b.scoreData.score !== a.scoreData.score) {
        return b.scoreData.score - a.scoreData.score;
      }
      // Desempate: mais vitórias
      const statsA = contestState.photoStats[a.id] || { wins: 0 };
      const statsB = contestState.photoStats[b.id] || { wins: 0 };
      if (statsB.wins !== statsA.wins) {
        return statsB.wins - statsA.wins;
      }
      return a.id.localeCompare(b.id);
    });
  
  // FILTRAR: apenas fotos com score > 50
  const finalPhotos = ranked.filter(p => p.scoreData.score > 50);
  
  if (finalPhotos.length < 2) {
    // Se não há fotos suficientes, finalizar contest
    contestState.phase = 'finished';
    saveContestState();
    toast(`🏆 Contest finalizado! Apenas ${finalPhotos.length} foto(s) com score > 50.`);
    await new Promise(resolve => setTimeout(resolve, 1500));
    location.hash = '#/results';
    return;
  }
  
  // Gerar batalhas "todas contra todas" para a fase final
  // IMPORTANTE: Apenas batalhas que ainda NÃO foram travadas entre as fotos finais
  // Considerar batalhas tanto da classificatória quanto da fase final (se houver)
  const allBattles = contestState.battleHistory.filter(b => 
    b.phase === 'qualifying' || b.phase === 'final'
  );
  
  const finalMatches = generateQualifyingBattles(
    finalPhotos,
    finalPhotos.length - 1, // Cada foto batalha contra todas as outras (se possível)
    eloScores,
    allBattles // Todas as batalhas já realizadas (qualifying + final)
  );
  
  // Inicializar histórico de Elo para fase final (continuar do Elo atual)
  const finalEloHistory = {};
  finalPhotos.forEach(p => {
    const existingHistory = contestState.qualifying?.eloHistory?.[p.id] || [];
    finalEloHistory[p.id] = existingHistory.length > 0 
      ? existingHistory 
      : [{ elo: eloScores[p.id] || 1500, timestamp: Date.now(), battleId: null }];
  });
  
  contestState.phase = 'final';
  contestState.final = {
    finalPhotos: finalPhotos,
    totalBattles: finalMatches.length,
    completedBattles: 0,
    currentMatch: finalMatches[0] || null,
    pendingMatches: finalMatches.slice(1),
    eloHistory: finalEloHistory
  };
  
  // Limpar bracket (não usado mais)
  contestState.bracket = null;
  
  saveContestState();
  
  toast(`🏆 Fase Classificatória finalizada! ${finalPhotos.length} fotos com score > 50 avançam para a Fase Final (todas contra todas).`);
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  await renderBattle();
}

/**
 * Gera bracket de eliminatória a partir dos seeds
 */
function generateBracketFromSeeds(seeds) {
  const rounds = [];
  let currentRound = seeds;
  let roundNum = 1;
  
  while (currentRound.length > 1) {
    const matches = [];
    
    // Parear: 1º vs último, 2º vs penúltimo, etc
    const half = Math.ceil(currentRound.length / 2);
    for (let i = 0; i < half; i++) {
      const photoA = currentRound[i];
      const photoB = currentRound[currentRound.length - 1 - i];
      
      if (photoA && photoB && photoA.id !== photoB.id) {
        matches.push({ photoA, photoB, winner: null, votesA: 0, votesB: 0 });
      }
    }
    
    rounds.push({ round: roundNum, matches: matches });
    
    // Próxima rodada terá metade dos participantes (vencedores)
    currentRound = currentRound.slice(0, half);
    roundNum++;
  }
  
  return { rounds, totalRounds: rounds.length };
}

/**
 * Processa batalha da fase final
 */
async function handleFinalBattle(winner) {
  const { final, eloScores } = contestState;
  const currentMatch = final.currentMatch;
  
  if (!currentMatch) return;
  
  const winnerPhoto = winner === 'A' ? currentMatch.photoA : currentMatch.photoB;
  const loserPhoto = winner === 'A' ? currentMatch.photoB : currentMatch.photoA;
  const winnerId = winnerPhoto.id;
  const loserId = loserPhoto.id;
  
  // Atualizar Elo (continuar atualizando na fase final para histórico, mas score permanece congelado)
  const result = calculateElo(
    eloScores[winnerId] || 1500,
    eloScores[loserId] || 1500,
    32
  );
  contestState.eloScores = updateEloScores(winnerId, loserId, contestState.eloScores, 32);
  
  // Atualizar histórico de Elo
  if (final.eloHistory[winnerId]) {
    final.eloHistory[winnerId].push({
      elo: eloScores[winnerId],
      timestamp: Date.now(),
      battleId: `${winnerId}-${loserId}`
    });
  }
  if (final.eloHistory[loserId]) {
    final.eloHistory[loserId].push({
      elo: eloScores[loserId],
      timestamp: Date.now(),
      battleId: `${winnerId}-${loserId}`
    });
  }
  
  // IMPORTANTE: Na fase final, o score permanece congelado (não atualizar baseado em Elo)
  // O ranking é determinado por W-L, não por Elo/score
  
  // Salvar no histórico
  contestState.battleHistory.push({
    photoA: currentMatch.photoA.id,
    photoB: currentMatch.photoB.id,
    winner: winnerId,
    timestamp: Date.now(),
    eloChange: result.change,
    phase: 'final',
    votesA: winner === 'A' ? 1 : 0,
    votesB: winner === 'B' ? 1 : 0
  });
  
  toast(`Foto ${winner} venceu!`);
  
  // Avançar para próxima batalha
  final.completedBattles++;
  
  // Verificar se fase final terminou
  if (final.completedBattles >= final.totalBattles || final.pendingMatches.length === 0) {
    console.log('[DEBUG] Fase final terminada - finalizando contest');
    await finishFinalPhase();
    return;
  }
  
  // Filtrar matches que já foram batalhadas
  const remainingMatches = final.pendingMatches.filter(match => {
    const pairKey = [match.photoA.id, match.photoB.id].sort().join('-');
    return !contestState.battleHistory.some(b => {
      if (b.phase !== 'final') return false;
      const battleKey = [b.photoA, b.photoB].sort().join('-');
      return battleKey === pairKey;
    });
  });
  
  final.pendingMatches = remainingMatches;
  final.currentMatch = remainingMatches.shift() || null;
  
  // Se não há mais batalhas válidas, finalizar
  if (!final.currentMatch && remainingMatches.length === 0) {
    console.log('[DEBUG] Não há mais batalhas válidas - finalizando fase final');
    await finishFinalPhase();
    return;
  }
  
  saveContestState();
  await new Promise(resolve => setTimeout(resolve, 800));
  await renderBattle();
}

/**
 * Finaliza fase final e define campeã
 */
async function finishFinalPhase() {
  const { final, eloScores, battleHistory } = contestState;
  
  // Calcular ranking final baseado em W-L (vitórias - perdas)
  const photoStats = calculatePhotoStats(
    final.finalPhotos,
    eloScores,
    battleHistory.filter(b => b.phase === 'final'),
    {}
  );
  
  // Recalcular ranking priorizando W-L (fase final)
  const statsWithRank = calculateRankingFromStats(photoStats, true);
  
  // Ordenar por W-L (vitórias - perdas, maior → menor)
  const ranked = [...final.finalPhotos]
    .map(p => ({
      ...p,
      stats: statsWithRank[p.id]
    }))
    .sort((a, b) => {
      const wlA = a.stats.wins - a.stats.losses;
      const wlB = b.stats.wins - b.stats.losses;
      
      // 1. W-L (vitórias - perdas)
      if (wlB !== wlA) {
        return wlB - wlA;
      }
      
      // 2. Mais vitórias
      if (b.stats.wins !== a.stats.wins) {
        return b.stats.wins - a.stats.wins;
      }
      
      // 3. Menos perdas
      if (a.stats.losses !== b.stats.losses) {
        return a.stats.losses - b.stats.losses;
      }
      
      // 4. ID (para consistência)
      return a.id.localeCompare(b.id);
    });
  
  // Campeã é a primeira do ranking (maior W-L)
  const championId = ranked[0].id;
  
  contestState.phase = 'finished';
  contestState.championId = championId;
  saveContestState();
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  toast(`🏆 Contest finalizado! Campeã definida!`);
  
  setTimeout(() => {
    location.hash = '#/results';
  }, 1500);
}


/**
 * Finaliza contest e vai para resultados
 */
function finishContest() {
  if (!contestState) return;
  
  contestState.phase = 'finished';
  saveContestState();
  
  toast('🏆 Contest finalizado! Veja os resultados.');
  
  // Redirecionar para aba Resultados
  setTimeout(() => {
    location.hash = '#/results';
  }, 1000);
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
  if (contestState) {
    // Salvar apenas dados essenciais (sem objetos Photo completos)
    const stateToSave = {
      phase: contestState.phase,
      qualifiedPhotoIds: contestState.qualifiedPhotos?.map(p => p.id) || [],
      
      // Fase Classificatória
      qualifying: contestState.qualifying ? {
        totalBattles: contestState.qualifying.totalBattles,
        completedBattles: contestState.qualifying.completedBattles,
        battlesPerPhoto: contestState.qualifying.battlesPerPhoto,
        currentMatch: contestState.qualifying.currentMatch ? {
          photoA: contestState.qualifying.currentMatch.photoA.id,
          photoB: contestState.qualifying.currentMatch.photoB.id
        } : null,
        pendingMatches: contestState.qualifying.pendingMatches.map(m => ({
          photoA: m.photoA.id,
          photoB: m.photoB.id
        })),
        eloHistory: contestState.qualifying.eloHistory
      } : null,
      
      // Fase Final
      final: contestState.final ? {
        finalPhotoIds: contestState.final.finalPhotos.map(p => p.id),
        totalBattles: contestState.final.totalBattles,
        completedBattles: contestState.final.completedBattles,
        currentMatch: contestState.final.currentMatch ? {
          photoA: contestState.final.currentMatch.photoA.id,
          photoB: contestState.final.currentMatch.photoB.id
        } : null,
        pendingMatches: contestState.final.pendingMatches.map(m => ({
          photoA: m.photoA.id,
          photoB: m.photoB.id
        })),
        eloHistory: contestState.final.eloHistory
      } : null,
      
      eloScores: contestState.eloScores,
      battleHistory: contestState.battleHistory,
      photoStats: contestState.photoStats || {},
      frozen: contestState.frozen || false,
      eloRange: contestState.eloRange || { min: 1500, max: 1500 },
      scoresAndTiers: contestState.scoresAndTiers || {},
      championId: contestState.championId || null
    };
    
    localStorage.setItem('photoranker-contest-state', JSON.stringify(stateToSave));
  } else {
    localStorage.removeItem('photoranker-contest-state');
  }
}

/**
 * Carrega estado do contest do localStorage
 */
function loadContestState() {
  try {
    const saved = localStorage.getItem('photoranker-contest-state');
    if (!saved) {
      contestState = null;
      return;
    }
    
    const state = JSON.parse(saved);
    
    // Reconstruir objetos Photo completos
    const qualifiedPhotos = state.qualifiedPhotoIds
      .map(id => allPhotos.find(p => p.id === id))
      .filter(Boolean);
    
    // Reconstruir fase classificatória
    let qualifying = null;
    if (state.qualifying) {
      const currentMatch = state.qualifying.currentMatch ? {
        photoA: allPhotos.find(p => p.id === state.qualifying.currentMatch.photoA),
        photoB: allPhotos.find(p => p.id === state.qualifying.currentMatch.photoB)
      } : null;
      
      // Se currentMatch não foi reconstruído, tentar pegar da fila
      let finalCurrentMatch = currentMatch;
      if (!finalCurrentMatch && state.qualifying.pendingMatches && state.qualifying.pendingMatches.length > 0) {
        const firstPending = state.qualifying.pendingMatches[0];
        finalCurrentMatch = {
          photoA: allPhotos.find(p => p.id === firstPending.photoA),
          photoB: allPhotos.find(p => p.id === firstPending.photoB)
        };
        if (finalCurrentMatch.photoA && finalCurrentMatch.photoB) {
          // Remover da fila pois será o currentMatch
          state.qualifying.pendingMatches = state.qualifying.pendingMatches.slice(1);
        } else {
          finalCurrentMatch = null;
        }
      }
      
      const pendingMatches = state.qualifying.pendingMatches.map(m => ({
        photoA: allPhotos.find(p => p.id === m.photoA),
        photoB: allPhotos.find(p => p.id === m.photoB)
      })).filter(m => m.photoA && m.photoB);
      
      qualifying = {
        totalBattles: state.qualifying.totalBattles,
        completedBattles: state.qualifying.completedBattles,
        battlesPerPhoto: state.qualifying.battlesPerPhoto,
        currentMatch: finalCurrentMatch,
        pendingMatches: pendingMatches,
        eloHistory: state.qualifying.eloHistory || {}
      };
      
      console.log('[DEBUG] loadContestState - qualifying reconstruído:', {
        currentMatch: finalCurrentMatch,
        pendingMatches: pendingMatches.length,
        completedBattles: qualifying.completedBattles,
        totalBattles: qualifying.totalBattles
      });
    }
    
    // Reconstruir fase final
    let final = null;
    if (state.final) {
      const finalPhotos = state.final.finalPhotoIds
        .map(id => allPhotos.find(p => p.id === id))
        .filter(Boolean);
      
      const currentMatch = state.final.currentMatch ? {
        photoA: allPhotos.find(p => p.id === state.final.currentMatch.photoA),
        photoB: allPhotos.find(p => p.id === state.final.currentMatch.photoB)
      } : null;
      
      const pendingMatches = state.final.pendingMatches.map(m => ({
        photoA: allPhotos.find(p => p.id === m.photoA),
        photoB: allPhotos.find(p => p.id === m.photoB)
      })).filter(m => m.photoA && m.photoB);
      
      final = {
        finalPhotos: finalPhotos,
        totalBattles: state.final.totalBattles,
        completedBattles: state.final.completedBattles,
        currentMatch: currentMatch,
        pendingMatches: pendingMatches,
        eloHistory: state.final.eloHistory || {}
      };
    }
    
    // Migrar estados antigos: se phase é 'bracket', converter para 'final' ou 'finished'
    let phase = state.phase;
    if (phase === 'bracket') {
      console.warn('[DEBUG] Estado antigo detectado (bracket), convertendo...');
      // Se há bracket salvo, tentar determinar se está ativo ou finalizado
      if (state.bracket && state.bracket.currentRound && state.bracket.rounds) {
        const currentRound = state.bracket.rounds[state.bracket.currentRound - 1];
        if (currentRound && currentRound.matches && currentRound.matches.length > 0) {
          // Bracket ainda em andamento - converter para 'final' seria complicado
          // Melhor resetar ou marcar como finished
          phase = 'finished';
        } else {
          phase = 'finished';
        }
      } else {
        phase = 'finished';
      }
    }
    
    contestState = {
      phase: phase,
      qualifiedPhotos: qualifiedPhotos,
      qualifying: qualifying,
      final: final,
      bracket: null, // Não usado mais, mas manter para compatibilidade
      eloScores: state.eloScores || {},
      battleHistory: state.battleHistory || [],
      photoStats: state.photoStats || {},
      frozen: state.frozen || false,
      eloRange: state.eloRange || { min: 1500, max: 1500 },
      scoresAndTiers: state.scoresAndTiers || {},
      championId: state.championId || null
    };
    
    // Se não há scoresAndTiers salvos, calcular agora
    if (!state.scoresAndTiers || Object.keys(state.scoresAndTiers).length === 0) {
      contestState.eloRange = calculateEloRange(contestState.eloScores);
      contestState.scoresAndTiers = calculateScoresAndTiers(
        contestState.eloScores,
        contestState.eloRange.min,
        contestState.eloRange.max
      );
    }
    
    console.log('[DEBUG] loadContestState - contestState reconstruído:', {
      phase: contestState.phase,
      qualifiedPhotos: contestState.qualifiedPhotos.length,
      hasQualifying: !!contestState.qualifying,
      hasFinal: !!contestState.final,
      championId: contestState.championId
    });
    
  } catch (err) {
    console.error('Erro ao carregar estado do contest:', err);
    contestState = null;
  }
}

// ========================================
//  SPRINT 4: RESULTS & CHAMPION (F4.4)
// ========================================

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
  const container = $('#resultsView');
  if (!container) return;
  
  // Carregar fotos atualizadas PRIMEIRO
  allPhotos = await getAllPhotos();
  
  // Carregar estado do contest
  loadContestState();
  
  if (!contestState || contestState.phase !== 'finished') {
    // Sem contest finalizado
    container.innerHTML = `
      <div class="results-empty">
        <div class="results-empty-icon">📊</div>
        <h3>Nenhum contest finalizado ainda</h3>
        <p class="muted">Complete um contest para ver os resultados e o campeão!</p>
        <button class="btn" onclick="location.hash='#/contest'">Ir para Contest</button>
      </div>
    `;
    return;
  }
  
  // Calcular stats e scores/tiers
  const photoStats = calculatePhotoStats(
    contestState.qualifiedPhotos, 
    contestState.eloScores, 
    contestState.battleHistory,
    contestState.photoStats
  );
  
  // Recalcular ranking priorizando W-L (contest finalizado)
  const statsWithRank = calculateRankingFromStats(photoStats, true);
  contestState.photoStats = statsWithRank;
  
  // Garantir que scoresAndTiers existam
  if (!contestState.scoresAndTiers || Object.keys(contestState.scoresAndTiers).length === 0) {
    contestState.eloRange = calculateEloRange(contestState.eloScores);
    contestState.scoresAndTiers = calculateScoresAndTiers(
      contestState.eloScores,
      contestState.eloRange.min,
      contestState.eloRange.max
    );
  }
  
  // Gerar ranking ordenado por W-L (vitórias - perdas)
  const ranking = [...contestState.qualifiedPhotos]
    .map(p => ({
      ...p,
      stats: statsWithRank[p.id],
      scoreData: contestState.scoresAndTiers[p.id] || { score: 50, tier: TIERS[4] }
    }))
    .sort((a, b) => {
      const wlA = a.stats.wins - a.stats.losses;
      const wlB = b.stats.wins - b.stats.losses;
      
      // 1. W-L (vitórias - perdas)
      if (wlB !== wlA) {
        return wlB - wlA;
      }
      
      // 2. Mais vitórias
      if (b.stats.wins !== a.stats.wins) {
        return b.stats.wins - a.stats.wins;
      }
      
      // 3. Menos perdas
      if (a.stats.losses !== b.stats.losses) {
        return a.stats.losses - b.stats.losses;
      }
      
      // 4. Score (desempate final)
      if (b.scoreData.score !== a.scoreData.score) {
        return b.scoreData.score - a.scoreData.score;
      }
      
      return a.id.localeCompare(b.id);
    });
  
  // Usar championId salvo (definido por W-L em finishFinalPhase) ou calcular por W-L
  let championId = contestState.championId;
  if (!championId) {
    // Fallback: campeã é a primeira do ranking (maior W-L)
    championId = ranking[0]?.id;
  }
  const champion = ranking.find(p => p.id === championId) || ranking[0];
  
  if (!champion) {
    container.innerHTML = `
      <div class="results-empty">
        <div class="results-empty-icon">❌</div>
        <h3>Erro ao carregar resultados</h3>
        <button class="btn" onclick="location.hash='#/contest'">Voltar</button>
      </div>
    `;
    return;
  }
  
  const championScore = champion.scoreData;
  
  // Renderizar resultados
  container.innerHTML = `
    <!-- Campeão -->
    <div class="champion-card">
      <div class="champion-icon">🏆</div>
      <h2>Campeã</h2>
      <div class="champion-image">
        <img src="${champion.thumb}" alt="Foto campeã">
      </div>
      <div class="champion-stats">
        <div class="stat">
          <div class="tier-badge tier-badge-large">
            <div class="tier-icon">${championScore.tier.icon}</div>
            <div class="tier-score">${championScore.score}/100</div>
            <div class="tier-label">${championScore.tier.label}</div>
          </div>
        </div>
        <div class="stat">
          <strong class="ranking-wins">${champion.stats.wins}</strong>
          <span>Vitórias</span>
        </div>
        <div class="stat">
          <strong class="ranking-losses">${champion.stats.losses}</strong>
          <span>Derrotas</span>
        </div>
      </div>
    </div>
    
    <!-- Ranking Completo -->
    <div class="ranking-section">
      <h3>Ranking Completo</h3>
      <div id="rankingList" class="ranking-list"></div>
    </div>
    
    <!-- Dashboard de Estatísticas -->
    <div class="results-dashboard">
      <h3>Dashboard de Estatísticas</h3>
      
      <!-- Heatmap -->
      <div class="dashboard-section">
        <h4>Heatmap de Confrontos</h4>
        <div id="resultsHeatmap" class="dashboard-heatmap"></div>
      </div>
      
      <!-- Gráficos de Evolução (Top 5) -->
      <div class="dashboard-section">
        <h4>Evolução do Score - Top 5</h4>
        <div id="resultsCharts" class="dashboard-charts"></div>
      </div>
      
      <!-- Estatísticas Gerais -->
      <div class="dashboard-section">
        <h4>Estatísticas Gerais do Contest</h4>
        <div id="resultsStats" class="dashboard-stats"></div>
      </div>
    </div>
    
    <!-- Ações -->
    <div class="results-actions">
      <button class="btn btn-secondary" id="restartContest">🔄 Recomeçar Contest</button>
      <button class="btn" onclick="location.hash='#/rate'">Voltar para Avaliação</button>
    </div>
  `;
  
  // Renderizar ranking com tier badges
  const rankingList = $('#rankingList');
  ranking.forEach((photo, index) => {
    const isChampion = photo.id === championId;
    const item = document.createElement('div');
    item.className = `ranking-item ${isChampion ? 'champion' : ''}`;
    
    const scoreData = photo.scoreData;
    // Usar rank calculado por W-L (do stats), não o índice do array
    const displayRank = photo.stats?.rank || (index + 1);
    
    item.innerHTML = `
      <div class="ranking-position">${isChampion ? '🏆' : `#${displayRank}`}</div>
      <div class="ranking-thumb">
        <img src="${photo.thumb}" alt="Foto ${index + 1}">
      </div>
      <div class="ranking-info">
        <div class="tier-badge tier-badge-small">
          <div class="tier-icon">${scoreData.tier.icon}</div>
          <div class="tier-score">${scoreData.score}/100</div>
          <div class="tier-label">${scoreData.tier.label}</div>
        </div>
        <div class="ranking-record">
          <span class="ranking-wins">${photo.stats.wins}V</span> - 
          <span class="ranking-losses">${photo.stats.losses}D</span>
          ${photo.stats.wins + photo.stats.losses > 0 
            ? ` (${Math.round(photo.stats.wins / (photo.stats.wins + photo.stats.losses) * 100)}%)` 
            : ''}
        </div>
      </div>
    `;
    
    rankingList.appendChild(item);
  });
  
  // Renderizar heatmap
  const heatmapContainer = $('#resultsHeatmap');
  if (heatmapContainer) {
    heatmapContainer.innerHTML = renderHeatmap();
  }
  
  // Renderizar gráficos de evolução (Top 5)
  const chartsContainer = $('#resultsCharts');
  if (chartsContainer) {
    const top5 = ranking.slice(0, 5);
    top5.forEach((photo, idx) => {
      const photoBattles = contestState.battleHistory.filter(b => 
        b.photoA === photo.id || b.photoB === photo.id
      );
      const eloHistory = contestState.qualifying?.eloHistory?.[photo.id] || [];
      
      // Converter para scoreHistory
      const scoreHistory = eloHistory.map(h => ({
        score: normalizeEloToScore(h.elo, contestState.eloRange.min, contestState.eloRange.max),
        timestamp: h.timestamp,
        battleId: h.battleId
      }));
      
      const chartDiv = document.createElement('div');
      chartDiv.className = 'chart-item';
      chartDiv.innerHTML = `
        <div class="chart-header">
          <img src="${photo.thumb}" alt="Foto ${idx + 1}" class="chart-thumb">
          <div class="chart-title">#${idx + 1} - Score: ${photo.scoreData.score}/100 ${photo.scoreData.tier.icon}</div>
        </div>
        <canvas id="chart-${photo.id}" width="600" height="150"></canvas>
      `;
      chartsContainer.appendChild(chartDiv);
      
      setTimeout(() => {
        renderScoreChart(`chart-${photo.id}`, scoreHistory);
      }, 100);
    });
  }
  
  // Renderizar estatísticas gerais
  const statsContainer = $('#resultsStats');
  if (statsContainer) {
    const totalBattles = contestState.battleHistory.length;
    const totalPhotos = ranking.length;
    const avgScore = ranking.reduce((sum, p) => sum + p.scoreData.score, 0) / totalPhotos;
    const totalWins = ranking.reduce((sum, p) => sum + p.stats.wins, 0);
    const totalLosses = ranking.reduce((sum, p) => sum + p.stats.losses, 0);
    
    statsContainer.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${totalPhotos}</div>
          <div class="stat-label">Fotos Participantes</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalBattles}</div>
          <div class="stat-label">Total de Batalhas</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${Math.round(avgScore)}</div>
          <div class="stat-label">Score Médio</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalWins}W / ${totalLosses}L</div>
          <div class="stat-label">Recorde Total</div>
        </div>
      </div>
    `;
  }
  
  // Event listener para recomeçar
  $('#restartContest')?.addEventListener('click', confirmRestartContest);
}

/**
 * Confirma recomeço do contest
 */
function confirmRestartContest() {
  openConfirm({
    title: 'Recomeçar Contest?',
    message: 'Todo o histórico e resultados serão perdidos. Deseja recomeçar?',
    confirmText: 'Recomeçar',
    onConfirm: () => {
      contestState = null;
      saveContestState();
      location.hash = '#/contest';
      toast('Contest resetado. Inicie um novo!');
    }
  });
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
  
  // Garantir índice válido
  if (rateViewIndex < 0) rateViewIndex = 0;
  if (rateViewIndex >= rateViewPhotos.length) rateViewIndex = rateViewPhotos.length - 1;
  
  const currentPhoto = rateViewPhotos[rateViewIndex];
  const totalPhotos = allVisiblePhotos.length; // Total geral (não filtrado)
  const ratedCount = allVisiblePhotos.filter(p => p.rating > 0).length; // Total avaliadas (geral)
  const currentPosition = rateViewIndex + 1;
  const listSize = rateViewPhotos.length;
  
  // Renderizar interface
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
//  SPRINT 3: RATING NO VIEWER
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
