import { readFileSync, writeFileSync } from 'fs';

const p = '.planning/phases/19-aprovacao-associada-caixa-athos/19-UAT.md';
let c = readFileSync(p, 'utf8');

c = c.replace('status: testing', 'status: complete');
c = c.replace('updated: 2026-05-05T13:30:00Z', 'updated: 2026-05-05T13:40:00Z');

c = c.replace(
`## Current Test

number: 6
name: Revalidacao - Conciliacao exibe venda/indicativo e notifica pagamento no caixa
expected: |
  Ao detectar pagamento no caixa, o sistema deve mostrar indicador de pago no caixa
  com numero da venda (quando houver) e/ou notificar o cliente no Chatwoot.
awaiting: user response`,
`## Current Test

[testing complete]`
);

c = c.replace(
`### 6. Conciliacao nao reprocessa saleExternalId ja preenchido
expected: Se o orcamento ja tem saleExternalId definido, a conciliacao nao sobrescreve o valor (idempotencia).
result: [pending]`,
`### 6. Conciliacao nao reprocessa saleExternalId ja preenchido
expected: Se o orcamento ja tem saleExternalId definido, a conciliacao nao sobrescreve o valor (idempotencia).
result: pass`
);

c = c.replace('passed: 5', 'passed: 6');
c = c.replace('pending: 1', 'pending: 0');

writeFileSync(p, c, 'utf8');
console.log('ok');
