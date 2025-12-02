/**
 * contest-battle.js
 * Renderização e interação de batalhas do Contest Mode
 * Responsabilidade: Renderizar batalhas, processar escolhas, gerenciar teclado
 */

import { $ } from "../../ui.js";
import { TIERS, calculateEloRange, calculateScoresAndTiers, normalizeEloToScore, getTierFromScore } from "../../tiers.js";
import { updateEloScores } from "../../elo.js";
import { calculatePhotoStats as calculatePhotoStatsState, calculateRankingFromStats } from "./contest-state.js";

/**
 * Cria e inicializa o módulo de batalhas
 * @param {Object} context - Contexto com todas as dependências necessárias
 * @returns {Object} API pública do módulo
 */
export function createBattleModule(context) {
  const {
    getContestState,
    setContestState,
    renderContestView,
    finishContest,
    saveContestState,
    toast,
    confirmCancelContest,
    generateNextPairwiseMatch
  } = context;
  
  // Funções legadas para migração de estados antigos (não usadas no fluxo normal)
  // Mantidas apenas para compatibilidade com estados salvos que podem ter fase "final"
  // Nota: generateQualifyingBattles não é mais passada no contexto, mas pode ser necessária
  // para migração de estados muito antigos. Se necessário, será implementada localmente.

  let battleKeysHandler = null;

  /**
   * Handler de atalhos de teclado na batalha
   */
  function handleBattleKeys(e) {
    const contestState = getContestState();
    // Verificar se está na rota de contest do projeto (não mais #/contest simples)
    const hash = location.hash;
    const isContestRoute = hash.includes('/contest') || hash === '#/contest';
    if (!isContestRoute || !contestState) {
      return;
    }
    
    // Sistema pairwise: apenas fase 'qualifying' (fase 'final' é legado para migração)
    if (contestState.phase !== 'qualifying' && contestState.phase !== 'final') {
      return;
    }
    
    const tag = (e.target && e.target.tagName) || "";
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
    if (typing) return;
    
    // Teclas 1 ou ← → Foto A vence
    if (e.key === '1' || e.key === 'ArrowLeft') {
      e.preventDefault();
      e.stopPropagation();
      chooseBattleWinner('A');
    }
    
    // Teclas 2 ou → → Foto B vence
    if (e.key === '2' || e.key === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      chooseBattleWinner('B');
    }
    
    // Esc → Cancelar contest
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      confirmCancelContest();
    }
  }


  /**
   * Renderiza ranking dinâmico
   */
  function renderDynamicRanking(photos, photoStats) {
    const contestState = getContestState();
    // Na fase final, ordenar por W-L primeiro; senão, por score
    const isFinal = contestState?.phase === 'final';
    
    const ranked = [...photos]
      .map(p => ({ 
        ...p, 
        stats: photoStats[p.id],
        scoreData: contestState.scoresAndTiers[p.id] || { score: 50, tier: TIERS[4] }
      }))
      .sort((a, b) => {
        if (isFinal) {
          const wlA = a.stats.wins - a.stats.losses;
          const wlB = b.stats.wins - b.stats.losses;
          
          if (wlB !== wlA) return wlB - wlA;
          if (b.stats.wins !== a.stats.wins) return b.stats.wins - a.stats.wins;
          if (b.scoreData.score !== a.scoreData.score) return b.scoreData.score - a.scoreData.score;
        } else {
          if (b.scoreData.score !== a.scoreData.score) return b.scoreData.score - a.scoreData.score;
          if (b.stats.wins !== a.stats.wins) return b.stats.wins - a.stats.wins;
        }
        
        return a.id.localeCompare(b.id);
      });
    
    return ranked.map((photo, index) => {
      const { wins, losses, rank } = photo.stats;
      const { score, tier } = photo.scoreData;
      return `
        <div class="ranking-item ${index < 3 ? 'top-' + (index + 1) : ''}">
          <span class="ranking-position">#${rank}</span>
          <img src="${photo.thumb}" alt="Foto" class="ranking-thumb">
          <div class="ranking-details">
            <div class="tier-badge tier-badge-small">
              <div class="tier-icon">${tier.icon}</div>
              <div class="tier-score">${score}/100</div>
              <div class="tier-label">${tier.label}</div>
            </div>
            <div class="ranking-record">${wins}W-${losses}L</div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Renderiza interface de confronto (suporta qualifying e bracket)
   */
  async function renderBattle() {
    const container = $('#contestView');
    if (!container) {
      return;
    }
    
    const contestState = getContestState();
    if (!contestState) {
      await renderContestView();
      return;
    }
    
    if (contestState.phase === 'finished') {
      finishContest();
      return;
    }
    
    if (contestState.phase === 'qualifying') {
      await renderQualifyingBattle();
    } else if (contestState.phase === 'final') {
      await renderFinalBattle();
    } else {
      await renderContestView();
    }
  }

  /**
   * Renderiza batalha da fase classificatória (sistema pairwise)
   */
  async function renderQualifyingBattle() {
    const container = $('#contestView');
    if (!container) {
      return;
    }
    
    const contestState = getContestState();
    if (!contestState || !contestState.qualifying) {
      await renderContestView();
      return;
    }
    
    const { qualifying, eloScores, battleHistory, qualifiedPhotos } = contestState;
    
    // Gerar próximo par único usando pareamento híbrido
    let currentMatch = qualifying.currentMatch;
    if (!currentMatch) {
      currentMatch = generateNextPairwiseMatch(qualifiedPhotos, eloScores, battleHistory);
      if (!currentMatch) {
        // Todas as combinações foram esgotadas - finalizar contest
        await finishContest();
        return;
      }
      qualifying.currentMatch = currentMatch;
      await saveContestState(); // Aguardar salvamento
    }
    
    const photoA = currentMatch.photoA;
    const photoB = currentMatch.photoB;
    
    if (!photoA || !photoB) {
      await renderContestView();
      return;
    }
    
    const photoStats = calculatePhotoStatsState(qualifiedPhotos, eloScores, battleHistory, contestState, contestState.photoStats);
    contestState.photoStats = photoStats;
    const statsA = photoStats[photoA.id];
    const statsB = photoStats[photoB.id];
    
    if (!statsA || !statsB) {
      await renderContestView();
      return;
    }
    
    // Obter scores e tiers
    const scoreA = contestState.scoresAndTiers[photoA.id] || { score: 50, tier: TIERS[4] };
    const scoreB = contestState.scoresAndTiers[photoB.id] || { score: 50, tier: TIERS[4] };
    
    // Calcular progresso
    const totalBattles = qualifying.totalBattles;
    const currentBattleNumber = qualifying.completedBattles + 1;
    const remainingBattles = totalBattles - qualifying.completedBattles;
    const progress = totalBattles > 0 ? Math.round((qualifying.completedBattles / totalBattles) * 100) : 0;
    
    container.innerHTML = `
      <div class="contest-battle">
        <div class="contest-progress">
          <strong>Contest - Sistema Pairwise</strong><br>
          Batalha <span class="current">${currentBattleNumber}</span> de ${totalBattles} 
          <span style="font-size: 0.9em; color: #666;">(${remainingBattles} pares únicos restantes)</span>
          <span class="progress-bar-mini">
            <span class="progress-fill" style="width: ${progress}%"></span>
          </span>
        </div>
        
        <!-- Grid principal: imagens + ranking -->
        <div class="battle-grid-layout">
          <!-- Container principal das imagens -->
          <div class="battle-container-full">
            <!-- Foto A -->
            <div class="battle-photo" id="battlePhotoA" tabindex="0" role="button" aria-label="Escolher Foto A (1 ou ←)">
              <img src="${photoA.thumb}" alt="Foto A">
              <div class="battle-label">1</div>
              <div class="battle-info">
                <div class="battle-rank">#${statsA.rank} | ${statsA.wins}W-${statsA.losses}L</div>
              </div>
            </div>
            
            <!-- VS -->
            <div class="battle-vs">
              <span>VS</span>
            </div>
            
            <!-- Foto B -->
            <div class="battle-photo" id="battlePhotoB" tabindex="0" role="button" aria-label="Escolher Foto B (2 ou →)">
              <img src="${photoB.thumb}" alt="Foto B">
              <div class="battle-label">2</div>
              <div class="battle-info">
                <div class="battle-rank">#${statsB.rank} | ${statsB.wins}W-${statsB.losses}L</div>
              </div>
            </div>
          </div>
          
          <!-- Ranking dinâmico - parte do grid -->
          <div class="dynamic-ranking-sidebar">
            <h4>Ranking</h4>
            <div class="ranking-list">
              ${renderDynamicRanking(qualifiedPhotos, photoStats)}
            </div>
          </div>
        </div>
        
        <div class="battle-actions">
          <button class="btn btn-secondary" id="cancelContest">Cancelar Contest</button>
        </div>
      </div>
    `;
    
    // Remover listener antigo se existir
    if (battleKeysHandler) {
      document.removeEventListener('keydown', battleKeysHandler);
    }
    
    // Criar novo handler e adicionar
    battleKeysHandler = handleBattleKeys;
    document.addEventListener('keydown', battleKeysHandler);
    
    // Event listeners para cliques - usar event delegation
    const battleContainer = $('.battle-container-full');
    if (battleContainer) {
      const newContainer = battleContainer.cloneNode(true);
      battleContainer.replaceWith(newContainer);
      
      newContainer.addEventListener('click', (e) => {
        const target = e.target.closest('#battlePhotoA, #battlePhotoB');
        if (!target) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        if (target.id === 'battlePhotoA') {
          chooseBattleWinner('A');
        } else if (target.id === 'battlePhotoB') {
          chooseBattleWinner('B');
        }
      });
    }
    
    $('#cancelContest')?.addEventListener('click', confirmCancelContest);
  }

  /**
   * Renderiza batalha da fase final
   */
  async function renderFinalBattle() {
    const container = $('#contestView');
    if (!container) {
      return;
    }
    
    const contestState = getContestState();
    if (!contestState || !contestState.final) {
      await renderContestView();
      return;
    }
    
    const { final, eloScores, battleHistory } = contestState;
    const { finalPhotos } = final;
    
    if (!final.currentMatch && final.pendingMatches && final.pendingMatches.length > 0) {
      final.currentMatch = final.pendingMatches.shift() || null;
    }
    
    const { currentMatch } = final;
    
    if (!currentMatch) {
      await finishFinalPhase();
      return;
    }
    
    if (!currentMatch.photoA || !currentMatch.photoB) {
      await renderContestView();
      return;
    }
    
    const photoA = currentMatch.photoA;
    const photoB = currentMatch.photoB;
    
    const photoStats = calculatePhotoStatsState(finalPhotos, eloScores, battleHistory, contestState, contestState.photoStats);
    contestState.photoStats = photoStats;
    const statsA = photoStats[photoA.id];
    const statsB = photoStats[photoB.id];
    
    const scoreA = contestState.scoresAndTiers[photoA.id] || { score: 50, tier: TIERS[4] };
    const scoreB = contestState.scoresAndTiers[photoB.id] || { score: 50, tier: TIERS[4] };
    
    const currentBattleNumber = final.completedBattles + 1;
    const progress = final.totalBattles > 0 ? Math.round((final.completedBattles / final.totalBattles) * 100) : 0;
    
    container.innerHTML = `
      <div class="contest-battle">
        <div class="contest-progress">
          <strong>Fase Final - Todas Contra Todas</strong><br>
          Batalha <span class="current">${currentBattleNumber}</span> de ${final.totalBattles} 
          <span class="progress-bar-mini">
            <span class="progress-fill" style="width: ${progress}%"></span>
          </span>
        </div>
        
        <div class="battle-grid-layout">
          <div class="battle-container-full">
            <div class="battle-photo" id="battlePhotoA" tabindex="0" role="button" aria-label="Escolher Foto A (1 ou ←)">
              <img src="${photoA.thumb}" alt="Foto A">
              <div class="battle-label">1</div>
              <div class="battle-info">
                <div class="battle-rank">#${statsA.rank} | ${statsA.wins}W-${statsA.losses}L</div>
              </div>
            </div>
            
            <div class="battle-vs">
              <span>VS</span>
            </div>
            
            <div class="battle-photo" id="battlePhotoB" tabindex="0" role="button" aria-label="Escolher Foto B (2 ou →)">
              <img src="${photoB.thumb}" alt="Foto B">
              <div class="battle-label">2</div>
              <div class="battle-info">
                <div class="battle-rank">#${statsB.rank} | ${statsB.wins}W-${statsB.losses}L</div>
              </div>
            </div>
          </div>
          
          <div class="dynamic-ranking-sidebar">
            <h4>Ranking Final</h4>
            <div class="ranking-list">
              ${renderDynamicRanking(finalPhotos, photoStats)}
            </div>
          </div>
        </div>
        
        <div class="battle-actions">
          <button class="btn btn-secondary" id="cancelContest">Cancelar Contest</button>
        </div>
      </div>
    `;
    
    if (battleKeysHandler) {
      document.removeEventListener('keydown', battleKeysHandler);
    }
    
    battleKeysHandler = handleBattleKeys;
    document.addEventListener('keydown', battleKeysHandler);
    
    const battleContainer = $('.battle-container-full');
    if (battleContainer) {
      const newContainer = battleContainer.cloneNode(true);
      battleContainer.replaceWith(newContainer);
      
      newContainer.addEventListener('click', (e) => {
        const target = e.target.closest('#battlePhotoA, #battlePhotoB');
        if (!target) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        if (target.id === 'battlePhotoA') {
          chooseBattleWinner('A');
        } else if (target.id === 'battlePhotoB') {
          chooseBattleWinner('B');
        }
      });
    }
    
    $('#cancelContest')?.addEventListener('click', confirmCancelContest);
  }

  /**
   * Registra vencedor de um confronto
   */
  async function chooseBattleWinner(winner) {
    const contestState = getContestState();
    if (!contestState || contestState.phase === 'finished') {
      return;
    }
    
    if (contestState.phase === 'qualifying') {
      await handleQualifyingBattle(winner);
    } else if (contestState.phase === 'final') {
      await handleFinalBattle(winner);
    }
  }

  /**
   * Processa batalha da fase classificatória (sistema pairwise)
   */
  async function handleQualifyingBattle(winner) {
    try {
      const contestState = getContestState();
      const { qualifying, eloScores, battleHistory, qualifiedPhotos } = contestState;
      
      if (!qualifying.currentMatch) {
        await renderContestView();
        return;
      }
      
      const currentMatch = qualifying.currentMatch;
      const winnerPhoto = winner === 'A' ? currentMatch.photoA : currentMatch.photoB;
      const loserPhoto = winner === 'A' ? currentMatch.photoB : currentMatch.photoA;
      const winnerId = winnerPhoto.id;
      const loserId = loserPhoto.id;
      
      // Atualizar Elo
      const eloBefore = { ...eloScores };
      if (!contestState.frozen) {
        contestState.eloScores = updateEloScores(winnerId, loserId, contestState.eloScores, 32);
        
        contestState.eloRange = calculateEloRange(contestState.eloScores);
        contestState.scoresAndTiers = calculateScoresAndTiers(
          contestState.eloScores,
          null,
          contestState.eloRange.min,
          contestState.eloRange.max,
          false
        );
      }
      
      // Registrar no histórico de Elo
      const battleId = `battle-${Date.now()}`;
      if (!qualifying.eloHistory[winnerId]) {
        qualifying.eloHistory[winnerId] = [];
      }
      if (!qualifying.eloHistory[loserId]) {
        qualifying.eloHistory[loserId] = [];
      }
      
      qualifying.eloHistory[winnerId].push({
        elo: contestState.eloScores[winnerId],
        timestamp: Date.now(),
        battleId: battleId
      });
      qualifying.eloHistory[loserId].push({
        elo: contestState.eloScores[loserId],
        timestamp: Date.now(),
        battleId: battleId
      });
      
      // Calcular mudança de Elo
      const eloChange = {
        winner: contestState.eloScores[winnerId] - (eloBefore[winnerId] || 1500),
        loser: contestState.eloScores[loserId] - (eloBefore[loserId] || 1500)
      };
      
      // Adicionar ao histórico de batalhas
      contestState.battleHistory.push({
        photoA: currentMatch.photoA.id,
        photoB: currentMatch.photoB.id,
        winner: winnerId,
        timestamp: Date.now(),
        eloChange: eloChange,
        phase: 'qualifying'
      });
      
      // Atualizar stats (para exibição, mas ranking final será baseado apenas em Elo)
      if (!contestState.photoStats[winnerId]) {
        contestState.photoStats[winnerId] = { wins: 0, losses: 0, elo: contestState.eloScores[winnerId] };
      }
      if (!contestState.photoStats[loserId]) {
        contestState.photoStats[loserId] = { wins: 0, losses: 0, elo: contestState.eloScores[loserId] };
      }
      contestState.photoStats[winnerId].wins++;
      contestState.photoStats[winnerId].elo = contestState.eloScores[winnerId];
      contestState.photoStats[loserId].losses++;
      contestState.photoStats[loserId].elo = contestState.eloScores[loserId];
      
      // Ranking baseado apenas em Elo (não W-L)
      contestState.photoStats = calculateRankingFromStats(contestState.photoStats, false);
      
      // Feedback visual
      const winnerElement = winner === 'A' ? $('#battlePhotoA') : $('#battlePhotoB');
      if (winnerElement) {
        winnerElement.style.borderColor = '#3ddc97';
        winnerElement.style.transform = 'scale(1.05)';
      }
      
      const winnerScoreBefore = contestState.scoresAndTiers[winnerId]?.score || 50;
      const winnerScoreAfter = contestState.scoresAndTiers[winnerId]?.score || 50;
      const scoreChange = winnerScoreAfter - winnerScoreBefore;
      const tierAfter = contestState.scoresAndTiers[winnerId]?.tier || TIERS[4];
      
      toast(`Foto ${winner} venceu! ${scoreChange > 0 ? '+' : ''}${Math.round(scoreChange)} score (${winnerScoreAfter}/100 ${tierAfter.icon})`);
      
      // Incrementar batalhas completadas
      qualifying.completedBattles++;
      
      // Limpar currentMatch e gerar próximo par
      qualifying.currentMatch = null;
      
      // Gerar próximo par único
      const nextMatch = generateNextPairwiseMatch(qualifiedPhotos, contestState.eloScores, contestState.battleHistory);
      
      if (!nextMatch) {
        // Todas as combinações foram esgotadas - finalizar contest
        setContestState(contestState);
        await saveContestState(); // Aguardar salvamento antes de finalizar
        await new Promise(resolve => setTimeout(resolve, 800));
        await finishContest();
        return;
      }
      
      qualifying.currentMatch = nextMatch;
      setContestState(contestState);
      await saveContestState(); // Aguardar salvamento
      
      await new Promise(resolve => setTimeout(resolve, 800));
      await renderBattle();
      
    } catch (error) {
      console.error('Erro em handleQualifyingBattle:', error);
      toast('Erro ao processar batalha. Tente novamente.');
    }
  }

  /**
   * Processa batalha da fase final
   */
  async function handleFinalBattle(winner) {
    const contestState = getContestState();
    const { final, eloScores } = contestState;
    const currentMatch = final.currentMatch;
    
    if (!currentMatch) return;
    
    const winnerPhoto = winner === 'A' ? currentMatch.photoA : currentMatch.photoB;
    const loserPhoto = winner === 'A' ? currentMatch.photoB : currentMatch.photoA;
    const winnerId = winnerPhoto.id;
    const loserId = loserPhoto.id;
    
    contestState.eloScores = updateEloScores(winnerId, loserId, contestState.eloScores, 32);
    
    if (final.eloHistory[winnerId]) {
      final.eloHistory[winnerId].push({
        elo: eloScores[winnerId],
        timestamp: Date.now(),
        battleId: `${winnerId}-${loserId}`
      });
    }
    if (final.eloHistory[loserId]) {
      final.eloHistory[loserId].push({
        elo: eloScores[loserId],
        timestamp: Date.now(),
        battleId: `${winnerId}-${loserId}`
      });
    }
    
    const photoStats = calculatePhotoStatsState(
      final.finalPhotos,
      contestState.eloScores,
      contestState.battleHistory.filter(b => b.phase === 'final'),
      contestState,
      contestState.photoStats
    );
    
    contestState.eloRange = calculateEloRange(contestState.eloScores);
    contestState.scoresAndTiers = calculateScoresAndTiers(
      contestState.eloScores,
      photoStats,
      contestState.eloRange.min,
      contestState.eloRange.max,
      true
    );
    
    const eloBefore = eloScores[winnerId] || 1500;
    const eloAfter = contestState.eloScores[winnerId] || 1500;
    const eloChange = eloAfter - eloBefore;
    
    contestState.battleHistory.push({
      photoA: currentMatch.photoA.id,
      photoB: currentMatch.photoB.id,
      winner: winnerId,
      timestamp: Date.now(),
      eloChange: { winner: eloChange, loser: -eloChange },
      phase: 'final',
      votesA: winner === 'A' ? 1 : 0,
      votesB: winner === 'B' ? 1 : 0
    });
    
    toast(`Foto ${winner} venceu!`);
    
    final.completedBattles++;
    
    if (final.completedBattles >= final.totalBattles || final.pendingMatches.length === 0) {
      await finishFinalPhase();
      return;
    }
    
    const remainingMatches = final.pendingMatches.filter(match => {
      const pairKey = [match.photoA.id, match.photoB.id].sort().join('-');
      return !contestState.battleHistory.some(b => {
        if (b.phase !== 'final') return false;
        const battleKey = [b.photoA, b.photoB].sort().join('-');
        return battleKey === pairKey;
      });
    });
    
    final.pendingMatches = remainingMatches;
    final.currentMatch = remainingMatches.shift() || null;
    
    if (!final.currentMatch && remainingMatches.length === 0) {
      await finishFinalPhase();
      return;
    }
    
    setContestState(contestState);
    await saveContestState(); // Aguardar salvamento
    await new Promise(resolve => setTimeout(resolve, 800));
    await renderBattle();
  }

  /**
   * Finaliza fase classificatória e inicia fase final
   */
  async function finishQualifyingAndStartBracket() {
    const contestState = getContestState();
    const { qualifiedPhotos, eloScores, scoresAndTiers, battleHistory } = contestState;
    
    const qualifyingBattles = battleHistory.filter(b => b.phase === 'qualifying');
    if (qualifyingBattles.length === 0) {
      return;
    }
    contestState.frozen = true;
    
    const ranked = [...qualifiedPhotos]
      .map(p => ({
        ...p,
        scoreData: scoresAndTiers[p.id] || { score: 50, tier: TIERS[4] }
      }))
      .sort((a, b) => {
        if (b.scoreData.score !== a.scoreData.score) {
          return b.scoreData.score - a.scoreData.score;
        }
        const statsA = contestState.photoStats[a.id] || { wins: 0 };
        const statsB = contestState.photoStats[b.id] || { wins: 0 };
        if (statsB.wins !== statsA.wins) {
          return statsB.wins - statsA.wins;
        }
        return a.id.localeCompare(b.id);
      });
    
    let finalPhotos = ranked.filter(p => p.scoreData.score > 50);
    
      if (finalPhotos.length < 2) {
        finalPhotos = ranked.slice(0, Math.max(2, ranked.length));
        
        if (finalPhotos.length < 2) {
          contestState.phase = 'finished';
          setContestState(contestState);
          await saveContestState(); // Aguardar salvamento antes de redirecionar
          toast(`🏆 Contest finalizado! Apenas ${finalPhotos.length} foto(s) participaram.`);
          await new Promise(resolve => setTimeout(resolve, 1500));
          // Redirecionar para aba Resultados do projeto atual
          const hash = location.hash;
          const projectMatch = hash.match(/#\/project\/([^/]+)/);
          const projectId = projectMatch ? projectMatch[1] : null;
          location.hash = projectId ? `#/project/${projectId}/results` : '#/results';
          return;
        }
      }
    
    const allBattles = contestState.battleHistory.filter(b => 
      b.phase === 'qualifying' || b.phase === 'final'
    );
    
    // Código legado: apenas para migração de estados antigos
    // No sistema pairwise atual, esta função não é mais chamada no fluxo normal
    // Se necessário para migração, gerar matches simples sem repetição
    const finalMatches = [];
    for (let i = 0; i < finalPhotos.length; i++) {
      for (let j = i + 1; j < finalPhotos.length; j++) {
        const pairKey = [finalPhotos[i].id, finalPhotos[j].id].sort().join('-');
        const hasBattled = allBattles.some(b => {
          const battleKey = [b.photoA, b.photoB].sort().join('-');
          return battleKey === pairKey;
        });
        if (!hasBattled) {
          finalMatches.push({ photoA: finalPhotos[i], photoB: finalPhotos[j] });
        }
      }
    }
    
    const finalEloHistory = {};
    finalPhotos.forEach(p => {
      const existingHistory = contestState.qualifying?.eloHistory?.[p.id] || [];
      finalEloHistory[p.id] = existingHistory.length > 0 
        ? existingHistory 
        : [{ elo: eloScores[p.id] || 1500, timestamp: Date.now(), battleId: null }];
    });
    
    contestState.phase = 'final';
    contestState.final = {
      finalPhotos: finalPhotos,
      totalBattles: finalMatches.length,
      completedBattles: 0,
      currentMatch: finalMatches[0] || null,
      pendingMatches: finalMatches.slice(1),
      eloHistory: finalEloHistory
    };
    
    contestState.bracket = null;
    
    setContestState(contestState);
    await saveContestState(); // Aguardar salvamento
    
    toast(`🏆 Fase Classificatória finalizada! ${finalPhotos.length} fotos com score > 50 avançam para a Fase Final (todas contra todas).`);
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    await renderBattle();
  }

  /**
   * Finaliza fase final e define campeã
   */
  async function finishFinalPhase() {
    const contestState = getContestState();
    const { final, eloScores, battleHistory, qualifiedPhotos } = contestState;
    
    const photoStats = calculatePhotoStatsState(
      qualifiedPhotos,
      eloScores,
      battleHistory,
      contestState,
      {}
    );
    
    const statsWithRank = calculateRankingFromStats(photoStats, true);
    
    const ranked = [...qualifiedPhotos]
      .map(p => ({
        ...p,
        stats: statsWithRank[p.id]
      }))
      .sort((a, b) => {
        const wlA = a.stats.wins - a.stats.losses;
        const wlB = b.stats.wins - b.stats.losses;
        
        if (wlB !== wlA) return wlB - wlA;
        if (b.stats.wins !== a.stats.wins) return b.stats.wins - a.stats.wins;
        if (a.stats.losses !== b.stats.losses) return a.stats.losses - b.stats.losses;
        
        const scoreA = contestState.scoresAndTiers[a.id]?.score || 50;
        const scoreB = contestState.scoresAndTiers[b.id]?.score || 50;
        if (scoreB !== scoreA) return scoreB - scoreA;
        
        return a.id.localeCompare(b.id);
      });
    
    const championId = ranked[0].id;
    
    contestState.phase = 'finished';
    contestState.championId = championId;
    setContestState(contestState);
    await saveContestState(); // Aguardar salvamento antes de redirecionar
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    toast(`🏆 Contest finalizado! Campeã definida!`);
    
    setTimeout(() => {
      // Redirecionar para aba Resultados do projeto atual
      const hash = location.hash;
      const projectMatch = hash.match(/#\/project\/([^/]+)/);
      const projectId = projectMatch ? projectMatch[1] : null;
      location.hash = projectId ? `#/project/${projectId}/results` : '#/results';
    }, 1500);
  }

  // Retornar API pública
  return {
    renderBattle,
    renderQualifyingBattle,
    renderFinalBattle, // Mantida apenas para migração de estados antigos
    renderDynamicRanking,
    chooseBattleWinner,
    handleQualifyingBattle,
    handleFinalBattle, // Mantida apenas para migração de estados antigos
    finishFinalPhase, // Mantida apenas para migração de estados antigos
    handleBattleKeys,
    getBattleKeysHandler: () => handleBattleKeys
  };
}
