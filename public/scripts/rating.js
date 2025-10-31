/**
 * rating.js
 * Componente de avaliação por estrelas (1-5)
 * 
 * Funcionalidades:
 * - Renderização visual de estrelas (vazias/preenchidas)
 * - Interação via mouse (hover + click)
 * - Interação via touch (mobile)
 * - Interação via teclado (1-5, Enter, Space)
 * - Acessibilidade completa (ARIA, screen reader)
 * - Feedback visual (animações, tooltips)
 */

import { $ } from './ui.js';

/**
 * Cria um componente de avaliação por estrelas
 * @param {number} currentRating - Rating atual (0-5, onde 0 = não avaliado)
 * @param {Function} onChange - Callback chamado quando rating muda: (newRating) => void
 * @returns {HTMLElement} - Container do componente
 */
export function createStarRating(currentRating = 0, onChange = null) {
  const container = document.createElement('div');
  container.className = 'star-rating';
  container.setAttribute('role', 'radiogroup');
  container.setAttribute('aria-label', 'Avaliação da foto');
  
  // Criar 5 estrelas - TODAS tabuláveis
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('button');
    star.className = 'star';
    star.setAttribute('type', 'button');
    star.setAttribute('role', 'radio');
    star.setAttribute('aria-checked', i <= currentRating ? 'true' : 'false');
    star.setAttribute('aria-label', `${i} estrela${i > 1 ? 's' : ''}`);
    star.setAttribute('data-value', i);
    star.setAttribute('data-tooltip', `Avaliar com ${i} estrela${i > 1 ? 's' : ''}`);
    star.textContent = '★';
    star.tabIndex = 0; // Todas as estrelas tabuláveis
    
    // Classe 'filled' para estrelas preenchidas
    if (i <= currentRating) {
      star.classList.add('filled');
    }
    
    container.appendChild(star);
  }
  
  // Estado para hover
  let hoveredValue = 0;
  
  // Event handlers
  const handleClick = (e) => {
    const star = e.target.closest('.star');
    if (!star) return;
    
    e.stopPropagation(); // Não propagar para card (evitar abrir viewer)
    
    const value = parseInt(star.dataset.value, 10);
    updateStarRating(container, value);
    
    if (onChange) {
      onChange(value);
    }
    
    // Feedback tátil no mobile
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  };
  
  const handleMouseEnter = (e) => {
    const star = e.target.closest('.star');
    if (!star) return;
    
    hoveredValue = parseInt(star.dataset.value, 10);
    updateHoverState(container, hoveredValue);
  };
  
  const handleMouseLeave = () => {
    hoveredValue = 0;
    updateHoverState(container, 0);
  };
  
  const handleKeyDown = (e) => {
    const star = e.target.closest('.star');
    if (!star) return;
    
    const currentValue = parseInt(star.dataset.value, 10);
    
    // Enter ou Space: seleciona estrela atual
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      star.click();
      return;
    }
    
    // Setas: navegar entre estrelas
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = container.querySelector(`.star[data-value="${currentValue + 1}"]`);
      if (next) next.focus();
      return;
    }
    
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = container.querySelector(`.star[data-value="${currentValue - 1}"]`);
      if (prev) prev.focus();
      return;
    }
    
    // Números 1-5: avaliação direta
    if (e.key >= '1' && e.key <= '5') {
      e.preventDefault();
      const targetValue = parseInt(e.key, 10);
      const targetStar = container.querySelector(`.star[data-value="${targetValue}"]`);
      if (targetStar) targetStar.click();
    }
    
    // 0: remover avaliação
    if (e.key === '0') {
      e.preventDefault();
      updateStarRating(container, 0);
      if (onChange) onChange(0);
    }
  };
  
  // Attach listeners
  container.addEventListener('click', handleClick);
  container.addEventListener('mouseenter', handleMouseEnter, true); // capture phase
  container.addEventListener('mouseleave', handleMouseLeave);
  container.addEventListener('keydown', handleKeyDown);
  
  return container;
}

/**
 * Atualiza visualmente o rating de um componente existente
 * @param {HTMLElement} container - Container do star-rating
 * @param {number} newRating - Novo rating (0-5)
 */
export function updateStarRating(container, newRating) {
  const stars = container.querySelectorAll('.star');
  
  stars.forEach((star, index) => {
    const value = index + 1;
    const isFilled = value <= newRating;
    
    star.classList.toggle('filled', isFilled);
    star.setAttribute('aria-checked', isFilled ? 'true' : 'false');
  });
  
  // Atualizar aria-label do grupo
  if (newRating === 0) {
    container.setAttribute('aria-label', 'Foto não avaliada');
  } else {
    container.setAttribute('aria-label', `Avaliação: ${newRating} de 5 estrelas`);
  }
}

/**
 * Atualiza estado de hover (preview)
 * @param {HTMLElement} container - Container do star-rating
 * @param {number} hoverValue - Valor do hover (0 = sem hover)
 */
function updateHoverState(container, hoverValue) {
  const stars = container.querySelectorAll('.star');
  
  stars.forEach((star, index) => {
    const value = index + 1;
    
    if (hoverValue > 0) {
      // Modo hover: mostrar preview
      star.classList.toggle('hover', value <= hoverValue);
    } else {
      // Sem hover: remover preview
      star.classList.remove('hover');
    }
  });
}

/**
 * Helper: Obter rating atual de um componente
 * @param {HTMLElement} container - Container do star-rating
 * @returns {number} - Rating atual (0-5)
 */
export function getCurrentRating(container) {
  const filledStars = container.querySelectorAll('.star.filled');
  return filledStars.length;
}

/**
 * Helper: Desabilitar/habilitar interação
 * @param {HTMLElement} container - Container do star-rating
 * @param {boolean} disabled - true = desabilitar
 */
export function setStarRatingDisabled(container, disabled) {
  const stars = container.querySelectorAll('.star');
  
  stars.forEach(star => {
    star.disabled = disabled;
    star.tabIndex = disabled ? -1 : (star.dataset.value === '1' ? 0 : -1);
  });
  
  container.classList.toggle('disabled', disabled);
}

