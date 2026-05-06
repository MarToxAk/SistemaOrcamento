import { readFileSync, writeFileSync } from 'fs';

const p = '.planning/phases/19-aprovacao-associada-caixa-athos/19-UAT.md';
let c = readFileSync(p, 'utf8');

c = c.replace('status: partial', 'status: testing');
c = c.replace('updated: 2026-05-05T12:55:00Z', 'updated: 2026-05-05T13:10:00Z');

const currentBlock = `## Current Test

[testing complete]`;
const newCurrent = `## Current Test

number: 2
name: Revalidacao - Bloquear EM_PRODUCAO para cliente associado sem aprovacao via link
expected: |
  Com as correcoes aplicadas, um orcamento com isAssociated=true e approved=false
  deve recusar a transicao para EM_PRODUCAO com mensagem de aprovacao via link.
awaiting: user response`;

if (c.includes(currentBlock)) {
  c = c.replace(currentBlock, newCurrent);
}

writeFileSync(p, c, 'utf8');
console.log('ok');
