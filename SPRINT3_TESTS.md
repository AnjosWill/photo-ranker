# 🧪 Testes da Sprint 3 — Sistema de Avaliação (⭐ 1–5)

> **Objetivo:** Validar todas as funcionalidades do sistema de avaliação por estrelas implementado na Sprint 3.

---

## 📋 Checklist Geral

### Pré-requisitos
- [ ] Projeto rodando em `http://localhost:5500`
- [ ] IndexedDB limpo (ou com fotos de teste)
- [ ] DevTools aberto (Console + Network)
- [ ] Pelo menos 10 fotos carregadas no sistema

---

## 🧪 Casos de Teste Detalhados

### **CT1 — Componente de Estrelas (Grid)**

**Objetivo:** Validar funcionamento básico do componente de estrelas nos cards da galeria.

#### CT1.1 — Renderização Inicial
- [x] **Passo 1:** Abrir aba "Upload" com fotos carregadas
- [x] **Passo 2:** Verificar que cada card mostra 5 estrelas vazias (cinza/transparente)
- [x] **Passo 3:** Verificar que estrelas estão posicionadas na parte inferior do card
- [x] **✅ Resultado Esperado:** Estrelas visíveis e alinhadas corretamente

#### CT1.2 — Hover Preview
- [x] **Passo 1:** Passar mouse sobre a 3ª estrela de um card
- [x] **Passo 2:** Verificar que estrelas 1, 2 e 3 ficam douradas (preview)
- [x] **Passo 3:** Retirar mouse → estrelas voltam ao estado vazio
- [x] **✅ Resultado Esperado:** Preview visual correto e reversível

#### CT1.3 — Avaliar com Click
- [x] **Passo 1:** Clicar na 4ª estrela de uma foto
- [x] **Passo 2:** Verificar que 4 estrelas ficam preenchidas (dourado)
- [x] **Passo 3:** Verificar toast: "Avaliada com 4 estrelas!"
- [x] **Passo 4:** Verificar badge "★ 4" aparece no card
- [x] **✅ Resultado Esperado:** Rating salvo e visual atualizado

#### CT1.4 — Click não Abre Viewer
- [x] **Passo 1:** Clicar em uma estrela
- [x] **Passo 2:** Verificar que viewer fullscreen NÃO abre
- [ ] **✅ Resultado Esperado:** Event stopPropagation funcionando

#### CT1.5 — Alterar Avaliação
- [ ] **Passo 1:** Foto avaliada com 3 estrelas
- [ ] **Passo 2:** Clicar na 5ª estrela
- [ ] **Passo 3:** Verificar que agora mostra 5 estrelas preenchidas
- [ ] **Passo 4:** Badge atualizado para "★ 5"
- [ ] **✅ Resultado Esperado:** Rating pode ser alterado

#### CT1.6 — Persistência
- [ ] **Passo 1:** Avaliar foto com 5 estrelas
- [ ] **Passo 2:** Recarregar página (F5)
- [ ] **Passo 3:** Verificar que foto ainda mostra 5 estrelas preenchidas
- [ ] **Passo 4:** Verificar badge "★ 5" persiste
- [x] **✅ Resultado Esperado:** Rating persistido no IndexedDB

---

### **CT2 — Viewer Fullscreen**

**Objetivo:** Validar avaliação no modo de visualização fullscreen.

#### CT2.1 — Exibição de Estrelas
- [x] **Passo 1:** Abrir foto no viewer (click em card)
- [x] **Passo 2:** Verificar que estrelas aparecem centralizadas abaixo da imagem
- [ ] **Passo 3:** Verificar que rating atual é exibido corretamente
- [ ] **✅ Resultado Esperado:** Estrelas visíveis e sincronizadas

#### CT2.2 — Atalho de Teclado (Número)
- [ ] **Passo 1:** Viewer aberto
- [ ] **Passo 2:** Pressionar tecla `5`
- [ ] **Passo 3:** Verificar que 5 estrelas ficam preenchidas
- [ ] **Passo 4:** Toast: "Avaliada com 5 estrelas!"
- [ ] **✅ Resultado Esperado:** Atalho funciona

