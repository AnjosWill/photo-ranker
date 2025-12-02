/**
 * contest-manager.js
 * Gerencia o ciclo de vida do Contest Mode
 * Responsabilidade: Iniciar, finalizar, salvar e carregar estado do contest
 */

import { getAllPhotos } from "../../db.js";
import { initializeEloScores } from "../../elo.js";
import { calculateEloRange, calculateScoresAndTiers } from "../../tiers.js";
import { calculatePhotoStats, calculateRankingFromStats } from "./contest-state.js";


/**
 * Inicia um novo contest
 * @param {Object} context - Contexto com contestState, renderBattle, toast, allPhotos
 */
export async function startContest(context) {
  const { contestState, renderBattle, toast, allPhotos } = context;
  const photos = allPhotos || await getAllPhotos();
  const visiblePhotos = photos.filter(p => !p._isSplit);
  const qualifiedPhotos = visiblePhotos.filter(p => p.rating === 5);
  
  if (qualifiedPhotos.length < 2) {
    toast('Você precisa de pelo menos 2 fotos com ⭐5');
    return;
  }
  
  const eloScores = initializeEloScores(qualifiedPhotos);
  
  // Calcular total de combinações possíveis (n*(n-1)/2)
  const totalPossibleBattles = qualifiedPhotos.length * (qualifiedPhotos.length - 1) / 2;
  
  const eloHistory = {};
  qualifiedPhotos.forEach(p => {
    eloHistory[p.id] = [{ elo: 1500, timestamp: Date.now(), battleId: null }];
  });
  
  contestState.current = {
    phase: 'qualifying',
    qualifiedPhotos: qualifiedPhotos,
    
    qualifying: {
      totalBattles: totalPossibleBattles,
      completedBattles: 0,
      currentMatch: null, // Próximo par a ser batalhado (gerado dinamicamente)
      eloHistory: eloHistory
    },
    
    eloScores: eloScores,
    battleHistory: [],
    photoStats: {},
    eloRange: { min: 1500, max: 1500 },
    scoresAndTiers: {},
    frozen: false
  };
  
  contestState.current.eloRange = calculateEloRange(eloScores);
  contestState.current.scoresAndTiers = calculateScoresAndTiers(
    eloScores,
    null,
    contestState.current.eloRange.min,
    contestState.current.eloRange.max,
    false
  );
  
  saveContestState(context);
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  await renderBattle();
  
  toast(`Contest iniciado! ${qualifiedPhotos.length} participantes. Sistema Pairwise: ${totalPossibleBattles} confrontos únicos possíveis.`);
}

/**
 * Finaliza o contest
 * Calcula campeão baseado exclusivamente no Elo final (maior Elo = campeão)
 * @param {Object} context - Contexto com contestState, toast
 */
