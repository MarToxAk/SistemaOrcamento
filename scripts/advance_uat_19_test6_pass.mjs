import { readFileSync, writeFileSync } from 'fs';

const p = '.planning/phases/19-aprovacao-associada-caixa-athos/19-UAT.md';
let c = readFileSync(p, 'utf8');

c = c.replace('updated: 2026-05-05T12:30:00Z', 'updated: 2026-05-05T12:40:00Z');

c = c.replace(
`number: 5
name: Conciliacao automatica ao abrir orcamento com ID Athos
expected: |
  Ao abrir ou buscar um orcamento com externalQuoteId, o sistema deve acionar
  a conciliacao em segundo plano e preencher saleExternalId quando houver idvenda,
  sem bloquear a resposta do getById.
awaiting: user response`,
`number: 6
name: Conciliacao nao reprocessa saleExternalId ja preenchido
expected: |
  Se o orcamento ja tiver saleExternalId definido, a conciliacao nao deve
  sobrescrever esse valor (idempotencia).
awaiting: user response`
);

c = c.replace(
`### 5. Conciliacao automatica ao abrir orcamento com ID Athos
expected: Ao abrir/buscar um orcamento com externalQuoteId, o sistema aciona em segundo plano a conciliacao com o Caixa Athos (relacao_orcamento_venda). Se houver idvenda, saleExternalId e preenchido sem bloquear a resposta do getById.
result: [pending]`,
`### 5. Conciliacao automatica ao abrir orcamento com ID Athos
expected: Ao abrir/buscar um orcamento com externalQuoteId, o sistema aciona em segundo plano a conciliacao com o Caixa Athos (relacao_orcamento_venda). Se houver idvenda, saleExternalId e preenchido sem bloquear a resposta do getById.
result: pass`
);

c = c.replace('passed: 2', 'passed: 3');
c = c.replace('pending: 2', 'pending: 1');

writeFileSync(p, c, 'utf8');
console.log('ok');
