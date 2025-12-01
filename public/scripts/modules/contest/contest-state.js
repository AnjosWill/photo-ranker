/**
 * contest-state.js
 * Funções de validação e manipulação de estado do contest
 * Responsabilidade: Validar consistência, calcular estatísticas, helpers de estado
 */

/**
 * Calcula estatísticas de cada foto
 * @param {Array} photos - Fotos participantes
 * @param {Object} eloScores - Scores Elo
 * @param {Array} battleHistory - Histórico de batalhas
 * @param {Object} contestState - Estado do contest (para verificar fase)
 * @param {Object} cachedStats - Stats em cache (opcional)
 * @returns {Object} { photoId: {wins, losses, elo, rank} }
 */
export function calculatePhotoStats(photos, eloScores, battleHistory, contestState = null, cachedStats = null) {
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
  
  // Sistema pairwise: ranking baseado apenas em Elo (não W-L)
  return calculateRankingFromStats(stats, false);
}

/**
 * Calcula ranking a partir de stats (com critério de desempate)
 * @param {Object} stats - { photoId: {wins, losses, elo} }
 * @param {boolean} prioritizeWL - Se true, prioriza W-L sobre Elo (para fase final)
 * @returns {Object} Stats com rank adicionado
 */
export function calculateRankingFromStats(stats, prioritizeWL = false) {
  const ranked = Object.entries(stats)
    .sort((a, b) => {
      const [idA, statsA] = a;
      const [idB, statsB] = b;
      
      if (prioritizeWL) {
        const wlA = statsA.wins - statsA.losses;
        const wlB = statsB.wins - statsB.losses;
        
        if (wlB !== wlA) return wlB - wlA;
        if (statsB.wins !== statsA.wins) return statsB.wins - statsA.wins;
        if (statsB.elo !== statsA.elo) return statsB.elo - statsA.elo;
        return idA.localeCompare(idB);
      } else {
        if (statsB.elo !== statsA.elo) return statsB.elo - statsA.elo;
        if (statsB.wins !== statsA.wins) return statsB.wins - statsA.wins;
        if (statsA.losses !== statsB.losses) return statsA.losses - statsB.losses;
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
 * @param {Object} contestState - Estado do contest a validar
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateContestState(contestState) {
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
export function calculateBattlesPerPhoto(totalPhotos) {
  if (totalPhotos <= 4) return Math.min(3, totalPhotos - 1);
  if (totalPhotos <= 8) return 4;
  if (totalPhotos <= 16) return 5;
  return 6;
}

/**
 * Verifica se duas fotos já batalharam (helper)
 * @param {string} photoAId - ID da foto A
 * @param {string} photoBId - ID da foto B
 * @param {Array} battleHistory - Histórico de batalhas
 * @returns {boolean} true se já batalharam
 */
export function haveAlreadyBattled(photoAId, photoBId, battleHistory) {
  const pairKey = [photoAId, photoBId].sort().join('-');
  return battleHistory.some(b => {
    const battleKey = [b.photoA, b.photoB].sort().join('-');
    return battleKey === pairKey;
  });
}

/**
 * Verifica se duas fotos já batalharam antes e retorna a vencedora
 * IMPORTANTE: Só verifica batalhas da fase 'qualifying', não do bracket
 * @param {string} photoAId - ID da foto A
 * @param {string} photoBId - ID da foto B
 * @param {Array} battleHistory - Histórico de batalhas
 * @returns {string|null} 'A' ou 'B' se já batalharam na qualifying, null caso contrário
 */
export function getPreviousWinner(photoAId, photoBId, battleHistory) {
  for (const battle of battleHistory) {
    if (battle.phase && battle.phase !== 'qualifying') {
      continue;
    }
    
    const battleIds = [battle.photoA, battle.photoB].sort();
    const currentIds = [photoAId, photoBId].sort();
    if (battleIds[0] === currentIds[0] && battleIds[1] === currentIds[1]) {
      return battle.winner === photoAId ? 'A' : 'B';
    }
  }
  return null;
}
