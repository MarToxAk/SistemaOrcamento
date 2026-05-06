import { readFileSync, writeFileSync } from 'fs';

const p = '.planning/phases/19-aprovacao-associada-caixa-athos/19-UAT.md';
let c = readFileSync(p, 'utf8');

c = c.replace('updated: 2026-05-05T00:00:00Z', 'updated: 2026-05-05T12:00:00Z');

c = c.replace(
`number: 1
name: Bloquear EM_PRODUCAO sem associacao e sem pagamento
expected: |
  Tentar avancar um orcamento para EM_PRODUCAO sem cliente associado ao Athos
  e sem pagamento confirmado (approved=false e saleExternalId ausente)
  deve retornar erro com mensagem de "confirmacao de pagamento".
awaiting: user response`,
`number: 2
name: Bloquear EM_PRODUCAO para cliente associado sem aprovacao via link
expected: |
  Um orcamento com isAssociated=true e approved=false deve recusar
  a transicao para EM_PRODUCAO com mensagem de "aprovacao via link".
awaiting: user response`
);

c = c.replace(
`### 1. Bloquear EM_PRODUCAO sem associacao e sem pagamento
expected: Tentar avancar um orcamento para EM_PRODUCAO sem cliente associado e sem pagamento confirmado deve retornar erro com mensagem de confirmacao de pagamento.
result: [pending]`,
`### 1. Bloquear EM_PRODUCAO sem associacao e sem pagamento
expected: Tentar avancar um orcamento para EM_PRODUCAO sem cliente associado e sem pagamento confirmado deve retornar erro com mensagem de confirmacao de pagamento.
result: pass`
);

c = c.replace('passed: 0', 'passed: 1');
c = c.replace('pending: 6', 'pending: 5');

writeFileSync(p, c, 'utf8');
console.log('ok');
