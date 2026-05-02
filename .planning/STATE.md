# STATE.md - Sistema de Orcamento BomCusto

**Last updated:** 2026-05-01
**Current phase:** 1 - Seguranca e Autenticacao (implemented, pending UAT)

---

## Project Status

| Phase | Title | Status |
|-------|-------|--------|
| 1 | Seguranca e Autenticacao | in-review |
| 2 | Confiabilidade de Integracoes | not-started |
| 3 | Correcoes de Fluxo e Qualidade de Dados | not-started |
| 4 | Testes e CI | not-started |
| 5 | UX do Painel e Area do Cliente | not-started |

## Active Context

- **Branch atual:** main
- **Ultimo commit de codigo:** 2026-05-01 - execucao da fase 1 (seguranca)
- **Codebase map:** .planning/codebase/ (7 documentos - gerados em 2026-05-01)
- **Risco principal remanescente:** ausencia de testes automatizados de seguranca e UAT runtime dos novos guards

## Decisions Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-05-01 | Mapear codebase antes de planejar | Projeto brownfield - necessario entender estado atual |
| 2026-05-01 | Granularity: Coarse | 5 fases amplas para time pequeno |
| 2026-05-01 | Auth via Chatwoot apenas | Equipe ja usa Chatwoot; evitar segundo sistema de login |
| 2026-05-01 | Phase 1 = Seguranca (prioridade maxima) | Sistema em producao sem qualquer autenticacao |
| 2026-05-01 | Execucao inline da fase 1 | Runtime local sem gsd-sdk, aplicado fallback manual do workflow |

## Notes

- Memorias do projeto disponiveis em memory/ (12 arquivos com detalhes de integracoes)
- NFS-e: regras criticas documentadas em memory/nfse-iibrasil-integracao.md - NAO alterar hash/aliquotas
- EFI: certificados mTLS em base64 nas env vars EFI_CERT_PEM / EFI_KEY_PEM
- Deploy: VPS via Tailscale, imagens no ghcr.io/martoxak/
- Summaries da fase 1:
  - .planning/phases/01-seguranca-e-autenticacao/01-01-SUMMARY.md
  - .planning/phases/01-seguranca-e-autenticacao/01-02-SUMMARY.md

---
*Initialized: 2026-05-01 via /gsd-new-project*
