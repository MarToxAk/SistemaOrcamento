# Roadmap — Sistema de Orçamento BomCusto

## Milestones

- ✅ **v1.0 MVP** — Segurança, Confiabilidade e UX — Fases 1-5 (shipped 2026-05-02)
- ✅ **v1.1 Aprovação Athos** — Fase 6 (shipped 2026-05-02)
- ✅ **v1.2 Chatwoot + UX Público** — Fases 7-8 (shipped)
- ✅ **v1.3 Migration/Update** — Fases 9-10 (shipped)
- ✅ **v1.4 Conciliação Athos + NFS-e** — Fases 11-14 (shipped)
- ✅ **v1.5 Encoding NFS-e + UI desconto** — Fases 15-16 (shipped)
- ✅ **v1.6 Cálculo de desconto** — Fase 17 (shipped)
- ✅ **v1.7 RPS e Tomador** — Fase 18 (shipped 2026-05-04)
- ✅ **v1.8 Busca de Cliente Athos** — Fases 19-21 (shipped 2026-05-05)
- ✅ **v2.0 Gestão Financeira, Caixa e Dashboards** — Fases 23-27 (shipped 2026-05-22)
- ✅ **v2.1 Cobrança e Fiscal do Cliente** — Fases 28-31 (shipped 2026-06-08)
- ✅ **v2.2 Gestão de Produtos do Athos (API)** — Fases 32-33 (shipped 2026-06-17) — Phase 34 descartada (decisão: API-only)
- ✅ **v2.3 White-Label Multi-Empresa** — Fases 35-36 + 999.1 (shipped 2026-06-23)
- ✅ **v2.4 Defaults Inteligentes no Cadastro de Produto** — Fases 37-38 (shipped 2026-06-28)
- 🔄 **v2.5 API de Produtos Compostos (Kits)** — Fases 39-40 (em andamento)

Detalhes completos de cada milestone arquivados em `.planning/milestones/v{X.Y}-ROADMAP.md`.

---

## v2.5 — API de Produtos Compostos (Kits) no Athos

**Goal:** Montar e gerenciar produtos compostos (kits) no Athos via API REST — um produto master composto de N produtos detail com quantidade — no mesmo padrão backend-only das APIs de produto (v2.2/v2.4). CRUD completo de composição com validação de integridade, gerenciamento automático do flag usaprodutocomposto e escrita controlada na tabela produto_composto (nova exceção à regra read-only do Athos).

**External prerequisite (gate before Phase 40 verification):**
> ⚠️ GRANT INSERT, UPDATE, DELETE ON TABLE produto_composto TO <usuario_api> + GRANT USAGE, SELECT ON SEQUENCE produto_composto_idprodutocomposto_seq — deve ser executado por DBA no banco Athos antes que qualquer endpoint de escrita possa ser verificado. Sem este GRANT toda operação de escrita falha em runtime com pg error 42501.

### Phases

- [ ] **Phase 39: Scaffold, Leitura e Spikes de Introspecão** - Spikes de introspecção no DB de referência (192.168.3.198), extração de validarFkExiste para util reutilizável, e endpoint GET de listagem enriquecida de componentes — tudo que não depende do write GRANT
- [ ] **Phase 40: Write CRUD (POST + PATCH + DELETE + flag usaprodutocomposto)** - Quatro endpoints de escrita com validação dual de FK, gerenciamento transacional do flag, PK serial via RETURNING e mapeamento completo de erros Postgres; cobertura de testes Jest

### Phase Details

### Phase 39: Scaffold, Leitura e Spikes de Introspecão

**Goal:** Os fundamentos do módulo estão provados e o endpoint de leitura está funcionando antes de qualquer dependência do write GRANT — spikes de introspecção resolvem todas as incógnitas do DB (domínio quantidade, UNIQUE constraint, triggers), o util validarFkExiste está extraído, e o operador pode listar componentes de um kit enriquecidos com dados do produto detail.

**Depends on:** Nothing — requer apenas o SELECT GRANT já existente no Athos

**Requirements:** COMP-07, COMP-08, COMP-01

**Research flag:** NEEDS RESEARCH-PHASE — os 3 spikes (COMP-07) requerem acesso live ao DB de referência 192.168.3.198; não podem ser respondidos pelo codebase.

**Success Criteria** (what must be TRUE):
  1. GET /athos/produtos/:idprodutomaster/composicao retorna lista de componentes enriquecida com descricaoproduto e statusproduto do produto detail via JOIN (não N+1)
  2. GET retorna array vazio (sem erro) quando o master existe mas não tem componentes cadastrados em produto_composto
  3. GET retorna 404 quando idprodutomaster não existe no catálogo de produtos
  4. Os 3 spikes de introspecção no DB de referência (192.168.3.198) estão concluídos e documentados no plano de fase: (a) tipo-base e cláusula CHECK do domínio quantidade, (b) existência de constraint UNIQUE em (idprodutomaster, idprodutodetail), (c) inventário completo de triggers/rules em produto_composto
  5. validarFkExiste extraído para athos-fk.util.ts e AthosProdutoService importa do util sem mudança de comportamento — testes existentes do serviço de produto continuam passando sem alteração

**Plans:** 3 plans

Plans:
- [ ] 39-01-PLAN.md — COMP-07: 3 spikes de introspecção no DB de referência (192.168.3.198), entrega manual (usuário cola resultados) (Wave 1)
- [ ] 39-02-PLAN.md — COMP-08: extrair validarFkExiste para athos-fk.util.ts + teste do util; re-wirear AthosProdutoService sem mudança de comportamento (Wave 1)
- [ ] 39-03-PLAN.md — COMP-01: GET /athos/produtos/:idprodutomaster/composicao (lista enriquecida via LEFT JOIN) + service/controller/DTOs scaffold + registro no AthosModule (Wave 2)

