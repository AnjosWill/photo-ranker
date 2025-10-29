# Changelog
Este projeto segue o formato **Keep a Changelog** e **SemVer**.

## [v0.2.0] — 2025-10-28 (Sprint 2)
### ✨ Funcionalidades
**Detecção e Divisão 2×2:**
- **Detecção automática de imagens 2×2** via Web Worker assíncrono
  - Análise heurística refinada baseada em similaridade entre quadrantes (>95%)
  - Performance: <500ms por imagem, execução paralela para múltiplas fotos
- **Modal de cropper interativo** com canvas HTML5
  - Guias ajustáveis (verticais e horizontais) via mouse e touch
  - Preview em tempo real dos 4 quadrantes durante ajuste (HiDPI 2x)
  - Alças de arrasto com 44×44px (WCAG)
- **Divisão manual** para fotos não detectadas automaticamente
  - Botão "Dividir em 2×2" nos cards e no viewer fullscreen
  - Fluxo idêntico ao automático: cropper → ajuste → confirmar
- **Fila de processamento** para múltiplas detecções
  - Cropper abre sequencialmente para cada imagem detectada
  - Feedback de progresso: "Ajustando imagem X de Y"
  - Opção de cancelar (Esc) e manter original
- **Extração de quadrantes** mantendo qualidade original (JPEG 0.95)
  - 4 fotos independentes criadas com metadados: `_parentId`, `_quadrant`

**Sistema de Reverter:**
- **Restauração de fotos originais** via botão ↺ (undo)
  - Remove todas as 4 fotos cortadas simultaneamente
  - Restaura original (remove flag `_isSplit`)
  - Modal de confirmação antes de reverter
  - Disponível nos cards (grid) e viewer fullscreen
  - Após reverter no viewer, abre automaticamente a foto original

**Badges Visuais:**
- **Badge "Cortado"** (verde) para fotos divididas
- **Badge "Novo"** (roxo) para fotos sem rating
- Badges empilhados verticalmente (não cobre a imagem)
- Tooltips customizados em todos os botões de ação

**Zoom e Navegação no Viewer:**
- **Zoom até 4x** com múltiplos métodos:
  - Scroll do mouse
  - Pinch-to-zoom (mobile)
  - Botões +/- e reset (⊗)
  - Atalhos de teclado: +, -, 0
- **Pan (arrastar)** quando com zoom ativo
  - Cursor muda para grab/grabbing
  - Limites inteligentes para não arrastar muito além
  - Suporte touch (1 dedo) no mobile
- **Canvas grande fixo**: 90vw × 82vh (max 1600×900px)
  - Imagens escalam para preencher o espaço (`object-fit: contain`)
  - Melhor aproveitamento da tela em desktops
- **Controles visuais**: Painel flutuante (canto inferior esquerdo)
  - Nível de zoom em % (atualização em tempo real)
  - Botões com tooltips informativos
  - Responsivo: menor no mobile

### 🎨 UX e Interface
- **Modal responsivo** do cropper (95vw max 900px)
  - Canvas com `object-fit: contain` para sempre mostrar imagem completa
  - Preview grid adaptativo: 4 colunas (desktop) → 2 colunas (mobile)
  - Previews HiDPI com `imageSmoothingQuality: 'high'`
  - Botões em coluna no mobile para melhor usabilidade
- **Tooltips customizados** com `data-tooltip` em todos os botões
  - Animação suave (fade-in 200ms)
  - Setas adaptativas (canto inferior nos cards, canto superior no viewer)
  - Evita conflito com tooltips nativos do browser
- **Hierarquia de z-index correta**:
  - Header: 10 (sempre no topo)
  - Photo-actions: 5 (botões dos cards)
  - Viewer: 1000 (fullscreen)
  - Cropper: 10000 (sobrepõe tudo)
  - Controles do viewer: 9999 (botões flutuantes)
- **Toasts informativos** em cada etapa do fluxo
- **Hint no cropper**: "Arraste as guias para ajustar o corte"
- **Ícones semânticos**: ↺ para reverter, ⊗ para grade/reset

### ♿ Acessibilidade (A11Y)
- **Modal com `role="dialog"` e `aria-modal="true"`**
- **Trap de foco** entre botões (Tab/Shift+Tab)
- **Esc fecha modal** mesmo durante drag de guias
- **Enter confirma** corte quando foco no botão
- **Atalhos de teclado no viewer**:
  - ←/→ para navegar entre fotos
  - Delete para remover
  - +/- para zoom, 0 para reset
- **Labels ARIA** em todos os elementos interativos
- **Tooltips descritivos** em todos os botões de ação
- **Alças de 44×44px** (WCAG) para toque confortável

### 🧱 Arquitetura
- Novo módulo `cropper.js` (ESM) com funções exportadas.
- Novo worker `quad-worker.js` para análise assíncrona.
- Integração no fluxo de upload (`app.js`):
  - Análise → Fila → Cropper → Salvamento.
- Estrutura de dados preparada para evolução futura (`projectId` opcional).

### 🐛 Correções
**Detecção e Worker:**
- Filtro de fotos com `_isSplit` no `renderGrid()` e viewer
- Timeout de segurança (500ms) nos workers para evitar travamentos
- Cleanup de workers após análise (previne vazamento de memória)
- Algoritmo refinado para reduzir falsos positivos/negativos:
  - Foco em similaridade muito alta entre quadrantes (≥95%)
  - Rejeição de fotos únicas cortadas (similaridade 70-90%)

**Cropper Modal:**
- Canvas com `object-fit: contain` para evitar distorção
- Cálculo de `displaySize` corrigido (lógica "contain" padrão)
- Promise resolve antes de `closeCropper()` para evitar erro
- `requestAnimationFrame` para garantir dimensões corretas do modal
- Previews proporcionais (não mais forçados a 80×80 quadrado)
- Debounce no resize para performance

**UI/UX:**
- Tooltips com `data-tooltip` (não mais `title`) para controle total
- `overflow: hidden` removido de `.photo-card` (tooltips cortados)
- `z-index` corrigido: photo-actions (5) < header (10)
- Botões flutuantes do viewer com `position: fixed` (não sobrepõem imagem)
- Viewer não fecha/reabre ao cancelar cropper (evita flicker)
- Badge "Novo" mostra mesmo em fotos cortadas (se `!rating`)
- Ícone de reverter trocado de 🏠 para ↺ (mais semântico)

### 📄 Documentação
- PROJECT_PLAN.md atualizado com visão de múltiplos contests (Sprints 4-5).
- README.md atualizado com features da Sprint 2.

---

## [v0.1.0] — 2025-10-26 (Sprint 1)
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