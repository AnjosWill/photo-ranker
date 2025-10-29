/**
 * cropper.js
 * Modal interativo para corte manual de imagens 2×2
 * 
 * Funcionalidades:
 * - Canvas HTML5 com imagem e guias ajustáveis
 * - Suporte a mouse e touch
 * - Preview em tempo real dos 4 quadrantes
 * - Extração de 4 imagens independentes
 */

import { $ } from './ui.js';

let currentImage = null;
let currentBlob = null;
let canvas = null;
let ctx = null;
let guides = {
  vertical: 0.5,   // Posição da guia vertical (0-1)
  horizontal: 0.5  // Posição da guia horizontal (0-1)
};
let dragging = null;
let resolvePromise = null;
let rejectPromise = null;

// Configurações de interação
const GUIDE_GRAB_DISTANCE = 20; // pixels
const MIN_QUADRANT_SIZE = 0.2;  // 20% mínimo

/**
 * Abre o modal de cropper
 * @param {Blob|string} imageSource - Imagem original (Blob ou dataURL)
 * @param {Array} suggestedRegions - Regiões sugeridas pelo worker
 * @returns {Promise<Array<Blob>>} - Promise que resolve com 4 blobs (ou null se cancelar)
 */
export function openCropper(imageSource, suggestedRegions = []) {
  return new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;

    currentBlob = imageSource;
    
    // Carregar imagem
    const img = new Image();
    let url = null;
    
    // Detectar se é Blob ou dataURL
    if (typeof imageSource === 'string') {
      // É dataURL - usar diretamente
      url = imageSource;
    } else {
      // É Blob - criar objectURL
      url = URL.createObjectURL(imageSource);
    }
    
    img.onload = () => {
      currentImage = img;
      
      // Revogar objectURL apenas se foi criado (não é dataURL)
      if (typeof imageSource !== 'string') {
        URL.revokeObjectURL(url);
      }
      
      // Abrir modal PRIMEIRO (para container ter dimensões)
      const modal = $('#cropperModal');
      modal.setAttribute('aria-hidden', 'false');
      
      // Aguardar próximo frame para garantir que modal está renderizado
      requestAnimationFrame(() => {
        // AGORA inicializar canvas (container já tem dimensões)
        setupCanvas();
        resetGuides();
        attachEventListeners();
        
        // Adicionar listener para resize da janela
        window.addEventListener('resize', handleResize);
        
        // Renderizar
        render();
        
        // Foco no botão de confirmar
        setTimeout(() => $('#cropperConfirm')?.focus(), 100);
      });
    };
    
    img.onerror = () => {
      // Revogar objectURL apenas se foi criado (não é dataURL)
      if (typeof imageSource !== 'string') {
        URL.revokeObjectURL(url);
      }
      reject(new Error('Falha ao carregar imagem'));
    };
    
    img.src = url;
  });
}

/**
 * Fecha o modal de cropper
 */
export function closeCropper() {
  const modal = $('#cropperModal');
  modal.setAttribute('aria-hidden', 'true');
  
  // Limpar estado
  currentImage = null;
  currentBlob = null;
  dragging = null;
  
  // Remover listeners
  detachEventListeners();
  window.removeEventListener('resize', handleResize);
  
  if (rejectPromise) {
    rejectPromise(null);
    resolvePromise = null;
    rejectPromise = null;
  }
}

/**
 * Configura o canvas com dimensões responsivas
 */
function setupCanvas() {
  canvas = $('#cropperCanvas');
  ctx = canvas.getContext('2d', { alpha: false });
  
  // Canvas interno = dimensões reais (alta qualidade)
  canvas.width = currentImage.width;
  canvas.height = currentImage.height;
  
  // Calcular dimensões de EXIBIÇÃO mantendo proporção
  calculateDisplaySize();
}

/**
 * Calcula e aplica tamanho de exibição do canvas
 * Algoritmo "contain" padrão de mercado
 */
