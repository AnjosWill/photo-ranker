# Mapeamento: Apresentação de Resultados em Tempo Real

## Visão Geral

O sistema apresenta resultados em **tempo real** durante a fase classificatória, atualizando automaticamente após cada voto. Na fase bracket, atualiza após cada batalha.

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

## 3. Ranking Completo (Overlay)

**Localização:** Modal overlay (botão "📊 Ranking")
**Função:** `renderRankingOverlay()` linha 2663
**Quando Atualiza:**
- ❌ **NÃO é tempo real:** Apenas ao abrir overlay
- ❌ **Não atualiza:** Se overlay estiver aberto durante votos

**Dados Mostrados:**
- Lista completa ordenada por Power Level
- Posição (#1, #2, etc)
- Thumbnail maior (80x80px)
- Power Level completo
- Recorde completo (W-L)
- Botão "Ver Detalhes" para cada foto

**Fonte de Dados:**
```javascript
calculatePhotoStats(qualifiedPhotos, eloScores, battleHistory)
→ ordena por Elo
```

**Como Abrir:**
- Botão "📊 Ranking" na barra de ações
- Atalho: (não há)

**Problema:** Não atualiza em tempo real enquanto aberto

---

## 4. Heatmap de Confrontos (Overlay)

**Localização:** Modal overlay (botão "🔥 Heatmap")
**Função:** `renderHeatmap()` linha 2742
**Quando Atualiza:**
- ❌ **NÃO é tempo real:** Apenas ao abrir overlay
- ❌ **Não atualiza:** Se overlay estiver aberto durante votos

**Dados Mostrados:**
- Matriz N×N de fotos
- Verde = já batalharam
- Cinza = não batalharam
- Miniaturas nas linhas/colunas

**Fonte de Dados:**
```javascript
battleHistory → verifica quais pares já batalharam
```

**Como Abrir:**
- Botão "🔥 Heatmap" na barra de ações

**Problema:** Não atualiza em tempo real enquanto aberto

---

## 5. Prévia do Bracket (Overlay)

**Localização:** Modal overlay (botão "🏆 Prévia Bracket")
**Função:** `renderBracketPreview()` linha 2702
**Quando Atualiza:**
- ❌ **NÃO é tempo real:** Apenas ao abrir overlay
- ✅ **Dinâmico:** Baseado no ranking atual (não fixo)

**Dados Mostrados:**
- Top N (potência de 2) do ranking atual
- Seeds numerados (#1, #2, etc)
- Estrutura de rodadas do bracket
- Miniaturas dos confrontos

**Fonte de Dados:**
```javascript
ranked = [...qualifiedPhotos].sort((a, b) => eloScores[b.id] - eloScores[a.id])
seeds = ranked.slice(0, bracketSize)
generateBracketFromSeeds(seeds)
```

**Como Abrir:**
- Botão "🏆 Prévia Bracket" na barra de ações

**Problema:** Não atualiza em tempo real enquanto aberto

---

## 6. Modal de Detalhes da Foto

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

## 7. Árvore do Bracket (Fase Bracket)

**Localização:** Modal overlay (botão "🏆 Bracket")
**Função:** `renderBracketTree()` linha 2800
**Quando Atualiza:**
- ❌ **NÃO é tempo real:** Apenas ao abrir overlay
- ❌ **Não atualiza:** Se overlay estiver aberto durante votos

**Dados Mostrados:**
- Árvore visual completa com rounds
- Vencedores marcados (✓)
- Power Level de cada foto
- Votos e porcentagem (se disponível)
- Mudança de Elo após batalha

**Fonte de Dados:**
```javascript
bracket.rounds → estrutura do bracket
battleHistory → resultados das batalhas
eloScores → Power Level atual
```

**Como Abrir:**
- Botão "🏆 Bracket" na fase bracket

**Problema:** Não atualiza em tempo real enquanto aberto

---

## Resumo: O que é Tempo Real?

### ✅ Atualiza em Tempo Real:
1. **Ranking Dinâmico (sidebar)** - Atualiza após cada voto
2. **Cards de Batalha** - Atualiza após cada voto

### ❌ NÃO Atualiza em Tempo Real:
1. **Ranking Completo (overlay)** - Apenas ao abrir
2. **Heatmap** - Apenas ao abrir
3. **Prévia Bracket** - Apenas ao abrir
4. **Modal Detalhes** - Apenas ao abrir
5. **Árvore Bracket** - Apenas ao abrir

---

## Fluxo de Atualização

```
Usuário vota em uma foto
  ↓
chooseBattleWinner('A' ou 'B')
  ↓
handleQualifyingBattle(winner)
  ↓
1. Calcula novo Elo (calculateElo)
2. Atualiza eloScores (updateEloScores)
3. Atualiza eloHistory
4. Salva em battleHistory
5. Avança para próxima batalha
6. renderBattle() → renderQualifyingBattle()
  ↓
renderQualifyingBattle() chama:
  - calculatePhotoStats() → recalcula tudo
  - renderDynamicRanking() → atualiza sidebar
  - Atualiza cards de batalha
```

**Problema:** `calculatePhotoStats()` é chamado toda vez, recalculando do zero.

