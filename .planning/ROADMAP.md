# Roadmap — Sistema de Orcamento BomCusto

**Version:** 1.1
**Date:** 2026-05-02

---

## Milestones

- Checkmark **v1.0 MVP** — Phases 1-5 (shipped 2026-05-02)
- WIP **v1.1** — Phase 6+ (planned)

---

## Phases

### v1.0 MVP (Phases 1-5) — SHIPPED 2026-05-02

- [x] Phase 1: Seguranca e Autenticacao
- [x] Phase 2: Confiabilidade de Integracoes
- [x] Phase 3: Correcoes de Fluxo e Qualidade de Dados
- [x] Phase 4: Testes e CI
- [x] Phase 5: UX do Painel e Area do Cliente

Full details: .planning/milestones/v1.0-ROADMAP.md

### v1.1 (Planned)

## Phase 6 - Aprovacao de Orcamento pelo Cliente com Associacao Athos
**Status:** not-started
**Goal:** Pagina publica para o cliente associado ao orcamento visualizar e aprovar; envio automatico de mensagem ao associar idcliente.

**Requirements covered:** FR-07.1, FR-07.2, FR-07.3 (integracao Athos)

### Plans
- TBD

**UAT:**
- [ ] Ao associar idcliente a um orcamento no Athos -> mensagem automatica enviada ao cliente
- [ ] Cliente acessa pagina publica de aprovacao -> visualiza detalhes do orcamento
- [ ] Cliente aprova orcamento -> status atualiza para APROVADO no sistema
- [ ] Link de aprovacao expira ou invalida apos uso

---

## Backlog (Future)

- Relatorios e exportacao CSV de orcamentos
- Notificacoes em tempo real (WebSocket) para mudanca de status
- Refactor gradual de quotes.service.ts
- Migrar PDF de Puppeteer para Gotenberg
- Redis para cache do token EFI
- RBAC por role (ADMIN / VENDEDOR / ATENDENTE)

---
*Roadmap v1.1 - 2026-05-02*