function calculateDisplaySize() {
  // Espaço disponível
  const maxWidth = window.innerWidth * 0.85;
  const maxHeight = window.innerHeight * 0.7;
  
  // Calcular escalas necessárias
  const scaleX = maxWidth / currentImage.width;
  const scaleY = maxHeight / currentImage.height;
  
  // Usar a MENOR escala (garante que cabe completamente)
  const scale = Math.min(scaleX, scaleY);
  
  // Aplicar escala mantendo proporção
  const displayWidth = currentImage.width * scale;
  const displayHeight = currentImage.height * scale;
  
  canvas.style.width = Math.round(displayWidth) + 'px';
  canvas.style.height = Math.round(displayHeight) + 'px';
}

/**
 * Reseta guias para o centro
 */
function resetGuides() {
  guides.vertical = 0.5;
  guides.horizontal = 0.5;
  render();
  updatePreview();
}

/**
 * Handler para redimensionamento da janela
 */
let resizeTimeout;
function handleResize() {
  // Debounce para performance
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    calculateDisplaySize();
    render();
  }, 100);
}

/**
 * Renderiza canvas com imagem e guias
 */
function render() {
  if (!currentImage || !ctx) return;
  
  // Limpar canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Desenhar imagem
  ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);
  
  // Desenhar overlay semi-transparente nas regiões
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  
  const vx = guides.vertical * canvas.width;
  const hy = guides.horizontal * canvas.height;
  
  // Desenhar guias
  ctx.strokeStyle = '#6aa3ff';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);
  
  // Guia vertical
  ctx.beginPath();
  ctx.moveTo(vx, 0);
  ctx.lineTo(vx, canvas.height);
  ctx.stroke();
  
  // Guia horizontal
  ctx.beginPath();
  ctx.moveTo(0, hy);
  ctx.lineTo(canvas.width, hy);
  ctx.stroke();
  
  ctx.setLineDash([]);
  
  // Desenhar alças de arrasto
  const handleSize = 44; // WCAG mínimo
  const handleColor = '#6aa3ff';
  const handleBorder = '#fff';
  
  // Alça da guia vertical (centro)
  drawHandle(ctx, vx, hy, handleSize, handleColor, handleBorder);
  
  // Alça da guia vertical (topo)
  drawHandle(ctx, vx, handleSize / 2, handleSize * 0.6, handleColor, handleBorder);
  
  // Alça da guia vertical (baixo)
  drawHandle(ctx, vx, canvas.height - handleSize / 2, handleSize * 0.6, handleColor, handleBorder);
  
  // Alça da guia horizontal (esquerda)
  drawHandle(ctx, handleSize / 2, hy, handleSize * 0.6, handleColor, handleBorder);
  
  // Alça da guia horizontal (direita)
  drawHandle(ctx, canvas.width - handleSize / 2, hy, handleSize * 0.6, handleColor, handleBorder);
}

/**
 * Desenha alça de arrasto
 */
