import { readFileSync, writeFileSync } from 'fs';

const p = '.planning/phases/19-aprovacao-associada-caixa-athos/19-UAT.md';
let c = readFileSync(p, 'utf8');

c = c.replace('updated: 2026-05-05T12:10:00Z', 'updated: 2026-05-05T12:20:00Z');

c = c.replace(
`number: 3
name: Permitir EM_PRODUCAO quando cliente associado foi aprovado via link
expected: |
  Um orcamento com isAssociated=true e approved=true deve conseguir
  avancar para EM_PRODUCAO sem erro.
awaiting: user response`,
`number: 4
name: Permitir EM_PRODUCAO sem associacao quando pagamento foi confirmado
expected: |
  Um orcamento sem associacao Athos deve conseguir avancar para EM_PRODUCAO
  se tiver approved=true ou saleExternalId preenchido.
awaiting: user response`
);

c = c.replace(
`### 3. Permitir EM_PRODUCAO quando cliente associado foi aprovado via link
expected: Um orcamento com isAssociated=true e approved=true deve conseguir avancar para EM_PRODUCAO sem erro.
result: [pending]`,
`### 3. Permitir EM_PRODUCAO quando cliente associado foi aprovado via link
expected: Um orcamento com isAssociated=true e approved=true deve conseguir avancar para EM_PRODUCAO sem erro.
result: blocked
blocked_by: prior-phase
reason: "Nao consigo deizer se esta funcionando o primeiro o anterior nao esta funcionando"`
);

c = c.replace('pending: 4', 'pending: 3');

writeFileSync(p, c, 'utf8');
console.log('ok');
