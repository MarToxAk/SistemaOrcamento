# STATE.md - Sistema de Orcamento BomCusto

**Last updated:** 2026-05-03 (v1.2 archived)
**Current phase:** none (between milestones)

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
| 7 | Mensagens Automaticas ao Cliente via Chatwoot | complete (v1.2) |
| 8 | UX das Paginas Publicas do Cliente | complete (v1.2) |

## Current Position

Phase: none
Status: Between milestones — v1.2 archived
Last activity: 2026-05-03 - Milestone v1.2 archived (tag v1.2)

## Project Reference

See: .planning/PROJECT.md (updated 2026-05-03)

**Core value:** Orcamentos criados, aprovados e cobrados sem intervencao manual
**Current focus:** v1.3 planning (backlog a definir)

## Active Context

- **Branch atual:** ship/phase-07
- **PR:** #1 aberto - https://github.com/MarToxAk/SistemaOrcamento/pull/1
- **Ultima versao shipped:** v1.2 (tag: v1.2)
- **Codebase map:** .planning/codebase/ (7 documentos - gerados em 2026-05-01)
- **Milestones archived:** v1.0, v1.1, v1.2

## Decisions Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-05-01 | Mapear codebase antes de planejar | Projeto brownfield - necessario entender estado atual |
| 2026-05-01 | Granularity: Coarse | 5 fases amplas para time pequeno |
| 2026-05-01 | Auth via Chatwoot apenas | Equipe ja usa Chatwoot; evitar segundo sistema de login |
| 2026-05-03 | Envio manual (botao Enviar) | Operador confirmou em UAT: nao quer auto-dispatch na criacao |
| 2026-05-03 | Notificar EM_PRODUCAO/PRONTO/ENTREGUE/CANCELADO | Status intermediarios internos nao chegam ao cliente |
| 2026-05-03 | Templates fixos no codigo (v1.2) | Configuracao pelo painel fica para milestone futuro |

## Notes

- Memorias do projeto disponiveis em memory/ (12 arquivos com detalhes de integracoes)
- NFS-e: regras criticas documentadas em memory/nfse-iibrasil-integracao.md - NAO alterar hash/aliquotas
- EFI: certificados mTLS em base64 nas env vars EFI_CERT_PEM / EFI_KEY_PEM
- Deploy: VPS via Tailscale, imagens no ghcr.io/martoxak/
- v1.0 arquivado em milestones/v1.0-ROADMAP.md
- v1.1 arquivado em milestones/v1.1-ROADMAP.md
- v1.2 arquivado em milestones/v1.2-ROADMAP.md + milestones/v1.2-REQUIREMENTS.md