#### CT2.3 — Avaliar com Click no Viewer
- [x] **Passo 1:** Viewer aberto
- [x] **Passo 2:** Clicar na 2ª estrela
- [x] **Passo 3:** Verificar 2 estrelas preenchidas
- [ ] **✅ Resultado Esperado:** Click funciona no viewer

#### CT2.4 — Navegação Mantém Estrelas
- [x] **Passo 1:** Avaliar foto com 4 estrelas
- [x] **Passo 2:** Navegar para próxima foto (→)
- [x] **Passo 3:** Verificar que estrelas resetam ou mostram rating da nova foto
- [x] **Passo 4:** Voltar (←) → 4 estrelas ainda preenchidas na foto anterior
- [ ] **✅ Resultado Esperado:** Rating sincronizado ao navegar

#### CT2.5 — Remover Avaliação (Tecla 0)
- [ ] **Passo 1:** Foto avaliada com 3 estrelas
- [ ] **Passo 2:** Abrir no viewer
- [ ] **Passo 3:** Pressionar tecla `0`
- [ ] **Passo 4:** Verificar que estrelas ficam vazias
- [ ] **Passo 5:** Toast: "Avaliação removida"
- [ ] **Passo 6:** Fechar viewer → badge desapareceu do card
- [ ] **✅ Resultado Esperado:** Rating removido (rating = 0)

#### CT2.6 — Sincronização com Grid
- [x] **Passo 1:** Avaliar foto com 5 estrelas no viewer
- [x] **Passo 2:** Fechar viewer (Esc)
- [x] **Passo 3:** Verificar que card no grid mostra badge "★ 5"
- [ ] **✅ Resultado Esperado:** Grid atualizado automaticamente

---

### **CT3 — Aba "Avaliar"**

**Objetivo:** Validar interface dedicada de ranqueamento sequencial.

#### CT3.1 — Layout e Navegação Inicial
- [x] **Passo 1:** Clicar na aba "Avaliar"
- [ ] **Passo 2:** Verificar que foto grande é exibida centralizada
- [x] **Passo 3:** Verificar estrelas logo abaixo da foto
- [x] **Passo 4:** Verificar botões "← Anterior" e "Próxima →"
- [x] **Passo 5:** Verificar progresso: "Foto 1 de 10 (0 avaliadas)"
- [x] **✅ Resultado Esperado:** Interface completa e funcional

#### CT3.2 — Avaliar Sequencialmente
- [x] **Passo 1:** Na aba "Avaliar", pressionar tecla `4`
- [x] **Passo 2:** Clicar "Próxima →"
- [x] **Passo 3:** Foto seguinte carregada
- [ ] **Passo 4:** Progresso atualizado: "Foto 2 de 10 (1 avaliada)"
- [x] **Passo 5:** Avaliar com 5 estrelas (click)
- [ ] **Passo 6:** Progresso: "Foto 2 de 10 (2 avaliadas)"
- [ ] **✅ Resultado Esperado:** Navegação fluida e progresso correto

#### CT3.3 — Filtro "Apenas Não Avaliadas"
- [x] **Passo 1:** Avaliar 3 fotos das 10 disponíveis
- [x] **Passo 2:** Marcar checkbox "Mostrar apenas não avaliadas"
- [x] **Passo 3:** Verificar que navegação pula fotos já avaliadas
- [x] **Passo 4:** Progresso: "Foto X de 7 (3 avaliadas)"
- [x] **✅ Resultado Esperado:** Filtro funcional e progresso ajustado

#### CT3.4 — Todas Avaliadas
- [ ] **Passo 1:** Avaliar todas as 10 fotos
- [ ] **Passo 2:** Verificar mensagem: "Todas as fotos foram avaliadas! 🎉"
- [ ] **Passo 3:** Botões "Anterior/Próxima" desabilitados
- [ ] **Passo 4:** Opção de "Ver todas novamente" ou "Voltar ao início"
- [ ] **✅ Resultado Esperado:** Estado vazio tratado corretamente

