# 📋 Sprint 4 — Overview e Planejamento Completo

> **Validação necessária antes de implementar**

---

## 🎯 Objetivo da Sprint 4

Implementar **Contest Mode completo** com sistema de confrontos (Elo), resultados e suporte a múltiplos projetos.

---

## 📦 Features Planejadas (6 Total)

| # | Feature | Estimativa | Dependências | Commit |
|---|---------|------------|--------------|--------|
| **F4.1** | Contest UI Base | 2-3h | Nenhuma ⚡ | Individual |
| **F4.2** | Elo Logic | 3-4h | Nenhuma ⚡ | Individual |
| **F4.3** | Battle Interface | 2-3h | F4.1 + F4.2 | Individual |
| **F4.4** | Results & Champion | 2h | F4.3 | Individual |
| **F4.5** | Multi-Project Base | 2-3h | Nenhuma ⚡ | Individual |
| **F4.6** | Project Manager | 3-4h | F4.5 | Individual |
| | **TOTAL** | **14-19h** | | **6 commits** |

⚡ = Pode ser implementada em paralelo (independente)

---

## 📊 Ordem de Implementação Recomendada

### Caminho 1: Contest Mode Core (Features Principais)
```
F4.1 (UI Base) → F4.2 (Elo Logic) → F4.3 (Battle) → F4.4 (Results)
      ↓              ↓                  ↓              ↓
   Commit 1      Commit 2          Commit 3       Commit 4
```
**Resultado:** Contest Mode funcional básico ✅

### Caminho 2: Multi-Project (Features Avançadas)
```
F4.5 (Multi-Project Base) → F4.6 (Project Manager)
           ↓                          ↓
       Commit 5                   Commit 6
```
**Resultado:** Suporte a múltiplos contests ✅

### Total: **6 commits granulares**

---

## 📋 Documentação Criada

✅ Todos os planos estão em `/docs/sprint-4/`:

| Arquivo | Conteúdo | Linhas |
|---------|----------|--------|
| `F4.1_PLAN.md` | Planejamento UI Base | ~150 |
| `F4.1_TESTS.md` | 7 casos de teste | ~80 |
| `F4.2_PLAN.md` | Planejamento Elo Logic | ~180 |
| `F4.2_TESTS.md` | 8 casos de teste | ~90 |
| `F4.3_PLAN.md` | Planejamento Battle Interface | ~200 |
| `F4.3_TESTS.md` | 10 casos de teste | ~110 |
| `F4.4_PLAN.md` | Planejamento Results & Champion | ~170 |
| `F4.4_TESTS.md` | 6 casos de teste | ~80 |
| `F4.5_PLAN.md` | Planejamento Multi-Project Base | ~220 |
| `F4.5_TESTS.md` | 8 casos de teste | ~100 |
| `F4.6_PLAN.md` | Planejamento Project Manager | ~190 |
| `F4.6_TESTS.md` | 11 casos de teste | ~120 |

**Total:** 12 documentos, ~1.690 linhas, **60 casos de teste**

---

## 🔍 Resumo por Feature

### F4.1 — Contest UI Base
**O quê:** Estrutura visual da aba Contest  
**Por quê:** Base para todas as outras features  
**Principais entregas:**
- HTML da aba Contest
- Layout de confronto (placeholders)
- Estados vazios
- Contador de fotos qualificadas

**Arquivos:** `index.html`, `components.css`, `app.js`  
**Testes:** 7 casos

---

### F4.2 — Elo Logic
**O quê:** Sistema de ranking Elo puro (matemática)  
**Por quê:** Algoritmo de pontuação para confrontos  
**Principais entregas:**
- Módulo `elo.js` independente
- Funções de cálculo, pairings, update scores
- Testes unitários extensivos

**Arquivos:** `public/scripts/elo.js` (novo)  
**Testes:** 8 casos (edge cases)

---

### F4.3 — Battle Interface
**O quê:** Tela de confronto interativa  
**Por quê:** Core do Contest Mode  
**Principais entregas:**
- Interface A vs B (click, touch, teclado)
- Integração com elo.js
- Persistência de estado
- Progresso e navegação automática

**Arquivos:** `app.js`, `index.html`, `components.css`, `db.js`  
**Testes:** 10 casos

---

### F4.4 — Results & Champion
**O quê:** Tela de resultados finais  
**Por quê:** Fechamento do contest  
**Principais entregas:**
- Card do campeão (🏆)
- Ranking completo
- Histórico de confrontos
- Botão recomeçar

**Arquivos:** `app.js`, `index.html`, `components.css`  
**Testes:** 6 casos

---

### F4.5 — Multi-Project Base
**O quê:** Infraestrutura para múltiplos contests  
**Por quê:** Escalabilidade e organização  
**Principais entregas:**
- Object store `contests` no IndexedDB
- Migração automática (backward compatible)
- CRUD de contests
- Campo `projectId` em Photos

