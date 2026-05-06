import { readFileSync, writeFileSync } from 'fs';

const p = '.planning/phases/19-aprovacao-associada-caixa-athos/19-UAT.md';
let c = readFileSync(p, 'utf8');

c = c.replace('updated: 2026-05-05T13:10:00Z', 'updated: 2026-05-05T13:20:00Z');

c = c.replace(
`number: 2
name: Revalidacao - Bloquear EM_PRODUCAO para cliente associado sem aprovacao via link
expected: |
  Com as correcoes aplicadas, um orcamento com isAssociated=true e approved=false
  deve recusar a transicao para EM_PRODUCAO com mensagem de aprovacao via link.
awaiting: user response`,
`number: 3
name: Revalidacao - Permitir EM_PRODUCAO quando cliente associado foi aprovado via link
expected: |
  Com as correcoes aplicadas, um orcamento com isAssociated=true e approved=true
  deve conseguir avancar para EM_PRODUCAO sem erro.
awaiting: user response`
);

c = c.replace(
`### 2. Bloquear EM_PRODUCAO para cliente associado sem aprovacao via link
expected: Um orcamento com isAssociated=true e approved=false deve recusar a transicao para EM_PRODUCAO com mensagem de aprovacao via link.
result: issue
reported: "Nao esta bloqueando"
severity: major`,
`### 2. Bloquear EM_PRODUCAO para cliente associado sem aprovacao via link
expected: Um orcamento com isAssociated=true e approved=false deve recusar a transicao para EM_PRODUCAO com mensagem de aprovacao via link.
result: pass`
);

c = c.replace(
`### 3. Permitir EM_PRODUCAO quando cliente associado foi aprovado via link
expected: Um orcamento com isAssociated=true e approved=true deve conseguir avancar para EM_PRODUCAO sem erro.
result: blocked
blocked_by: prior-phase
reason: "Nao consigo deizer se esta funcionando o primeiro o anterior nao esta funcionando"`,
`### 3. Permitir EM_PRODUCAO quando cliente associado foi aprovado via link
expected: Um orcamento com isAssociated=true e approved=true deve conseguir avancar para EM_PRODUCAO sem erro.
result: [pending]`
);

c = c.replace('passed: 3', 'passed: 4');
c = c.replace('issues: 2', 'issues: 1');
c = c.replace('pending: 0', 'pending: 1');

const gap2 = `- truth: "Um orcamento com isAssociated=true e approved=false deve recusar a transicao para EM_PRODUCAO com mensagem de aprovacao via link."
  status: failed
  reason: "User reported: Nao esta bloqueando"
  severity: major
  test: 2
  artifacts: []
  missing: []

`;

c = c.replace(gap2, '');

writeFileSync(p, c, 'utf8');
console.log('ok');
