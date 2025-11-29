# Documentação: Botões de Estatísticas e Visualizações

## Visão Geral

O sistema oferece múltiplas formas de visualizar estatísticas e rankings durante o contest. Cada visualização tem um propósito específico e mostra dados diferentes.

---

## Fase Classificatória

### 1. Botão "📊 Ranking"

**Localização:** Barra de ações (botões inferiores)
**ID:** `toggleRankingView`
**Função:** Abre overlay modal com ranking completo

**O que Mostra:**
- Lista completa de todas as fotos ordenadas por Power Level
- Posição no ranking (#1, #2, #3, etc)
- Thumbnail maior (80x80px)
- Power Level completo (Elo arredondado)
- Recorde completo (W-L)
- Botão "Ver Detalhes" para cada foto
- Top 3 destacados: Ouro (#1), Prata (#2), Bronze (#3)

**Quando Atualiza:**
- ❌ **NÃO é tempo real:** Apenas ao abrir overlay
- ❌ **Não atualiza:** Se overlay estiver aberto durante votos
- ✅ **Solução:** Fechar e reabrir para ver dados atualizados

**Fonte de Dados:**
```javascript
calculatePhotoStats(qualifiedPhotos, eloScores, battleHistory)
→ ordena por Elo (maior → menor)
```

**Como Usar:**
1. Clique no botão "📊 Ranking"
2. Overlay abre mostrando ranking completo
3. Clique em "Ver Detalhes" para ver gráfico e timeline de uma foto
4. Clique no "×" para fechar

**Código:** `renderRankingOverlay()` linha 2663

---

### 2. Botão "🔥 Heatmap"

**Localização:** Barra de ações (botões inferiores)
**ID:** `toggleHeatmap`
**Função:** Abre overlay modal com matriz de confrontos

**O que Mostra:**
- Matriz N×N (N = número de fotos)
- Miniaturas nas linhas e colunas (40x40px)
- Verde = já batalharam (✓)
- Cinza = não batalharam
- Diagonal = mesma foto (vazia)
- Tooltip ao passar mouse: "FotoA vs FotoB: Batalharam/Não batalharam"

**Quando Atualiza:**
- ❌ **NÃO é tempo real:** Apenas ao abrir overlay
- ❌ **Não atualiza:** Se overlay estiver aberto durante votos

**Fonte de Dados:**
```javascript
battleHistory → verifica quais pares já batalharam
```

**Como Usar:**
1. Clique no botão "🔥 Heatmap"
2. Visualize matriz de confrontos
3. Identifique rapidamente quais fotos já batalharam
4. Clique no "×" para fechar

**Código:** `renderHeatmap()` linha 2745

---

### 3. Botão "🏆 Prévia Bracket"

**Localização:** Barra de ações (botões inferiores)
**ID:** `toggleBracket`
**Função:** Mostra como será o bracket final baseado no ranking atual

**O que Mostra:**
- Top N (potência de 2) do ranking atual
- Seeds numerados (#1, #2, etc)
- Estrutura de rodadas do bracket
- Miniaturas dos confrontos (40x40px)
- Labels de rodadas

**Quando Atualiza:**
- ❌ **NÃO é tempo real:** Apenas ao abrir overlay
- ✅ **Dinâmico:** Baseado no ranking atual (não fixo)
- ⚠️ **Muda:** Conforme ranking muda, prévia também muda

**Fonte de Dados:**
```javascript
ranked = [...qualifiedPhotos].sort((a, b) => eloScores[b.id] - eloScores[a.id])
seeds = ranked.slice(0, bracketSize) // potência de 2
generateBracketFromSeeds(seeds)
```

**Como Usar:**
1. Clique no botão "🏆 Prévia Bracket"
2. Veja como será o bracket final
3. Observe seeds e estrutura de rodadas
4. Clique no "×" para fechar

**Código:** `renderBracketPreview()` linha 2702

---

### 4. Botão "Ver Detalhes" (em cada foto do ranking)

**Localização:** Dentro do overlay "Ranking Completo"
**ID:** `btn-view-details` (dinâmico por foto)
**Função:** Abre modal com detalhes completos de uma foto

**O que Mostra:**
- **Cabeçalho:**
  - Thumbnail grande (200x200px)
  - Power Level atual
  - Ranking atual
  - Recorde (W-L)

- **Gráfico de Evolução Elo:**
  - Canvas mostrando evolução do Power Level
  - Eixos X (tempo) e Y (Elo)
  - Pontos marcando cada batalha
  - Linha conectando pontos

- **Timeline de Batalhas:**
  - Lista vertical de todas as batalhas
  - Miniaturas dos oponentes (32x32px)
  - Elo antes → depois
  - Mudança de Elo (+X ou -X)
  - Vitória/Derrota destacada

**Quando Atualiza:**
- ❌ **NÃO é tempo real:** Apenas ao abrir modal
- ❌ **Não atualiza:** Se modal estiver aberto durante votos

**Fonte de Dados:**
```javascript
eloHistory = qualifying.eloHistory[photoId]
photoBattles = battleHistory.filter(b => b.photoA === photoId || b.photoB === photoId)
```

**Como Usar:**
1. Abra "Ranking Completo"
2. Clique em "Ver Detalhes" em qualquer foto
3. Modal abre com gráfico e timeline
4. Clique no "×" para fechar

**Código:** `showPhotoDetails()` linha 2965

---

## Fase Bracket

### 5. Botão "🏆 Bracket"

**Localização:** Barra de ações (botões inferiores)
**ID:** `toggleBracket`
**Função:** Abre overlay modal com árvore completa do bracket

**O que Mostra:**
- Árvore visual completa com rounds em colunas
- Linhas conectando vencedores entre rodadas
- Power Level de cada foto
- Votos e porcentagem (se disponível)
- Mudança de Elo após batalha (+X ou -X)
- Vencedores marcados (✓)
- Rodada atual destacada
- Confronto atual destacado

**Quando Atualiza:**
- ❌ **NÃO é tempo real:** Apenas ao abrir overlay
- ❌ **Não atualiza:** Se overlay estiver aberto durante votos

**Fonte de Dados:**
```javascript
bracket.rounds → estrutura do bracket
battleHistory → resultados das batalhas
eloScores → Power Level atual
```

**Como Usar:**
1. Clique no botão "🏆 Bracket"
2. Visualize árvore completa
3. Veja progressão de cada foto
4. Clique no "×" para fechar

**Código:** `renderBracketTree()` linha 2853

---

## Visualizações Sempre Visíveis (Tempo Real)

### 6. Ranking Dinâmico (Sidebar)

**Localização:** Painel lateral direito durante batalhas
**Função:** Mostra ranking atualizado em tempo real

**O que Mostra:**
- Lista compacta de todas as fotos
- Posição (#1, #2, etc)
- Thumbnail pequeno (32x32px)
- Power Level (Elo arredondado)
- Recorde (W-L)
- Top 3 destacados com borda colorida

**Quando Atualiza:**
- ✅ **Tempo Real:** A cada voto
- ✅ **Automático:** Sem necessidade de ação

**Fonte de Dados:**
```javascript
calculatePhotoStats(qualifiedPhotos, eloScores, battleHistory)
→ ordena por Elo
```

**Código:** `renderDynamicRanking()` linha 2609

---

### 7. Cards de Batalha (Principal)

**Localização:** Área central de batalha
**Função:** Mostra informações das fotos em batalha

**O que Mostra (por foto):**
- Foto grande (clique para votar)
- Power Level atual
- Rank atual (#X)
- Recorde (W-L)

**Quando Atualiza:**
- ✅ **Tempo Real:** A cada renderização (após cada voto)
- ✅ **Automático:** Sempre mostra dados mais recentes

**Fonte de Dados:**
```javascript
photoStats = calculatePhotoStats(...)
statsA = photoStats[photoA.id]
eloA = eloScores[photoA.id] || 1500
```

**Código:** `renderQualifyingBattle()` linha 2417-2433

---

## Resumo de Atualização

| Visualização | Tempo Real? | Quando Atualiza |
|--------------|-------------|-----------------|
| Ranking Dinâmico (sidebar) | ✅ Sim | A cada voto |
| Cards de Batalha | ✅ Sim | A cada voto |
| Ranking Completo (overlay) | ❌ Não | Apenas ao abrir |
| Heatmap (overlay) | ❌ Não | Apenas ao abrir |
| Prévia Bracket (overlay) | ❌ Não | Apenas ao abrir |
| Modal Detalhes | ❌ Não | Apenas ao abrir |
| Árvore Bracket (overlay) | ❌ Não | Apenas ao abrir |

---

## Melhorias Sugeridas

1. **Atualização em Tempo Real para Overlays**
   - Implementar polling ou eventos
   - Atualizar overlays abertos automaticamente

2. **Feedback Visual**
   - Animar mudanças de ranking
   - Destacar fotos que subiram/desceram
   - Mostrar setas de tendência (↑↓)

3. **Critério de Desempate**
   - Em caso de empate em Elo:
     - 1º: Mais vitórias
     - 2º: Menos derrotas
     - 3º: Ordem de última vitória

