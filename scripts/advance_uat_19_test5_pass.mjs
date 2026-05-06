import { readFileSync, writeFileSync } from 'fs';

const p = '.planning/phases/19-aprovacao-associada-caixa-athos/19-UAT.md';
let c = readFileSync(p, 'utf8');

c = c.replace('updated: 2026-05-05T12:20:00Z', 'updated: 2026-05-05T12:30:00Z');

c = c.replace(
`number: 4
name: Permitir EM_PRODUCAO sem associacao quando pagamento foi confirmado
expected: |
  Um orcamento sem associacao Athos deve conseguir avancar para EM_PRODUCAO
  se tiver approved=true ou saleExternalId preenchido.
awaiting: user response`,
`number: 5
name: Conciliacao automatica ao abrir orcamento com ID Athos
expected: |
  Ao abrir ou buscar um orcamento com externalQuoteId, o sistema deve acionar
  a conciliacao em segundo plano e preencher saleExternalId quando houver idvenda,
  sem bloquear a resposta do getById.
awaiting: user response`
);

c = c.replace(
`### 4. Permitir EM_PRODUCAO sem associacao quando pagamento foi confirmado
expected: Um orcamento sem associacao Athos deve conseguir avancar para EM_PRODUCAO se tiver approved=true ou saleExternalId preenchido.
result: [pending]`,
`### 4. Permitir EM_PRODUCAO sem associacao quando pagamento foi confirmado
expected: Um orcamento sem associacao Athos deve conseguir avancar para EM_PRODUCAO se tiver approved=true ou saleExternalId preenchido.
result: pass`
);

c = c.replace('passed: 1', 'passed: 2');
c = c.replace('pending: 3', 'pending: 2');

writeFileSync(p, c, 'utf8');
console.log('ok');