**Arquivos:** `idb.js`, `db.js`, `app.js`  
**Testes:** 8 casos (foco em migração)

---

### F4.6 — Project Manager
**O quê:** UI de gerenciamento de contests  
**Por quê:** Permitir criar/trocar/deletar projetos  
**Principais entregas:**
- Dropdown no header
- Modal de lista de projetos
- Criar/deletar contests
- Filtro automático por projeto ativo

**Arquivos:** `app.js`, `index.html`, `components.css`  
**Testes:** 11 casos

---

## 🎨 Principais Mudanças no Sistema

### Estrutura de Dados:

**Antes (Sprint 3):**
```
IndexedDB
  └─ photos → [{ id, thumb, rating, ... }]
```

**Depois (Sprint 4):**
```
IndexedDB
  ├─ photos → [{ id, thumb, rating, projectId, ... }]
  └─ contests → [{
       id,
       name,
       contestState: { phase, eloScores, battleHistory, champion },
       settings
     }]

localStorage
  ├─ photoranker-active-contest → 'default'
  └─ photoranker-sort → 'date-desc' (já existe)
```

### Fluxo do Contest:

```
1. Usuário avalia fotos (rating 1-5) → Sprint 3 ✅
   
2. Aba "Contest" → verifica fotos com ⭐5
   
3. Se ≥ 2 fotos: "Iniciar Contest" habilitado
   
4. Click → Gera confrontos (Elo logic)
   
5. Interface mostra: Foto A vs Foto B
   
6. Usuário escolhe → Atualiza Elo → Próximo confronto
   
7. Fim → Aba "Resultados" → Campeão 🏆
   
8. Recomeçar ou Voltar para Avaliação
```

---

## ⚠️ Pontos de Atenção

### 1. Migração de Dados (F4.5)
- **Crítico:** Não pode perder dados existentes
- **Solução:** Migração automática testada extensivamente
- **Rollback:** Se falhar, dados originais intactos

### 2. Complexidade do Elo (F4.2)
- **Atenção:** Algoritmo precisa estar correto
- **Solução:** Testes unitários extensivos (8 casos + edge cases)
- **Validação:** Você pode testar manualmente também

### 3. Persistência de Estado (F4.3)
- **Atenção:** Contest pode ser interrompido
- **Solução:** Salvar estado a cada confronto
- **Validação:** Testes de continuidade (CT3.1)

### 4. Performance com Múltiplos Projetos (F4.6)
- **Atenção:** 10+ projetos pode ficar lento
- **Solução:** Índices otimizados, queries eficientes
- **Validação:** Testes de performance

---

## ✅ Checklist de Validação (VOCÊ VALIDA AGORA)

Por favor, revise cada feature e responda:

### F4.1 - Contest UI Base
- [ ] O escopo faz sentido?
- [ ] Os RF/RNF estão claros?
- [ ] A estimativa (2-3h) parece razoável?
- [ ] Comentários/ajustes?

### F4.2 - Elo Logic
- [ ] O algoritmo Elo está adequado?
- [ ] As funções planejadas são suficientes?
- [ ] Prefere outro sistema de ranking? (knockout, pontos simples)
- [ ] Comentários/ajustes?

### F4.3 - Battle Interface
- [ ] A interação (click, atalhos) está boa?
- [ ] O fluxo de confrontos faz sentido?
- [ ] Prefere alguma mudança na UX?
- [ ] Comentários/ajustes?

### F4.4 - Results & Champion
- [ ] O layout de resultados está adequado?
- [ ] O que mais gostaria de ver na tela de resultados?
- [ ] Histórico de confrontos é importante?
- [ ] Comentários/ajustes?

### F4.5 - Multi-Project Base
- [ ] A migração automática está segura?
- [ ] A estrutura de dados faz sentido?
- [ ] Prefere localStorage ou IndexedDB para contestState?
- [ ] Comentários/ajustes?

### F4.6 - Project Manager
- [ ] O dropdown no header é a melhor opção?
- [ ] Prefere outra UI para gerenciar projetos?
- [ ] As ações (criar/deletar/duplicar) são suficientes?
- [ ] Comentários/ajustes?

---

## 🚀 Próximo Passo

**Se você aprovar todos os planos**, vou começar a implementação sequencial:

1. ✅ **F4.1** → implementar → commit → você testa
2. ✅ **F4.2** → implementar → commit → você testa
3. ✅ **F4.3** → implementar → commit → você testa
4. ✅ **F4.4** → implementar → commit → você testa
5. ✅ **F4.5** → implementar → commit → você testa
6. ✅ **F4.6** → implementar → commit → você testa

**Resultado:** 6 commits granulares, Sprint 4 completa! 🎯

---

**Me diga:**
- ✅ Aprovar tudo e começar implementação?
- 🔄 Ajustar alguma feature específica?
- 💬 Dúvidas/sugestões?

