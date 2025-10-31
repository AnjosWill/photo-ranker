# 📋 Sprint 3 — Sistema de Avaliação (⭐ 1–5)

> **Objetivo:** Adicionar sistema completo de avaliação por estrelas (1 a 5), filtros de visualização e interface dedicada de ranqueamento.

---

## 📦 Escopo da Sprint

### 🎯 Objetivos Principais
1. **Interface de Avaliação por Estrelas**
   - Componente visual de 5 estrelas interativo (hover, click, touch)
   - Disponível nos cards (grid) e viewer fullscreen
   - Atalhos de teclado (1, 2, 3, 4, 5) para avaliação rápida
   
2. **Aba "Avaliar" Funcional**
   - Interface dedicada para ranqueamento sequencial
   - Navegação foto a foto (anterior/próxima)
   - Progresso visual ("X de Y avaliadas")
   - Filtro: mostrar apenas não avaliadas
   
3. **Sistema de Filtros**
   - "Todas" (padrão)
   - "⭐ 5 estrelas" (apenas fotos nota máxima)
   - "Não avaliadas" (fotos sem rating ou rating = 0)
   - Contador atualizado por filtro
   
4. **Persistência e Metadados**
   - Campo `rating` (0-5) persistido no IndexedDB
   - Índice para consultas rápidas por rating
   - Badge visual mostrando nota nos cards

---

## 🧩 Requisitos Funcionais (RF)

### RF1 — Componente de Estrelas
- **RF1.1**: Exibir 5 estrelas vazias por padrão
- **RF1.2**: Preencher estrelas de acordo com rating atual (1-5)
- **RF1.3**: Hover mostra preview da nota (preenchimento temporário)
- **RF1.4**: Click/tap define a nota permanentemente
- **RF1.5**: Atalhos de teclado (1, 2, 3, 4, 5) para avaliação rápida
- **RF1.6**: Feedback visual imediato (transição suave)
- **RF1.7**: Indicador de "sem avaliação" (0 estrelas vazias + texto "Não avaliado")

### RF2 — Integração no Grid (Aba "Upload")
- **RF2.1**: Estrelas visíveis na parte inferior de cada card (sobreposição sutil)
- **RF2.2**: Click em estrela NÃO abre o viewer (event.stopPropagation)
- **RF2.3**: Atualização instantânea no card após rating
- **RF2.4**: Badge "★ X" visível após avaliação (ex: "★ 5")

### RF3 — Integração no Viewer Fullscreen
- **RF3.1**: Estrelas centralizadas abaixo da imagem
- **RF3.2**: Atalhos 1-5 funcionam mesmo com viewer aberto
- **RF3.3**: Navegação (←/→) mantém estrelas visíveis
- **RF3.4**: Rating salvo automaticamente ao trocar de foto

### RF4 — Aba "Avaliar"
- **RF4.1**: Layout centralizado com foto grande e estrelas
- **RF4.2**: Botões "← Anterior" e "Próxima →" (WCAG 44px)
- **RF4.3**: Progresso: "Foto 3 de 15 (5 avaliadas)"
- **RF4.4**: Filtro toggle: "Mostrar apenas não avaliadas"
- **RF4.5**: Estado vazio: "Todas as fotos já foram avaliadas! 🎉"
- **RF4.6**: Atalhos:
  - `←/→`: Navegar entre fotos
  - `1-5`: Avaliar foto atual
  - `0`: Remover avaliação
  - `Esc`: Voltar para aba Upload

### RF5 — Sistema de Filtros (Aba "Upload")
- **RF5.1**: Dropdown/Tabs para seleção de filtro:
  - "Todas" (padrão)
  - "⭐ 5 estrelas"
  - "Não avaliadas"
- **RF5.2**: Grid atualizado instantaneamente ao trocar filtro
- **RF5.3**: Contador reflete quantidade filtrada: "8 imagens (⭐5)"
- **RF5.4**: Filtro persiste ao fazer upload de novas fotos
- **RF5.5**: Badge no tab "Upload" mostrando quantidade de fotos nota 5

### RF6 — Persistência
- **RF6.1**: Campo `rating` (number, 0-5) adicionado ao objeto Photo
- **RF6.2**: Rating=0 significa "não avaliado" (padrão para fotos novas)
- **RF6.3**: Salvar rating automaticamente via `savePhotos()`
- **RF6.4**: Índice `rating` no IndexedDB para queries otimizadas

