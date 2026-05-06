import { readFileSync, writeFileSync } from 'fs';

const p = '.planning/phases/19-aprovacao-associada-caixa-athos/19-UAT.md';
let c = readFileSync(p, 'utf8');

c = c.replace('updated: 2026-05-05T13:20:00Z', 'updated: 2026-05-05T13:30:00Z');

c = c.replace(
`number: 3
name: Revalidacao - Permitir EM_PRODUCAO quando cliente associado foi aprovado via link
expected: |
  Com as correcoes aplicadas, um orcamento com isAssociated=true e approved=true
  deve conseguir avancar para EM_PRODUCAO sem erro.
awaiting: user response`,
`number: 6
name: Revalidacao - Conciliacao exibe venda/indicativo e notifica pagamento no caixa
expected: |
  Ao detectar pagamento no caixa, o sistema deve mostrar indicador de pago no caixa
  com numero da venda (quando houver) e/ou notificar o cliente no Chatwoot.
awaiting: user response`
);

c = c.replace(
`### 3. Permitir EM_PRODUCAO quando cliente associado foi aprovado via link
expected: Um orcamento com isAssociated=true e approved=true deve conseguir avancar para EM_PRODUCAO sem erro.
result: [pending]`,
`### 3. Permitir EM_PRODUCAO quando cliente associado foi aprovado via link
expected: Um orcamento com isAssociated=true e approved=true deve conseguir avancar para EM_PRODUCAO sem erro.
result: pass`
);

c = c.replace(
`### 6. Conciliacao nao reprocessa saleExternalId ja preenchido
expected: Se o orcamento ja tem saleExternalId definido, a conciliacao nao sobrescreve o valor (idempotencia).
result: issue
reported: "Gostaria que mostrase o numero da venda ou indicativo de foi pago no caixa ou notificar o cliente que recebeu pagamento no caixa. ou foi feito o pagemto no caixa"
severity: major`,
`### 6. Conciliacao nao reprocessa saleExternalId ja preenchido
expected: Se o orcamento ja tem saleExternalId definido, a conciliacao nao sobrescreve o valor (idempotencia).
result: [pending]`
);

c = c.replace('passed: 4', 'passed: 5');
c = c.replace('issues: 1', 'issues: 0');

const gapBlock = `- truth: "Ao conciliar pagamento no caixa, o sistema deve expor o numero da venda ou indicador de pago e/ou notificar o cliente sobre pagamento confirmado no caixa."
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
    - notificar cliente quando pagamento no caixa for detectado`;

c = c.replace(gapBlock, '[none yet]');

writeFileSync(p, c, 'utf8');
console.log('ok');
