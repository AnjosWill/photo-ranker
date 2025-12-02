# Changelog
Este projeto segue o formato **Keep a Changelog** e **SemVer**.

## [v0.5.0] — 2025-01-15 (Sprint 5)
### ✨ Funcionalidades
**Sistema de Múltiplos Projetos:**
- **Infraestrutura Base (F5.1)**
  - Object store `contests` no IndexedDB para armazenar múltiplos projetos
  - Campo `projectId` em todas as fotos para isolamento entre projetos
  - Migração automática de dados antigos (cria projeto "default" e associa fotos existentes)
  - Migração idempotente (pode rodar múltiplas vezes sem problemas)
  - Backward compatible (fotos antigas funcionam sem projeto)
  - Índices otimizados no IndexedDB para queries por projeto (`by-project`, `by-phase`)
  - Funções CRUD para contests: `createContest`, `getAllContests`, `getContest`, `updateContest`, `deleteContest`
  - Função `getPhotosByProject(projectId)` para filtrar fotos por projeto

- **Gerenciamento de Projetos (F5.2)**
  - Tela inicial de gerenciamento com grid de cards de projetos
  - Side menu lateral para navegação rápida entre projetos
  - Breadcrumb no header para indicar projeto ativo e contexto atual
  - CRUD completo: criar, editar, duplicar, deletar projetos
  - Sistema de pastas para organização hierárquica de projetos
  - Reordenação de projetos e pastas (drag & drop)
  - Mover projetos entre pastas ou para "Sem pasta"
  - Estatísticas por projeto: total de fotos, avaliadas, ⭐5, fase atual
  - Cards com preview de miniaturas das primeiras fotos do projeto
  - Modal de edição com nome e descrição
  - Duplicação de projetos (com fotos, mas estado de contest resetado)
  - Cada projeto tem seu próprio estado de contest, fotos e avaliações
  - Projeto ativo salvo no localStorage (`activeProjectId`)
  - Filtro automático: grid, aba "Avaliar" e Contest mostram apenas fotos do projeto ativo
  - Upload adiciona fotos automaticamente ao projeto ativo

- **Exportação e Importação (F5.3)**
  - Exportar projeto completo para arquivo ZIP
  - Formato de exportação: `project.json` (dados completos) + pasta `photos/` (imagens)
  - Preserva todos os dados: projeto, estado completo do contest (phase, eloScores, battleHistory, qualifying, final, championId, photoStats, eloRange, scoresAndTiers), todas as fotos com metadados, avaliações (ratings), thumbnails
  - Importar projeto de arquivo ZIP
  - Validação completa de estrutura e dados (formato ZIP, JSON válido, campos obrigatórios)
  - Seleção de pasta ao importar (se houver pastas no sistema)
  - Modal de seleção de pasta com lista de pastas existentes + opção "Sem pasta"
  - Feedback de progresso durante export/import (barra de progresso 0-100%)
  - Nome de arquivo exportado: `[nome-projeto]-[data].zip`
  - Geração de novos IDs únicos ao importar (não preserva IDs originais)
  - Preservação de ordem e metadados das fotos
  - Tratamento de erros em todas as etapas com mensagens claras

### 🎨 UX e Interface
- **Tela de Projetos**
  - Grid responsivo de cards com preview de miniaturas
  - Side menu colapsável com lista de projetos organizados por pastas
  - Breadcrumb dinâmico mostrando: Projetos > [Pasta] > [Projeto] > [Aba]
  - Estados vazios informativos ("Nenhum projeto criado ainda")
  - Transições suaves ao trocar de projeto
  - Feedback visual em todas as operações (toasts, animações)
- **Cards de Projeto**
  - Preview com 3-4 miniaturas das primeiras fotos
  - Estatísticas: total de fotos, avaliadas, ⭐5, fase atual
  - Badges de fase: "Em avaliação", "Em contest", "Finalizado"
  - Botões de ação: Editar, Duplicar, Exportar, Deletar
  - Destaque visual no projeto ativo (borda/background diferente)
- **Modais**
  - Modal de criação/edição de projeto (nome e descrição)
  - Modal de seleção de pasta para importação
  - Modais acessíveis com ARIA labels e trap de foco

