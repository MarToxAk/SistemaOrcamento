# Milestones — Sistema de Orçamento BomCusto

---

## v1.0 — MVP: Segurança, Confiabilidade e UX

**Shipped:** 2026-05-02
**Phases:** 1–5 | **Plans:** 8

**Delivered:** Sistema seguro, com integrações confiáveis, UX polida e fluxo de aprovação do cliente.

**Key accomplishments:**
1. Autenticação global (API key guard + HMAC EFI webhooks + rate limiting)
2. Logger estruturado em todas as integrações + enviarParaCliente async + pg.Pool Athos
3. Máquina de estados, paginação, isAssociated e correções de fluxo
4. 37 testes Jest + CI GitHub Actions
5. Filter pills, badges de integração, validação de form, páginas do cliente

Archive: `.planning/milestones/v1.0-ROADMAP.md`

---

## v1.1 — Aprovação de Orçamento com Associação Athos

**Shipped:** 2026-05-03
**Phases:** 6 | **Plans:** 4

**Delivered:** Fluxo completo de aprovação de orçamento via link público integrado ao Athos.

**Key accomplishments:**
1. Correção do link de aprovação (D-03): `/orcamento/{id}/approve` em vez de `/api/quotes/`
2. Página de aprovação exibe itens e total em BRL vindos do Athos
3. Aprovação registrada em tempo real no sistema (botão → status APROVADO)
4. Endereço manual do tomador na emissão NFS-e (gap da fase 2 fechado)
5. Envio de mensagem: manual via botão (não auto-dispatch)

**Stats:** 10 commits | 23 arquivos | +2.535 / -101 linhas | 2 dias

Archive: `.planning/milestones/v1.1-ROADMAP.md`

---
