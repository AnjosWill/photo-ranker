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
 * Gera confrontos "todos contra todos" (round-robin) para uma rodada
 * Cada foto batalha com todas as outras, sem repetição
 * 
 * @param {Array} photos - Fotos participantes da rodada
 * @param {Array} battleHistory - Histórico de batalhas (para evitar repetições)
 * @param {number} round - Número da rodada
 * @returns {Array} [{photoA, photoB}, ...] Array de confrontos
 */
export function generateRoundRobin(photos, battleHistory = [], round = 1) {
  if (photos.length < 2) {
    return [];
  }
  
  const pairings = [];
  const used = new Set();
  
  // Gerar todos os pares possíveis (sem repetição)
  for (let i = 0; i < photos.length; i++) {
    for (let j = i + 1; j < photos.length; j++) {
      const photoA = photos[i];
      const photoB = photos[j];
      
      // Verificar se já batalharam antes (em qualquer rodada)
      const pairKey = [photoA.id, photoB.id].sort().join('-');
      const alreadyFaced = battleHistory.some(b => {
        const battleKey = [b.photoA, b.photoB].sort().join('-');
        return battleKey === pairKey;
      });
      
      // Se já batalharam, usar vencedora anterior (não criar novo confronto)
      if (alreadyFaced) {
        continue; // Pula este par (já foi decidido antes)
      }
      
      // Adicionar confronto
      pairings.push({ photoA, photoB });
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

/**
 * Gera estrutura de bracket de eliminação progressiva com consolation bracket
 * Sistema: Double Elimination Tournament
 * 
 * Round 1: Pares iniciais (A vs B, C vs D, etc.)
 * Round 2+: Winners avançam, Losers batalham entre si para ranking
 * 
 * @param {Array} photos - Fotos participantes
 * @returns {Object} Estrutura do bracket
 */
export function generateBracketStructure(photos) {
  if (photos.length < 2) {
    return null;
  }
  
  // Embaralhar fotos (ou ordenar por Elo inicial se preferir)
  const shuffled = [...photos].sort(() => Math.random() - 0.5);
  
  // Criar Round 1 (inicial)
  const round1Matches = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    if (i + 1 < shuffled.length) {
      round1Matches.push({
        photoA: shuffled[i],
        photoB: shuffled[i + 1],
        winner: null,
        loser: null,
        completed: false
      });
    } else {
      // Foto ímpar - bye (avança direto)
      round1Matches.push({
        photoA: shuffled[i],
        photoB: null,
        winner: shuffled[i],
        loser: null,
        completed: true,
        bye: true
      });
    }
  }
  
  return {
    rounds: [
      {
        round: 1,
        type: 'initial',
        matches: round1Matches,
        winners: [],
        losers: [],
        completed: false
      }
    ],
    currentRound: 1,
    currentMatchIndex: 0,
    totalRounds: Math.ceil(Math.log2(photos.length)) + 1
  };
}

/**
 * Processa resultado de uma batalha e atualiza o bracket
 * @param {Object} bracket - Estrutura do bracket
 * @param {number} roundIndex - Índice do round (0-based)
 * @param {number} matchIndex - Índice do match no round
 * @param {Object} winner - Foto vencedora
 * @param {Object} loser - Foto perdedora
 * @returns {Object} Bracket atualizado
 */
export function processBracketBattle(bracket, roundIndex, matchIndex, winner, loser) {
  if (!bracket || !bracket.rounds[roundIndex]) {
    return bracket;
  }
  
  const round = bracket.rounds[roundIndex];
  const match = round.matches[matchIndex];
  
  if (!match || match.completed) {
    return bracket;
  }
  
  // Atualizar match
  match.winner = winner;
  match.loser = loser;
  match.completed = true;
  
  // Adicionar aos arrays de winners/losers
  if (!round.winners.includes(winner.id)) {
    round.winners.push(winner.id);
  }
  if (!round.losers.includes(loser.id)) {
    round.losers.push(loser.id);
  }
  
  // Verificar se round está completo
  const allCompleted = round.matches.every(m => m.completed);
  if (allCompleted) {
    round.completed = true;
    
    // Gerar próximo round se necessário
    generateNextRound(bracket, roundIndex);
  }
  
  return bracket;
}

/**
 * Gera próximo round baseado nos resultados do round anterior
 * @param {Object} bracket - Estrutura do bracket
 * @param {number} completedRoundIndex - Índice do round completado
 */
function generateNextRound(bracket, completedRoundIndex) {
  const completedRound = bracket.rounds[completedRoundIndex];
  
  if (!completedRound || !completedRound.completed) {
    return;
  }
  
  // Se é round inicial, criar Round 2 - Winners e Round 2 - Losers
  if (completedRound.type === 'initial') {
    // Winners Round 2: pegar TODOS os winners do Round 1
    const winnerPhotos = completedRound.matches
      .filter(m => m.completed && m.winner && !m.bye)
      .map(m => m.winner)
      .filter((photo, index, self) => self.findIndex(p => p.id === photo.id) === index); // Remover duplicatas
    
    if (winnerPhotos.length >= 2) {
      const winnersMatches = [];
      for (let i = 0; i < winnerPhotos.length; i += 2) {
        if (i + 1 < winnerPhotos.length) {
          winnersMatches.push({
            photoA: winnerPhotos[i],
            photoB: winnerPhotos[i + 1],
            winner: null,
            loser: null,
            completed: false
          });
        } else {
          // Foto ímpar - bye (avança direto)
          winnersMatches.push({
            photoA: winnerPhotos[i],
            photoB: null,
            winner: winnerPhotos[i],
            loser: null,
            completed: true,
            bye: true
          });
        }
      }
      
      if (winnersMatches.length > 0) {
        bracket.rounds.push({
          round: 2,
          type: 'winners',
          matches: winnersMatches,
          winners: [],
          losers: [],
          completed: false
        });
      }
    }
    
    // Losers Round 2 (Consolation): pegar TODOS os losers do Round 1
    const loserPhotos = completedRound.matches
      .filter(m => m.completed && m.loser)
      .map(m => m.loser)
      .filter((photo, index, self) => self.findIndex(p => p.id === photo.id) === index); // Remover duplicatas
    
    if (loserPhotos.length >= 2) {
      const losersMatches = [];
      for (let i = 0; i < loserPhotos.length; i += 2) {
        if (i + 1 < loserPhotos.length) {
          losersMatches.push({
            photoA: loserPhotos[i],
            photoB: loserPhotos[i + 1],
            winner: null,
            loser: null,
            completed: false
          });
        } else {
          // Foto ímpar - bye (avança direto)
          losersMatches.push({
            photoA: loserPhotos[i],
            photoB: null,
            winner: loserPhotos[i],
            loser: null,
            completed: true,
            bye: true
          });
        }
      }
      
      if (losersMatches.length > 0) {
        bracket.rounds.push({
          round: 2,
          type: 'losers',
          matches: losersMatches,
          winners: [],
          losers: [],
          completed: false
        });
      }
    }
  } else if (completedRound.type === 'winners') {
    // Round de Winners: gerar próximo round de winners
    const winnerPhotos = completedRound.matches
      .filter(m => m.completed && m.winner && !m.bye)
      .map(m => m.winner)
      .filter((photo, index, self) => self.findIndex(p => p.id === photo.id) === index); // Remover duplicatas
    
    if (winnerPhotos.length >= 2) {
      const winnersMatches = [];
      for (let i = 0; i < winnerPhotos.length; i += 2) {
        if (i + 1 < winnerPhotos.length) {
          winnersMatches.push({
            photoA: winnerPhotos[i],
            photoB: winnerPhotos[i + 1],
            winner: null,
            loser: null,
            completed: false
          });
        } else {
          // Foto ímpar - bye
          winnersMatches.push({
            photoA: winnerPhotos[i],
            photoB: null,
            winner: winnerPhotos[i],
            loser: null,
            completed: true,
            bye: true
          });
        }
      }
      
      if (winnersMatches.length > 0) {
        const nextRoundNum = Math.max(...bracket.rounds.map(r => r.round)) + 1;
        bracket.rounds.push({
          round: nextRoundNum,
          type: 'winners',
          matches: winnersMatches,
          winners: [],
          losers: [],
          completed: false
        });
      }
    } else if (winnerPhotos.length === 1) {
      // Apenas 1 winner restante - campeão!
    }
  } else if (completedRound.type === 'losers') {
    // Round de Losers: gerar próximo round de losers (se houver mais de 1)
    const winnerPhotos = completedRound.matches
      .filter(m => m.completed && m.winner && !m.bye)
      .map(m => m.winner)
      .filter((photo, index, self) => self.findIndex(p => p.id === photo.id) === index);
    
    if (winnerPhotos.length >= 2) {
      const losersMatches = [];
      for (let i = 0; i < winnerPhotos.length; i += 2) {
        if (i + 1 < winnerPhotos.length) {
          losersMatches.push({
            photoA: winnerPhotos[i],
            photoB: winnerPhotos[i + 1],
            winner: null,
            loser: null,
            completed: false
          });
        } else {
          // Foto ímpar - bye
          losersMatches.push({
            photoA: winnerPhotos[i],
            photoB: null,
            winner: winnerPhotos[i],
            loser: null,
            completed: true,
            bye: true
          });
        }
      }
      
      if (losersMatches.length > 0) {
        const nextRoundNum = Math.max(...bracket.rounds.map(r => r.round)) + 1;
        bracket.rounds.push({
          round: nextRoundNum,
          type: 'losers',
          matches: losersMatches,
          winners: [],
          losers: [],
          completed: false
        });
      }
    }
  }
  
  // Atualizar currentRound apenas se não estiver sendo controlado externamente
  // (não atualizar aqui para evitar conflitos)
}

