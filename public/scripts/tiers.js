/**
 * tiers.js
 * Sistema de tiers temáticos para fotos (0-100)
 * Normaliza Elo interno para score visual 0-100 e atribui tiers
 */

/**
 * Tiers temáticos relacionados a fotografia
 */
export const TIERS = [
  { id: 'rascunho', label: 'Rascunho', min: 0, max: 9, icon: '✏️' },
  { id: 'captura', label: 'Captura', min: 10, max: 19, icon: '📷' },
  { id: 'foco', label: 'Foco', min: 20, max: 29, icon: '🎯' },
  { id: 'enquadrada', label: 'Enquadrada', min: 30, max: 39, icon: '🖼️' },
  { id: 'bem-composta', label: 'Bem Composta', min: 40, max: 49, icon: '📐' },
  { id: 'destaque', label: 'Destaque', min: 50, max: 59, icon: '⭐' },
  { id: 'portfolio', label: 'Portfólio', min: 60, max: 69, icon: '📁' },
  { id: 'curadoria', label: 'Curadoria', min: 70, max: 79, icon: '🏛️' },
  { id: 'galeria', label: 'Galeria', min: 80, max: 89, icon: '🖼️' },
  { id: 'obra-prima', label: 'Obra-prima Visual', min: 90, max: 100, icon: '👑' }
];

/**
 * Normaliza Elo para score 0-100
 * @param {number} elo - Elo atual da foto
 * @param {number} minElo - Elo mínimo do contest
 * @param {number} maxElo - Elo máximo do contest
 * @returns {number} Score normalizado 0-100
 */
export function normalizeEloToScore(elo, minElo, maxElo) {
  if (maxElo === minElo) return 50; // Se todos têm mesmo Elo, retorna meio da escala
  
  // Clamp Elo entre min e max
  const clampedElo = Math.max(minElo, Math.min(maxElo, elo));
  
  // Normalizar para 0-100
  const normalized = ((clampedElo - minElo) / (maxElo - minElo)) * 100;
  
  // Clamp final para garantir 0-100
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

/**
 * Obtém tier baseado no score
 * @param {number} score - Score 0-100
 * @returns {Object} Tier {id, label, icon, min, max}
 */
export function getTierFromScore(score) {
  const clampedScore = Math.max(0, Math.min(100, score));
  
  for (const tier of TIERS) {
    if (clampedScore >= tier.min && clampedScore <= tier.max) {
      return tier;
    }
  }
  
  // Fallback (não deveria acontecer)
  return TIERS[0];
}

/**
 * Calcula min/max Elo do contest
 * @param {Object} eloScores - { photoId: elo, ... }
 * @returns {{min: number, max: number}} Min e max Elo
 */
export function calculateEloRange(eloScores) {
  const elos = Object.values(eloScores);
  if (elos.length === 0) {
    return { min: 1500, max: 1500 };
  }
  
  return {
    min: Math.min(...elos),
    max: Math.max(...elos)
  };
}

/**
 * Calcula score baseado em W-L ratio (vitórias / total de batalhas)
 * @param {number} wins - Número de vitórias
 * @param {number} losses - Número de derrotas
 * @returns {number} Score 0-100 baseado em W-L
 */
export function calculateWLScore(wins, losses) {
  const total = wins + losses;
  if (total === 0) return 50; // Sem batalhas = score neutro
  
  const winRate = wins / total;
  // Normalizar para 0-100: 0% = 0, 50% = 50, 100% = 100
  return Math.round(winRate * 100);
}

/**
 * Calcula score híbrido combinando Elo e W-L
 * @param {number} eloScore - Score baseado em Elo (0-100)
 * @param {number} wlScore - Score baseado em W-L (0-100)
 * @param {number} eloWeight - Peso do Elo (0-1, padrão: 0.3)
 * @param {number} wlWeight - Peso do W-L (0-1, padrão: 0.7)
 * @returns {number} Score híbrido 0-100
 */
export function calculateHybridScore(eloScore, wlScore, eloWeight = 0.3, wlWeight = 0.7) {
  const hybrid = (eloScore * eloWeight) + (wlScore * wlWeight);
  return Math.max(0, Math.min(100, Math.round(hybrid)));
}

/**
 * Calcula score e tier para todas as fotos
 * 
 * FASE CLASSIFICATÓRIA: Score = Elo normalizado (0-100)
 * FASE FINAL: Score = Híbrido (30% Elo + 70% W-L) - reflete performance real
 * 
 * @param {Object} eloScores - { photoId: elo, ... }
 * @param {Object} photoStats - { photoId: {wins, losses}, ... } (opcional, necessário para fase final)
 * @param {number} minElo - Elo mínimo (opcional, calcula se não fornecido)
 * @param {number} maxElo - Elo máximo (opcional, calcula se não fornecido)
 * @param {boolean} useHybrid - Se true, usa score híbrido (Elo + W-L) para fase final
 * @returns {Object} { photoId: {score, tier}, ... }
 */
export function calculateScoresAndTiers(eloScores, photoStats = null, minElo = null, maxElo = null, useHybrid = false) {
  const range = minElo !== null && maxElo !== null 
    ? { min: minElo, max: maxElo }
    : calculateEloRange(eloScores);
  
  const result = {};
  
  Object.entries(eloScores).forEach(([photoId, elo]) => {
    const eloScore = normalizeEloToScore(elo, range.min, range.max);
    
    let finalScore;
    if (useHybrid && photoStats && photoStats[photoId]) {
      // FASE FINAL: Score híbrido (Elo + W-L)
      // W-L tem mais peso (70%) porque reflete performance real na fase final
      const stats = photoStats[photoId];
      const wlScore = calculateWLScore(stats.wins, stats.losses);
      finalScore = calculateHybridScore(eloScore, wlScore, 0.3, 0.7);
    } else {
      // FASE CLASSIFICATÓRIA: Score baseado apenas em Elo
      finalScore = eloScore;
    }
    
    const tier = getTierFromScore(finalScore);
    
    result[photoId] = {
      score: finalScore,
      tier,
      elo // Manter Elo interno para referência
    };
  });
  
  return result;
}

