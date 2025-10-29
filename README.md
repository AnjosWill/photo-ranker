# Photo Ranker — MVP (Mobile-first)
MVP mobile-first para upload, avaliação e gerenciamento de fotos.

## Como rodar (VS Code)
1. Abra esta pasta `photo-ranker-mvp` no VS Code.
2. Instale a extensão **Live Server** (Ritwick Dey) ou use `npx http-server`.
3. Sirva a pasta `public/`:
   - Live Server: clique em `Go Live` dentro de `public/index.html`.
   - CLI: `cd public && npx http-server -p 5500` e abra http://localhost:5500.

## Features

### ✅ Sprint 1 (v0.1.0)
- Upload com progresso global (X de Y).
- IndexedDB (persistência).
- Multi-seleção com barra de ações.
- Viewer fullscreen com remoção segura (modal).
- Acessibilidade e responsividade.

### ✅ Sprint 2 (v0.2.0) — **Atual**
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
- Atalhos de teclado: +/- para zoom, 0 para reset
- Botão adaptativo: divide originais ou restaura cortadas
- Canvas grande fixo (90vw × 82vh) para melhor visualização

**UX/A11Y:**
- Tooltips customizados em todos os botões
- Responsividade mobile completa
- Hierarquia de z-index correta
- Ícones semânticos (↺ para reverter, ⊗ para grade)

## Próximos passos
- Sprint 3: ranqueamento 1–5 com estrelas.
- Sprint 4: contest mode (Elo + mata-mata) + múltiplos projetos.
- Sprint 5: exportação/importação + PWA + refinamentos.