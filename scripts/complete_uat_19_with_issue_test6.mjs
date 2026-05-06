import { readFileSync, writeFileSync } from 'fs';

const p = '.planning/phases/19-aprovacao-associada-caixa-athos/19-UAT.md';
let c = readFileSync(p, 'utf8');

c = c.replace('status: testing', 'status: partial');
c = c.replace('updated: 2026-05-05T12:40:00Z', 'updated: 2026-05-05T12:55:00Z');

c = c.replace(
`## Current Test

number: 6
name: Conciliacao nao reprocessa saleExternalId ja preenchido
expected: |
  Se o orcamento ja tiver saleExternalId definido, a conciliacao nao deve
  sobrescrever esse valor (idempotencia).
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
result: issue
reported: "Gostaria que mostrase o numero da venda ou indicativo de foi pago no caixa ou notificar o cliente que recebeu pagamento no caixa. ou foi feito o pagemto no caixa"
severity: major`
);

c = c.replace('issues: 1', 'issues: 2');
c = c.replace('pending: 1', 'pending: 0');

if (!c.includes('test: 6')) {
  c = c.replace(
`  artifacts: []
  missing: []`,
`  artifacts: []
  missing: []

- truth: "Ao conciliar pagamento no caixa, o sistema deve expor o numero da venda ou indicador de pago e/ou notificar o cliente sobre pagamento confirmado no caixa."
  status: failed
  reason: "User reported: Gostaria que mostrase o numero da venda ou indicativo de foi pago no caixa ou notificar o cliente que recebeu pagamento no caixa. ou foi feito o pagemto no caixa"
  severity: major
  test: 6
  artifacts:
    - apps/backend/src/modules/quotes/quotes.service.ts
    - apps/backend/src/modules/quotes/quotes.service.unit.test.ts
  missing:
    - persistir e/ou expor indicador de pagamento confirmado no caixa para o orcamento
    - expor numero da venda (saleExternalId) de forma visivel no fluxo de consulta
    - notificar cliente quando pagamento no caixa for detectado`
  );
}

writeFileSync(p, c, 'utf8');
console.log('ok');