### ♿ Acessibilidade
- Navegação por teclado completa em todos os componentes
- ARIA labels em todos os elementos interativos
- Side menu acessível com foco e navegação por Tab
- Breadcrumb com navegação semântica
- Estados vazios com mensagens descritivas

### 🧱 Arquitetura
- **Novos Módulos:**
  - `modules/project/project-manager.js`: CRUD de projetos e pastas
  - `modules/project/project-ui.js`: Componentes UI de gerenciamento
  - `modules/export/export-manager.js`: Lógica de exportação para ZIP
  - `modules/export/import-manager.js`: Lógica de importação de ZIP
  - `modules/export/import-folder-selector.js`: Modal de seleção de pasta
- **Modificações no IndexedDB:**
  - Novo object store `contests` com índices otimizados
  - Novo object store `folders` para organização hierárquica
  - Campo `projectId` adicionado em todas as fotos
  - Campo `folderId` em projetos para organização
- **Dependências:**
  - JSZip para criação e leitura de arquivos ZIP (via CDN)

### 🐛 Correções
- Migração automática garante que fotos antigas funcionem sem projeto
- Validação de dados na importação previne corrupção
- Tratamento de erros robusto em todas as operações de export/import
- Sincronização correta de projeto ativo entre componentes

### 📄 Documentação
- Documentos de planejamento: F5.1, F5.2, F5.3_PLAN.md
- Casos de teste: F5.1, F5.2, F5.3_TESTS.md
- README.md atualizado com features da Sprint 5
- Estrutura de arquivos atualizada no README

---

## [v0.4.0] — 2025-10-31 (Sprint 4)
### ✨ Funcionalidades
**Contest Mode - Sistema Elo-Based Non-Repeat Pairwise Ranking:**
- **Interface de Contest**
  - Aba "Contest" funcional com contador de fotos qualificadas (⭐5)
  - Botão "Iniciar Contest" / "Refazer Contest" (habilitado quando ≥ 2 fotos ⭐5)
  - Modal de confirmação ao refazer contest (avisa que resultados anteriores serão apagados)
  - Estados vazios: instruções claras e feedback visual
- **Sistema Pairwise (Non-Repeat)**
  - Cada par de fotos batalha apenas uma vez
  - Total de confrontos: n*(n-1)/2 (todas as combinações possíveis)
  - Pareamento híbrido: Elo similar (60%) + balanceamento de batalhas (40%)
  - Finalização automática quando todas as combinações são esgotadas
  - Exemplo (8 fotos): 28 confrontos únicos possíveis
- **Sistema Elo de Pontuação**
  - Algoritmo Elo (FIDE padrão) para calcular ratings
  - Rating inicial: 1500 para todos
  - K-factor: 32 (balanceado)
  - Atualização após cada confronto
  - Ranking final baseado exclusivamente em Elo (não W-L record)
- **Interface de Batalha Interativa**
  - Layout lado a lado (desktop) ou vertical (mobile)
  - Progresso: "Batalha X de Y (Z pares únicos restantes)"
  - Interação: click, touch, atalhos de teclado
  - Atalhos: 1/← (Foto A), 2/→ (Foto B), Esc (cancelar)
  - Feedback visual: borda verde ao vencer, escala 1.05
  - Toast com mudança de Elo: "Foto A venceu! +16 Elo"
  - Delay 800ms entre confrontos
  - Ranking dinâmico ao lado mostrando posições atualizadas
- **Tela de Resultados**
  - Card do campeão com animações (bounce, gradient, entrance)
  - Foto grande + ícone 🏆
  - Estatísticas: Elo final, vitórias, derrotas, média de batalhas por foto
  - Ranking completo ordenado por Elo final
  - Heatmap de confrontos (clicável para abrir fotos no viewer)
  - Histórico cronológico de confrontos (visualização compacta em 2 colunas, clicável)
  - Botão "🔄 Recomeçar Contest" (com modal de confirmação)
  - Navegação: "Voltar para Avaliação"

**Persistência:**
- Estado do contest salvo no localStorage
- Continuar de onde parou (interromper e voltar)
- Próximo par a batalhar, confrontos realizados, Elo scores
- Histórico completo de batalhas
- Migração automática de estados antigos (bracket → pairwise)

