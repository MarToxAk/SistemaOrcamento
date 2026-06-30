# 12-RESEARCH — Conciliação Athos: Consulta real de pagamento

Phase: 12
Created: 2026-05-04

---

## Resumo

Pesquisa sobre como implementar consulta real de pagamento no banco Athos, baseada na análise do codebase existente e padrões do AthosService.

---

## Padrão de Consulta Existente no AthosService

O serviço usa `dynamic column discovery` via `information_schema.columns` para lidar com variações de schema entre instalações Athos. O padrão consiste em:

1. Listar colunas disponíveis na tabela alvo
2. Encontrar coluna identificadora usando uma lista de candidatos
3. Executar query parametrizada usando nome de coluna verificado como safe identifier

### Funções utilitárias já disponíveis

```typescript
isSafeIdentifier(value: string)   // valida nome de coluna
pickString(row, keys)             // extrai string de múltiplos candidates
pickNumber(row, keys, fallback)   // extrai número de múltiplos candidates
findExistingTable(client, candidates)  // localiza tabela por lista de candidatos
```

---

## Tabelas Candidatas no Athos para Pagamento

### Tabela de Venda (para localizar vendaId via orcamentoId)

Candidatos (ordem de prioridade):
```
"venda", "vendas", "orcamento_venda", "movimento_venda"
```

Colunas de ligação a orçamento:
```
"idorcamento", "orcamentoid", "id_orcamento", "codorcamento"
```

Colunas de vendaId (para retornar ao caller):
```
"idvenda", "vendaid", "id_venda", "id", "codigvenda", "codvenda"
```

Colunas de status de pagamento:
```
"situacaovenda", "situacao", "statuspagamento", "status", "statussituacao"
```

Valores que indicam pago (case-insensitive):
```
"PAGO", "QUITADO", "RECEBIDO", "LIQUIDADO", "FINALIZADO"
```

### Tabela Financeira (para valor pago, via idvenda)

Candidatos:
```
"financeiro", "conta_receber", "contasreceber", "parcela_receber",
"receber", "parcelas_receber", "titulo_receber"
```

Colunas de ligação a venda:
```
"idvenda", "vendaid", "id_venda"
```

Colunas de valor pago:
```
"valorpago", "valor_pago", "valorquitado", "totalrecebido", "valor_recebido"
```

---

## Estratégia de Implementação

### Fluxo principal

```
verificarPagamentoPorOrcamento(orcamentoId, vendaId?)
  1. Conectar ao pool
  2. Se vendaId fornecido:
       → buscar diretamente na tabela venda por idvenda
  3. Se não (ou não encontrou):
       → buscar na tabela venda por idorcamento → obtém idvenda
  4. Verificar status/situacao da venda para determinar paid=true
  5. Buscar valor pago na tabela financeira (opcional — não bloqueia resultado)
  6. Liberar connection
  7. Retornar {paid, idVenda, valor}
```

### Tratamento de erros

- Tabela `venda` não encontrada → `{paid: false, idVenda: null, valor: 0}` + `logger.warn`
- Coluna identificadora não encontrada → mesmo fallback
- Erro de query → `logger.error` + retornar fallback (sem re-throw, conforme D-05)

---

## Interface de Retorno Tipada

```typescript
interface PagamentoAthosResult {
  paid: boolean;
  idVenda: number | string | null;
  valor: number;
  situacao?: string;   // raw status string do Athos (para log/debug)
}
```

---

## Teste Unitário

A implementação deve ser coberta por testes unitários usando mock do pool/client:

- Cenário pago: query retorna row com `situacaovenda = "PAGO"` → `paid: true`
- Cenário não pago: query retorna row com situacao diferente → `paid: false`
- Cenário sem venda: tabela não encontrada → `paid: false` sem exceção
- Cenário com vendaId fornecido: deve priorizar busca direta por vendaId
- Cenário de erro de conexão: deve retornar fallback sem re-throw

---

## Referências no Codebase

| Local | Relevância |
|-------|-----------|
| `athos.service.ts:listarContasPagar()` | Exemplo do padrão dynamic table discovery |
| `athos.service.ts:buscarOrcamentoPorNumero()` | Exemplo de uso de `findExistingTable` + `isSafeIdentifier` |
| `quotes.service.ts:checkPaymentStatus()` (linha ~231) | Caller que já usa o resultado para sync de status |
| `athos.service.ts:verificarPagamentoPorOrcamento()` (linha ~581) | Stub atual a ser substituído |
