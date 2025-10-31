# 🎯 Estratégia de Desenvolvimento - Sprints 4 e 5

> **Objetivo:** Implementar Contest Mode e Recursos Avançados de forma modular, testável e incremental.

---

## 📐 Abordagem: Feature-Driven Development

### Princípios:
1. **Uma Feature = Uma Branch = Um Commit**
2. **Validação Individual** antes de integrar
3. **Feature Flags** para features em desenvolvimento
4. **Documentação Incremental** (atualizar docs a cada feature)
5. **Testes Isolados** por feature

---

## 🏗️ Sprint 4 — Contest Mode (Decomposição)

### Contexto:
Sprint 4 é **GRANDE** e complexa. Vamos dividir em **6 features independentes**:

| # | Feature | Descrição | Estimativa |
|---|---------|-----------|------------|
| **F4.1** | Contest UI Base | Aba "Contest", layout, navegação | 2-3h |
| **F4.2** | Contest Logic (Elo) | Sistema de pontuação Elo | 3-4h |
| **F4.3** | Battle Interface | Tela de confronto A vs B | 2-3h |
| **F4.4** | Results & Champion | Tela de resultados, campeão | 2h |
| **F4.5** | Multi-Project Base | Object store 'contests' no IndexedDB | 2-3h |
| **F4.6** | Project Manager | Tela de gerenciamento de projetos | 3-4h |

**Total:** 14-19 horas (dividido em 6 commits)

---

## 🔧 Estrutura de Branches (Sprints 4 e 5)

### Modelo de Branches:

```
main (v0.3.0 - Sprint 3)
 │
 ├─ feature/sprint-4-contest (branch de integração)
 │   │
 │   ├─ feature/f4.1-contest-ui-base
 │   ├─ feature/f4.2-elo-logic
 │   ├─ feature/f4.3-battle-interface
 │   ├─ feature/f4.4-results-champion
 │   ├─ feature/f4.5-multi-project-base
 │   └─ feature/f4.6-project-manager
 │
 └─ feature/sprint-5-advanced (branch de integração)
     │
     ├─ feature/f5.1-export-import
     ├─ feature/f5.2-pwa-setup
     ├─ feature/f5.3-cache-optimization
     └─ feature/f5.4-theme-switcher
```

### Workflow por Feature:

```bash
# 1. Criar branch da feature (a partir da branch de integração)
git checkout feature/sprint-4-contest
git checkout -b feature/f4.1-contest-ui-base

# 2. Desenvolver feature
# (implementação + testes + docs)

# 3. Commit
git add .
git commit -m "feat(f4.1): adicionar UI base do Contest Mode

- Estrutura HTML da aba Contest
- Layout responsivo
- Navegação básica
- Estados vazios

Testes: F4.1_TESTS.md (8 casos)
Docs: README.md, CHANGELOG.md"

# 4. Push da feature
git push origin feature/f4.1-contest-ui-base

# 5. Validar localmente
npm run dev
# (executar testes da feature)

# 6. Se aprovado: merge na branch de integração
git checkout feature/sprint-4-contest
git merge --no-ff feature/f4.1-contest-ui-base
git push origin feature/sprint-4-contest

# 7. Deletar branch da feature
git branch -d feature/f4.1-contest-ui-base
git push origin --delete feature/f4.1-contest-ui-base

# 8. Repetir para F4.2, F4.3, ..., F4.6
```

---

## 📋 Template de Feature

### Estrutura de Documentação por Feature:

```
/docs/sprint-4/
  ├── F4.1_PLAN.md          # Planejamento da feature
  ├── F4.1_TESTS.md         # Casos de teste
  ├── F4.2_PLAN.md
  ├── F4.2_TESTS.md
  └── ...
```

### Template: `FX.Y_PLAN.md`

