# Roadmap — Sistema de Orcamento BomCusto

**Version:** 1.2
**Date:** 2026-05-03

---

## Milestones

- ✅ **v1.0 MVP** — Phases 1–5 (shipped 2026-05-02)
- ✅ **v1.1 Aprovação Athos** — Phase 6 (shipped 2026-05-03)
- 🚧 **v1.2 Mensagens e UX do Cliente** — Phases 7–8 (in progress)

---

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1–5) — SHIPPED 2026-05-02</summary>

Full details: .planning/milestones/v1.0-ROADMAP.md

- [x] Phase 1: Seguranca e Autenticacao
- [x] Phase 2: Confiabilidade de Integracoes
- [x] Phase 3: Correcoes de Fluxo e Qualidade de Dados
- [x] Phase 4: Testes e CI
- [x] Phase 5: UX do Painel e Area do Cliente

</details>

<details>
<summary>✅ v1.1 Aprovação Athos (Phase 6) — SHIPPED 2026-05-03</summary>

Full details: .planning/milestones/v1.1-ROADMAP.md

- [x] Phase 6: Aprovacao de Orcamento pelo Cliente com Associacao Athos (4 planos)

</details>

### 🚧 v1.2 Mensagens e UX do Cliente

## Phase 7 - Mensagens Automáticas ao Cliente via Chatwoot
**Status:** not started
**Goal:** Enviar mensagem automática ao cliente no Chatwoot em cada evento relevante do serviço — aprovação, pagamento PIX (parcial/total/parcelado) e mudanças de status — com texto amigável e emojis.

**Requirements covered:** MSG-01, MSG-02, MSG-03, MSG-04, MSG-05

**Depends on:** Phase 6 (Chatwoot integration, enviarParaCliente pattern, changeStatus)

**Plans:** a definir

**Success criteria:**
1. Aprovar orçamento via link → cliente recebe mensagem Chatwoot com emoji de confirmação e próximo passo
2. PIX parcial recebido (webhook EFI) → cliente recebe mensagem com valor pago e saldo restante
3. PIX total recebido (webhook EFI) → cliente recebe mensagem de pagamento completo/celebração
4. Pagamento parcelado confirmado → cliente recebe mensagem confirmando parcela
5. Operador muda status para EM_PRODUCAO/PRONTO/ENTREGUE/CANCELADO → cliente recebe mensagem descrevendo o status em linguagem amigável

---

## Phase 8 - UX das Páginas Públicas do Cliente
**Status:** not started
**Goal:** Reformular as páginas públicas de aprovação e status do orçamento para ter layout consistente com a identidade visual da Bom Custo, mais amigável e informativo para o cliente.

**Requirements covered:** UX-01, UX-02, UX-03

**Depends on:** Phase 5 (páginas existentes), Phase 6 (campos de itens/total na approve page)

**Plans:** a definir

**Success criteria:**
1. Página `/orcamento/:id/approve` usa logo Bom Custo, gradiente de fundo, card branco centralizado — visualmente consistente com identidade da marca
2. Página `/orcamento/:id/status` exibe status atual com ícone/emoji específico por status e descrição em português claro
3. Ambas as páginas são responsivas e funcionam bem em mobile
4. Layout das páginas públicas é coeso e distinguível de páginas do painel interno

---

## Backlog (Future)

- Relatorios e exportacao CSV de orcamentos
- Notificacoes em tempo real (WebSocket) para mudanca de status
- Refactor gradual de quotes.service.ts
- Migrar PDF de Puppeteer para Gotenberg
- Redis para cache do token EFI
- RBAC por role (ADMIN / VENDEDOR / ATENDENTE)
- Templates de mensagem configuráveis pelo painel
- Histórico de mensagens enviadas ao cliente

---
*Roadmap v1.2 - 2026-05-03*