### 🎨 UX e Interface
- **Animações**: pulse no ícone 🏆, bounce no campeão, entrance animations
- **Feedback Visual**: 
  - Borda verde ao vencer
  - Escala e hover nos confrontos
  - Toasts informativos em cada etapa
- **Progresso Detalhado**: "Rodada 2 de 3 / Confronto 1 de 2"
- **Responsividade**: Layout adaptativo (lado a lado → vertical)
- **Estados Vazios**: Mensagens claras e call-to-actions

### ♿ Acessibilidade
- ARIA labels em fotos de batalha
- Navegação por teclado completa (1, 2, ←, →, Esc)
- Foco visível em elementos interativos
- Screen reader friendly

### 📄 Documentação
- Documentos de planejamento: F4.1-F4.4_PLAN.md
- Casos de teste: F4.1-F4.4_TESTS.md (31 casos)
- SPRINTS_4_5_STRATEGY.md (estratégia completa)
- docs/sprint-4/ com toda documentação

---

## [v0.3.0] — 2025-10-31 (Sprint 3)
### ✨ Funcionalidades
**Sistema de Avaliação por Estrelas (1-5):**
- **Componente de Estrelas Interativo**
  - Interface visual de 5 estrelas com feedback em tempo real
  - Hover preview (pré-visualização) ao passar o mouse
  - Suporte completo a touch (mobile)
  - Animações suaves e efeitos visuais (glow, scale)
  - Cor dourada (#FFD700) para estrelas preenchidas
- **Integração no Grid (Aba "Upload")**
  - Estrelas aparecem ao passar mouse sobre o card
  - Sempre visíveis se foto já foi avaliada
  - Click em estrela NÃO abre o viewer (event.stopPropagation)
  - Atualização instantânea do badge após avaliação
- **Integração no Viewer Fullscreen**
  - Estrelas centralizadas abaixo da imagem
  - Atalhos de teclado: 1-5 para avaliar, Shift+0 para resetar zoom
  - Sincronização automática ao navegar (←/→)
  - Feedback visual imediato com toast
- **Aba "Avaliar" Funcional**
  - Interface dedicada para ranqueamento sequencial
  - Foto grande centralizada com estrelas logo abaixo
  - Navegação: botões "← Anterior" e "Próxima →"
  - Progresso em tempo real: "Foto X de Y (Z avaliadas)"
  - Filtro "Mostrar apenas não avaliadas" (checkbox)
  - Estado vazio: "Todas as fotos já foram avaliadas! 🎉"
  - Atalhos de teclado:
    - `←/→`: Navegar entre fotos
    - `1-5`: Avaliar foto atual
    - `0`: Remover avaliação
    - `Esc`: Voltar para aba Upload

**Sistema de Filtros:**
- **Tabs de Filtragem (Aba "Upload")**
  - "Todas" (padrão)
  - "⭐ 5 estrelas" (apenas fotos nota máxima)
  - "Não avaliadas" (fotos sem rating ou rating = 0)
- **Contadores Dinâmicos**
  - Cada tab mostra quantidade de fotos
  - Atualização instantânea ao avaliar
  - Persistência ao fazer upload de novas fotos
- **Interface Responsiva**
  - Tabs horizontais no desktop
  - Dropdown vertical no mobile
  - Transições suaves entre filtros

**Persistência e Metadados:**
- Campo `rating` (0-5) em todas as fotos
- `rating = 0` significa "não avaliado" (padrão)
- Campo `evaluatedAt` (timestamp) quando foto é avaliada
- Índice IndexedDB otimizado para queries de rating
- Migração automática de fotos antigas (adiciona rating = 0)

### 🎨 UX e Interface
- **Feedback Tátil**: Vibração curta no mobile ao avaliar (50ms)
- **Toasts Informativos**: "Avaliada com X estrelas!" / "Avaliação removida"
- **Badges Visuais**:
  - "★ X" (azul) quando foto tem rating
  - "Novo" (roxo) quando foto não tem rating
  - "Cortado" (verde) para fotos divididas em 2×2
  - Empilhamento vertical sem cobrir a imagem
- **Animações Suaves**:
  - Estrelas com scale (1.15x) e glow ao hover
  - Transition em 150ms para todas as interações
  - Drop shadow nas estrelas preenchidas
- **Responsividade**:
  - Estrelas 24px (mobile) → 28px (desktop)
  - Layout da aba "Avaliar" adaptado (vertical no mobile)
  - Filtros em dropdown no mobile, tabs no desktop

### ♿ Acessibilidade (A11Y)
- **Componente de Estrelas**:
  - `role="radiogroup"` no container
  - `role="radio"` e `aria-checked` em cada estrela
  - `aria-label` descritivo: "Avaliação: X de 5 estrelas"
  - Navegação por Tab, Enter/Space para selecionar
  - Setas (←/→) para navegar entre estrelas
- **Atalhos de Teclado Globais**:
  - `1-5`: Avaliar foto em foco no grid
  - `0`: Remover avaliação
  - Não conflita com atalhos existentes (U, S, Esc, Delete)
- **Screen Reader**:
  - Anúncio via `aria-live` ao avaliar
  - Labels claros em todos os controles
  - Progresso acessível na aba "Avaliar"
- **Contraste WCAG AA**: Estrelas douradas ≥ 4.5:1

**Sistema de Ordenação:**
- **8 Opções de Ordenação**:
  - 📅 Data (mais recente/mais antiga)
  - ⭐ Avaliação (maior/menor)
  - 📦 Tamanho em pixels (maior/menor)
  - 📏 Dimensão/Resolução (maior/menor)
- **Persistência**: Preferência salva no localStorage
- **Sincronização**: Mesma ordem em grid, viewer e aba "Avaliar"
- **UI**: Dropdown com ícones semânticos

**Otimizações de UX:**
- **Manutenção de Scroll**:
  - Avaliar nas miniaturas: mantém posição exata
  - Avaliar no viewer: faz scroll ao fechar + destaque visual
  - Dividir/Reverter: mantém foco na foto resultante
- **Viewer com Filtros**: Índices sincronizados (abre foto correta)
- **Botão "Limpar" Contextual**:
  - Respeita filtro ativo (remove apenas fotos visíveis)
  - Mensagem detalhada: "Removerá X foto(s) [filtro]"
- **Layout Responsivo**:
  - Aba "Avaliar" sem scroll (elementos distribuídos)
  - Header compacto (padding reduzido)
  - Grid 1 coluna em telas < 400px (evita vazamento)
- **Estrelas nos Cards**:
  - Tamanho adaptativo: 20px → 16px (mobile) → 18px (mini)
  - `max-width` para nunca vazar do card
  - Gap reduzido em telas pequenas

### 🐛 Correções
- **Migração de Dados**: Fotos antigas recebem `rating = 0` automaticamente
- **Upload**: Novas fotos já incluem `rating = 0` e `uploadedAt`
- **Filtros**: Re-renderização correta ao trocar filtro ativo
- **Viewer**: 
  - Atalho `0` remove rating, `Shift+0` reseta zoom
  - Abre foto correta mesmo com filtros/ordenação ativos
  - Rating visual persiste ao navegar
  - Fecha e faz scroll até última foto visualizada
- **Grid**: 
  - Click em estrelas não abre viewer (stopPropagation)
  - Scroll mantém posição ao avaliar nas miniaturas
  - Ícones adicionados no dropdown de ordenação
- **Aba "Avaliar"**:
  - Atalhos de teclado (1-5) atualizam estrelas visualmente
  - Delay 300ms antes de avançar automaticamente
  - Progresso mostra total geral mesmo com checkbox marcado
  - Foco mantém ao alternar checkbox "apenas não avaliadas"
  - Layout sem scroll em desktop e mobile
  - Botões lado a lado em mobile
- **Badge "Novo"**: Removido ao avaliar, reaparece se rating = 0
- **Tab Navigation**: Todas as 5 estrelas tabuláveis (antes só a 1ª)

### 📄 Documentação
- `SPRINT3_PLAN.md`: Planejamento detalhado com RF/RNF
- `SPRINT3_TESTS.md`: 41 casos de teste (8 categorias)
- `README.md`: Atualizado com features da Sprint 3
- `PROJECT_PLAN.md`: Status da Sprint 3 marcado como concluído
- Código limpo: removidas funções não utilizadas (`blobToDataURL`, `loadImageFromURL`)

---

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