function drawHandle(ctx, x, y, size, fillColor, strokeColor) {
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/**
 * Atualiza preview dos 4 quadrantes com alta qualidade
 */
function updatePreview() {
  const previewContainer = $('.cropper-preview');
  previewContainer.innerHTML = '';
  
  const quadrants = [
    { name: 'Superior Esquerdo', x: 0, y: 0, w: guides.vertical, h: guides.horizontal },
    { name: 'Superior Direito', x: guides.vertical, y: 0, w: 1 - guides.vertical, h: guides.horizontal },
    { name: 'Inferior Esquerdo', x: 0, y: guides.horizontal, w: guides.vertical, h: 1 - guides.horizontal },
    { name: 'Inferior Direito', x: guides.vertical, y: guides.horizontal, w: 1 - guides.vertical, h: 1 - guides.horizontal }
  ];
  
  quadrants.forEach((q, idx) => {
    const previewCanvas = document.createElement('canvas');
    const previewCtx = previewCanvas.getContext('2d');
    
    // Calcular dimensões do quadrante na imagem original
    const sx = q.x * currentImage.width;
    const sy = q.y * currentImage.height;
    const sw = q.w * currentImage.width;
    const sh = q.h * currentImage.height;
    
    // Calcular aspect ratio do quadrante
    const aspectRatio = sw / sh;
    
    // Tamanho de EXIBIÇÃO do preview (CSS)
    const displaySize = 100; // Aumentado de 80 para 100
    
    // Resolução interna ALTA (2x para melhor qualidade)
    const pixelRatio = 2;
    const maxSize = displaySize * pixelRatio;
    
    // Calcular dimensões mantendo proporção
    let previewWidth, previewHeight;
    if (aspectRatio > 1) {
      // Mais largo que alto
      previewWidth = maxSize;
      previewHeight = maxSize / aspectRatio;
    } else {
      // Mais alto que largo
      previewWidth = maxSize * aspectRatio;
      previewHeight = maxSize;
    }
    
    // Canvas com resolução alta (2x)
    previewCanvas.width = maxSize;
    previewCanvas.height = maxSize;
    previewCanvas.className = 'preview-canvas';
    previewCanvas.title = q.name;
    
    // Tamanho visual via CSS
    previewCanvas.style.width = displaySize + 'px';
    previewCanvas.style.height = displaySize + 'px';
    
    // Melhor qualidade de interpolação
    previewCtx.imageSmoothingEnabled = true;
    previewCtx.imageSmoothingQuality = 'high';
    
    // Calcular offset para centralizar
    const offsetX = (maxSize - previewWidth) / 2;
    const offsetY = (maxSize - previewHeight) / 2;
    
    // Fundo escuro
    previewCtx.fillStyle = '#1a1a1c';
    previewCtx.fillRect(0, 0, maxSize, maxSize);
    
    // Desenhar região recortada com alta qualidade
    previewCtx.drawImage(currentImage, sx, sy, sw, sh, offsetX, offsetY, previewWidth, previewHeight);
    
    const wrapper = document.createElement('div');
    wrapper.className = 'preview-item';
    wrapper.innerHTML = `<span class="preview-label">${idx + 1}</span>`;
    wrapper.appendChild(previewCanvas);
    
    previewContainer.appendChild(wrapper);
  });
}

/**
 * Extrai os 4 quadrantes como dataURLs independentes
 */
async function extractQuadrants() {
  if (!currentImage) return null;
  
  const quadrants = [
    { x: 0, y: 0, w: guides.vertical, h: guides.horizontal, name: 'top-left' },
    { x: guides.vertical, y: 0, w: 1 - guides.vertical, h: guides.horizontal, name: 'top-right' },
    { x: 0, y: guides.horizontal, w: guides.vertical, h: 1 - guides.horizontal, name: 'bottom-left' },
    { x: guides.vertical, y: guides.horizontal, w: 1 - guides.vertical, h: 1 - guides.horizontal, name: 'bottom-right' }
  ];
  
  const results = [];
  
  for (const q of quadrants) {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    const sx = q.x * currentImage.width;
    const sy = q.y * currentImage.height;
    const sw = q.w * currentImage.width;
    const sh = q.h * currentImage.height;
    
    tempCanvas.width = sw;
    tempCanvas.height = sh;
    
    tempCtx.drawImage(currentImage, sx, sy, sw, sh, 0, 0, sw, sh);
    
    // Converter para dataURL (JPEG, 95% qualidade)
    const dataURL = tempCanvas.toDataURL('image/jpeg', 0.95);
    
    results.push({ 
      dataURL, 
      width: sw, 
      height: sh, 
      quadrant: q.name 
    });
  }
  
  return results;
}

/**
 * Event listeners
 */
function attachEventListeners() {
  // Botões
  $('#cropperReset')?.addEventListener('click', handleReset);
  $('#cropperCancel')?.addEventListener('click', handleCancel);
  $('#cropperConfirm')?.addEventListener('click', handleConfirm);
  
  // Canvas - mouse
  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('mouseleave', handleMouseUp);
  
  // Canvas - touch
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd);
  
  // Teclado
  document.addEventListener('keydown', handleKeyDown);
}

function detachEventListeners() {
  $('#cropperReset')?.removeEventListener('click', handleReset);
  $('#cropperCancel')?.removeEventListener('click', handleCancel);
  $('#cropperConfirm')?.removeEventListener('click', handleConfirm);
  
  canvas?.removeEventListener('mousedown', handleMouseDown);
  canvas?.removeEventListener('mousemove', handleMouseMove);
  canvas?.removeEventListener('mouseup', handleMouseUp);
  canvas?.removeEventListener('mouseleave', handleMouseUp);
  
  canvas?.removeEventListener('touchstart', handleTouchStart);
  canvas?.removeEventListener('touchmove', handleTouchMove);
  canvas?.removeEventListener('touchend', handleTouchEnd);
  
  document.removeEventListener('keydown', handleKeyDown);
}

