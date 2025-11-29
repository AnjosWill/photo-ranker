# 🧪 Guia de Teste - Sprint 4 (Contest Mode)

## 🌐 Acessar o Projeto

**URL Local:** http://localhost:8000

Abra no navegador e comece os testes!

---

## ✅ Checklist de Testes

### 📋 Preparação Inicial

- [ ] **Upload de Fotos**
  - Faça upload de **pelo menos 8 fotos** (recomendado: 8-16)
  - Use fotos diferentes para facilitar identificação

- [ ] **Avaliar Fotos**
  - Vá para aba **"Avaliar"** ou use o grid
  - Avalie **pelo menos 8 fotos com ⭐5 estrelas**
  - Use atalhos: `1-5` para avaliar, `0` para remover

---

## 🎯 Teste 1: Sistema de Eliminatória (KNOCKOUT)

### ⚠️ **TESTE PRINCIPAL - Sistema de Rodadas Progressivas**

#### Cenário: 8 Fotos ⭐5

1. [ ] **Acesse aba "Contest"**
   - Deve mostrar: "8 fotos qualificadas"
   - Botão "Iniciar Contest" habilitado

2. [ ] **Clique "Iniciar Contest"**
   - Toast: "Contest iniciado! 8 participantes, 3 rodadas, X confrontos."
   - Interface de batalha aparece

3. [ ] **RODADA 1 (4 confrontos)**
   - Progresso: "Rodada 1 de 3 / Confronto 1 de 4"
   - Escolha vencedor: click, `1`/`2`, ou `←`/`→`
   - Feedback: borda verde, toast "Foto A venceu! +X Elo"
   - Avança automaticamente para próximo confronto
   
   - **Confronto 2/4**: Escolha vencedor
   - **Confronto 3/4**: Escolha vencedor
   - **Confronto 4/4**: Escolha vencedor
   
   - ✅ **Ao final da R1**: Toast "Rodada 1 completa! 4 vencedores avançam."
   - ✅ **Avança para R2 automaticamente**

4. [ ] **RODADA 2 (2 confrontos)**
   - Progresso: "Rodada 2 de 3 / Confronto 1 de 2"
   - ✅ **Apenas 4 fotos batalham** (vencedores da R1)
   - **Confronto 1/2**: Escolha vencedor
   - **Confronto 2/2**: Escolha vencedor
   
   - ✅ **Ao final da R2**: Toast "Rodada 2 completa! 2 vencedores avançam."
   - ✅ **Avança para R3 automaticamente**

5. [ ] **RODADA 3 - FINAL (1 confronto)**
   - Progresso: "Rodada 3 de 3 / Confronto 1 de 1"
   - ✅ **Apenas 2 fotos batalham** (vencedores da R2)
   - **Confronto FINAL**: Escolha vencedor
   
   - ✅ **Toast**: "🏆 Contest finalizado! Campeão definido!"
   - ✅ **Redireciona automaticamente para aba "Resultados"**

---

## 🏆 Teste 2: Tela de Resultados

1. [ ] **Card do Campeão**
   - Foto grande do campeão
   - Ícone 🏆 animado (bounce)
   - Título "Campeã" ou "Campeão"
   - Elo final exibido (ex: "1650")
   - Estatísticas: vitórias, derrotas, win rate

