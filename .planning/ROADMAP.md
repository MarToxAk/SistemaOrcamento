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

Detalhes completos de cada milestone arquivados em `.planning/milestones/v{X.Y}-ROADMAP.md`.

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

**Milestone v2.3 (White-Label Multi-Empresa) concluído e arquivado em 2026-06-23.** Aguardando início do próximo milestone.

Próximo passo: `/gsd-new-milestone`

### Dívida diferida (não bloqueia)

- UAT/verificação humana das Fases 32 e 33 (ciclo v2.2, APIs de Produto) ficaram pendentes — diferidas no fechamento do v2.3 (ver STATE.md → Deferred Items). Tratar com `/gsd-audit-uat` num saneamento futuro.
- Segurança v2.3: ação pré-deploy CR-01 (env vars do painel admin) — ver `999.1-SECURITY.md`.

## Histórico arquivado

Cada milestone tem roadmap e requisitos completos em `.planning/milestones/`:

- `v{X.Y}-ROADMAP.md` — fases, planos e critérios de sucesso
- `v{X.Y}-REQUIREMENTS.md` — requisitos com rastreabilidade
- `v2.1-MILESTONE-AUDIT.md` — auditoria de fechamento (status: passed)
