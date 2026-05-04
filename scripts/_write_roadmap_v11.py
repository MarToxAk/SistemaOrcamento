new_roadmap = '''# Roadmap — Sistema de Orçamento BomCusto

**Version:** 1.1
**Date:** 2026-05-02

---

## Milestones

- ✅ **v1.0 MVP** — Phases 1–5 (shipped 2026-05-02) — [.planning/milestones/v1.0-ROADMAP.md](.planning/milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1** — Phase 6+ (planned)

---

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–5) — SHIPPED 2026-05-02</summary>

- [x] Phase 1: Segurança e Autenticação — guard global, HMAC webhooks, fail-fast env, throttling
- [x] Phase 2: Confiabilidade de Integrações — logger estruturado, interceptor, fire-and-forget, pg.Pool, health check
- [x] Phase 3: Correções de Fluxo e Qualidade de Dados — máquina de estados, paginação, isAssociated, race condition
- [x] Phase 4: Testes e CI — 32 testes Jest, GitHub Actions CI
- [x] Phase 5: UX do Painel e Área do Cliente — filter pills, toast, validação de form, badges, páginas do cliente

</details>

### 🚧 v1.1 (Planned)

## Phase 6 — Aprovação de Orçamento pelo Cliente com Associação Athos
**Status:** not-started
**Goal:** Página pública onde o cliente associado ao orçamento (via `idcliente` na tabela `orcamento` do Athos) pode visualizar e aprovar o pedido; envio automático de mensagem ao cliente no momento da associação ao orçamento.

**Requirements covered:** FR-07.1, FR-07.2, FR-07.3 (integração Athos)

### Plans
- TBD — use `/gsd-plan-phase 6` to create plans

**UAT:**
- [ ] Ao associar `idcliente` a um orçamento no Athos → mensagem automática enviada ao cliente
- [ ] Cliente acessa página pública de aprovação → visualiza detalhes do orçamento
- [ ] Cliente aprova orçamento → status atualiza para `APROVADO` no sistema
- [ ] Link de aprovação expira ou invalida após uso

---

## Backlog (Future)

- Relatórios e exportação CSV de orçamentos
- Notificações em tempo real (WebSocket) para mudança de status
- Refactor gradual de `quotes.service.ts` — extrair `QuotePaymentService`, `QuoteMessagingService`, `QuoteApprovalService`
- Migrar PDF de Puppeteer para Gotenberg (menos dependências de OS)
- Redis para cache do token EFI (preparação para múltiplas réplicas)
- RBAC por role (ADMIN / VENDEDOR / ATENDENTE) — atualmente todos têm acesso total

---
*Roadmap v1.1 — 2026-05-02*
'''

with open('.planning/ROADMAP.md', 'w', encoding='utf-8', newline='\\n') as f:
    f.write(new_roadmap)
print('done')
'''

import sys
exec(new_roadmap)
'''
