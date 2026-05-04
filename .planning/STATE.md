# STATE.md - Sistema de Orcamento BomCusto

Last updated: 2026-05-04
Current phase: 17-correcao-desconto-nfse
Milestone: v1.6 (in progress)

---

## Current Position

Phase: 17-correcao-desconto-nfse — COMPLETE
Plan: —
Status: Phase 17 verified and complete — v1.6 pronto para ship
Last activity: 2026-05-04 — Phase 17 completa; verificacao passed (5/5 must-haves)

## Project Status

| Phase | Title | Status |
|-------|-------|--------|
| 1 | Seguranca e Autenticacao | complete (v1.0) |
| 2 | Confiabilidade de Integracoes | complete (v1.0) |
| 3 | Correcoes de Fluxo e Qualidade de Dados | complete (v1.0) |
| 4 | Testes e CI | complete (v1.0) |
| 5 | UX do Painel e Area do Cliente | complete (v1.0) |
| 6 | Aprovacao de Orcamento pelo Cliente com Associacao Athos | complete (v1.1) |
| 7 | Mensagens Automaticas ao Cliente via Chatwoot | complete (v1.2) |
| 8 | UX das Paginas Publicas do Cliente | complete (v1.2) |
| 9 | Fluxo de Migration Idempotente | complete (v1.3) |
| 10 | Operacao Segura de Update | complete (v1.3) |
| 11 | Webhook EFI sem assinatura obrigatoria | complete (v1.4) |
| 12 | Conciliacao Athos no backend | complete (v1.4) |
| 13 | Gatilhos de checagem e sincronizacao de status | complete (v1.4) |
| 14 | Desconto controlado na emissao de NFS-e | complete (v1.4) |
| 15 | Corrigir encoding NFS-e e proxy API | complete (v1.5) |
| 16 | UI de desconto no modal NFS-e | complete (v1.5) |
| 17 | Correcao do calculo de desconto no modal NFS-e | complete (v1.6) |

## Milestones Archived

- v1.0 — phases 1-5 (.planning/milestones/v1.0-ROADMAP.md)
- v1.1 — phase 6 (.planning/milestones/v1.1-ROADMAP.md)
- v1.2 — phases 7-8 (.planning/milestones/v1.2-ROADMAP.md)
- v1.3 — phases 9-10 (.planning/milestones/v1.3-ROADMAP.md)
- v1.4 — phases 11-14 (.planning/milestones/v1.4-ROADMAP.md)
- v1.5 — phases 15-16 (.planning/milestones/v1.5-ROADMAP.md)

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-04)
Core value: Orcamentos criados, aprovados e cobrados sem intervencao manual
Current focus: v1.6 Correcao do calculo de desconto no modal NFS-e

## Active Context

- Branch atual: ship/phase-07
- PR ativo: #1
- Ultima versao tagged: v1.2
- Milestones archived: v1.0, v1.1, v1.2, v1.3
- Escopo v1.4: webhook EFI sem auth HMAC obrigatoria + conciliacao Athos sem n8n + desconto NFS-e opcional

## Decisions Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-05-03 | Iniciar v1.3 focado em migration reliability | Erro de migration no update via compose bloqueia deploy |
| 2026-05-03 | Nao usar pesquisa externa para v1.3 | Escopo interno e tecnico conhecido |
| 2026-05-04 | Nao usar n8n para notificacao de pagamento | Fluxo deve ficar na aplicacao backend principal |
| 2026-05-04 | Checar pagamento no Athos ao abrir e ao enviar orcamento | Sincronizar status com estado real do caixa |
| 2026-05-04 | Incluir desconto opcional na emissao de NFS-e | Necessidade fiscal de deducao por percentual/valor sobre total pago |
| 2026-05-04 | v1.5 foca em dois bugs de NFS-e: mojibake no backend + UI de desconto ausente no frontend | Emissao de NFS-e com valor correto nao era possivel sem esses fixes |
| 2026-05-04 | v1.6 foca no path errado de quote?.totais?.valor no frontend | Base de calculo era sempre 0, quebrando todos os calculos de desconto no modal NFS-e |
| 2026-05-04 | Corrigir quote?.totais?.valor para quote?.body?.totais?.valor em 6 pontos do modal NFS-e | totais existe somente dentro de body no tipo QuoteDetail; acesso direto retornava undefined |
| 2026-05-04 | Usar Record<string, string | number | boolean> no body do POST NFS-e | descontoAtivo precisava ser boolean true para satisfazer igualdade estrita do backend |

## Notes

- SDK gsd nao encontrado no ambiente atual; ajustes de milestone feitos manualmente
- Proximo passo: /gsd-next para planejar a Phase 16
- Implementacao anterior baseada em listener externo nao sera reutilizada (sem n8n)