2. [ ] **Ranking Completo**
   - Lista ordenada por Elo (maior → menor)
   - 1º lugar = campeão (mesma foto do card)
   - Cada item mostra:
     - Posição (#1, #2, #3...)
     - Miniatura da foto
     - Elo final
     - Vitórias e derrotas
     - Win rate (%)

3. [ ] **Botão "🔄 Recomeçar Contest"**
   - Clicar abre modal de confirmação
   - Confirmar → Estado limpo, volta para aba "Contest"
   - Botão "Iniciar Contest" habilitado novamente

4. [ ] **Navegação**
   - Botão "Voltar para Avaliação" → redireciona para aba "Avaliar"

---

## ⌨️ Teste 3: Atalhos de Teclado

1. [ ] **Durante Batalha:**
   - `1` ou `←`: Escolhe Foto A
   - `2` ou `→`: Escolhe Foto B
   - `Esc`: Abre modal "Cancelar Contest?"

2. [ ] **Cancelar Contest:**
   - Pressionar `Esc` durante batalha
   - Modal aparece: "Deseja cancelar o contest?"
   - Confirmar → Estado resetado, volta para tela inicial

---

## 💾 Teste 4: Persistência

1. [ ] **Continuar de Onde Parou:**
   - Inicie contest (8 fotos)
   - Complete 2 confrontos da Rodada 1
   - **Feche a aba do navegador** (ou vá para outra aba)
   - **Reabra a aplicação**
   - Acesse aba "Contest"
   - ✅ **Deve continuar no confronto 3 da Rodada 1**

2. [ ] **Estado Persistido:**
   - Elo scores mantidos
   - Histórico de batalhas mantido
   - Rodada atual mantida

---

## 📱 Teste 5: Responsividade

1. [ ] **Desktop (1920px+):**
   - Layout lado a lado (Foto A | VS | Foto B)
   - Fotos grandes e visíveis

2. [ ] **Mobile (375px):**
   - Layout vertical (Foto A acima, Foto B abaixo)
   - VS centralizado
   - Botões acessíveis

3. [ ] **Tablet (768px):**
   - Layout adaptado (pode ser lado a lado ou vertical)

---

## 🎲 Teste 6: Casos Especiais

### 6.1 - Apenas 2 Fotos ⭐5
- [ ] Iniciar contest com 2 fotos
- [ ] Apenas 1 confronto gerado
- [ ] Progresso: "Rodada 1 de 1 / Confronto 1 de 1"
- [ ] Escolher vencedor → Imediatamente vai para "Resultados"
- [ ] ✅ **Rodada 1 = FINAL** (sem rodadas adicionais)

### 6.2 - 3 Fotos ⭐5
- [ ] Iniciar contest com 3 fotos
- [ ] Rodada 1: 1 confronto (1 foto passa direto - bye)
- [ ] Rodada 2: 1 confronto FINAL
- [ ] ✅ **Total: 2 confrontos, 2 rodadas**

### 6.3 - 16 Fotos ⭐5
- [ ] Iniciar contest com 16 fotos
- [ ] Rodada 1: 8 confrontos → 8 vencedores
- [ ] Rodada 2: 4 confrontos → 4 vencedores
- [ ] Rodada 3: 2 confrontos → 2 vencedores
- [ ] Rodada 4: 1 confronto FINAL → 1 campeão
- [ ] ✅ **Total: 15 confrontos, 4 rodadas**

---

## 🔍 Teste 7: Validações de Elo

1. [ ] **Elo Inicial:**
   - Todas as fotos começam com Elo 1500

2. [ ] **Mudança de Elo:**
   - Após cada confronto, toast mostra: "Foto A venceu! +16 Elo"
   - Vencedor ganha Elo, perdedor perde Elo
   - Elo atualizado em tempo real

3. [ ] **Elo Final:**
   - Campeão tem maior Elo
   - Ranking ordenado por Elo (maior → menor)

---

## 🐛 Teste 8: Edge Cases

1. [ ] **Sem Fotos Qualificadas:**
   - 0 fotos com ⭐5
   - Botão "Iniciar Contest" desabilitado
   - Mensagem: "Você precisa avaliar pelo menos 2 fotos com ⭐5"

2. [ ] **Apenas 1 Foto ⭐5:**
   - Botão "Iniciar Contest" desabilitado
   - Mensagem: "Você precisa de pelo menos 2 fotos com ⭐5"

3. [ ] **Fotos Ocultas (Split):**
   - Fotos cortadas (split) não aparecem no contest
   - Apenas fotos visíveis com ⭐5 são qualificadas

---

## 📊 Resumo de Testes

| Teste | Status | Observações |
|-------|--------|-------------|
| **T1: Eliminatória (8 fotos)** | ⬜ | **TESTE PRINCIPAL** |
| **T2: Resultados** | ⬜ | Card campeão + ranking |
| **T3: Atalhos** | ⬜ | 1/2, ←/→, Esc |
| **T4: Persistência** | ⬜ | Fechar/reabrir |
| **T5: Responsividade** | ⬜ | Desktop/Mobile |
| **T6: Casos Especiais** | ⬜ | 2, 3, 16 fotos |
| **T7: Elo** | ⬜ | Cálculos corretos |
| **T8: Edge Cases** | ⬜ | Validações |

---

## ✅ Critérios de Aprovação

### ✅ **OBRIGATÓRIO (Bloqueador):**
- [ ] Sistema de eliminatória funciona corretamente (rodadas progressivas)
- [ ] Vencedores avançam para próxima rodada
- [ ] Contest finaliza quando sobra apenas 1 campeão
- [ ] Tela de resultados exibe campeão e ranking corretos
- [ ] Persistência funciona (fechar/reabrir)

### ✅ **Desejável:**
- [ ] Atalhos de teclado funcionam
- [ ] Responsividade OK (desktop/mobile)
- [ ] Casos especiais (2, 3, 16 fotos) funcionam
- [ ] Elo calculado corretamente

---

## 🚨 Problemas Encontrados?

Se encontrar algum problema, anote aqui:

1. **Problema:** _________________________
   - **Onde:** _________________________
   - **Passos para reproduzir:** _________________________

2. **Problema:** _________________________
   - **Onde:** _________________________
   - **Passos para reproduzir:** _________________________

---

## 📝 Notas Finais

- **Tempo estimado de teste:** 15-20 minutos
- **Foco principal:** Sistema de eliminatória (T1)
- **URL:** http://localhost:8000

**Boa sorte com os testes! 🚀**

