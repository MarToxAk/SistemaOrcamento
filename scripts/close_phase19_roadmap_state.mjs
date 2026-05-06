import { readFileSync, writeFileSync } from 'fs';

const roadmapPath = '.planning/ROADMAP.md';
let roadmap = readFileSync(roadmapPath, 'utf8');

roadmap = roadmap.replace(
  '- [ ] v1.8 Aprovacao Associada ao Pagamento + Conciliacao Caixa Athos - Phase 19 (em andamento)',
  '- [x] v1.8 Aprovacao Associada ao Pagamento + Conciliacao Caixa Athos - Phase 19 (shipped 2026-05-05)',
);

roadmap = roadmap.replace(
  '## v1.8 Aprovacao Associada ao Pagamento + Conciliacao Caixa Athos (Phase 19) - EM ANDAMENTO',
  '## v1.8 Aprovacao Associada ao Pagamento + Conciliacao Caixa Athos (Phase 19) - SHIPPED 2026-05-05',
);

roadmap = roadmap.replace(
  '- [ ] Phase 19: Regras de aprovacao associada, conciliacao via relacao_orcamento_venda e correcao de textos (APR-01..03, ATHC-01..03, TRG-01..03, TXT-01..02)',
  '- [x] Phase 19: Regras de aprovacao associada, conciliacao via relacao_orcamento_venda e correcao de textos (APR-01..03, ATHC-01..03, TRG-01..03, TXT-01..02)',
);

roadmap = roadmap.replace('- [ ] 19-01-PLAN.md', '- [x] 19-01-PLAN.md');
roadmap = roadmap.replace('- [ ] 19-02-PLAN.md', '- [x] 19-02-PLAN.md');

writeFileSync(roadmapPath, roadmap, 'utf8');

const statePath = '.planning/STATE.md';
let state = readFileSync(statePath, 'utf8');

state = state.replace('Milestone: v1.8 (planning)', 'Milestone: v1.8 (complete)');
state = state.replace(
  'Last activity: 2026-05-05 - Phase 19 complete (commits 8fd4df7, fd36b4e)',
  'Last activity: 2026-05-05 - Phase 19 complete e revalidada (commits 8fd4df7, fd36b4e, 1673cc5, 962464e, eb2abc6)',
);
state = state.replace(
  'Current focus: v1.8 - aprovacao associada ao pagamento + conciliacao caixa Athos',
  'Current focus: aguardando planejamento da proxima fase/milestone',
);

writeFileSync(statePath, state, 'utf8');

console.log('ok');
