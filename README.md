# 📸 Photo Ranker — MVP (Mobile-first)

> Aplicação web progressiva para upload, avaliação e ranqueamento de fotos com detecção automática de composições 2×2.

## 🚀 Como rodar

```bash
# Instalar dependências (primeira vez)
npm install

# Iniciar servidor de desenvolvimento
npm run dev

# Abrir no navegador
# http://localhost:5500
```

**Ou com npx** (sem instalar):
```bash
cd public
npx http-server -p 5500
```

## Features

### ✅ Sprint 1 (v0.1.0)
 - Upload com progresso global (X de Y).
 - IndexedDB (persistência).
 - Multi-seleção com barra de ações.
 - Viewer fullscreen com remoção segura (modal).
 - Acessibilidade e responsividade.

### ✅ Sprint 2 (v0.2.0)
**Detecção e Divisão 2×2:**
- Detecção automática de imagens 2×2 via Web Worker
- Modal de cropper interativo com guias ajustáveis (mouse/touch)
- Preview em tempo real dos 4 quadrantes durante ajuste
- Processamento em fila para múltiplas detecções
- Divisão manual para fotos não detectadas automaticamente

**Gerenciamento:**
- Fotos divididas mantêm referência ao original (`_parentId`, `_quadrant`)
- Originais arquivados automaticamente (flag `_isSplit`)
- Sistema de reverter: restaura original e remove todas as cortadas
- Badges visuais: "Cortado" (verde) e "Novo" (roxo)

**Viewer Fullscreen:**
- Zoom até 4x com scroll/pinch/botões (+, -, reset)
- Pan (arrastar) quando com zoom
- Atalhos de teclado: +/- para zoom, Shift+0 para reset
- Botão adaptativo: divide originais ou restaura cortadas
- Canvas grande fixo (90vw × 82vh) para melhor visualização

**UX/A11Y:**
- Tooltips customizados em todos os botões
- Responsividade mobile completa
- Hierarquia de z-index correta
- Ícones semânticos (↺ para reverter, ⊗ para grade)