```markdown
# Feature X.Y — [Nome da Feature]

## 🎯 Objetivo
[Descrição clara e concisa]

## 📦 Escopo
- [ ] Item 1
- [ ] Item 2
- [ ] Item 3

## 🧩 Requisitos Funcionais (RF)
- **RF1**: [Descrição]
- **RF2**: [Descrição]

## 🎨 Requisitos Não Funcionais (RNF)
- **RNF1**: [Performance, A11Y, etc]

## 🧱 Arquitetura
### Arquivos Novos:
- `path/to/file.js` - Descrição

### Arquivos Modificados:
- `path/to/file.js` - Mudanças

## 📊 Estrutura de Dados
```javascript
// Novos campos, objetos, etc
```

## ✅ Definition of Done
- [ ] RF implementados
- [ ] RNF atendidos
- [ ] Testes passando
- [ ] Docs atualizadas
- [ ] Sem erros de linter
- [ ] Código revisado

## 🔗 Dependências
- Depende de: [F4.X, ...]
- Bloqueia: [F4.Y, ...]
```

### Template: `FX.Y_TESTS.md`

```markdown
# Testes - Feature X.Y

## Casos de Teste

### CT1 — [Nome do Teste]
- [ ] Passo 1
- [ ] Passo 2
- [ ] ✅ Resultado Esperado

### CT2 — [Nome do Teste]
...

## Resumo
| Teste | Status |
|-------|--------|
| CT1   | ⬜ Pendente / ✅ Passou / ❌ Falhou |
| CT2   | ... |
```

---

## 🚀 Sprint 4 — Decomposição Detalhada

### **F4.1 — Contest UI Base** (Independente)
**Branch:** `feature/f4.1-contest-ui-base`  
**Depende de:** Nada (pode começar agora)

**Entregas:**
- [ ] HTML da aba "Contest" (estrutura básica)
- [ ] CSS para layout de confronto
- [ ] Estados vazios ("Nenhum contest ativo")
- [ ] Navegação (botões, atalhos)
- [ ] Placeholder para confrontos

**Testes:** 8 casos (UI, responsividade, navegação)  
**Arquivos:** `index.html`, `components.css`, `app.js` (routing)

---

### **F4.2 — Elo Logic** (Independente)
**Branch:** `feature/f4.2-elo-logic`  
**Depende de:** Nada (lógica pura)

**Entregas:**
- [ ] Módulo `elo.js` (cálculo de Elo rating)
- [ ] Funções: `calculateElo(winnerRating, loserRating, k=32)`
- [ ] Funções: `generateMatches(photos, strategy='elo')`
- [ ] Testes unitários (casos extremos, empates)

**Testes:** 12 casos (cálculos, edge cases)  
**Arquivos:** `public/scripts/elo.js` (novo)

---

### **F4.3 — Battle Interface** (Depende de F4.1 + F4.2)
**Branch:** `feature/f4.3-battle-interface`  
**Depende de:** F4.1, F4.2

**Entregas:**
- [ ] Componente de confronto (2 fotos lado a lado)
- [ ] Interação: click, touch, atalhos (← →, 1, 2)
- [ ] Feedback visual (escolha, animação)
- [ ] Integração com `elo.js`
- [ ] Progresso: "Confronto X de Y"

**Testes:** 10 casos (interação, cálculo, navegação)  
**Arquivos:** `app.js`, `components.css`, `elo.js`

---

### **F4.4 — Results & Champion** (Depende de F4.3)
**Branch:** `feature/f4.4-results-champion`  
**Depende de:** F4.3

**Entregas:**
- [ ] Aba "Resultados" funcional
- [ ] Ranking completo (ordenado por Elo)
- [ ] Destaque do campeão (🏆)
- [ ] Histórico de confrontos
- [ ] Botão "Recomeçar contest"

**Testes:** 6 casos (ranking, campeão, reset)  
**Arquivos:** `index.html`, `app.js`, `components.css`

---

### **F4.5 — Multi-Project Base** (Independente, PODE SER PARALELA)
**Branch:** `feature/f4.5-multi-project-base`  
**Depende de:** Nada (infraestrutura)

**Entregas:**
- [ ] Object store `contests` no IndexedDB
- [ ] Migração automática (criar contest "default")
- [ ] Campo `projectId` em Photo
- [ ] Funções CRUD para contests
- [ ] Testes de migração

**Testes:** 8 casos (CRUD, migração, queries)  
**Arquivos:** `db.js`, `idb.js`

---

### **F4.6 — Project Manager** (Depende de F4.5)
**Branch:** `feature/f4.6-project-manager`  
**Depende de:** F4.5

