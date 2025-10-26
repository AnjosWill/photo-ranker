# Changelog
Este projeto segue o formato **Keep a Changelog** e **SemVer**.

## [v0.1.0] — 2025-10-26
### ✨ Funcionalidades
- Upload múltiplo com progresso global (quantidade concluída).
- Persistência via IndexedDB.
- Visualização fullscreen com navegação e remoção com confirmação.
- Multi-seleção de fotos + barra de ações; “Limpar” inteligente.
- A11Y & atalhos (U, S, Esc, Delete); trap de foco no modal.
- UI mobile-first, responsiva, com microinterações.

### 🛠️ Ajustes/UX
- Ícone ✕ oculto no modo seleção; checks só no modo seleção.
- Toolbar harmonizada (Selecionar + Limpar à esquerda; contador à direita).
- Viewer bloqueia navegação durante confirmação.
- Botão Limpar desabilitado quando não há imagens.
- Cópia padronizada (“X imagens”).

### 🧱 Base técnica
- `base.css` (tokens/layout), `components.css` (componentes).
- `db.js`, `image-utils.js`, `app.js` modulados e com tratamento de erros.

<!-- Links de comparação (preencher quando houver próxima versão) -->
<!-- [v0.1.0]: https://github.com/AnjosWill/photo-ranker/releases/tag/v0.1.0 -->