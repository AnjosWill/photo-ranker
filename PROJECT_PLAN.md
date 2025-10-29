# 🧠 Photo Ranker — Contexto, Arquitetura e Diretrizes de Desenvolvimento

> Documento base para o desenvolvimento contínuo do projeto **Photo Ranker**, servindo como guia para o Cursor e demais ferramentas automáticas compreenderem **estrutura, contexto, UX, arquitetura e fluxo de evolução por sprints**.

---

## 📌 1. Visão Geral do Projeto
O **Photo Ranker** é uma aplicação **HTML + CSS + JavaScript (ESM)**, **mobile-first e responsiva**, projetada para:
1. Fazer upload de várias imagens (individuais ou compostas 2×2);
2. Separar automaticamente as fotos individuais;
3. Permitir avaliar cada imagem com notas em estrelas (1 a 5);
4. Entrar em uma fase de confronto entre as fotos com nota 5 até encontrar a campeã.

O projeto tem foco em **UX fluida, performance local, acessibilidade (A11Y)** e **usabilidade mobile-first**.

---

## ⚙️ 2. Arquitetura e Tecnologias

| Camada | Descrição |
|--------|------------|
| **Frontend** | HTML + CSS + JS nativos, modulares (ESM). Nenhum framework. |
| **Armazenamento local** | IndexedDB (módulo `db.js`) para persistir fotos e metadados. |
| **Diretórios principais** | `public/` (frontend), `scripts/`, `styles/`, `assets/`. |
| **Servidor de dev** | `http-server` (`npm run dev` → http://localhost:5500). |
| **Design tokens** | Definidos em `base.css` (`--brand`, `--bg`, `--fg`, etc.). |
| **Controle de versão** | Git + GitHub (`main` = estável, `feature/sprint-x` = evolução). |

---

## 🧱 3. Estrutura do Projeto

photo-ranker/
│
├── public/
│   ├── index.html
│   ├── styles/
│   │   ├── base.css
│   │   └── components.css
│   ├── scripts/
│   │   ├── app.js
│   │   ├── db.js
│   │   ├── idb.js
│   │   ├── image-utils.js
│   │   ├── ui.js
│   │   ├── cropper.js        ← Sprint 2
│   │   └── quad-worker.js    ← Sprint 2
│   ├── assets/
│   └── …
│
├── package.json
├── PROJECT_PLAN.md            ← Documento base para o Cursor
├── README.md
└── CHANGELOG.md

---

## 🚀 4. Status Atual (Sprint 1 concluída — `v0.1.0`)

### ✅ Funcionalidades já implementadas
- Upload múltiplo de imagens (input ou arrastar);
- **Progresso global** de upload (por quantidade, não bytes);
- Persistência via IndexedDB;
- Grid responsivo (2–4 colunas);
- Viewer fullscreen com navegação (← → Esc);
- Remoção com modal de confirmação;
- Modo **selecionar múltiplas** imagens com barra de ações;
- Botão **Limpar inteligente**:
  - com seleção → remove apenas selecionadas;
  - sem seleção → abre modal de confirmação;
- Microinterações (hover, toasts, foco visível);
- Acessibilidade: atalhos (`U`, `S`, `Del`, `Esc`).

### 🧩 Arquivos principais
- `app.js` → lógica e integração UI ↔ DB.
- `components.css` → estilos e microinterações.
- `base.css` → layout, tokens e responsividade.
- `index.html` → estrutura principal e containers de modais.

---

## 🔧 5. Sprint 2 — Detecção 2×2 e Cropper Manual (em andamento)

### 🎯 Objetivo
Permitir detectar automaticamente e cortar manualmente fotos compostas (4 rostos em uma imagem).

### 📦 Entregas desta sprint
| Item | Descrição |
|------|------------|
| 🧠 Worker `quad-worker.js` | Detectar automaticamente imagens 2×2 e sugerir cortes. |
| ✂️ `cropper.js` | Modal de corte com guias ajustáveis e preview. |
| 💾 Integração IndexedDB | Cada quadrante salvo como foto independente. |
| 🧍 UX | Cancelar (Esc), confirmar corte, feedback visual. |
| 🧩 Integração app.js | Abrir cropper automático após upload de imagens candidatas. |

### 📂 Arquivos que podem ser alterados
- `scripts/app.js`
- `scripts/cropper.js`
- `scripts/quad-worker.js`
- `styles/components.css`
- `index.html`

---

## ⭐ 6. Sprint 3 — Sistema de Avaliação (⭐ 1–5)

### 🎯 Objetivo
Adicionar o sistema de notas e filtros de visualização.

### 📦 Entregas previstas
- Interface de avaliação por estrelas no grid e viewer;
- Persistência da nota (`rating`) no IndexedDB;
- Filtros rápidos (“Todas”, “⭐5”, “Não avaliadas”);
- Microinterações e foco de acessibilidade (`role="radiogroup"`).

---

## 🏆 7. Sprint 4 — Contest Mode (Comparação Direta)

### 🎯 Objetivo
Permitir escolher a melhor foto entre as de nota 5 via confrontos diretos.

### 📦 Entregas previstas
- Tela de confronto exibindo duas fotos lado a lado;
- Sistema de votação (Elo/knock-out);
- Feedback de progresso (“3 de 10 confrontos”);
- Tela final de campeão;
- Persistência da foto vencedora e ranking.

---

## ⚙️ 8. Sprint 5 — Refinamento e Release Final

### 🎯 Objetivo
Preparar o MVP final (v1.0.0) para release público.

### 📦 Entregas previstas
- Cache + lazy-load;
- Exportação/importação de dados (JSON/ZIP);
- Melhorias visuais (modo claro, tema dinâmico);
- Auditoria de acessibilidade;
- Documentação final (`README` e `CHANGELOG` completos).

---

## 🧩 9. Convenções de Desenvolvimento

| Tipo | Exemplo | Descrição |
|------|----------|------------|
| **Branch** | `feature/sprint-2-cut-2x2` | Uma sprint ou grande feature. |
| **Tag** | `v0.1.0`, `v0.2.0` | Marca conclusão de sprint. |
| **Commit** | `feat: add cropper modal` | Padrão Conventional Commits. |
| **Release** | `v1.0.0` | Apenas quando MVP completo. |

---

## 🧠 10. Diretrizes para o Cursor (ou LLMs auxiliares)

> ⚙️ Sempre seguir estas instruções ao propor, gerar ou editar código neste projeto.

### 🔹 Linguagem e stack
- Usar apenas **HTML5, CSS3 e JavaScript (ESM)**.
- Não incluir frameworks (React, Vue, etc).
- Código modular, limpo e documentado.
- Compatível com browsers modernos.

### 🔹 UX e Acessibilidade
- Layout **mobile-first** e responsivo.
- Seguir heurísticas de usabilidade de Nielsen.
- Garantir foco visível, navegação por teclado e ARIA roles.
- Cada ação deve ter feedback imediato (toast, loading, progress).

### 🔹 UI
- Utilizar tokens definidos em `base.css`.
- Evitar novas cores ou estilos sem propósito funcional.
- Seguir padrões: botões primários, secundários, destrutivos.

### 🔹 Arquitetura
- Scripts separados por responsabilidade (`db`, `cropper`, `app`).
- Nenhuma lógica inline no HTML.
- Módulos importados via ESM.
- Uso de IndexedDB e APIs nativas.

### 🔹 Git & Sprints
- Cada sprint desenvolvida em branch própria.
- Commitar granularmente e usar mensagens semânticas.
- Atualizar `CHANGELOG.md`, `README.md` e `PROJECT_PLAN.md` antes de cada tag.

---

## 🔮 11. Evolução Futura — Gerenciamento de Contextos e Múltiplos Contests

> **Visão de longo prazo** para as Sprints 4 e 5, preparando o sistema para suportar múltiplos projetos, persistência de estado e exportação/importação completa.

### 🎯 Motivação
Permitir que usuários:
1. Organizem fotos em **múltiplos contests/projetos** independentes ("Fotos Família", "Fotos Trabalho");
2. **Salvem e recuperem o estado completo** de um contest (ratings, confrontos, campeão);
3. **Exportem e importem** seus dados (JSON + ZIP) para backup ou compartilhamento;
4. **Visualizem histórico** de contests anteriores e resultados.

### 📦 Estrutura de Dados Proposta

#### **Contest/Projeto** (nova entidade)
```javascript
{
  id: string,              // UUID do projeto/contest
  name: string,            // "Fotos Viagem 2025"
  description?: string,    // Descrição opcional
  createdAt: number,       // timestamp
  updatedAt: number,       // timestamp
  photos: string[],        // IDs das fotos vinculadas a este contest
  
  // Estado do ranqueamento (Sprint 3)
  ratings: {
    [photoId]: number      // 1-5 estrelas
  },
  
  // Estado do contest/batalha (Sprint 4)
  contestState: {
    phase: 'rating' | 'battle' | 'finished',
    currentMatch?: {
      photoA: string,      // ID
      photoB: string,      // ID
      matchNumber: number  // ex: "3 de 10"
    },
    eloScores: {
      [photoId]: number    // Pontuação Elo
    },
    battleHistory: Array<{
      photoA: string,
      photoB: string,
      winner: string,
      timestamp: number
    }>,
    champion: string | null  // ID da foto campeã
  },
  
  // Configurações específicas
  settings?: {
    minRatingForBattle: number,  // padrão: 5
    battleMode: 'elo' | 'knockout'
  }
}
```

#### **Photo Object** (estendido)
```javascript
{
  id: string,              // UUID
  thumb: string,           // base64 DataURL
  w: number,               // largura
  h: number,               // altura
  
  // Relacionamentos
  parentId?: string,       // ID da foto original (se cortada 2×2)
  quadrant?: string,       // "top-left", "top-right", etc
  projectId?: string,      // ← Novo (Sprint 4+): ID do contest/projeto
  
  // Estados e metadados
  rating?: number,         // 0-5 (Sprint 3)
  _isSplit?: boolean,      // true se foi dividida (original arquivado)
  tags?: string[],         // ← Novo (Sprint 5): ["família", "praia"]
  
  timestamp: number,
  uploadedAt?: number      // timestamp de quando foi adicionada
}
```

### 🗂️ Estrutura de Armazenamento (IndexedDB)

#### Object Stores
```javascript
// Atual (Sprint 1-3)
'photos' → keyPath: 'id'

// Novos (Sprint 4+)
'contests' → keyPath: 'id'
'settings' → keyPath: 'key'  // configurações globais da app
```

#### Índices
```javascript
// Object Store: photos
- index: 'by-project' → keyPath: 'projectId'
- index: 'by-parent' → keyPath: 'parentId'
- index: 'by-rating' → keyPath: 'rating'

// Object Store: contests
- index: 'by-date' → keyPath: 'createdAt'
- index: 'by-phase' → keyPath: 'contestState.phase'
```

### 🔄 Compatibilidade Retroativa

#### Migração Automática (Sprint 4)
Ao adicionar suporte a múltiplos contests:
1. Criar contest "default" automaticamente;
2. Associar todas as fotos existentes (`projectId = 'default'`);
3. Transferir ratings existentes para `contests[default].ratings`;
4. Manter backward compatibility total.

```javascript
// Exemplo de migração
async function migrateToMultiContest() {
  const allPhotos = await getAllPhotos();
  const defaultContest = {
    id: 'default',
    name: 'Meu Primeiro Contest',
    createdAt: Date.now(),
    photos: allPhotos.map(p => p.id),
    ratings: {},
    contestState: { phase: 'rating', eloScores: {}, champion: null }
  };
  
  // Atualizar fotos com projectId
  for (const photo of allPhotos) {
    photo.projectId = 'default';
    await savePhoto(photo);
  }
  
  await saveContest(defaultContest);
}
```

### 📤 Exportação e Importação (Sprint 5)

#### Formato de Exportação
```javascript
// contest-export-[name]-[date].json
{
  version: "1.0.0",
  exportedAt: timestamp,
  contest: {
    id, name, description, createdAt, contestState, settings
  },
  photos: [
    {
      id, w, h, parentId, quadrant, rating, tags,
      // thumb como base64 ou referência ao arquivo no ZIP
      thumbFile: "photos/photo-[id].jpg"
    }
  ]
}

// Estrutura do ZIP:
// contest-viagem-2025.zip
// ├── contest.json
// └── photos/
//     ├── photo-abc123.jpg
//     ├── photo-def456.jpg
//     └── ...
```

#### Funcionalidades de Exportação
- Exportar contest completo (JSON + imagens em ZIP);
- Exportar apenas rankings/resultados (JSON leve);
- Importar contest de ZIP (restaurar estado completo);
- Compartilhar link (upload opcional para servidor futuro).

### 🎨 UX para Múltiplos Contests

#### Navegação Principal (atualizada Sprint 4)
```
Header:
  [Photo Ranker] [Dropdown: "Contest Atual: Viagem 2025 ▼"]
  
  Tabs:
  - Upload
  - Avaliar
  - Contest
  - Resultados
  - [Novo] Projetos  ← gerenciar contests
```

#### Tela "Projetos" (Sprint 4)
- Lista de todos os contests criados;
- Cards com preview (3-4 fotos), nome, status, progresso;
- Botões: "Continuar", "Exportar", "Duplicar", "Deletar";
- Botão "+  Novo Contest" destacado.

#### Fluxo de Criação de Contest
1. Usuário clica "+ Novo Contest";
2. Modal: "Nome do contest", "Descrição (opcional)";
3. Redireciona para aba Upload do novo contest;
4. Dropdown no header mostra o contest ativo.

### 🧠 Decisões Arquiteturais

#### Por que não implementar em Sprint 2?
- **Foco:** Sprint 2 concentra-se no cropper 2×2 (funcionalidade core);
- **Complexidade:** Múltiplos contests requer refatoração significativa do estado global;
- **Dependências:** Precisa de sistema de rating (Sprint 3) para ser útil.

#### Por que preparar agora?
- **Estrutura de dados:** `projectId` pode ser adicionado desde Sprint 2 (opcional, default `null`);
- **Flag `_isSplit`:** Já pensada para permitir re-corte futuro;
- **IndexedDB:** Suporta múltiplos object stores nativamente.

#### Impacto nas Sprints 2-3
- **Sprint 2:** Adicionar `projectId?: string` no Photo object (não utilizado ainda);
- **Sprint 3:** Sistema de rating funciona com ou sem múltiplos contests;
- **Sprint 4:** Implementação completa de contests + migração.

### 📊 Roadmap Técnico

#### Sprint 4: Múltiplos Contests
- [ ] Criar object store `contests` no IndexedDB;
- [ ] Implementar CRUD de contests;
- [ ] Tela de gerenciamento de projetos;
- [ ] Dropdown de seleção de contest ativo;
- [ ] Migração automática de dados existentes;
- [ ] Filtros por contest na visualização de fotos.

#### Sprint 5: Exportação e Refinamento
- [ ] Implementar exportação para ZIP (lib: JSZip);
- [ ] Implementar importação de contests;
- [ ] Histórico visual de contests finalizados;
- [ ] Comparação entre contests (rankings side-by-side);
- [ ] PWA manifest + service worker (offline-first);
- [ ] Auditoria de acessibilidade final.

---

## ✅ 12. Objetivo Final
Entregar o **MVP completo (v1.0.0)**, com:
- Upload, corte 2×2, rankeamento e contest final estáveis;
- UX fluida e acessível;
- Documentação e versionamento corretos;
- Release público no GitHub.

---

## 📄 13. Referência Rápida (Resumo para o Cursor)
Projeto: Photo Ranker
Stack: HTML + CSS + JS nativo (ESM)
Design: mobile-first, responsivo, tokens e A11Y
Armazenamento: IndexedDB (fotos → Sprint 1-3; contests → Sprint 4+)
Estado atual: Sprint 2 (cropper + worker)
Proximas sprints: avaliação, contest/batalhas, múltiplos projetos, exportação/PWA
Proibir frameworks e libs externas (exceto JSZip na Sprint 5)
Preservar UX, A11Y e tokens
Estrutura de dados preparada para evolução (projectId, _isSplit, tags)
Compatibilidade retroativa obrigatória em todas as migrações