**Entregas:**
- [ ] Tela de gerenciamento de projetos
- [ ] Criar/editar/deletar contests
- [ ] Dropdown de contest ativo (header)
- [ ] Filtro de fotos por projeto
- [ ] Preview de projetos (cards)

**Testes:** 10 casos (CRUD, navegação, filtros)  
**Arquivos:** `index.html`, `app.js`, `components.css`

---

## 🌟 Sprint 5 — Decomposição Detalhada

### **F5.1 — Export/Import** (Independente)
**Branch:** `feature/f5.1-export-import`  
**Depende de:** Nada (pode começar agora)

**Entregas:**
- [ ] Exportar contest para JSON
- [ ] Importar contest de JSON
- [ ] Exportar para ZIP (JSON + imagens) - lib: JSZip
- [ ] Importar de ZIP
- [ ] UI: botões de exportar/importar

**Testes:** 8 casos (export, import, validação)  
**Arquivos:** `export.js` (novo), `app.js`, `package.json` (JSZip)

---

### **F5.2 — PWA Setup** (Independente)
**Branch:** `feature/f5.2-pwa-setup`  
**Depende de:** Nada

**Entregas:**
- [ ] `manifest.json` (ícones, cores, nome)
- [ ] Service Worker básico
- [ ] Estratégia de cache (offline-first para assets)
- [ ] Instalação PWA (botão "Instalar")

**Testes:** 6 casos (instalação, offline, cache)  
**Arquivos:** `manifest.json` (novo), `sw.js` (novo), `index.html`

---

### **F5.3 — Cache Optimization** (Independente)
**Branch:** `feature/f5.3-cache-optimization`  
**Depende de:** Nada

**Entregas:**
- [ ] Lazy loading de imagens (IntersectionObserver)
- [ ] Virtual scrolling para 500+ fotos
- [ ] Debounce em filtros/ordenação
- [ ] Otimização de thumbnails (WebP, compressão)

**Testes:** 5 casos (performance, memória)  
**Arquivos:** `app.js`, `image-utils.js`

---

### **F5.4 — Theme Switcher** (Independente)
**Branch:** `feature/f5.4-theme-switcher`  
**Depende de:** Nada

**Entregas:**
- [ ] Toggle dark/light mode
- [ ] Persistência no localStorage
- [ ] Transição suave entre temas
- [ ] Respeitar `prefers-color-scheme`

**Testes:** 4 casos (toggle, persistência, auto)  
**Arquivos:** `base.css`, `app.js`

---

## 🔄 Workflow Recomendado

### Fase 1: Planejamento por Feature

```bash
# Para cada feature:
# 1. Criar documento de planejamento
docs/sprint-4/F4.1_PLAN.md
docs/sprint-4/F4.1_TESTS.md

# 2. Revisar e aprovar com usuário
# (você valida se faz sentido)

# 3. Estimar (horas, complexidade)
```

### Fase 2: Implementação Incremental

```bash
# Para cada feature (em ordem de dependência):

# 1. Criar branch
git checkout main  # ou branch de integração
git checkout -b feature/f4.1-contest-ui-base

# 2. Desenvolver (foco na feature)
# - Implementar código
# - Escrever testes
# - Atualizar docs

# 3. Testar localmente
npm run dev
# Executar casos de teste da feature

# 4. Commit granular
git add .
git commit -m "feat(f4.1): adicionar UI base do Contest Mode

- Aba Contest com layout responsivo
- Estados vazios
- Navegação básica

Testes: 8/8 passando
Docs: README.md atualizado"

# 5. Push e solicitar validação
git push origin feature/f4.1-contest-ui-base

# 6. Usuário valida
# (você testa e aprova)

# 7. Merge na branch de integração
git checkout feature/sprint-4-contest
git merge --no-ff feature/f4.1-contest-ui-base
git push origin feature/sprint-4-contest

# 8. Limpar branch da feature
git branch -d feature/f4.1-contest-ui-base

# 9. Repetir para próxima feature
```

### Fase 3: Integração e Release

