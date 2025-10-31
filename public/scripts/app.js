/**
 * app.js - Photo Ranker MVP
 * Lógica principal da aplicação
 * 
 * Sprint 1: Upload, grid, viewer, multi-select
 * Sprint 2: Detecção 2×2, cropper, zoom/pan
 * Sprint 3: Rating por estrelas, filtros, ordenação, aba "Avaliar"
 */

import { $, on } from "./ui.js";
import { savePhotos, getAllPhotos, clearAll } from "./db.js";
import { filesToThumbs } from "./image-utils.js";
import { openCropper } from "./cropper.js";
import { createStarRating, updateStarRating } from "./rating.js";

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
