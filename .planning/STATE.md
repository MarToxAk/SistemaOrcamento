# STATE.md - Sistema de Orcamento BomCusto

Last updated: 2026-05-04
Current phase: 12 (not started — discuss/plan pending)

---

## Current Position

Phase: 12 - Conciliacao Athos no backend
Plan: -
Status: Not started
Last activity: 2026-05-04 - Phase 11 verified and closed

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
| 12 | Conciliacao Athos no backend | pending (v1.4) |
| 13 | Gatilhos de checagem e sincronizacao de status | pending (v1.4) |
| 14 | Desconto controlado na emissao de NFS-e | pending (v1.4) |

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-04)
Core value: Orcamentos criados, aprovados e cobrados sem intervencao manual
Current focus: v1.4 pagamentos EFI/Athos no backend + desconto NFS-e

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

## Notes

- SDK gsd nao encontrado no ambiente atual; ajustes de milestone feitos manualmente
- Proximo passo: /gsd-plan-phase 11
- Implementacao anterior baseada em listener externo nao sera reutilizada (sem n8n)