```bash
# Quando todas as features da Sprint 4 estiverem prontas:

# 1. Merge da branch de integração na main
git checkout main
git merge --no-ff feature/sprint-4-contest

# 2. Criar tag da sprint
git tag -a v0.4.0 -m "Release v0.4.0 - Sprint 4: Contest Mode"

# 3. Push
git push origin main
git push origin v0.4.0
```

---

## 📁 Estrutura de Diretórios Proposta

```
photo-ranker/
├── docs/
│   ├── sprint-4/
│   │   ├── F4.1_PLAN.md
│   │   ├── F4.1_TESTS.md
│   │   ├── F4.2_PLAN.md
│   │   ├── F4.2_TESTS.md
│   │   └── ...
│   ├── sprint-5/
│   │   ├── F5.1_PLAN.md
│   │   ├── F5.1_TESTS.md
│   │   └── ...
│   └── SPRINTS_4_5_STRATEGY.md  ← este arquivo
│
├── public/
│   ├── scripts/
│   │   ├── app.js
│   │   ├── rating.js
│   │   ├── elo.js           ← F4.2
│   │   ├── contest.js       ← F4.3
│   │   ├── export.js        ← F5.1
│   │   └── ...
│   └── ...
│
├── SPRINT4_SUMMARY.md        # Resumo final da Sprint 4
├── SPRINT5_SUMMARY.md        # Resumo final da Sprint 5
└── ...
```

---

## 🤖 Como Usar "Agentes" (Conversas Separadas)

### Opção 1: Conversas Lineares (Recomendada)

**Vantagem:** Mantém contexto entre features  
**Desvantagem:** Pode crescer muito

**Workflow:**
```
Conversa 1 (esta) → Sprint 3 CONCLUÍDA ✅

Conversa 2 → Planejar TODAS as features da Sprint 4
  ├─ Criar F4.1_PLAN.md, F4.1_TESTS.md
  ├─ Criar F4.2_PLAN.md, F4.2_TESTS.md
  └─ ... (todos os 6)
  
  → Você valida todos os planos
  
  → Se aprovado, continuar nesta mesma conversa:
     ├─ Implementar F4.1 → commit → validar
     ├─ Implementar F4.2 → commit → validar
     └─ ... até F4.6
     
  → Sprint 4 completa ✅

Conversa 3 → Sprint 5 (mesmo fluxo)
```

### Opção 2: Uma Conversa por Feature (Granular)

**Vantagem:** Contexto focado, limpo  
**Desvantagem:** Precisa repassar contexto a cada vez

**Workflow:**
```
Conversa 1 → Sprint 3 ✅ (esta)

Conversa 2 → F4.1 (Contest UI Base)
  └─ Planejar → Implementar → Testar → Commit → Validar ✅

Conversa 3 → F4.2 (Elo Logic)
  └─ Planejar → Implementar → Testar → Commit → Validar ✅

Conversa 4 → F4.3 (Battle Interface)
  └─ ... e assim por diante
```

### Opção 3: Híbrida (RECOMENDAÇÃO FINAL)

**Melhor custo-benefício:**

```
Conversa 1 → Sprint 3 ✅ (esta)

Conversa 2 → PLANEJAMENTO COMPLETO Sprint 4
  ├─ Criar todos os F4.X_PLAN.md (6 features)
  ├─ Criar todos os F4.X_TESTS.md (6 features)
  └─ Você valida e aprova os planos ✅

Conversa 3 → IMPLEMENTAÇÃO Sprint 4 (Features F4.1 → F4.6)
  ├─ Implementar F4.1 → commit → você valida
  ├─ Implementar F4.2 → commit → você valida
  ├─ ... (todas as 6 features sequencialmente)
  └─ Sprint 4 completa ✅
  
Conversa 4 → PLANEJAMENTO Sprint 5
  └─ (mesmo processo)
  
Conversa 5 → IMPLEMENTAÇÃO Sprint 5
  └─ (mesmo processo)
```

---

## 📊 Vantagens da Abordagem Modular

| Aspecto | Antes (Sprint inteira) | Agora (Features) |
|---------|----------------------|------------------|
| **Commits** | 1 commit gigante | 6+ commits granulares |
| **Validação** | No final (tudo ou nada) | Incremental (feature por feature) |
| **Rollback** | Difícil (tudo junto) | Fácil (reverter 1 feature) |
| **Paralelização** | Impossível | Possível (features independentes) |
| **Documentação** | Densa | Modular e clara |
| **Testes** | 50+ de uma vez | 6-12 por feature |
| **Debugging** | Difícil (muito código) | Fácil (escopo pequeno) |

