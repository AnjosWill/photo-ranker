# Photo Ranker — MVP (Mobile-first)
MVP mobile-first para upload, avaliação e gerenciamento de fotos.

## Como rodar (VS Code)
1. Abra esta pasta `photo-ranker-mvp` no VS Code.
2. Instale a extensão **Live Server** (Ritwick Dey) ou use `npx http-server`.
3. Sirva a pasta `public/`:
   - Live Server: clique em `Go Live` dentro de `public/index.html`.
   - CLI: `cd public && npx http-server -p 5500` e abra http://localhost:5500.

## Features (Sprint 1)
 - Upload com progresso global (X de Y).
 - IndexedDB (persistência).
 - Multi-seleção com barra de ações.
 - Viewer fullscreen com remoção segura (modal).
 - Acessibilidade e responsividade.

## Próximos passos
- Sprint 2: detecção/fatiamento 2×2 em Web Worker + corte manual.
- Sprint 3: ranqueamento 1–5.
- Sprint 4: contest (Elo + mata-mata).
- Sprint 5: exportações + PWA.