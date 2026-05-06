import { readFileSync, writeFileSync } from 'fs';

const p = '.planning/phases/19-aprovacao-associada-caixa-athos/19-UAT.md';
let c = readFileSync(p, 'utf8');

c = c.replace('updated: 2026-05-05T12:00:00Z', 'updated: 2026-05-05T12:10:00Z');

c = c.replace(
`number: 2
name: Bloquear EM_PRODUCAO para cliente associado sem aprovacao via link
expected: |
  Um orcamento com isAssociated=true e approved=false deve recusar
  a transicao para EM_PRODUCAO com mensagem de "aprovacao via link".
awaiting: user response`,
`number: 3
name: Permitir EM_PRODUCAO quando cliente associado foi aprovado via link
expected: |
  Um orcamento com isAssociated=true e approved=true deve conseguir
  avancar para EM_PRODUCAO sem erro.
awaiting: user response`
);

c = c.replace(
`### 2. Bloquear EM_PRODUCAO para cliente associado sem aprovacao via link
expected: Um orcamento com isAssociated=true e approved=false deve recusar a transicao para EM_PRODUCAO com mensagem de aprovacao via link.
result: [pending]`,
`### 2. Bloquear EM_PRODUCAO para cliente associado sem aprovacao via link
expected: Um orcamento com isAssociated=true e approved=false deve recusar a transicao para EM_PRODUCAO com mensagem de aprovacao via link.
result: issue
reported: "Nao esta bloqueando"
severity: major`
);

c = c.replace('issues: 0', 'issues: 1');
c = c.replace('pending: 5', 'pending: 4');

if (c.includes('[none yet]')) {
  c = c.replace(
    '[none yet]',
`- truth: "Um orcamento com isAssociated=true e approved=false deve recusar a transicao para EM_PRODUCAO com mensagem de aprovacao via link."
  status: failed
  reason: "User reported: Nao esta bloqueando"
  severity: major
  test: 2
  artifacts: []
  missing: []`
  );
}

writeFileSync(p, c, 'utf8');
console.log('ok');
