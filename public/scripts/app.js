import { $, on } from "./ui.js";
import { savePhotos, getAllPhotos, clearAll } from "./db.js";
import { filesToThumbs } from "./image-utils.js";

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

    await savePhotos(newPhotos);
    renderGrid(await getAllPhotos());
    toast(`${newPhotos.length} imagem(ns) adicionadas.`);
  } catch (err) {
    console.error(err);
    toast("Erro ao processar imagens. Veja o Console para detalhes.");
  } finally {
    showProgress(false);
  }
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
  const grid = $("#grid");
  grid.innerHTML = "";
  $("#countInfo").textContent = `${photos.length} imagens`;

  // habilita ou desabilita o botão "Limpar" conforme existência de fotos
  const clearBtn = $("#clearAll");
  if (clearBtn) clearBtn.disabled = photos.length === 0;

  photos.forEach((p, idx) => {
    const badges = [];
    if (p.parentId)
      badges.push('<span class="badge badge-split">Cortado</span>');
    if (typeof p.rating === "number" && p.rating > 0)
      badges.push(`<span class="badge badge-rated">★ ${p.rating}</span>`);
    if (!p.rating) badges.push('<span class="badge badge-new">Novo</span>');

    const card = document.createElement("article");
    card.className = "photo-card";
    card.dataset.id = p.id;
    card.tabIndex = 0;
    if (selectedIds.has(p.id)) card.classList.add("selected");
    card.innerHTML = `
      <img src="${
        p.thumb
      }" alt="Foto importada" loading="lazy" decoding="async">
      <div class="photo-meta">${Math.round(p.w)}×${Math.round(p.h)}</div>
      <div class="photo-actions">
        <button class="icon-btn" title="Remover" aria-label="Remover"><span class="x">✕</span></button>
      </div>
      <div class="photo-badges">${badges.join("")}</div>
    `;

    const mark = document.createElement("div");
    mark.className = "select-mark";
    mark.textContent = selectedIds.has(p.id) ? "✓" : "";
    card.appendChild(mark);

    // abrir viewer OU selecionar, conforme modo
    card.addEventListener("click", (ev) => {
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

    // remover individual (sem afetar seleção)
    const removeBtn = card.querySelector(".icon-btn");
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
  currentList = await getAllPhotos();
  if (!currentList.length) return;
  currentIndex = Math.max(0, Math.min(index, currentList.length - 1));
  const v = document.getElementById("viewer");
  const img = document.getElementById("viewerImg");
  img.src = currentList[currentIndex].thumb;
  v.setAttribute("aria-hidden", "false");
  // teclas
  document.addEventListener("keydown", viewerKeys);
}
function closeViewer() {
  const v = document.getElementById("viewer");
  v.setAttribute("aria-hidden", "true");
  document.removeEventListener("keydown", viewerKeys);
}
function viewerPrev() {
  if (currentIndex > 0) openViewer(currentIndex - 1);
}
function viewerNext() {
  if (currentIndex < currentList.length - 1) openViewer(currentIndex + 1);
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

async function deleteCurrentAndAdvance() {
  try {
    // 1) deleta atual
    const victim = currentList[currentIndex];
    await savePhotos([{ ...victim, _delete: true }]);

    // 2) recarrega lista global e re-renderiza grid
    const fresh = await getAllPhotos();
    renderGrid(fresh);

    if (!fresh.length) {
      // nada restou: fecha viewer
      toast("Imagem removida.");
      closeViewer();
      return;
    }

    // 3) recalcula índice seguro
    // mapeia para achar o mesmo id (pode ter saído), então usa clamp
    const newIndex = Math.min(currentIndex, fresh.length - 1);
    currentList = fresh;
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
