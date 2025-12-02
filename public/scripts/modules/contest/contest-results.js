/**
 * contest-results.js
 * Renderização de resultados e rankings do Contest Mode
 * Responsabilidade: Exibir resultados finais, ranking, heatmap, histórico
 */

import { $ } from "../../ui.js";
import { TIERS, calculateEloRange, calculateScoresAndTiers } from "../../tiers.js";
import { calculatePhotoStats as calculatePhotoStatsState, calculateRankingFromStats } from "./contest-state.js";

/**
 * Cria e inicializa o módulo de resultados
 * @param {Object} context - Contexto com todas as dependências necessárias
 * @returns {Object} API pública do módulo
 */
export function createResultsModule(context) {
  const {
    getContestState,
    setContestState,
    saveContestState,
    openConfirm,
    toast,
    openResultsViewer,
    renderHeatmap
  } = context;

  /**
   * Renderiza aba "Resultados"
   */
  async function renderResultsView() {
    const container = $('#resultsView');
    if (!container) return;
    
    const contestState = getContestState();
    if (!contestState || contestState.phase !== 'finished') {
      // Extrair projectId da URL atual
      const hash = location.hash;
      const projectMatch = hash.match(/#\/project\/([^/]+)/);
      const projectId = projectMatch ? projectMatch[1] : null;
      const contestHash = projectId ? `#/project/${projectId}/contest` : '#/contest';
      
      container.innerHTML = `
        <div class="results-empty">
          <div class="results-empty-icon">📊</div>
          <h3>Nenhum contest finalizado ainda</h3>
          <p class="muted">Complete um contest para ver os resultados e o campeão!</p>
          <button class="btn" onclick="location.hash='${contestHash}'">Ir para Contest</button>
        </div>
      `;
      return;
    }
    
    const photosToRank = contestState.qualifiedPhotos;
    const allBattleHistory = contestState.battleHistory;
    
    const photoStats = calculatePhotoStatsState(
      photosToRank, 
      contestState.eloScores, 
      allBattleHistory,
      contestState,
      contestState.photoStats
    );
    
    // Ranking baseado APENAS em Elo final (não W-L)
    const statsWithRank = calculateRankingFromStats(photoStats, false);
    contestState.photoStats = statsWithRank;
    
    contestState.eloRange = calculateEloRange(contestState.eloScores);
    contestState.scoresAndTiers = calculateScoresAndTiers(
      contestState.eloScores,
      statsWithRank,
      contestState.eloRange.min,
      contestState.eloRange.max,
      false
    );
    
    // Ordenar por Elo descendente (maior = melhor)
    const ranking = [...photosToRank]
      .map(p => ({
        ...p,
        stats: statsWithRank[p.id],
        scoreData: contestState.scoresAndTiers[p.id] || { score: 50, tier: TIERS[4] },
        elo: contestState.eloScores[p.id] || 1500
      }))
      .sort((a, b) => {
        // Prioridade 1: Elo (maior = melhor)
        if (b.elo !== a.elo) return b.elo - a.elo;
        // Desempate por ID
        return a.id.localeCompare(b.id);
      });
    
    // Atualizar ranks baseado na ordenação por Elo
    ranking.forEach((photo, index) => {
      if (photo.stats) {
        photo.stats.rank = index + 1;
      }
      // Garantir que o rank também está no photoStats do contestState
      if (contestState.photoStats[photo.id]) {
        contestState.photoStats[photo.id].rank = index + 1;
      }
    });
    
    // Salvar estado atualizado com ranks
    setContestState(contestState);
    saveContestState();
    
    let championId = contestState.championId || ranking[0]?.id;
    const champion = ranking.find(p => p.id === championId) || ranking[0];
    
    if (!champion) {
      // Extrair projectId da URL atual
      const hash = location.hash;
      const projectMatch = hash.match(/#\/project\/([^/]+)/);
      const projectId = projectMatch ? projectMatch[1] : null;
      const contestHash = projectId ? `#/project/${projectId}/contest` : '#/contest';
      
      container.innerHTML = `
        <div class="results-empty">
          <div class="results-empty-icon">❌</div>
          <h3>Erro ao carregar resultados</h3>
          <button class="btn" onclick="location.hash='${contestHash}'">Voltar</button>
        </div>
      `;
      return;
    }
    
    const championScore = champion.scoreData;
    
    container.innerHTML = `
      <div class="champion-card">
        <div class="champion-header">
          <div class="champion-header-left">
            <div class="champion-icon">🏆</div>
            <h2>Campeã</h2>
          </div>
          <div class="champion-tier-badge">
            <div class="tier-badge tier-badge-large">
              <div class="tier-icon">${championScore.tier.icon}</div>
              <div class="tier-score">${championScore.score}/100</div>
              <div class="tier-label">${championScore.tier.label}</div>
            </div>
          </div>
        </div>
        <div class="champion-image-wrapper">
          <div class="champion-image">
            <img src="${champion.thumb}" alt="Foto campeã" class="champion-image-img" data-photo-id="${champion.id}" style="cursor: pointer;">
          </div>
        </div>
        <div class="champion-stats">
          <div class="stat">
            <strong class="ranking-wins">${champion.stats.wins}</strong>
            <span>Vitórias</span>
          </div>
          <div class="stat">
            <strong class="ranking-losses">${champion.stats.losses}</strong>
            <span>Derrotas</span>
          </div>
        </div>
      </div>
      
      <div class="results-stats-overview">
        <div id="resultsStats" class="dashboard-stats"></div>
      </div>
      
      <div class="results-main-layout">
        <div class="results-ranking-column">
          <div class="ranking-section">
            <h3>Ranking Completo</h3>
            <div id="rankingList" class="ranking-list"></div>
          </div>
        </div>
        
        <div class="results-dashboard-column">
          <div class="results-dashboard">
            <h3>Heatmap de Confrontos</h3>
            <div id="resultsHeatmap"></div>
          </div>
        </div>
      </div>
      
      <div class="results-heatmap-section">
        <h3>Histórico Cronológico de Confrontos</h3>
        <div id="resultsBracketHistory" class="dashboard-bracket-history"></div>
      </div>
      
      <div class="results-actions">
        <button class="btn btn-secondary" id="restartContest">🔄 Recomeçar Contest</button>
        <button class="btn" onclick="location.hash='#/rate'">Voltar para Avaliação</button>
      </div>
    `;
    
    setTimeout(() => {
      const championImg = document.querySelector('.champion-image-img');
      if (championImg) {
        championImg.addEventListener('click', () => {
          openResultsViewer(champion.id, ranking);
        });
      }
    }, 0);
    
    const rankingList = $('#rankingList');
    ranking.forEach((photo, index) => {
      const isChampion = photo.id === championId;
      const item = document.createElement('div');
      item.className = `ranking-item ${isChampion ? 'champion' : ''}`;
      
      const scoreData = photo.scoreData;
      const displayRank = photo.stats?.rank || (index + 1);
      
      item.innerHTML = `
        ${isChampion ? '<div class="ranking-winner-badge">🏆</div>' : ''}
        <div class="ranking-position">#${displayRank}</div>
        <div class="ranking-thumb">
          <img src="${photo.thumb}" alt="Foto ${index + 1}" class="ranking-thumb-img" data-photo-id="${photo.id}" style="cursor: pointer;">
        </div>
        <div class="ranking-info">
          <div class="tier-badge tier-badge-small">
            <div class="tier-icon">${scoreData.tier.icon}</div>
            <div class="tier-score">${scoreData.score}/100</div>
            <div class="tier-label">${scoreData.tier.label}</div>
          </div>
          <div class="ranking-record">
            <span class="ranking-wins">${photo.stats.wins}V</span> - 
            <span class="ranking-losses">${photo.stats.losses}D</span>
            ${photo.stats.wins + photo.stats.losses > 0 
              ? ` (${Math.round(photo.stats.wins / (photo.stats.wins + photo.stats.losses) * 100)}%)` 
              : ''}
          </div>
        </div>
      `;
      
      const thumbImg = item.querySelector('.ranking-thumb-img');
      if (thumbImg) {
        thumbImg.addEventListener('click', () => {
          openResultsViewer(photo.id, ranking);
        });
      }
      
      rankingList.appendChild(item);
    });
    
    const bracketHistoryContainer = $('#resultsBracketHistory');
    if (bracketHistoryContainer) {
      try {
        const bracketHtml = renderBracketHistory();
        bracketHistoryContainer.innerHTML = bracketHtml || '<p class="muted">Nenhum histórico de brackets disponível.</p>';
        
        // Adicionar event delegation para abrir fotos no viewer ao clicar nas miniaturas do histórico
        // Usar once: true para evitar múltiplos listeners (será re-adicionado a cada render)
        const existingHandler = bracketHistoryContainer._historyClickHandler;
        if (existingHandler) {
          bracketHistoryContainer.removeEventListener('click', existingHandler);
        }
        const historyClickHandler = (e) => {
          const thumb = e.target.closest('.pairwise-battle-thumb-compact[data-photo-id]');
          if (thumb) {
            e.stopPropagation();
            e.preventDefault();
            const photoId = thumb.getAttribute('data-photo-id');
            if (photoId && ranking.length > 0) {
              openResultsViewer(photoId, ranking);
            }
          }
        };
        bracketHistoryContainer._historyClickHandler = historyClickHandler;
        bracketHistoryContainer.addEventListener('click', historyClickHandler);
      } catch (err) {
        bracketHistoryContainer.innerHTML = '<p class="muted">Erro ao carregar histórico de brackets.</p>';
      }
    }
    
    const heatmapContainer = $('#resultsHeatmap');
    if (heatmapContainer) {
      try {
        const heatmapHtml = renderHeatmap();
        heatmapContainer.innerHTML = heatmapHtml || '<p class="muted">Nenhum heatmap disponível.</p>';
        
        // Adicionar event delegation para abrir fotos no viewer ao clicar nas miniaturas do heatmap
        // Usar once: true para evitar múltiplos listeners (será re-adicionado a cada render)
        const existingHeatmapHandler = heatmapContainer._heatmapClickHandler;
        if (existingHeatmapHandler) {
          heatmapContainer.removeEventListener('click', existingHeatmapHandler);
        }
        const heatmapClickHandler = (e) => {
          const thumb = e.target.closest('.heatmap-thumb-small[data-photo-id]');
          if (thumb) {
            e.stopPropagation();
            e.preventDefault();
            const photoId = thumb.getAttribute('data-photo-id');
            if (photoId && ranking.length > 0) {
              openResultsViewer(photoId, ranking);
            }
          }
        };
        heatmapContainer._heatmapClickHandler = heatmapClickHandler;
        heatmapContainer.addEventListener('click', heatmapClickHandler);
      } catch (err) {
        heatmapContainer.innerHTML = '<p class="muted">Erro ao carregar heatmap.</p>';
      }
    }
    
    const statsContainer = $('#resultsStats');
    if (statsContainer) {
      try {
        const totalBattles = contestState.battleHistory?.length || 0;
        const totalPhotos = ranking.length;
        const totalPossibleBattles = contestState.qualifying?.totalBattles || (totalPhotos * (totalPhotos - 1) / 2);
        const completionPercentage = totalPossibleBattles > 0 ? Math.round((totalBattles / totalPossibleBattles) * 100) : 0;
        const avgScore = totalPhotos > 0 ? ranking.reduce((sum, p) => sum + p.scoreData.score, 0) / totalPhotos : 0;
        
        // Calcular média de batalhas por foto
        const battlesPerPhoto = {};
        contestState.qualifiedPhotos.forEach(p => {
          battlesPerPhoto[p.id] = contestState.battleHistory.filter(b => 
            (b.photoA === p.id || b.photoB === p.id) && b.phase === 'qualifying'
          ).length;
        });
        const avgBattlesPerPhoto = totalPhotos > 0 ? Math.round(Object.values(battlesPerPhoto).reduce((a, b) => a + b, 0) / totalPhotos) : 0;
        
        statsContainer.innerHTML = `
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">${totalPhotos}</div>
              <div class="stat-label">Fotos Participantes</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${totalBattles} / ${totalPossibleBattles}</div>
              <div class="stat-label">Confrontos Únicos (${completionPercentage}%)</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${Math.round(avgScore)}</div>
              <div class="stat-label">Score Médio</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${avgBattlesPerPhoto}</div>
              <div class="stat-label">Média de Batalhas por Foto</div>
            </div>
          </div>
        `;
      } catch (err) {
        statsContainer.innerHTML = '<p class="muted">Erro ao carregar estatísticas.</p>';
      }
    }
    
    $('#restartContest')?.addEventListener('click', confirmRestartContest);
  }

  /**
   * Renderiza histórico completo de batalhas (sistema pairwise)
   * Visualização híbrida: estatísticas globais + lista cronológica
   */
  function renderBracketHistory() {
    return renderPairwiseBattleHistory();
  }

  /**
   * Renderiza histórico de batalhas pairwise - lista cronológica compacta
   */
  function renderPairwiseBattleHistory() {
    const contestState = getContestState();
    if (!contestState || !contestState.battleHistory || contestState.battleHistory.length === 0) {
      return '<p class="muted">Nenhum histórico de batalhas disponível.</p>';
    }
    
    const { battleHistory, qualifiedPhotos, eloScores, scoresAndTiers } = contestState;
    
    // Ordenar batalhas cronologicamente (mais recente primeiro)
    const sortedBattles = [...battleHistory]
      .filter(b => b.phase === 'qualifying')
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    let html = '<div class="pairwise-history-container">';
    html += '<div class="pairwise-history-list">';
    html += '<div class="pairwise-battles-grid">';
    
    sortedBattles.forEach((battle, index) => {
      const photoA = qualifiedPhotos.find(p => p.id === battle.photoA);
      const photoB = qualifiedPhotos.find(p => p.id === battle.photoB);
      
      if (!photoA || !photoB) return;
      
      const photoAWon = battle.winner === photoA.id;
      const photoBWon = battle.winner === photoB.id;
      
      const scoreA = scoresAndTiers[photoA.id] || { score: 50, tier: TIERS[4] };
      const scoreB = scoresAndTiers[photoB.id] || { score: 50, tier: TIERS[4] };
      
      const eloA = eloScores[photoA.id] || 1500;
      const eloB = eloScores[photoB.id] || 1500;
      
      // Calcular mudança de Elo corretamente
      const eloChangeA = photoAWon ? (battle.eloChange?.winner || 0) : (battle.eloChange?.loser || 0);
      const eloChangeB = photoBWon ? (battle.eloChange?.winner || 0) : (battle.eloChange?.loser || 0);
      
      const battleDate = new Date(battle.timestamp || Date.now());
      const dateStr = battleDate.toLocaleString('pt-BR', { 
        day: '2-digit', 
        month: '2-digit', 
        hour: '2-digit',
        minute: '2-digit'
      });
      
      html += `<div class="pairwise-battle-card ${photoAWon ? 'winner-A' : 'winner-B'}">`;
      
      // Header com número e data
      html += `<div class="pairwise-battle-card-header">`;
      html += `<span class="pairwise-battle-number">#${sortedBattles.length - index}</span>`;
      html += `<span class="pairwise-battle-date">${dateStr}</span>`;
      html += `</div>`;
      
      // Conteúdo: fotos lado a lado com VS no meio
      html += `<div class="pairwise-battle-card-content">`;
      
      // Foto A
      html += `<div class="pairwise-battle-photo-compact ${photoAWon ? 'winner' : ''}">`;
      html += `<div class="pairwise-battle-photo-wrapper">`;
      html += `<img src="${photoA.thumb}" alt="Foto A" class="pairwise-battle-thumb-compact" data-photo-id="${photoA.id}" style="cursor: pointer;">`;
      if (photoAWon) {
        html += `<div class="pairwise-battle-winner-badge">✓</div>`;
      }
      html += `</div>`;
      html += `<div class="pairwise-battle-photo-details">`;
      html += `<div class="pairwise-battle-tier-compact">
        <span class="tier-icon-small">${scoreA.tier.icon}</span>
        <span class="tier-score-small">${scoreA.score}</span>
      </div>`;
      html += `<div class="pairwise-battle-elo-compact">${Math.round(eloA)}</div>`;
      if (eloChangeA !== 0) {
        html += `<div class="pairwise-battle-change-compact ${eloChangeA > 0 ? 'positive' : 'negative'}">${eloChangeA > 0 ? '+' : ''}${Math.round(eloChangeA)}</div>`;
      }
      html += `</div></div>`;
      
      // VS
      html += `<div class="pairwise-battle-vs-compact">VS</div>`;
      
      // Foto B
      html += `<div class="pairwise-battle-photo-compact ${photoBWon ? 'winner' : ''}">`;
      html += `<div class="pairwise-battle-photo-wrapper">`;
      html += `<img src="${photoB.thumb}" alt="Foto B" class="pairwise-battle-thumb-compact" data-photo-id="${photoB.id}" style="cursor: pointer;">`;
      if (photoBWon) {
        html += `<div class="pairwise-battle-winner-badge">✓</div>`;
      }
      html += `</div>`;
      html += `<div class="pairwise-battle-photo-details">`;
      html += `<div class="pairwise-battle-tier-compact">
        <span class="tier-icon-small">${scoreB.tier.icon}</span>
        <span class="tier-score-small">${scoreB.score}</span>
      </div>`;
      html += `<div class="pairwise-battle-elo-compact">${Math.round(eloB)}</div>`;
      if (eloChangeB !== 0) {
        html += `<div class="pairwise-battle-change-compact ${eloChangeB > 0 ? 'positive' : 'negative'}">${eloChangeB > 0 ? '+' : ''}${Math.round(eloChangeB)}</div>`;
      }
      html += `</div></div>`;
      
      html += `</div></div>`;
    });
    
    html += '</div>';
    html += '</div>';
    html += '</div>';
    
    return html;
  }


  /**
   * Confirma recomeço do contest
   */
  function confirmRestartContest() {
    openConfirm({
      title: 'Recomeçar Contest?',
      message: 'Todo o histórico, resultados e colocações das fotos serão perdidos permanentemente. Deseja realmente recomeçar?',
      confirmText: 'Sim, Recomeçar',
      onConfirm: () => {
        setContestState(null);
        saveContestState();
        // Extrair projectId da URL atual
        const hash = location.hash;
        const projectMatch = hash.match(/#\/project\/([^/]+)/);
        const projectId = projectMatch ? projectMatch[1] : null;
        location.hash = projectId ? `#/project/${projectId}/contest` : '#/contest';
        toast('Contest resetado. Inicie um novo!');
      }
    });
  }

  // Retornar API pública
  return {
    renderResultsView,
    renderBracketHistory,
    renderPairwiseBattleHistory,
    confirmRestartContest
  };
}