#### CT3.5 — Atalhos de Teclado
- [ ] **Passo 1:** Na aba "Avaliar", pressionar `←` (seta esquerda)
- [ ] **Passo 2:** Foto anterior carregada
- [ ] **Passo 3:** Pressionar `→` (seta direita)
- [ ] **Passo 4:** Próxima foto carregada
- [ ] **Passo 5:** Pressionar `Esc`
- [ ] **Passo 6:** Voltar para aba "Upload"
- [ ] **✅ Resultado Esperado:** Todos os atalhos funcionam

#### CT3.6 — Responsividade Mobile
- [ ] **Passo 1:** Redimensionar janela para 375px (mobile)
- [ ] **Passo 2:** Verificar que foto, estrelas e botões ficam verticais
- [ ] **Passo 3:** Estrelas com tamanho de toque adequado (44px)
- [ ] **✅ Resultado Esperado:** Layout adaptado para mobile

---

### **CT4 — Filtros (Aba "Upload")**

**Objetivo:** Validar sistema de filtros de visualização.

#### CT4.1 — Filtro "Todas"
- [x] **Passo 1:** 10 fotos no sistema (3 com ★5, 2 sem rating, 5 com outras notas)
- [x] **Passo 2:** Selecionar filtro "Todas"
- [x] **Passo 3:** Verificar que 10 fotos são exibidas
- [x] **Passo 4:** Contador: "10 imagens"
- [x] **✅ Resultado Esperado:** Todas as fotos visíveis

#### CT4.2 — Filtro "⭐ 5 Estrelas"
- [x] **Passo 1:** Selecionar filtro "⭐ 5 estrelas"
- [x] **Passo 2:** Verificar que apenas 3 fotos são exibidas
- [x] **Passo 3:** Contador: "3 imagens"
- [x] **Passo 4:** Todas visíveis têm badge "★ 5"
- [x] **✅ Resultado Esperado:** Filtro correto

#### CT4.3 — Filtro "Não Avaliadas"
- [x] **Passo 1:** Selecionar filtro "Não avaliadas"
- [x] **Passo 2:** Verificar que apenas 2 fotos são exibidas
- [x] **Passo 3:** Contador: "2 imagens"
- [x] **Passo 4:** Nenhuma das visíveis tem badge de rating
- [x] **✅ Resultado Esperado:** Filtro correto

#### CT4.4 — Persistência do Filtro
- [x] **Passo 1:** Selecionar filtro "⭐ 5 estrelas"
- [x] **Passo 2:** Fazer upload de nova foto (sem rating)
- [x] **Passo 3:** Verificar que grid ainda mostra apenas ★5
- [x] **Passo 4:** Nova foto NÃO aparece (pois não tem rating 5)
- [x] **✅ Resultado Esperado:** Filtro persiste

#### CT4.5 — Badge no Tab
- [x] **Passo 1:** 3 fotos com ★5
- [x] **Passo 2:** Verificar badge no tab "Upload": "⭐ 3"
- [x] **Passo 3:** Avaliar mais uma foto com 5 estrelas
- [x] **Passo 4:** Badge atualizado: "⭐ 4"
- [x] **✅ Resultado Esperado:** Badge dinâmico

#### CT4.6 — Filtro Vazio
- [x] **Passo 1:** Selecionar filtro "⭐ 5 estrelas"
- [x] **Passo 2:** Nenhuma foto com rating 5
- [ ] **Passo 3:** Verificar mensagem: "Nenhuma foto com 5 estrelas ainda."
- [ ] **Passo 4:** Link para voltar ao filtro "Todas"
- [ ] **✅ Resultado Esperado:** Estado vazio tratado

---

### **CT5 — Acessibilidade (A11Y)**

**Objetivo:** Garantir conformidade WCAG AA.

#### CT5.1 — Navegação por Teclado
- [ ] **Passo 1:** Usar Tab para navegar até estrelas
- [ ] **Passo 2:** Foco visível (outline) em cada estrela
- [ ] **Passo 3:** Pressionar Enter ou Space → estrela selecionada
- [ ] **✅ Resultado Esperado:** Navegação 100% funcional

