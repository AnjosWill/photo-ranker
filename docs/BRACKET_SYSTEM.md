# Sistema de Bracket de Eliminação Progressiva

## Conceito

**Double Elimination Tournament com Consolation Bracket**

- **Winners Bracket**: Ganhadores avançam para próximas rodadas
- **Losers Bracket**: Perdedores batalham entre si para ranking completo
- **Final**: Campeão é determinado entre winners e losers bracket

## Estrutura de Rounds

### Round 1 (Inicial)
```
A vs B  →  B (ganhador)
C vs D  →  D (ganhador)
E vs F  →  E (ganhador)
G vs H  →  G (ganhador)
```

### Round 2 - Winners
```
B vs D  →  B (ganhador)
E vs G  →  E (ganhador)
```

### Round 2 - Losers (Consolation)
```
A vs D  →  A (ganhador) - para ranking
F vs H  →  F (ganhador) - para ranking
```

### Round 3 - Winners
```
B vs E  →  C (ganhador) - define campeão
```

## Implementação

### Estrutura de Dados

```javascript
contestState.qualifying = {
  rounds: [
    {
      round: 1,
      type: 'initial', // 'initial' | 'winners' | 'losers'
      matches: [
        { photoA: A, photoB: B, winner: B, loser: A },
        ...
      ],
      winners: [B, D, E, G],
      losers: [A, C, F, H]
    },
    {
      round: 2,
      type: 'winners',
      matches: [...],
      winners: [B, E],
      losers: [D, G]
    },
    {
      round: 2,
      type: 'losers',
      matches: [...],
      winners: [A, F],
      losers: [D, H]
    }
  ],
  currentRound: 1,
  currentMatchIndex: 0
}
```

### Função de Geração de Bracket

```javascript
function generateBracketStructure(photos) {
  // 1. Embaralhar ou ordenar por Elo inicial
  // 2. Criar pares para Round 1
  // 3. Processar resultados e gerar próximos rounds
}
```

### Função de Processamento de Round

```javascript
function processRound(round, results) {
  // 1. Separar winners e losers
  // 2. Gerar próximo round de winners (se houver)
  // 3. Gerar próximo round de losers (se houver)
  // 4. Continuar até ter campeão
}
```

