# STATE.md - Sistema de Orcamento BomCusto

**Last updated:** 2026-05-03 (v1.1 archived)
**Current phase:** Post-v1.1 — next: /gsd-new-milestone for v1.2

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

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-03)

**Core value:** Orçamentos criados, aprovados e cobrados sem intervenção manual
**Current focus:** Planning next milestone (v1.2)

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
| 2026-05-01 | Phase 1 = Seguranca (prioridade maxima) | Sistema em producao sem qualquer autenticacao |
| 2026-05-03 | Envio manual (botao Enviar) | Operador confirmou em UAT: nao quer auto-dispatch |

## Notes

- Memorias do projeto disponiveis em memory/ (12 arquivos com detalhes de integracoes)
- NFS-e: regras criticas documentadas em memory/nfse-iibrasil-integracao.md - NAO alterar hash/aliquotas
- EFI: certificados mTLS em base64 nas env vars EFI_CERT_PEM / EFI_KEY_PEM
- Deploy: VPS via Tailscale, imagens no ghcr.io/martoxak/
- Fases 1-5 arquivadas em milestones/v1.0-ROADMAP.md
- Fase 6 arquivada em milestones/v1.1-ROADMAP.md

---
*Initialized: 2026-05-01 via /gsd-new-project*