---

## 🎯 Minha Recomendação

### Para você (usuário):

**Use a Opção 3 (Híbrida):**

1. **Próxima Conversa**: Peça para eu criar TODOS os planos das features da Sprint 4
   - Você revisa e aprova (sem código ainda)
   - Pode pedir ajustes no escopo
   - Fica claro o que será implementado

2. **Conversa Seguinte**: Implementação incremental
   - Eu implemento F4.1 → você valida
   - Eu implemento F4.2 → você valida
   - (Se algo não estiver bom, ajusto antes de próxima feature)
   - Commits granulares e rastreáveis

3. **Benefícios**:
   - ✅ Controle total (aprova cada feature)
   - ✅ Commits independentes (pode reverter só uma)
   - ✅ Testes incrementais (menos sobrecarga)
   - ✅ Documentação sempre atualizada
   - ✅ Histórico Git limpo e semântico

---

## 📝 Comandos para Iniciar Sprint 4

### Agora (preparação):

```bash
# 1. Criar branch de integração da Sprint 4
git checkout main
git checkout -b feature/sprint-4-contest

# 2. Criar estrutura de docs
mkdir -p docs/sprint-4

# 3. Pronto para começar planejamento
```

### Próxima Conversa (planejamento):

**Prompt sugerido:**
```
"Vamos planejar a Sprint 4 completa. Leia o PROJECT_PLAN.md 
e crie os documentos de planejamento para TODAS as 6 features:

F4.1 - Contest UI Base
F4.2 - Elo Logic
F4.3 - Battle Interface
F4.4 - Results & Champion
F4.5 - Multi-Project Base
F4.6 - Project Manager

Para cada uma, crie:
- docs/sprint-4/F4.X_PLAN.md (RF, RNF, arquitetura)
- docs/sprint-4/F4.X_TESTS.md (casos de teste)

Após criar todos, me apresente um resumo para eu validar."
```

### Conversa Seguinte (implementação):

**Prompt sugerido:**
```
"Vamos implementar a Sprint 4. Comece pela F4.1 (Contest UI Base).
Implemente tudo conforme o F4.1_PLAN.md, depois me avise para eu testar.
Após minha aprovação, faça commit e passe para F4.2."
```

---

## ✅ Checklist de Preparação

- [x] Sprint 3 commitada e validada
- [x] Estratégia definida (este documento)
- [ ] Branch `feature/sprint-4-contest` criada
- [ ] Diretório `docs/sprint-4/` criado
- [ ] Planejamento das 6 features criado
- [ ] Usuário aprovou os planos
- [ ] Pronto para implementação incremental

---

## 🎯 Resumo Executivo

### Sprint 4 (v0.4.0):
- **6 features** independentes
- **6 branches** separadas
- **6 commits** granulares
- **~15-20 horas** total
- **Validação** incremental (você aprova cada feature)

### Sprint 5 (v0.5.0):
- **4 features** independentes
- **4 branches** separadas
- **4 commits** granulares
- **~10-15 horas** total
- **Validação** incremental

### Total: **10 features, 10 commits, ~25-35 horas**

---

## 🚀 Vantagens para Você

1. ✅ **Controle Total**: Aprova cada feature antes da próxima
2. ✅ **Reversível**: Pode desfazer só uma feature (não tudo)
3. ✅ **Testável**: Testa pequenas partes (menos complexo)
4. ✅ **Histórico Git Limpo**: Commits semânticos e rastreáveis
5. ✅ **Documentação Incremental**: Sempre atualizada
6. ✅ **Menos Risco**: Problemas detectados cedo
7. ✅ **Paralelizável**: Pode pedir features independentes em paralelo (se quiser)

---

**Pronto para começar? Quer que eu:**

A) Crie a branch `feature/sprint-4-contest` e a estrutura de diretórios agora?

B) Comece direto com o planejamento das 6 features da Sprint 4?

C) Outra abordagem que preferir?