---

### Phase 40: Write CRUD (POST + PATCH + DELETE + flag usaprodutocomposto)

**Goal:** Operador pode criar, editar quantidade e remover componentes de um kit com garantias de integridade — validação dual de FK, auto-gerenciamento transacional do flag usaprodutocomposto no primeiro add e último remove, PK gerada pelo banco via RETURNING, e todos os erros do Postgres mapeados para respostas HTTP acionáveis.

**Depends on:** Phase 39

**External gate (before verification):**
> ⚠️ GRANT INSERT, UPDATE, DELETE ON TABLE produto_composto + GRANT USAGE, SELECT ON SEQUENCE produto_composto_idprodutocomposto_seq devem estar confirmados no banco Athos antes de iniciar a verificação desta fase. Todo endpoint de escrita retorna 500 sem este GRANT.

**Requirements:** COMP-02, COMP-03, COMP-04, COMP-05, COMP-06

**Success Criteria** (what must be TRUE):
  1. Operador pode adicionar um componente via POST e a resposta retorna idprodutocomposto gerado pelo banco (serial via RETURNING — nunca MAX+1); rejeita auto-referência (master == detail), par duplicado e detail com statusproduto = false com os HTTP codes corretos (422/409)
  2. Ao adicionar o primeiro componente de um kit, usaprodutocomposto do produto master é automaticamente definido como true dentro da mesma transação BEGIN/COMMIT do INSERT em produto_composto
  3. Operador pode atualizar a quantidade de um componente via PATCH; recebe 404 quando o par (idprodutomaster, idprodutodetail) não existe; quantidade inválida (viola domínio) retorna 422
  4. Operador pode remover um componente via DELETE físico; ao remover o último componente, usaprodutocomposto do master é automaticamente definido como false dentro da mesma transação — DELETE físico é correto aqui (produto_composto é tabela de composição, distinta da regra de soft-delete de produto)
  5. Erros Postgres mapeados corretamente para HTTP: 42501 → 500 com mensagem acionável apontando o GRANT ausente; 23505 → 409 (par duplicado); 23514 → 422 (violação de domínio); 23503 → 422 (FK); master/detail inexistente → 422; testes Jest unitários cobrem todos esses cenários incluindo validarFkExiste chamado para ambos master e detail

**Plans:** TBD

---

### Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 39. Scaffold, Leitura e Spikes | 0/3 | Not started | - |
| 40. Write CRUD | 0/TBD | Not started | - |

---

## Backlog

### Phase 999.1: Gerenciamento de layout do PDF de orçamento pela interface (COMPLETE — 2026-06-23, shipped com v2.3)

**Goal:** Permitir trocar o layout/template do PDF de orçamento a qualquer momento pelo próprio sistema (usuário final), sem alterar código/git nem reiniciar o servidor.
**Plans:** 6/6 plans complete

Plans:

- [x] 999.1-01-PLAN.md — Storage: modelo Prisma PdfTemplate + migration + seed dos 3 presets + scaffolds de teste (Wave 1)
- [x] 999.1-02-PLAN.md — AdminAuthGuard (x-admin-api-key) + @AdminOnly + env ADMIN_API_KEY (Wave 1)
- [x] 999.1-03-PLAN.md — Render seguro: renderHtml usa template ativo+fallback + hardening Handlebars/Puppeteer anti-SSRF (Wave 2)
- [x] 999.1-04-PLAN.md — 3 presets com fontes/ícones inline + dehardcode do contato (Wave 2)
- [x] 999.1-05-PLAN.md — Módulo backend: upload/validar/ativar/excluir/preview + checkpoint sanitize-html (Wave 3)
- [x] 999.1-06-PLAN.md — Frontend: tela de gerenciamento (galeria/upload/preview) + rotas proxy admin (Wave 4)

**✓ Verificação:** `999.1-VERIFICATION.md` — PASSED (8/8 must-haves; UAT manual aprovado + validação Nyquist + suítes verdes).
**✓ Segurança:** `999.1-SECURITY.md` — `threats_open: 0` (T-AUTH mitigado com rate-limit; T-SANDBOX `--no-sandbox` aceito como risco para deploy interno; dívida do code review registrada).
**⚠ Ação obrigatória pré-deploy (CR-01):** o gate de senha do painel é *fail-open* — definir `ADMIN_API_KEY`, `CONFIG_PANEL_PASSWORD` e `CONFIG_PANEL_SESSION_SECRET` (e adicioná-los ao `deploy/stack.env.example`) antes de subir, senão o painel admin sobe sem proteção. Ver `999.1-REVIEW.md`.

---

## Estado atual

**Milestone v2.5 (API de Produtos Compostos / Kits) em andamento.** Roadmap definido em 2026-06-29.

Próximo passo: `/gsd-plan-phase 39`

### Dívida diferida (não bloqueia)

- UAT/verificação humana das Fases 32 e 33 (ciclo v2.2, APIs de Produto) ficaram pendentes — diferidas no fechamento do v2.3 (ver STATE.md → Deferred Items). Tratar com `/gsd-audit-uat` num saneamento futuro.
- Segurança v2.3: ação pré-deploy CR-01 (env vars do painel admin) — ver `999.1-SECURITY.md`.

## Histórico arquivado

Cada milestone tem roadmap e requisitos completos em `.planning/milestones/`:

- `v{X.Y}-ROADMAP.md` — fases, planos e critérios de sucesso
- `v{X.Y}-REQUIREMENTS.md` — requisitos com rastreabilidade
- `v2.1-MILESTONE-AUDIT.md` — auditoria de fechamento (status: passed)
