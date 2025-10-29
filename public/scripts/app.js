import { $, on } from "./ui.js";
import { savePhotos, getAllPhotos, clearAll } from "./db.js";
import { filesToThumbs } from "./image-utils.js";
import { openCropper } from "./cropper.js";

const MAX_SIZE_MB = 15;
const MAX_FILES_PER_BATCH = 300;
const ACCEPTED_TYPES = /^image\/(jpeg|jpg|png|webp|heic|heif)$/i; // aceitamos HEIC/HEIF, mas validaremos decodificação

const routes = ["upload", "rate", "contest", "results"];

let confirmOpen = false; // ⬅️ novo: bloqueia navegação do viewer quando true

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
  });

  renderGrid(await getAllPhotos());
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

  // Limpar tudo
  $("#clearAll").addEventListener("click", async () => {
    if (selectedIds && selectedIds.size > 0) {
      // usa a função que já sai do modo após remover
      await removeSelected();
      return;
    }

    // sem seleção → modal para apagar tudo
    openConfirm({
      title: "Limpar todas as imagens?",
      message: "Esta ação é permanente e removerá todas as imagens do projeto.",
      confirmText: "Remover tudo",
      onConfirm: async () => {
        await clearAll();
        toggleSelectionMode(false); // garante modo normal
        renderGrid([]);
        toast("Todas as imagens foram removidas.");
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
            
            // Re-renderizar grid
            const updatedPhotos = await getAllPhotos();
            renderGrid(updatedPhotos);
            
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
    
    // Carregar imagem completa
    const img = await loadImageFromURL(imageSource);
    
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
    
    // Re-renderizar grid
    renderGrid(await getAllPhotos());
    
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

/**
 * Converte Blob para DataURL
 */
function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Carrega Image a partir de URL
 */
function loadImageFromURL(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// helpers de progresso (adicione no arquivo)
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

function renderGrid(photos) {
  // Sprint 2: Filtrar fotos divididas (originais com _isSplit)
  const visiblePhotos = photos.filter(p => !p._isSplit);
  
  const grid = $("#grid");
  grid.innerHTML = "";
  $("#countInfo").textContent = `${visiblePhotos.length} imagens`;

  // habilita ou desabilita o botão "Limpar" conforme existência de fotos
  const clearBtn = $("#clearAll");
  if (clearBtn) clearBtn.disabled = visiblePhotos.length === 0;

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

    const mark = document.createElement("div");
    mark.className = "select-mark";
    mark.textContent = selectedIds.has(p.id) ? "✓" : "";
    card.appendChild(mark);

    // abrir viewer OU selecionar, conforme modo
    card.addEventListener("click", (ev) => {
      // Ignorar cliques em botões de ação
      if (ev.target.closest(".icon-btn")) return;

      if (selectionMode) {
        // toggle seleção
        toggleSelect(p.id, ev);
      } else {
        // ação primária: abrir viewer
        openViewer(idx);
      }
    });

    card.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        if (selectionMode) toggleSelect(p.id, ev);
        else openViewer(idx);
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

  const first = !selectionMode && grid.querySelector(".photo-card");
  if (first) setTimeout(() => first.focus(), 0);
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
  renderGrid(await getAllPhotos()); // re-render atualiza contador (countInfo)
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

async function openViewer(index) {
  const allPhotos = await getAllPhotos();
  // Filtrar fotos divididas (originais marcadas com _isSplit)
  currentList = allPhotos.filter(p => !p._isSplit);
  
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
  // Atalhos de zoom
  if (e.key === "+" || e.key === "=") {
    e.preventDefault();
    zoomBy(ZOOM_STEP);
  }
  if (e.key === "-" || e.key === "_") {
    e.preventDefault();
    zoomBy(-ZOOM_STEP);
  }
  if (e.key === "0") {
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
      // Foto foi revertida: abrir a original no viewer
      const allPhotos = await getAllPhotos();
      const visiblePhotos = allPhotos.filter(p => !p._isSplit);
      const originalIndex = visiblePhotos.findIndex(p => p.id === photo._parentId);
      
      if (originalIndex >= 0) {
        openViewer(originalIndex);
      } else {
        closeViewer();
      }
    }
  } else {
    // Dividir: cortar em 2×2
    const newPhotos = await handleManualSplit(photo);
    
    // Atualizar viewer apenas se confirmou
    if (newPhotos && newPhotos.length > 0) {
      const allPhotos = await getAllPhotos();
      const visiblePhotos = allPhotos.filter(p => !p._isSplit);
      const newIndex = visiblePhotos.findIndex(p => p.id === newPhotos[0].id);
      
      if (newIndex >= 0) {
        currentList = visiblePhotos;
        currentIndex = newIndex;
        const img = document.getElementById("viewerImg");
        img.src = currentList[currentIndex].thumb;
        updateViewerSplitButton();
      }
    }
  }
}

async function deleteCurrentAndAdvance() {
  try {
    // 1) deleta atual
    const victim = currentList[currentIndex];
    await savePhotos([{ ...victim, _delete: true }]);

    // 2) recarrega lista global e re-renderiza grid
    const allPhotos = await getAllPhotos();
    renderGrid(allPhotos);

    // Filtrar fotos divididas para o viewer
    const visiblePhotos = allPhotos.filter(p => !p._isSplit);

    if (!visiblePhotos.length) {
      // nada restou: fecha viewer
      toast("Imagem removida.");
      closeViewer();
      return;
    }

    // 3) recalcula índice seguro
    // mapeia para achar o mesmo id (pode ter saído), então usa clamp
    const newIndex = Math.min(currentIndex, visiblePhotos.length - 1);
    currentList = visiblePhotos;
    currentIndex = newIndex;

    // 4) atualiza imagem exibida
    const img = document.getElementById("viewerImg");
    img.src = currentList[currentIndex].thumb;

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
