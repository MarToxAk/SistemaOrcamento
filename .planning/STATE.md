# STATE.md — Sistema de Orçamento BomCusto

**Last updated:** 2026-05-01
**Current phase:** None started — use `/gsd-plan-phase 1` to begin

---

## Project Status

| Phase | Title | Status |
|-------|-------|--------|
| 1 | Segurança e Autenticação | not-started |
| 2 | Confiabilidade de Integrações | not-started |
| 3 | Correções de Fluxo e Qualidade de Dados | not-started |
| 4 | Testes e CI | not-started |
| 5 | UX do Painel e Área do Cliente | not-started |

## Active Context

- **Branch atual:** main
- **Último commit:** 2026-04-30 — `fix: remove código morto no modal NFS-e que causava erro de build`
- **Codebase map:** `.planning/codebase/` (7 documentos — gerados em 2026-05-01)
- **Maior risco:** Zero autenticação + zero testes em produção

## Decisions Log

| Date | Decision | Reason |
|------|----------|--------|
| 2026-05-01 | Mapear codebase antes de planejar | Projeto brownfield — necessário entender estado atual |
| 2026-05-01 | Granularity: Coarse | 5 fases amplas para time pequeno |
| 2026-05-01 | Auth via Chatwoot apenas | Equipe já usa Chatwoot; evitar segundo sistema de login |
| 2026-05-01 | Phase 1 = Segurança (prioridade máxima) | Sistema em produção sem qualquer autenticação |

## Notes

- Memórias do projeto disponíveis em `memory/` (12 arquivos com detalhes de integrações)
- NFS-e: regras críticas documentadas em `memory/nfse-iibrasil-integracao.md` — NÃO alterar hash/alíquotas
- EFI: certificados mTLS em base64 nas env vars `EFI_CERT_PEM` / `EFI_KEY_PEM`
- Deploy: VPS via Tailscale, imagens no `ghcr.io/martoxak/`

---
*Initialized: 2026-05-01 via /gsd-new-project*