export function finishContest(context) {
  const { contestState, toast } = context;
  if (!contestState.current) return;
  
  // Calcular campeão baseado apenas no Elo final (não W-L)
  const { qualifiedPhotos, eloScores, battleHistory } = contestState.current;
  
  // Calcular photoStats e ranks antes de finalizar (se ainda não calculados)
  if (!contestState.current.photoStats || Object.keys(contestState.current.photoStats).length === 0) {
    const photoStats = calculatePhotoStats(
      qualifiedPhotos,
      eloScores,
      battleHistory,
      contestState.current,
      {}
    );
    contestState.current.photoStats = photoStats;
  }
  
  // Calcular ranks se ainda não calculados ou atualizar ranks existentes
  if (contestState.current.photoStats) {
    contestState.current.photoStats = calculateRankingFromStats(contestState.current.photoStats, false);
  }
  
  const ranked = [...qualifiedPhotos]
    .sort((a, b) => {
      const eloA = eloScores[a.id] || 1500;
      const eloB = eloScores[b.id] || 1500;
      // Ordenar por Elo descendente (maior = melhor)
      if (eloB !== eloA) return eloB - eloA;
      // Desempate por ID
      return a.id.localeCompare(b.id);
    });
  
  if (ranked.length > 0) {
    contestState.current.championId = ranked[0].id;
  }
  
  contestState.current.phase = 'finished';
  
  // Salvar estado antes de redirecionar
  saveContestState(context);
  
  toast('🏆 Contest finalizado! Veja os resultados.');
  
  // Redirecionar para aba Resultados do projeto atual
  // Extrair projectId da URL atual ou usar função global se disponível
  const hash = location.hash;
  const projectMatch = hash.match(/#\/project\/([^/]+)/);
  const projectId = projectMatch ? projectMatch[1] : null;
  const resultsHash = projectId ? `#/project/${projectId}/results` : '#/results';
  
  // Aguardar um pouco mais para garantir que o estado foi salvo
  setTimeout(() => {
    try {
      location.hash = resultsHash;
    } catch (error) {
      console.error('Erro ao redirecionar para resultados:', error);
      // Fallback: tentar novamente após um delay
      setTimeout(() => {
        location.hash = resultsHash;
      }, 500);
    }
  }, 1500);
}

/**
 * Salva estado do contest no localStorage
 * @param {Object} context - Contexto com contestState
 */
export function saveContestState(context) {
  const { contestState } = context;
  if (contestState.current) {
    const stateToSave = {
      phase: contestState.current.phase,
      qualifiedPhotoIds: contestState.current.qualifiedPhotos?.map(p => p.id) || [],
      
      qualifying: contestState.current.qualifying ? {
        totalBattles: contestState.current.qualifying.totalBattles,
        completedBattles: contestState.current.qualifying.completedBattles,
        currentMatch: contestState.current.qualifying.currentMatch ? {
          photoA: contestState.current.qualifying.currentMatch.photoA.id,
          photoB: contestState.current.qualifying.currentMatch.photoB.id
        } : null,
        eloHistory: contestState.current.qualifying.eloHistory
      } : null,
      
      // Fase Final
      final: contestState.current.final ? {
        finalPhotoIds: contestState.current.final.finalPhotos.map(p => p.id),
        totalBattles: contestState.current.final.totalBattles,
        completedBattles: contestState.current.final.completedBattles,
        currentMatch: contestState.current.final.currentMatch ? {
          photoA: contestState.current.final.currentMatch.photoA.id,
          photoB: contestState.current.final.currentMatch.photoB.id
        } : null,
        pendingMatches: contestState.current.final.pendingMatches.map(m => ({
          photoA: m.photoA.id,
          photoB: m.photoB.id
        })),
        eloHistory: contestState.current.final.eloHistory
      } : null,
      
      eloScores: contestState.current.eloScores,
      battleHistory: contestState.current.battleHistory,
      photoStats: contestState.current.photoStats || {},
      frozen: contestState.current.frozen || false,
      eloRange: contestState.current.eloRange || { min: 1500, max: 1500 },
      scoresAndTiers: contestState.current.scoresAndTiers || {},
      championId: contestState.current.championId || null
    };
    
    localStorage.setItem('photoranker-contest-state', JSON.stringify(stateToSave));
  } else {
    localStorage.removeItem('photoranker-contest-state');
  }
}

/**
 * Carrega estado do contest do localStorage
 * @param {Object} context - Contexto com contestState, allPhotos
 */
export function loadContestState(context) {
  const { contestState, allPhotos } = context;
  try {
    const saved = localStorage.getItem('photoranker-contest-state');
    if (!saved) {
      contestState.current = null;
      return;
    }
    
    const state = JSON.parse(saved);
    const photos = allPhotos || [];
    
    if (!photos || photos.length === 0) {
      contestState.current = null;
      return;
    }
    
    const qualifiedPhotos = state.qualifiedPhotoIds
      .map(id => photos.find(p => p.id === id))
      .filter(Boolean);
    
    let qualifying = null;
    if (state.qualifying) {
      // Migração: se houver bracket antigo, converter para sistema pairwise
      // Calcular total de combinações possíveis baseado no número de fotos qualificadas
      const numPhotos = qualifiedPhotos.length;
      const totalPossibleBattles = numPhotos * (numPhotos - 1) / 2;
      
      const currentMatch = state.qualifying.currentMatch ? {
        photoA: photos.find(p => p.id === state.qualifying.currentMatch.photoA),
        photoB: photos.find(p => p.id === state.qualifying.currentMatch.photoB)
      } : null;
      
      qualifying = {
        totalBattles: state.qualifying.totalBattles || totalPossibleBattles,
        completedBattles: state.qualifying.completedBattles || 0,
        currentMatch: currentMatch,
        eloHistory: state.qualifying.eloHistory || {}
      };
    }
    
    // Reconstruir fase final
    let final = null;
    if (state.final) {
      const finalPhotos = state.final.finalPhotoIds
        .map(id => photos.find(p => p.id === id))
        .filter(Boolean);
      
      const currentMatch = state.final.currentMatch ? {
        photoA: photos.find(p => p.id === state.final.currentMatch.photoA),
        photoB: photos.find(p => p.id === state.final.currentMatch.photoB)
      } : null;
      
      const pendingMatches = state.final.pendingMatches.map(m => ({
        photoA: photos.find(p => p.id === m.photoA),
        photoB: photos.find(p => p.id === m.photoB)
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
    
    let phase = state.phase;
    // Migração: converter fases antigas para o novo sistema
    if (phase === 'bracket' || phase === 'final') {
      phase = 'finished';
    }
    
    contestState.current = {
      phase: phase,
      qualifiedPhotos: qualifiedPhotos,
      qualifying: qualifying,
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
      contestState.current.eloRange = calculateEloRange(contestState.current.eloScores);
      contestState.current.scoresAndTiers = calculateScoresAndTiers(
        contestState.current.eloScores,
        null,
        contestState.current.eloRange.min,
        contestState.current.eloRange.max,
        false
      );
    }
    
  } catch (err) {
    console.error('Erro ao carregar estado do contest:', err);
    contestState.current = null;
  }
}