#### CT5.2 — Screen Reader (NVDA/VoiceOver)
- [ ] **Passo 1:** Ativar screen reader
- [ ] **Passo 2:** Focar em grupo de estrelas
- [ ] **Passo 3:** Anúncio: "Avaliação da foto, radiogroup"
- [ ] **Passo 4:** Navegar entre estrelas
- [ ] **Passo 5:** Anúncio: "3 estrelas, radio button, not checked"
- [ ] **Passo 6:** Selecionar estrela
- [ ] **Passo 7:** `aria-live`: "Avaliada com 3 estrelas"
- [ ] **✅ Resultado Esperado:** Anúncios corretos

#### CT5.3 — Contraste (WCAG)
- [ ] **Passo 1:** Abrir DevTools → Lighthouse → Accessibility
- [ ] **Passo 2:** Verificar que estrelas douradas têm contraste ≥ 4.5:1
- [ ] **Passo 3:** Verificar estrelas vazias têm contraste ≥ 3:1 (large text)
- [ ] **✅ Resultado Esperado:** Sem erros de contraste

#### CT5.4 — ARIA Attributes
- [ ] **Passo 1:** Inspecionar HTML das estrelas
- [ ] **Passo 2:** Verificar `role="radiogroup"` no container
- [ ] **Passo 3:** Verificar `role="radio"` em cada estrela
- [ ] **Passo 4:** Verificar `aria-checked="true"` na estrela selecionada
- [ ] **Passo 5:** Verificar `aria-label` descritivo
- [ ] **✅ Resultado Esperado:** Todos atributos presentes

---

### **CT6 — Performance**

**Objetivo:** Validar conformidade com RNF de performance.

#### CT6.1 — Renderização do Grid Filtrado
- [ ] **Passo 1:** Carregar 100 fotos
- [ ] **Passo 2:** Abrir DevTools → Performance
- [ ] **Passo 3:** Selecionar filtro "⭐ 5 estrelas"
- [ ] **Passo 4:** Parar gravação e medir tempo de renderização
- [ ] **✅ Resultado Esperado:** < 50ms

#### CT6.2 — Atualização de Rating
- [ ] **Passo 1:** DevTools → Performance
- [ ] **Passo 2:** Iniciar gravação
- [ ] **Passo 3:** Clicar em estrela para avaliar
- [ ] **Passo 4:** Parar gravação
- [ ] **Passo 5:** Medir tempo total (UI + IndexedDB)
- [ ] **✅ Resultado Esperado:** < 100ms

#### CT6.3 — Query de Filtros
- [ ] **Passo 1:** Console → `console.time('filter')`
- [ ] **Passo 2:** Executar `getAllPhotos().then(photos => photos.filter(p => p.rating === 5))`
- [ ] **Passo 3:** `console.timeEnd('filter')`
- [ ] **✅ Resultado Esperado:** < 10ms para 100 fotos

---

### **CT7 — Edge Cases**

**Objetivo:** Validar comportamento em situações extremas.

#### CT7.1 — Foto Cortada (2×2)
- [ ] **Passo 1:** Dividir foto em 2×2 (4 quadrantes)
- [ ] **Passo 2:** Avaliar cada quadrante com notas diferentes
- [ ] **Passo 3:** Verificar que cada um mantém rating independente
- [ ] **Passo 4:** Reverter foto (restaurar original)
- [ ] **Passo 5:** Verificar que original NÃO tem rating (ou mantém rating anterior)
- [ ] **✅ Resultado Esperado:** Ratings independentes por foto

#### CT7.2 — Upload Durante Filtro Ativo
- [ ] **Passo 1:** Ativar filtro "⭐ 5 estrelas"
- [ ] **Passo 2:** Fazer upload de 5 novas fotos
- [ ] **Passo 3:** Verificar que novas fotos NÃO aparecem (rating = 0)
- [ ] **Passo 4:** Voltar para filtro "Todas"
- [ ] **Passo 5:** Verificar que 5 novas fotos estão lá
- [ ] **✅ Resultado Esperado:** Filtro consistente