function handleReset() {
  resetGuides();
}

function handleCancel() {
  closeCropper();
  if (resolvePromise) {
    resolvePromise(null);
    resolvePromise = null;
    rejectPromise = null;
  }
}

async function handleConfirm() {
  try {
    const quadrants = await extractQuadrants();
    
    // ⚠️ IMPORTANTE: Resolver promise ANTES de fechar o cropper!
    if (resolvePromise) {
      const resolve = resolvePromise;
      resolvePromise = null;
      rejectPromise = null;
      
      closeCropper();
      resolve(quadrants);
    } else {
      closeCropper();
    }
  } catch (error) {
    console.error('Erro ao extrair quadrantes:', error);
    const reject = rejectPromise;
    resolvePromise = null;
    rejectPromise = null;
    closeCropper();
    if (reject) reject(error);
  }
}

function handleKeyDown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    handleCancel();
  }
  if (e.key === 'Enter' && e.target.id === 'cropperConfirm') {
    e.preventDefault();
    handleConfirm();
  }
}

/**
 * Mouse handlers
 */
function handleMouseDown(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  // Converter coordenadas visuais para coordenadas do canvas interno
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = x * scaleX;
  const canvasY = y * scaleY;
  
  dragging = detectGuideNear(canvasX, canvasY);
  if (dragging) {
    canvas.style.cursor = dragging === 'vertical' ? 'ew-resize' : 'ns-resize';
  }
}

function handleMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  // Converter coordenadas visuais para coordenadas do canvas interno
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = x * scaleX;
  const canvasY = y * scaleY;
  
  if (dragging) {
    updateGuidePosition(canvasX, canvasY);
  } else {
    // Atualizar cursor
    const near = detectGuideNear(canvasX, canvasY);
    canvas.style.cursor = near === 'vertical' ? 'ew-resize' : near === 'horizontal' ? 'ns-resize' : 'default';
  }
}

function handleMouseUp() {
  dragging = null;
  canvas.style.cursor = 'default';
}

/**
 * Touch handlers
 */
function handleTouchStart(e) {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;
  
  // Converter coordenadas visuais para coordenadas do canvas interno
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = x * scaleX;
  const canvasY = y * scaleY;
  
  dragging = detectGuideNear(canvasX, canvasY);
}

function handleTouchMove(e) {
  e.preventDefault();
  if (!dragging) return;
  
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const x = touch.clientX - rect.left;
  const y = touch.clientY - rect.top;
  
  // Converter coordenadas visuais para coordenadas do canvas interno
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = x * scaleX;
  const canvasY = y * scaleY;
  
  updateGuidePosition(canvasX, canvasY);
}

function handleTouchEnd() {
  dragging = null;
}

/**
 * Detecta se o cursor está próximo de uma guia
 */
function detectGuideNear(x, y) {
  const vx = guides.vertical * canvas.width;
  const hy = guides.horizontal * canvas.height;
  
  const distV = Math.abs(x - vx);
  const distH = Math.abs(y - hy);
  
  if (distV < GUIDE_GRAB_DISTANCE && distV < distH) {
    return 'vertical';
  }
  if (distH < GUIDE_GRAB_DISTANCE) {
    return 'horizontal';
  }
  
  return null;
}

/**
 * Atualiza posição da guia sendo arrastada
 */
function updateGuidePosition(x, y) {
  if (dragging === 'vertical') {
    guides.vertical = Math.max(MIN_QUADRANT_SIZE, Math.min(1 - MIN_QUADRANT_SIZE, x / canvas.width));
  } else if (dragging === 'horizontal') {
    guides.horizontal = Math.max(MIN_QUADRANT_SIZE, Math.min(1 - MIN_QUADRANT_SIZE, y / canvas.height));
  }
  
  render();
  updatePreview();
}

