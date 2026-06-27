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
- 🔄 **v2.4 Defaults Inteligentes no Cadastro de Produto** — Fases 37-38 (em andamento)

Detalhes completos de cada milestone arquivados em `.planning/milestones/v{X.Y}-ROADMAP.md`.

---

## v2.4 — Defaults Inteligentes no Cadastro de Produto

**Goal:** Produtos criados pela API saem prontos para uso (ativos, vendáveis e fiscalmente válidos) sem ajuste manual no Athos, preenchendo campos faltantes com os valores mais usados pelos produtos já existentes (moda).

### Phases

- [x] **Phase 37: Motor de Defaults (Descoberta por Moda)** - Serviço NestJS que calcula e armazena em cache a moda de cada campo configurável a partir dos produtos ativos do Athos, com fallback seguro quando não há amostra (completed 2026-06-27)
- [ ] **Phase 38: Aplicação de Defaults na Criação de Produto** - Integração do motor de defaults no fluxo de criação: defaults operacionais e fiscais preenchidos automaticamente, override do operador garantido, edição não alterada, log de defaults aplicados

### Phase Details

#### Phase 37: Motor de Defaults (Descoberta por Moda)

**Goal:** Um serviço dedicado calcula a moda de cada campo configurável do produto a partir dos produtos ativos do Athos, armazena o resultado em cache e fornece fallback seguro quando não há amostra suficiente.

**Depends on:** Nothing — serviço independente que apenas lê do Athos (read-only)

**Requirements:** DEFD-01, DEFD-02, DEFD-03, DEFD-04

**Success Criteria** (what must be TRUE):

  1. Dado um conjunto de produtos ativos no Athos, o serviço retorna o valor mais frequente de cada campo configurável (ex: se 8 de 10 produtos têm `icms = 'NAO'`, o default retornado é `'NAO'`)
  2. Campos com valor nulo ou vazio nos produtos existentes são ignorados no cálculo — apenas valores preenchidos participam da moda
  3. O resultado da moda é reutilizado entre chamadas consecutivas sem nova consulta ao banco Athos (cache válido por TTL ou por sessão de execução)
  4. Quando um campo não possui nenhuma amostra válida (todos nulos ou tabela vazia), o serviço retorna um valor de fallback seguro e não lança exceção

**Plans:** 1/1 plans complete

- [x] 37-01-PLAN.md — Motor de defaults: função pura da moda (util), serviço singleton com cache/pg Pool e registro no AthosModule (DEFD-01..04)

---

#### Phase 38: Aplicação de Defaults na Criação de Produto

**Goal:** O endpoint de criação de produto preenche automaticamente campos omitidos com os valores do motor de defaults (operacionais e fiscais), preserva integralmente qualquer valor enviado pelo operador, não altera produtos já existentes na edição, e registra em log quais defaults foram aplicados.

**Depends on:** Phase 37

**Requirements:** DOPR-01, DOPR-02, DFIS-01, DFIS-02, DFIS-03, OVRD-01, OVRD-02, OVRD-03, OBSV-01

**Success Criteria** (what must be TRUE):

  1. Um produto criado sem informar `statusproduto` e `vendeproduto` nasce ativo e vendável; criado sem informar `controlaestoque` e `baixarestoque` recebe valores sensatos — confirmável ao buscar o produto recém-criado no Athos
  2. Campos fiscais omitidos no DTO (`icms`, `icmsnfe`, `tributacao`, `tributacaonfe`, `codigocsosn`, `codigocsosnnfe`, `origem`, `origemnfe`, `tipoitem`, `piscst`, `cofinscst`, `idcfopsaida`, `ncm`) são preenchidos com o valor de moda calculado pelo Phase 37
  3. Qualquer valor enviado explicitamente no DTO de criação — mesmo que coincida com o default — chega intacto ao banco; o default nunca sobrescreve o operador
  4. Uma chamada de edição (PATCH/PUT) de produto existente não injeta nem altera campos via defaults — apenas o que o operador enviou é gravado
  5. Cada criação de produto gera uma entrada de log identificando campo a campo quais defaults foram aplicados e qual valor foi usado; criações sem defaults (operador preencheu tudo) geram log indicando que nenhum default foi necessário

**Plans:** TBD

---

### Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 37. Motor de Defaults | 1/1 | Complete   | 2026-06-27 |
| 38. Aplicação de Defaults na Criação | 0/? | Not started | - |

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

**Milestone v2.4 (Defaults Inteligentes no Cadastro de Produto) em andamento.** Roadmap definido em 2026-06-26.

Próximo passo: `/gsd-plan-phase 37`

### Dívida diferida (não bloqueia)

- UAT/verificação humana das Fases 32 e 33 (ciclo v2.2, APIs de Produto) ficaram pendentes — diferidas no fechamento do v2.3 (ver STATE.md → Deferred Items). Tratar com `/gsd-audit-uat` num saneamento futuro.
- Segurança v2.3: ação pré-deploy CR-01 (env vars do painel admin) — ver `999.1-SECURITY.md`.

## Histórico arquivado

Cada milestone tem roadmap e requisitos completos em `.planning/milestones/`:

- `v{X.Y}-ROADMAP.md` — fases, planos e critérios de sucesso
- `v{X.Y}-REQUIREMENTS.md` — requisitos com rastreabilidade
- `v2.1-MILESTONE-AUDIT.md` — auditoria de fechamento (status: passed)
