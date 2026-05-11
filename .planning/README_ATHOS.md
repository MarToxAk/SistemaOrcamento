# Patch: Inclusão de idcontapagar no GET /contas-pagar ✓ COMPLETO

## Status: COMPLETO

O endpoint de listagem agora retorna o ID primário da conta a pagar, viabilizando operações de upload e update vinculadas.

## Alterações Realizadas

### 1. AthosService.ts

Arquivo: `apps/backend/src/modules/integrations/athos/athos.service.ts`

**Mudança:** Método `listarContasPagar()` agora inclui `idcontapagar` no mapper de saída.

**Query SQL:** SELECT * ... (coluna extraída do resultado)

**Mapper atualizado:**
```typescript
return (result.rows as Row[]).map((row) => ({
  idcontapagar: pickNumber(row, ["idcontapagar", "id_contapagar", "id"], undefined),
  descricaoconta: pickString(row, [...]),
  // ... demais campos
}));
```

### 2. Resposta da API

O objeto JSON retornado em `GET /athos/contas-pagar` agora contém:

```json
[
  {
    "idcontapagar": 42,
    "descricaoconta": "Fatura ABC",
    "dataemissao": "2026-05-01",
    "datavencimento": "2026-06-30",
    "valorconta": 1500.50,
    "statusconta": "ABERTO",
    "numerodocumento": "NF-001",
    ...
  }
]
```

## Verificação

- Build do backend: ✓ OK
- Testes Athos: ✓ OK (36 testes passaram)
- Swagger: ✓ Propriedade `idcontapagar` agora visível no schema de resposta