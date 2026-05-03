# STATE.md - Sistema de Orcamento BomCusto

**Last updated:** 2026-05-03 (v1.2 — phase 7 complete)
**Current phase:** Phase 8 — UX das Páginas Públicas do Cliente

---

## Project Status

| Phase | Title | Status |
|-------|-------|--------|
| 1 | Seguranca e Autenticacao | complete (v1.0) |
| 2 | Confiabilidade de Integracoes | complete (v1.0) |
| 3 | Correcoes de Fluxo e Qualidade de Dados | complete (v1.0) |
| 4 | Testes e CI | complete (v1.0) |
| 5 | UX do Painel e Area do Cliente | complete (v1.0) |
| 6 | Aprovação de Orçamento pelo Cliente com Associação Athos | complete (v1.1) |
| 7 | Mensagens Automáticas ao Cliente via Chatwoot | complete (v1.2) |
| 8 | UX das Páginas Públicas do Cliente | not started |

## Current Position

Phase: 8 — UX das Páginas Públicas do Cliente
Plan: — (not yet planned)
Status: Awaiting planning
Last activity: 2026-05-03 — Phase 7 UAT PASSED (10/10 tests) — ready for Phase 8

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-03)

**Core value:** Orçamentos criados, aprovados e cobrados sem intervenção manual
**Current focus:** v1.2 — Mensagens e UX do Cliente

## Active Context

- **Branch atual:** main
- **Última versão shipped:** v1.1 (tag: v1.1)
- **Codebase map:** .planning/codebase/ (7 documentos - gerados em 2026-05-01)
- **Milestones archived:** v1.0, v1.1

## Decisions Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-05-01 | Mapear codebase antes de planejar | Projeto brownfield - necessario entender estado atual |
| 2026-05-01 | Granularity: Coarse | 5 fases amplas para time pequeno |
| 2026-05-01 | Auth via Chatwoot apenas | Equipe ja usa Chatwoot; evitar segundo sistema de login |
| 2026-05-03 | Envio manual (botao Enviar) | Operador confirmou em UAT: nao quer auto-dispatch na criação |
| 2026-05-03 | Notificar EM_PRODUCAO/PRONTO/ENTREGUE/CANCELADO | Status intermediários internos não chegam ao cliente |
| 2026-05-03 | Templates fixos no código (v1.2) | Configuração pelo painel fica para milestone futuro |

## Notes

- Memorias do projeto disponiveis em memory/ (12 arquivos com detalhes de integracoes)
- NFS-e: regras criticas documentadas em memory/nfse-iibrasil-integracao.md - NAO alterar hash/aliquotas
- EFI: certificados mTLS em base64 nas env vars EFI_CERT_PEM / EFI_KEY_PEM
- Deploy: VPS via Tailscale, imagens no ghcr.io/martoxak/
- v1.0 arquivado em milestones/v1.0-ROADMAP.md
- v1.1 arquivado em milestones/v1.1-ROADMAP.md

---
*Initialized: 2026-05-01 via /gsd-new-project*
