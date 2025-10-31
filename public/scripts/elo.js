/**
 * elo.js
 * Sistema de ranking Elo para confrontos entre fotos
 * 
 * Baseado no sistema Elo da FIDE (International Chess Federation)
 * https://en.wikipedia.org/wiki/Elo_rating_system
 */

/**
 * Calcula novos ratings após um confronto
 * @param {number} winnerElo - Rating atual do vencedor
 * @param {number} loserElo - Rating atual do perdedor
 * @param {number} k - K-factor (padrão: 32, quanto maior mais volátil)
 * @returns {{winner: number, loser: number}} Novos ratings
 */
export function calculateElo(winnerElo, loserElo, k = 32) {
  // Probabilidade esperada de vitória (fórmula Elo)
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const expectedLoser = 1 - expectedWinner;
  
  // Novos ratings
  // Vencedor: rating + k * (1 - expected)
  // Perdedor: rating + k * (0 - expected)
  const newWinnerElo = Math.round(winnerElo + k * (1 - expectedWinner));
  const newLoserElo = Math.round(loserElo + k * (0 - expectedLoser));
  
  return {
    winner: newWinnerElo,
    loser: newLoserElo,
    change: {
      winner: newWinnerElo - winnerElo,
      loser: newLoserElo - loserElo
    }
  };
}

/**
 * Inicializa scores Elo para fotos
 * @param {Array} photos - Array de fotos
 * @param {number} initialRating - Rating inicial (padrão: 1500)
 * @returns {Object} { photoId: rating, ... }
 */
export function initializeEloScores(photos, initialRating = 1500) {
  const scores = {};
  photos.forEach(p => {
    scores[p.id] = initialRating;
  });
  return scores;
}

/**
 * Gera sistema de eliminatória completo (bracket/chaves)
 * Todos os participantes batalham até sobrar apenas 1 campeão
 * 
 * @param {Array} photos - Fotos qualificadas
 * @param {Object} eloScores - Scores atuais { photoId: rating }
 * @returns {Object} { rounds: [[{photoA, photoB}, ...], ...], totalMatches: number }
 */
export function generateEliminationBracket(photos, eloScores = {}) {
  if (photos.length < 2) {
    return { rounds: [], totalMatches: 0 };
  }
  
  // Ordenar por Elo (seed do torneio)
  const seeded = [...photos].sort((a, b) => 
    (eloScores[b.id] || 1500) - (eloScores[a.id] || 1500)
  );
  
  const rounds = [];
  let currentRound = seeded;
  
  // Gerar rodadas até sobrar apenas 1 foto
  while (currentRound.length > 1) {
    const roundPairings = [];
    
    // Parear: 1º vs último, 2º vs penúltimo, etc (balanceado)
    const half = Math.ceil(currentRound.length / 2);
    
    for (let i = 0; i < half; i++) {
      const photoA = currentRound[i];
      const photoB = currentRound[currentRound.length - 1 - i];
      
      // Se não houver par (número ímpar), photoA passa automaticamente (bye)
      if (photoA && photoB && photoA.id !== photoB.id) {
        roundPairings.push({ photoA, photoB });
      }
    }
    
    if (roundPairings.length > 0) {
      rounds.push(roundPairings);
    }
    
    // Próxima rodada terá metade dos participantes (vencedores)
    // Como ainda não sabemos os vencedores, preparamos para a quantidade esperada
    currentRound = currentRound.slice(0, half);
  }
  
  // Calcular total de confrontos
  const totalMatches = rounds.reduce((sum, round) => sum + round.length, 0);
  
  return { rounds, totalMatches };
}

/**
 * Gera pares de confronto balanceados (LEGADO - usar generateEliminationBracket)
 * @deprecated Use generateEliminationBracket para sistema de eliminatória
 */
export function generatePairings(photos, eloScores = {}, history = []) {
  if (photos.length < 2) {
    return [];
  }
  
  // Ordenar por Elo (maior → menor)
  const sorted = [...photos].sort((a, b) => 
    (eloScores[b.id] || 1500) - (eloScores[a.id] || 1500)
  );
  
  const pairings = [];
  const used = new Set();
  
  // Parear fotos adjacentes (após ordenação por Elo)
  for (let i = 0; i < sorted.length - 1; i += 2) {
    if (i + 1 < sorted.length) {
      pairings.push({
        photoA: sorted[i],
        photoB: sorted[i + 1]
      });
    }
  }
  
  return pairings;
}

/**
 * Atualiza scores após confronto
 * @param {string} winnerId - ID do vencedor
 * @param {string} loserId - ID do perdedor
 * @param {Object} eloScores - Scores atuais
 * @param {number} k - K-factor
 * @returns {Object} Scores atualizados
 */
export function updateEloScores(winnerId, loserId, eloScores, k = 32) {
  const winnerElo = eloScores[winnerId] || 1500;
  const loserElo = eloScores[loserId] || 1500;
  
  const newRatings = calculateElo(winnerElo, loserElo, k);
  
  return {
    ...eloScores,
    [winnerId]: newRatings.winner,
    [loserId]: newRatings.loser
  };
}

/**
 * Determina campeão (maior Elo)
 * @param {Object} eloScores - Scores finais
 * @returns {string} ID do campeão
 */
export function getChampion(eloScores) {
  let championId = null;
  let maxElo = -Infinity;
  
  for (const [photoId, elo] of Object.entries(eloScores)) {
    if (elo > maxElo) {
      maxElo = elo;
      championId = photoId;
    }
  }
  
  return championId;
}

/**
 * Gera ranking ordenado por Elo
 * @param {Array} photos - Array de fotos
 * @param {Object} eloScores - Scores finais
 * @param {Array} battleHistory - Histórico de confrontos
 * @returns {Array} Ranking ordenado com estatísticas
 */
export function generateRanking(photos, eloScores, battleHistory = []) {
  // Calcular vitórias e derrotas
  const stats = {};
  
  photos.forEach(p => {
    stats[p.id] = { wins: 0, losses: 0 };
  });
  
  battleHistory.forEach(battle => {
    if (stats[battle.winner]) stats[battle.winner].wins++;
    
    const loser = battle.photoA === battle.winner ? battle.photoB : battle.photoA;
    if (stats[loser]) stats[loser].losses++;
  });
  
  // Ordenar por Elo (maior → menor)
  const ranking = [...photos]
    .map(p => ({
      ...p,
      elo: eloScores[p.id] || 1500,
      wins: stats[p.id]?.wins || 0,
      losses: stats[p.id]?.losses || 0,
      total: (stats[p.id]?.wins || 0) + (stats[p.id]?.losses || 0)
    }))
    .sort((a, b) => b.elo - a.elo);
  
  return ranking;
}