#### CT7.3 — Remover Foto Avaliada
- [ ] **Passo 1:** 10 fotos, 3 com ★5
- [ ] **Passo 2:** Remover 1 foto com ★5
- [ ] **Passo 3:** Filtro "⭐ 5 estrelas" → agora mostra 2 fotos
- [ ] **Passo 4:** Badge no tab atualizado: "⭐ 2"
- [ ] **✅ Resultado Esperado:** Contadores atualizados

#### CT7.4 — Avaliar Rapidamente (Spam de Clicks)
- [ ] **Passo 1:** Clicar rapidamente várias estrelas diferentes (1, 5, 3, 2)
- [ ] **Passo 2:** Verificar que apenas última clicada é salva
- [ ] **Passo 3:** Sem erros no console
- [ ] **✅ Resultado Esperado:** Debounce ou última ação prevalece

#### CT7.5 — Sem Fotos no Sistema
- [ ] **Passo 1:** IndexedDB vazio
- [ ] **Passo 2:** Abrir aba "Avaliar"
- [ ] **Passo 3:** Verificar mensagem: "Nenhuma foto para avaliar. Faça upload primeiro!"
- [ ] **Passo 4:** Link para aba "Upload"
- [ ] **✅ Resultado Esperado:** Estado vazio tratado

---

### **CT8 — Cross-Browser e Mobile**

**Objetivo:** Garantir compatibilidade multiplataforma.

#### CT8.1 — Chrome (Desktop)
- [ ] Executar CT1 a CT7
- [ ] **✅ Resultado:** Todos passando

#### CT8.2 — Firefox (Desktop)
- [ ] Executar CT1 a CT7
- [ ] **✅ Resultado:** Todos passando

#### CT8.3 — Safari (Desktop/Mac)
- [ ] Executar CT1 a CT7
- [ ] **✅ Resultado:** Todos passando

#### CT8.4 — Chrome Mobile (Android)
- [ ] Touch nas estrelas funciona
- [ ] Vibração ao avaliar (se implementado)
- [ ] Layout responsivo correto
- [ ] **✅ Resultado:** Funcional

#### CT8.5 — Safari Mobile (iOS)
- [ ] Touch nas estrelas funciona
- [ ] Layout responsivo correto
- [ ] Sem erros no console
- [ ] **✅ Resultado:** Funcional

---

## 📊 Resumo de Validação

### Critérios de Aceitação

| Área | Testes | Passaram | % |
|------|--------|----------|---|
| Componente Base | 6 | — | — |
| Viewer Fullscreen | 6 | — | — |
| Aba "Avaliar" | 6 | — | — |
| Filtros | 6 | — | — |
| Acessibilidade | 4 | — | — |
| Performance | 3 | — | — |
| Edge Cases | 5 | — | — |
| Cross-Browser | 5 | — | — |
| **TOTAL** | **41** | **—** | **—%** |

### ✅ Definition of Done

A Sprint 3 será aprovada se:
- [ ] **≥ 95% dos testes passando** (máximo 2 falhas não críticas)
- [ ] **0 erros críticos** (acessibilidade, performance, data loss)
- [ ] **Lighthouse Accessibility ≥ 95**
- [ ] **Performance conforme RNF2**
- [ ] **Sem `console.error` em produção**

---

## 🐛 Registro de Bugs (Preencher Durante Testes)

### Bug #1
- **Teste:** CT_____
- **Descrição:** _______
- **Severidade:** Crítica / Alta / Média / Baixa
- **Status:** Aberto / Corrigido

### Bug #2
- **Teste:** CT_____
- **Descrição:** _______
- **Severidade:** Crítica / Alta / Média / Baixa
- **Status:** Aberto / Corrigido

*(Adicionar mais conforme necessário)*

---

## 📝 Notas Finais

- **Ambiente de Teste:** Chrome 118+, Firefox 119+, Safari 17+
- **Resolução Mobile:** 375×667 (iPhone SE) e 393×851 (Pixel 5)
- **Screen Reader:** NVDA (Windows), VoiceOver (Mac/iOS)
- **Ferramentas:** DevTools, Lighthouse, axe DevTools

**Data de Execução:** _____  
**Executor:** _____  
**Resultado:** ✅ Aprovado / ❌ Reprovado / ⚠️ Aprovado com ressalvas

