# Problemas de Robustez Identificados

## Problemas Críticos

### 1. Recálculo Excessivo de Stats

**Problema:**
- `calculatePhotoStats()` é chamado 4-5 vezes por renderização
- Recalcula wins/losses/rank do zero toda vez
- Performance: O(n²) no pior caso (n = número de fotos)

**Locais onde é chamado:**
1. `renderQualifyingBattle()` linha 2392
2. `renderBracket()` linha 2236
3. `renderRankingOverlay()` linha 2667
4. `showPhotoDetails()` linha 2977

**Impacto:**
- Com 20 fotos: ~400 operações por renderização
- Com 50 fotos: ~2500 operações por renderização
- Pode causar lag em dispositivos móveis

**Solução:**
- Cache `photoStats` no `contestState`
- Atualizar incrementalmente após cada batalha
- Invalidar cache apenas quando necessário

---

### 2. Ranking com Empates

**Problema:**
- Fotos com mesmo Elo têm rank igual?
- Não há critério de desempate definido
- Pode causar confusão visual (duas fotos #1?)

**Exemplo:**
```
Foto A: Elo 1520, 3W-1L → Rank #1
Foto B: Elo 1520, 2W-2L → Rank #1 (empate!)
Foto C: Elo 1500, 1W-3L → Rank #3
```

**Solução:**
- Critério de desempate:
  1. Elo (maior → menor)
  2. Mais vitórias (maior → menor)
  3. Menos derrotas (menor → maior)
  4. Ordem de última vitória (mais recente → mais antiga)

---

### 3. Sincronização de Estado

**Problema:**
- `eloScores` e `battleHistory` podem ficar dessincronizados?
- `eloHistory` pode ter gaps?
- Não há validação de consistência

**Cenários de Problema:**
1. Batalha salva em `battleHistory` mas Elo não atualizado
2. Elo atualizado mas `eloHistory` não atualizado
3. Estado carregado do localStorage com inconsistências

**Solução:**
- Validação após cada atualização
- Função de sincronização
- Detecção e correção de inconsistências

---

### 4. Performance com Muitas Fotos

**Problema:**
- `calculatePhotoStats()` é O(n²) no pior caso
- Múltiplas chamadas por renderização
- Pode causar lag

**Solução:**
- Cache de stats
- Memoização de rankings
- Lazy loading de overlays

---

## Problemas Menores

### 5. Overlays não Atualizam em Tempo Real

**Problema:**
- Overlays mostram snapshot do momento que foram abertos
- Não atualizam enquanto abertos
- Usuário precisa fechar e reabrir

**Solução:**
- Polling ou eventos
- Atualizar overlays abertos automaticamente

---

### 6. Gráfico Elo Pode Estar Vazio

**Problema:**
- Se foto não tem histórico suficiente (< 2 pontos)
- Gráfico não renderiza
- Sem mensagem ou placeholder

**Solução:**
- Mensagem: "Histórico insuficiente"
- Placeholder visual

---

### 7. Timeline Pode Estar Desordenada

**Problema:**
- Batalhas ordenadas por ordem de adição?
- Deveria ordenar por timestamp

**Solução:**
- Ordenar por `timestamp` antes de renderizar

---

## Validações Necessárias

### 8. Validação de Consistência

**Verificações:**
1. Soma de wins/losses = total de batalhas?
2. Elo inicial + mudanças = Elo atual?
3. Ranking não tem gaps?
4. `eloHistory` tem todos os pontos?

**Solução:**
- Função `validateContestState()`
- Chamar após cada atualização crítica
- Log de inconsistências

---

## Melhorias de UX

### 9. Feedback Visual de Mudanças

**Problema:**
- Mudanças de ranking não são destacadas
- Usuário não vê claramente quem subiu/desceu

**Solução:**
- Animar mudanças de ranking
- Destacar fotos que subiram (↑ verde)
- Destacar fotos que desceram (↓ vermelho)
- Mostrar setas de tendência

---

### 10. Critério de Desempate Visual

**Problema:**
- Empates não são tratados visualmente
- Pode confundir usuário

**Solução:**
- Mostrar critério de desempate
- Indicar quando há empate
- Mostrar ranking exato (#1.1, #1.2, etc)