### ✅ Sprint 3 (v0.3.0)
**Sistema de Avaliação por Estrelas:**
- Componente interativo de 5 estrelas (hover, click, touch, teclado)
- Integração no grid (aparece ao passar mouse, sempre visível se avaliada)
- Integração no viewer fullscreen (centralizadas abaixo da imagem)
- Atalhos de teclado globais: 1-5 para avaliar, 0 para remover avaliação
- Feedback visual: toasts, animações, glow dourado (#FFD700)
- Vibração tátil no mobile (50ms)

**Aba "Avaliar" Funcional:**
- Interface dedicada para ranqueamento sequencial
- Foto grande centralizada com estrelas e progresso
- Navegação: "← Anterior" / "Próxima →" (botões e atalhos ←/→)
- Progresso em tempo real: "Foto X de Y (Z avaliadas)"
- Filtro "Mostrar apenas não avaliadas" (checkbox)
- Estado vazio: "Todas as fotos já foram avaliadas! 🎉"
- Atalhos completos: ←/→ (navegar), 1-5 (avaliar), 0 (remover), Esc (voltar)

**Sistema de Filtros:**
- Tabs de filtragem: "Todas" / "⭐ 5 estrelas" / "Não avaliadas"
- Contadores dinâmicos atualizados em tempo real
- Persistência ao fazer upload de novas fotos
- Interface responsiva (tabs horizontal → dropdown vertical no mobile)

**Persistência:**
- Campo `rating` (0-5) em todas as fotos (0 = não avaliado)
- Campo `evaluatedAt` (timestamp) quando foto é avaliada
- Índice IndexedDB otimizado para queries de rating
- Migração automática de fotos antigas

**Acessibilidade:**
- ARIA completo (role="radiogroup", aria-checked, aria-label)
- Navegação por Tab + Enter/Space
- Screen reader: anúncios via aria-live
- Contraste WCAG AA: estrelas douradas ≥ 4.5:1

**Sistema de Ordenação:**
- 8 opções: 📅 Data, ⭐ Avaliação, 📦 Tamanho, 📏 Dimensão
- Persistência no localStorage
- Sincronização completa (grid, viewer, aba "Avaliar")
- Dropdown com ícones para identificação rápida

**Otimizações:**
- Manutenção de scroll ao avaliar (miniaturas mantém posição, viewer faz scroll)
- Índices sincronizados com filtros/ordenação
- Botão "Limpar" contextual (respeita filtro ativo)
- Layout responsivo sem scroll na aba "Avaliar"
- Grid 1 coluna em telas < 400px (evita vazamento de estrelas)

### ✅ Sprint 4 (v0.4.0)
**Contest Mode - Sistema Elo-Based Non-Repeat Pairwise Ranking:**
- Interface de confronto lado a lado (A vs B)
- Sistema pairwise: cada par de fotos batalha apenas uma vez
- Total de confrontos: n*(n-1)/2 (todas as combinações possíveis)
- Pareamento híbrido: Elo similar (60%) + balanceamento de batalhas (40%)
- Finalização automática quando todas as combinações são esgotadas
- Algoritmo Elo (FIDE padrão, K=32) para ranking e pontuação
- Progresso detalhado: "Batalha X de Y (Z pares únicos restantes)"
- Ranking dinâmico ao lado mostrando posições atualizadas
- Interação: click, touch, atalhos (1/←, 2/→, Esc)
- Modal de confirmação para "Refazer Contest"

**Tela de Resultados:**
- Card do campeão com animações (🏆 bounce, gradient)
- Ranking completo ordenado por Elo final (não W-L record)
- Estatísticas: Elo final, vitórias, derrotas, média de batalhas por foto
- Heatmap de confrontos (matriz visual, clicável para abrir fotos no viewer)
- Histórico cronológico de confrontos (visualização compacta em 2 colunas, clicável)
- Botão "Recomeçar Contest" (com modal de confirmação)

**Persistência:**
- Estado salvo no localStorage (continuar de onde parou)
- Histórico completo de batalhas (cronológico)
- Elo scores atualizados em tempo real
- Migração automática de estados antigos (bracket → pairwise)

**UX/A11Y:**
- Feedback visual: borda verde ao vencer, escala, toasts
- Layout responsivo (lado a lado → vertical em mobile)
- Navegação por teclado completa
- Delay 800ms entre confrontos para ver feedback
- Miniaturas clicáveis no heatmap e histórico para abrir viewer

### ✅ Sprint 5 (v0.5.0) — **Atual**
**Sistema de Múltiplos Projetos:**
- Infraestrutura base para múltiplos projetos (object store `contests` no IndexedDB)
- Migração automática de dados antigos (cria projeto "default" e associa fotos existentes)
- Campo `projectId` em todas as fotos para isolamento entre projetos
- Tela inicial de gerenciamento de projetos com grid de cards
- Side menu para navegação rápida entre projetos
- Breadcrumb para indicar projeto ativo e contexto atual
- Cada projeto tem seu próprio estado de contest, fotos e avaliações

**Gerenciamento de Projetos:**
- CRUD completo: criar, editar, duplicar, deletar projetos
- Sistema de pastas para organização hierárquica
- Reordenação de projetos e pastas (drag & drop)
- Mover projetos entre pastas ou para "Sem pasta"
- Estatísticas por projeto: total de fotos, avaliadas, ⭐5, fase atual
- Cards com preview de miniaturas das primeiras fotos
- Modal de edição com nome e descrição
- Duplicação de projetos (com fotos, mas estado resetado)

**Exportação e Importação:**
- Exportar projeto completo para arquivo ZIP
- Formato: `project.json` (dados completos) + pasta `photos/` (imagens)
- Preserva: dados do projeto, estado completo do contest, todas as fotos, avaliações, thumbnails
- Importar projeto de arquivo ZIP
- Validação completa de estrutura e dados
- Seleção de pasta ao importar (se houver pastas no sistema)
- Feedback de progresso durante export/import (barra de progresso)
- Nome de arquivo: `[nome-projeto]-[data].zip`

**Persistência:**
- Projeto ativo salvo no localStorage (`activeProjectId`)
- Migração automática e idempotente (pode rodar múltiplas vezes)
- Backward compatible (fotos antigas funcionam sem projeto)
- Índices otimizados no IndexedDB para queries por projeto

**UX/A11Y:**
- Interface responsiva (grid adaptativo, side menu colapsável)
- Transições suaves ao trocar de projeto
- Feedback visual em todas as operações (toasts, animações)
- Navegação por teclado completa
- Estados vazios informativos

## 🎯 Atalhos de Teclado

| Tecla | Ação |
|-------|------|
| **U** | Abrir upload de imagens |
| **S** | Ativar/desativar modo seleção |
| **1-5** | Avaliar foto em foco |
| **0** | Remover avaliação |
| **Esc** | Fechar viewer/modal ou sair do modo seleção |
| **Delete/D** | Remover foto (no viewer) |
| **←/→** | Navegar entre fotos (viewer ou aba "Avaliar") / Foto A/B (Contest) |
| **+/-** | Zoom in/out (viewer) |
| **Shift+0** | Resetar zoom (viewer) |
| **1** | Escolher Foto A (Contest) |
| **2** | Escolher Foto B (Contest) |

## 📋 Estrutura do Projeto

```
photo-ranker/
├── public/
│   ├── index.html                 # Estrutura HTML
│   ├── scripts/
│   │   ├── app.js                 # Lógica principal
│   │   ├── db.js                  # IndexedDB
│   │   ├── idb.js                 # Helper IndexedDB
│   │   ├── ui.js                  # Utilitários UI
│   │   ├── image-utils.js         # Processamento de imagens
│   │   ├── cropper.js             # Modal de corte 2×2
│   │   ├── quad-worker.js         # Worker de detecção
│   │   ├── rating.js              # Componente de estrelas
│   │   ├── elo.js                 # Sistema de ranking Elo
│   │   └── modules/
│   │       ├── contest/           # Módulos do Contest Mode
│   │       ├── project/           # Gerenciamento de projetos
│   │       └── export/            # Exportação/importação
│   └── styles/
│       ├── base.css               # Layout e tokens
│       └── components.css          # Componentes e microinterações
├── package.json
├── PROJECT_PLAN.md                # Documentação técnica
├── CHANGELOG.md                   # Histórico de versões
├── COMMIT_SPRINT4.md              # Guia de commit Sprint 4
├── SPRINTS_4_5_STRATEGY.md        # Estratégia Sprints 4 e 5
└── docs/                          # Documentação técnica detalhada
    ├── ELO_ANALYSIS.md            # Análise do sistema Elo
    ├── REALTIME_UPDATES.md        # Mapeamento de atualizações em tempo real
    ├── ROBUSTNESS_ISSUES.md       # Problemas de robustez identificados
    └── sprint-4/                  # Documentação de planejamento Sprint 4

## 🎓 Tecnologias

- **Frontend**: HTML5, CSS3, JavaScript (ESM)
- **Armazenamento**: IndexedDB
- **Workers**: Web Workers (análise assíncrona)
- **APIs**: Canvas, FileReader, Blob, DataURL
- **Design**: Mobile-first, responsivo, WCAG AA
- **Sem frameworks**: Vanilla JS puro

## 📊 Status do Projeto

- ✅ **Sprint 1** (v0.1.0): Upload, grid, viewer, multi-select
- ✅ **Sprint 2** (v0.2.0): Detecção 2×2, cropper, zoom/pan
- ✅ **Sprint 3** (v0.3.0): Rating, filtros, ordenação, aba "Avaliar"
- ✅ **Sprint 4** (v0.4.0): Contest Mode (sistema pairwise + Elo + resultados)
- ✅ **Sprint 5** (v0.5.0): Múltiplos projetos + pastas + exportação/importação
- 🔜 **Sprint 6**: PWA + otimizações de performance + theme switcher

## 📄 Licença

MIT © 2025