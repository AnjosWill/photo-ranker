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

### ✅ Sprint 4 (v0.4.0) — **Atual**
**Contest Mode - Sistema de Eliminatória:**
- Interface de confronto lado a lado (A vs B)
- Sistema de eliminatória progressiva (knockout/bracket)
- Vencedores avançam rodada a rodada até definir campeão
- Algoritmo Elo (FIDE) para ranking e pontuação
- Progresso detalhado: "Rodada X de Y / Confronto A de B"
- Interação: click, touch, atalhos (1/←, 2/→, Esc)

**Tela de Resultados:**
- Card do campeão com animações (🏆 bounce, gradient)
- Ranking completo ordenado por Elo
- Estatísticas: Elo final, vitórias, derrotas, win rate
- Botão "Recomeçar Contest" (com confirmação)

**Persistência:**
- Estado salvo no localStorage (continuar de onde parou)
- Histórico completo de batalhas por rodada
- Elo scores atualizados em tempo real

**UX/A11Y:**
- Feedback visual: borda verde ao vencer, escala, toasts
- Layout responsivo (lado a lado → vertical em mobile)
- Navegação por teclado completa
- Delay 800ms entre confrontos para ver feedback

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
│   │   └── elo.js                 # Sistema de ranking Elo
│   └── styles/
│       ├── base.css               # Layout e tokens
│       └── components.css         # Componentes e microinterações
├── package.json
├── PROJECT_PLAN.md                # Documentação técnica
├── CHANGELOG.md                   # Histórico de versões
├── SPRINT3_PLAN.md                # Planejamento Sprint 3
└── SPRINT3_TESTS.md               # Casos de teste

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
- ✅ **Sprint 4** (v0.4.0): Contest Mode (eliminatória + Elo + resultados)
- 🔜 **Sprint 5**: Múltiplos projetos + exportação/importação + PWA

## 📝 Próximos passos
- Sprint 5: Múltiplos projetos + exportação/importação + PWA + refinamentos.

## 📄 Licença

MIT © 2025