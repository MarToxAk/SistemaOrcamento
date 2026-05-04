# STATE.md - Sistema de Orcamento BomCusto

Last updated: 2026-05-04
Current phase: 19-api-de-busca-de-cliente-athos
Milestone: v1.8 (in progress)

---

## Current Position

Phase: 20-resolucao-de-tomador-por-cliente-selecionado
Plan: 20-01-PLAN.md
Status: complete
Last activity: 2026-05-04 - Phase 20 executed: clienteAthosId + resolucao tomador + 5 testes passando

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
| 18 | Correcoes NFS-e - RPS e Tomador | complete (v1.7) |
| 19 | API de busca de cliente Athos | complete (v1.8) |
| 20 | Resolucao de tomador por cliente selecionado | complete (v1.8) |
| 21 | UI NFS-e, observabilidade e testes | planned (v1.8) |

## Milestones Archived

- v1.0 — phases 1-5 (.planning/milestones/v1.0-ROADMAP.md)
- v1.1 — phase 6 (.planning/milestones/v1.1-ROADMAP.md)
- v1.2 — phases 7-8 (.planning/milestones/v1.2-ROADMAP.md)
- v1.3 — phases 9-10 (.planning/milestones/v1.3-ROADMAP.md)
- v1.4 — phases 11-14 (.planning/milestones/v1.4-ROADMAP.md)
- v1.5 — phases 15-16 (.planning/milestones/v1.5-ROADMAP.md)
- v1.6 — phase 17 (.planning/milestones/v1.6-ROADMAP.md)
- v1.7 — phase 18 (.planning/milestones/v1.7-ROADMAP.md)

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-04)
Core value: Orcamentos criados, aprovados e cobrados sem intervencao manual
Current focus: v1.8 Phase 19 - API de busca de cliente Athos

## Active Context

- Branch atual: planning/v1.8-athos-nfse-cliente-busca
- PR ativo: none
- Ultima versao tagged: v1.7
- Milestones archived: v1.0 a v1.7
- Escopo v1.8: busca de cliente Athos para emissao de NFS-e com resolucao de tomador e selecao manual no frontend

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
| 2026-05-04 | Iniciar v1.8 focado em busca de cliente Athos no fluxo NFS-e | Reduz erro de tomador e evita preenchimento manual inconsistente |

## Notes

- SDK gsd nao encontrado no ambiente atual; ajustes de milestone feitos manualmente
- Milestone v1.8 iniciou em modo planejamento para detalhar fases 19-21
- Tabelas-alvo informadas para busca de cliente: cliente, cliente_fisico, cliente_juridico, cliente_endereco