---

## 🎨 Requisitos Não Funcionais (RNF)

### RNF1 — UX e Usabilidade
- **RNF1.1**: Feedback tátil no mobile (vibração curta ao avaliar)
- **RNF1.2**: Animação suave das estrelas (fade/scale) ao preencher
- **RNF1.3**: Cor dourada (#FFD700) para estrelas preenchidas
- **RNF1.4**: Contraste mínimo WCAG AA (4.5:1) entre estrela e fundo
- **RNF1.5**: Tooltip ao passar sobre estrela: "Avaliar com X estrela(s)"
- **RNF1.6**: Toast de confirmação: "Avaliada com 5 estrelas!"
- **RNF1.7**: Estrelas com tamanho mínimo de toque: 44×44px (WCAG)

### RNF2 — Performance
- **RNF2.1**: Renderização do grid < 50ms para até 100 fotos filtradas
- **RNF2.2**: Atualização de rating < 100ms (UI + IndexedDB)
- **RNF2.3**: Query de filtros otimizada via índice (< 10ms)

### RNF3 — Responsividade
- **RNF3.1**: Estrelas responsivas: 24px (mobile) → 32px (desktop)
- **RNF3.2**: Layout da aba "Avaliar" adaptado para mobile (vertical)
- **RNF3.3**: Filtros em dropdown no mobile, tabs no desktop

### RNF4 — Acessibilidade
- **RNF4.1**: Componente de estrelas com `role="radiogroup"`
- **RNF4.2**: Cada estrela com `role="radio"` e `aria-checked`
- **RNF4.3**: Label ARIA: "Avaliação: X de 5 estrelas"
- **RNF4.4**: Navegação por Tab entre estrelas
- **RNF4.5**: Enter/Space também ativa estrela (além de click)
- **RNF4.6**: Anúncio via `aria-live` ao avaliar: "Avaliado com 4 estrelas"

### RNF5 — Compatibilidade
- **RNF5.1**: Funciona em Chrome, Firefox, Safari, Edge (últimas 2 versões)
- **RNF5.2**: Suporte touch completo (iOS, Android)
- **RNF5.3**: Degradação elegante em navegadores antigos (estrelas simples)

---

## 📐 Estrutura de Dados

### Photo Object (Estendido)
```javascript
{
  id: string,              // UUID
  thumb: string,           // base64 DataURL
  w: number,               // largura
  h: number,               // altura
  rating: number,          // ⭐ NOVO: 0-5 (0 = não avaliado)
  
  // Sprint 2 (existente)
  _parentId?: string,      // ID da foto original (se cortada)
  _quadrant?: string,      // "top-left", "top-right", etc
  _isSplit?: boolean,      // true se foi dividida
  
  // Metadados
  uploadedAt: number,      // timestamp
  evaluatedAt?: number     // ⭐ NOVO: timestamp da última avaliação
}
```

### Filtros (State Local)
```javascript
{
  currentFilter: 'all' | 'rated5' | 'unrated',
  filteredPhotos: Photo[],  // Cache do resultado filtrado
  counts: {
    all: number,
    rated5: number,
    unrated: number
  }
}
```

---

## 🎨 Design do Componente de Estrelas

### HTML
```html
<div class="star-rating" role="radiogroup" aria-label="Avaliação da foto">
  <button class="star" role="radio" aria-checked="false" aria-label="1 estrela" data-value="1">★</button>
  <button class="star" role="radio" aria-checked="false" aria-label="2 estrelas" data-value="2">★</button>
  <button class="star" role="radio" aria-checked="false" aria-label="3 estrelas" data-value="3">★</button>
  <button class="star" role="radio" aria-checked="false" aria-label="4 estrelas" data-value="4">★</button>
  <button class="star" role="radio" aria-checked="false" aria-label="5 estrelas" data-value="5">★</button>
</div>
```

### CSS (Principais Regras)
```css
.star-rating {
  display: flex;
  gap: 4px;
  justify-content: center;
}

.star {
  font-size: 28px;
  color: rgba(255, 255, 255, 0.25); /* vazio */
  transition: color 0.15s ease, transform 0.1s ease;
  cursor: pointer;
  background: none;
  border: none;
  padding: 8px;
  min-width: 44px;
  min-height: 44px;
}

.star:hover,
.star.hover {
  color: rgba(255, 215, 0, 0.6); /* preview */
  transform: scale(1.1);
}

.star.filled,
.star[aria-checked="true"] {
  color: #FFD700; /* dourado */
}

.star:active {
  transform: scale(0.95);
}
```

---

## 🧱 Arquitetura de Código

### Novos Arquivos
- **`public/scripts/rating.js`**: Módulo dedicado ao componente de estrelas
  - `createStarRating(currentRating, onChange)`: Factory do componente
  - `updateStarRating(element, newRating)`: Atualizar visualmente
  - Lógica de hover, click, touch, keyboard

### Arquivos Modificados

#### `public/index.html`
- Adicionar filtros na aba "Upload" (acima do grid)
- Implementar conteúdo da aba "Avaliar" (atualmente placeholder)
- Adicionar container para estrelas no viewer fullscreen

#### `public/scripts/app.js`
- Importar `rating.js`
- Adicionar estado de filtro global
- Implementar funções:
  - `setRating(photoId, rating)`: Salva rating no DB
  - `applyFilter(filterType)`: Atualiza grid filtrado
  - `openRateView()`: Lógica da aba "Avaliar"
  - `updateRatingInViewer()`: Sincroniza rating no viewer
- Listener de atalhos 1-5 (global e no viewer)

#### `public/scripts/db.js`
- Adicionar índice `rating` no `onupgradeneeded` (se não existir)
- Implementar query helper: `getPhotosByRating(rating)` (opcional, pode usar filter client-side)

#### `public/styles/components.css`
- Estilos do componente `.star-rating`
- Estilos da aba "Avaliar" (`.rate-view`, `.rate-container`)
- Estilos dos filtros (`.filter-tabs`, `.filter-dropdown`)
- Ajustes nos cards para comportar estrelas (`.photo-rating-overlay`)

---

## 🧪 Casos de Teste

### CT1 — Avaliar Foto no Grid
1. Abrir aba "Upload" com fotos carregadas
2. Passar mouse sobre estrelas de uma foto → preview visual
3. Clicar na 4ª estrela → foto avaliada com 4 estrelas
4. Verificar badge "★ 4" no card
5. Recarregar página → rating persiste

### CT2 — Avaliar Foto no Viewer
1. Abrir viewer fullscreen (click em foto)
2. Pressionar tecla `5` → foto avaliada com 5 estrelas
3. Navegar para próxima foto (→) → estrelas resetam ou mostram rating existente
4. Fechar viewer → badge atualizado no grid

### CT3 — Aba "Avaliar"
1. Abrir aba "Avaliar"
2. Ver foto centralizada + estrelas + progresso
3. Avaliar com 3 estrelas (click ou tecla)
4. Clicar "Próxima →" → foto seguinte carregada
5. Marcar "Apenas não avaliadas" → pula fotos já avaliadas
6. Avaliar todas → mensagem de conclusão aparece

### CT4 — Filtros
1. Aba "Upload" com 10 fotos (3 com ⭐5, 2 sem avaliação, 5 com outras notas)
2. Selecionar filtro "⭐ 5 estrelas" → apenas 3 fotos exibidas
3. Contador mostra "3 imagens"
4. Selecionar "Não avaliadas" → 2 fotos exibidas
5. Voltar para "Todas" → 10 fotos exibidas
6. Fazer upload de nova foto → filtro mantém (mas mostra nova se aplicável)

### CT5 — Remover Avaliação
1. Foto avaliada com 4 estrelas
2. Abrir viewer → pressionar `0` → rating removido
3. Verificar que badge desaparece
4. Confirmar no IndexedDB que `rating = 0`

### CT6 — Acessibilidade
1. Navegar para estrelas com Tab
2. Usar Enter/Space para selecionar
3. Screen reader anuncia "Avaliação: 3 de 5 estrelas"
4. Verificar contraste (DevTools) ≥ 4.5:1

---

## 📊 Indicadores de Sucesso

- [ ] ✅ Todas as fotos podem ser avaliadas (grid, viewer, aba "Avaliar")
- [ ] ✅ Atalhos 1-5 funcionam em todos os contextos
- [ ] ✅ Filtros retornam resultados corretos instantaneamente
- [ ] ✅ Rating persiste após refresh
- [ ] ✅ Badge visual correto em todos os cards
- [ ] ✅ Aba "Avaliar" permite ranquear todas as fotos sequencialmente
- [ ] ✅ Acessibilidade (screen reader + teclado) 100% funcional
- [ ] ✅ Performance: atualização < 100ms, filtro < 50ms

---

## 🚀 Entregáveis

1. **Código funcional**:
   - `public/scripts/rating.js` (novo)
   - `public/scripts/app.js` (modificado)
   - `public/scripts/db.js` (índice rating)
   - `public/index.html` (aba "Avaliar" + filtros)
   - `public/styles/components.css` (estilos)

2. **Documentação**:
   - `SPRINT3_TESTS.md` (casos de teste detalhados)
   - `CHANGELOG.md` (v0.3.0)
   - `README.md` (features da Sprint 3)
   - `PROJECT_PLAN.md` (atualizar status)

3. **Git**:
   - Branch: `feature/sprint-3-rating`
   - Commits semânticos (feat, fix, docs)
   - Tag: `v0.3.0` após merge na `main`

---

## 🔄 Roadmap de Implementação

### Fase 1: Componente Base (2-3h)
1. Criar `rating.js` com componente de estrelas
2. CSS completo com animações e responsividade
3. Testes unitários do componente (hover, click, keyboard)

### Fase 2: Integração Grid (1-2h)
1. Adicionar estrelas nos cards (overlay)
2. Event handlers (stopPropagation)
3. Atualização de badge após rating

### Fase 3: Viewer Fullscreen (1h)
1. Container de estrelas abaixo da imagem
2. Atalhos de teclado 1-5
3. Sincronização ao navegar

### Fase 4: Aba "Avaliar" (2-3h)
1. HTML/CSS da interface
2. Lógica de navegação sequencial
3. Filtro "apenas não avaliadas"
4. Progresso e estado vazio

### Fase 5: Filtros (1-2h)
1. UI dos filtros (tabs ou dropdown)
2. Lógica de filtragem
3. Contadores dinâmicos
4. Persistência do filtro ativo (localStorage)

### Fase 6: Testes e Refinamento (2h)
1. Executar todos os casos de teste
2. Ajustes de UX (toasts, feedbacks)
3. Auditoria de acessibilidade
4. Performance profiling

### Fase 7: Documentação e Release (1h)
1. Atualizar todos os docs
2. Criar tag v0.3.0
3. Merge na main

**Estimativa total:** 10-15 horas

---

## 📝 Notas Técnicas

### Índice IndexedDB
```javascript
// idb.js - onupgradeneeded
if (db.objectStoreNames.contains(STORE)) {
  const store = db.transaction(STORE, 'readwrite').objectStore(STORE);
  if (!store.indexNames.contains('rating')) {
    store.createIndex('rating', 'rating', { unique: false });
  }
}
```

### Migration de Fotos Antigas
```javascript
// Ao carregar, garantir que todas as fotos têm rating
async function ensureRatingField() {
  const photos = await getAllPhotos();
  const needsUpdate = photos.filter(p => typeof p.rating !== 'number');
  if (needsUpdate.length > 0) {
    const updated = needsUpdate.map(p => ({ ...p, rating: 0 }));
    await savePhotos(updated);
  }
}
```

---

## ✅ Definition of Done

A Sprint 3 será considerada **CONCLUÍDA** quando:

1. ✅ Todos os RF e RNF implementados
2. ✅ Todos os CT executados e passando
3. ✅ Acessibilidade auditada (axe DevTools) sem erros críticos
4. ✅ Performance conforme RNF2 (< 50ms grid, < 100ms rating)
5. ✅ Código revisado (sem console.log, TODOs resolvidos)
6. ✅ Documentação completa (README, CHANGELOG, PROJECT_PLAN)
7. ✅ Branch mergeada na `main` e tag `v0.3.0` criada
8. ✅ Demo funcional (gravação ou apresentação ao usuário)

---

**Data de Início:** 31/10/2025  
**Data Prevista de Conclusão:** 02/11/2025  
**Responsável:** Cursor AI + Usuário (validação e testes)

