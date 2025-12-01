# Mapeamento: Apresentação de Resultados em Tempo Real

## Visão Geral

O sistema apresenta resultados em **tempo real** durante o contest pairwise, atualizando automaticamente após cada batalha.

---

## 1. Ranking Dinâmico (Sidebar)

**Localização:** Painel lateral direito durante batalhas
**Função:** `renderDynamicRanking()` linha 2609
**Quando Atualiza:**
- ✅ **Tempo Real:** A cada `renderQualifyingBattle()` (após cada voto)
- ✅ **Automático:** Sem necessidade de recarregar ou fechar/abrir

**Dados Mostrados:**
- Posição no ranking (#1, #2, #3, etc)
- Thumbnail da foto (32x32px)
- Power Level (Elo arredondado)
- Recorde (W-L)

**Fonte de Dados:**
```javascript
calculatePhotoStats(qualifiedPhotos, eloScores, battleHistory)
→ ordena por Elo (maior → menor)
```

**Problema:** Recalcula stats do zero a cada renderização

---

## 2. Cards de Batalha (Principal)

**Localização:** Área central de batalha
**Função:** `renderQualifyingBattle()` linha 2417-2433
**Quando Atualiza:**
- ✅ **Tempo Real:** A cada renderização (após cada voto)
- ✅ **Automático:** Sempre mostra dados mais recentes

**Dados Mostrados (por foto):**
- Power Level atual (Elo arredondado)
- Rank atual (#X)
- Recorde (W-L)

**Fonte de Dados:**
```javascript
photoStats = calculatePhotoStats(...)
statsA = photoStats[photoA.id]
eloA = eloScores[photoA.id] || 1500
```

**Problema:** Recalcula stats do zero a cada renderização

---

## 3. Ranking Completo (Overlay - Legado)

**Nota:** Este overlay foi removido da aba Contest. O ranking completo agora está disponível apenas na aba Resultados após o contest finalizar.

**Localização:** (Removido - não mais disponível durante contest)
**Função:** `renderRankingOverlay()` (mantida apenas para compatibilidade)
**Quando Atualiza:**
- ❌ **Removido:** Não mais usado no sistema pairwise atual

**Alternativa:**
- Use o ranking dinâmico na sidebar durante o contest
- Acesse a aba "Resultados" após finalizar para ver ranking completo

---

## 4. Heatmap de Confrontos (Aba Resultados)

**Nota:** O heatmap foi movido para a aba Resultados e só é exibido após o contest finalizar.

**Localização:** Aba "Resultados" após contest finalizado
**Função:** `renderHeatmap()`
**Quando Atualiza:**
- ❌ **NÃO é tempo real:** Apenas ao abrir aba Resultados
- ✅ **Completo:** Mostra todas as batalhas realizadas

**Dados Mostrados:**
- Matriz N×N de fotos
- Verde = já batalharam (✓)
- Cinza = não batalharam
- Miniaturas clicáveis nas linhas/colunas (abre viewer)

**Fonte de Dados:**
```javascript
battleHistory → verifica quais pares já batalharam
qualifiedPhotos → todas as fotos participantes
```

**Como Abrir:**
- Acessar aba "Resultados" após contest finalizado

---

## 5. Modal de Detalhes da Foto

**Localização:** Modal (botão "Ver Detalhes" no ranking)
**Função:** `showPhotoDetails()` linha 2965
**Quando Atualiza:**
- ❌ **NÃO é tempo real:** Apenas ao abrir modal
- ❌ **Não atualiza:** Se modal estiver aberto durante votos

**Dados Mostrados:**
- Power Level atual
- Ranking atual
- Recorde (W-L)
- **Gráfico de evolução Elo** (canvas)
- **Timeline de batalhas** (vertical)

**Fonte de Dados:**
```javascript
eloHistory = qualifying.eloHistory[photoId]
photoBattles = battleHistory.filter(b => b.photoA === photoId || b.photoB === photoId)
```

**Como Abrir:**
- Botão "Ver Detalhes" em cada foto do ranking completo

**Problema:** Não atualiza em tempo real enquanto aberto

---

## 7. Histórico Cronológico de Confrontos (Aba Resultados)

**Localização:** Aba "Resultados" após contest finalizado
**Função:** `renderPairwiseBattleHistory()`
**Quando Atualiza:**
- ❌ **NÃO é tempo real:** Apenas ao abrir aba Resultados
- ✅ **Completo:** Mostra todas as batalhas em ordem cronológica

**Dados Mostrados:**
- Lista cronológica de todas as batalhas
- Fotos lado a lado com VS no meio
- Elo antes/depois de cada batalha
- Mudança de Elo (Δ)
- Badge de tier
- Indicador de vencedor

**Fonte de Dados:**
```javascript
battleHistory → histórico completo ordenado por timestamp
eloScores → Elo atual de cada foto
```

**Como Abrir:**
- Acessar aba "Resultados" após contest finalizado

---

## Resumo: O que é Tempo Real?

### ✅ Atualiza em Tempo Real:
1. **Ranking Dinâmico (sidebar)** - Atualiza após cada voto
2. **Cards de Batalha** - Atualiza após cada voto

### ❌ NÃO Atualiza em Tempo Real:
1. **Ranking Completo (overlay)** - Apenas ao abrir
2. **Heatmap de Confrontos** (aba Resultados) - Apenas ao abrir
3. **Histórico Cronológico** (aba Resultados) - Apenas ao abrir
4. **Modal Detalhes** - Apenas ao abrir

---

## Fluxo de Atualização

```
Usuário vota em uma foto
  ↓
chooseBattleWinner('A' ou 'B')
  ↓
handleQualifyingBattle(winner)
  ↓
1. Calcula novo Elo (updateEloScores)
2. Atualiza eloScores no contestState
3. Atualiza eloHistory
4. Salva em battleHistory
5. Gera próximo par único (generateNextPairwiseMatch)
6. renderBattle() → renderQualifyingBattle()
  ↓
renderQualifyingBattle() chama:
  - calculatePhotoStats() → recalcula tudo
  - renderDynamicRanking() → atualiza sidebar
  - Atualiza cards de batalha
```

**Problema:** `calculatePhotoStats()` é chamado toda vez, recalculando do zero.

