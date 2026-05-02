# STATE.md - Sistema de Orcamento BomCusto

**Last updated:** 2026-05-02 (v1.0 shipped)
**Current phase:** 6 - Aprovacao de Orcamento pelo Cliente com Associacao Athos (v1.1 planning)

---

## Project Status

| Phase | Title | Status |
|-------|-------|--------|
| 1 | Seguranca e Autenticacao | complete (v1.0) |
| 2 | Confiabilidade de Integracoes | complete (v1.0) |
| 3 | Correcoes de Fluxo e Qualidade de Dados | complete (v1.0) |
| 4 | Testes e CI | complete (v1.0) |
| 5 | UX do Painel e Area do Cliente | complete (v1.0) |
| 6 | Aprovação de Orçamento pelo Cliente com Associação Athos | not-started |

## Active Context

- **Branch atual:** main
- **Ultimo commit de codigo:** 2026-05 - feat(05): filter pills+toast+paginated fix; form validation; integration badges; customer approve+status pages
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

## Accumulated Context

### Roadmap Evolution
- Phase 6 adicionada: Aprovação de Orçamento pelo Cliente com Associação Athos

## Notes

- Memorias do projeto disponiveis em memory/ (12 arquivos com detalhes de integracoes)
- NFS-e: regras criticas documentadas em memory/nfse-iibrasil-integracao.md - NAO alterar hash/aliquotas
- EFI: certificados mTLS em base64 nas env vars EFI_CERT_PEM / EFI_KEY_PEM
- Deploy: VPS via Tailscale, imagens no ghcr.io/martoxak/
- Summaries da fase 1:
  - .planning/phases/01-seguranca-e-autenticacao/01-01-SUMMARY.md
  - .planning/phases/01-seguranca-e-autenticacao/01-02-SUMMARY.md
- Summaries da fase 5:
  - .planning/phases/05-ux-do-painel-e-area-do-cliente/05-01-SUMMARY.md
  - .planning/phases/05-ux-do-painel-e-area-do-cliente/05-02-SUMMARY.md
  - .planning/phases/05-ux-do-painel-e-area-do-cliente/05-03-SUMMARY.md
  - .planning/phases/05-ux-do-painel-e-area-do-cliente/05-04-SUMMARY.md

- Summaries da fase 4:
  - .planning/phases/04-testes-e-ci/04-01-SUMMARY.md
---
*Initialized: 2026-05-01 via /gsd-new-project*
