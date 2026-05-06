import { readFileSync, writeFileSync } from 'fs';

const roadmapPath = '.planning/ROADMAP.md';
let roadmap = readFileSync(roadmapPath, 'utf8');

roadmap = roadmap.replace('Version: 1.8', 'Version: 1.9');
roadmap = roadmap.replace(
  '- [x] v1.8 Aprovacao Associada ao Pagamento + Conciliacao Caixa Athos - Phase 19 (shipped 2026-05-05)',
  '- [x] v1.8 Aprovacao Associada ao Pagamento + Conciliacao Caixa Athos - Phase 19 (shipped 2026-05-05)' +
    '\n- [ ] v1.9 Relatorios e Exportacao CSV - Phase 20 (planning)',
);

if (!roadmap.includes('## v1.9 Relatorios e Exportacao CSV (Phase 20) - PLANNING')) {
  const insertAfter = '## Backlog (Future)';
  const section =
    '\n## v1.9 Relatorios e Exportacao CSV (Phase 20) - PLANNING\n\n' +
    '**Plans:** 0 plans\n\n' +
    '- [ ] Phase 20: Relatorios e exportacao CSV de orcamentos (a definir no discuss/plan)\n\n' +
    'Plans:\n' +
    '- [ ] 20-01-PLAN.md - [To be planned]\n\n' +
    '### Phase Details\n\n' +
    '**Phase 20: Relatorios e exportacao CSV de orcamentos**\n' +
    'Goal: Entregar visoes operacionais e exportacao CSV para acompanhamento comercial e financeiro.\n' +
    'Requirements: [To be defined]\n' +
    'Success criteria:\n' +
    '1. Usuario consegue gerar exportacao CSV com filtros basicos\n' +
    '2. Exportacao contem campos essenciais do orcamento, cliente, status e valores\n' +
    '3. Fluxo nao degrada performance das telas principais\n\n';

  roadmap = roadmap.replace(insertAfter, section + insertAfter);
}

roadmap = roadmap.replace('Roadmap v1.8 - 2026-05-05', 'Roadmap v1.9 - 2026-05-05');
writeFileSync(roadmapPath, roadmap, 'utf8');

const statePath = '.planning/STATE.md';
let state = readFileSync(statePath, 'utf8');

state = state.replace('Current phase: 19 (complete)', 'Current phase: 20 (planning)');
state = state.replace('Milestone: v1.8 (complete)', 'Milestone: v1.9 (planning)');
state = state.replace('Phase: 19 - aprovacao-associada-caixa-athos (complete)', 'Phase: 20 - relatorios-exportacao-csv (planning)');
state = state.replace('Status: Phase 19 complete', 'Status: Defining requirements');
state = state.replace(
  /Last activity: .*/,
  'Last activity: 2026-05-05 - Milestone v1.9 started (phase 20 planning)',
);

if (!state.includes('| 20 | Relatorios e Exportacao CSV de Orcamentos | planning (v1.9) |')) {
  state = state.replace(
    '| 19 | Aprovacao Associada ao Pagamento + Conciliacao Caixa Athos | complete (v1.8) |',
    '| 19 | Aprovacao Associada ao Pagamento + Conciliacao Caixa Athos | complete (v1.8) |\n| 20 | Relatorios e Exportacao CSV de Orcamentos | planning (v1.9) |',
  );
}

state = state.replace('Current focus: aguardando planejamento da proxima fase/milestone', 'Current focus: v1.9 - relatorios e exportacao CSV de orcamentos');

writeFileSync(statePath, state, 'utf8');

console.log('ok');
