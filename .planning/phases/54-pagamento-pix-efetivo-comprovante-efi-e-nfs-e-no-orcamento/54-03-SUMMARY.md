---
phase: 54-pagamento-pix-efetivo-comprovante-efi-e-nfs-e-no-orcamento
plan: 03
subsystem: integrations/efi, integrations/chatwoot
tags: [pix, comprovante, chatwoot, puppeteer, handlebars]
requires: []
provides:
  - "ChatwootService.sendAttachment com opts { private, content }"
  - "pix-comprovante.util (DadosComprovantePix, montarTextoComprovante, sanitizarTextoLivre, nomeArquivoComprovante, formatarBRL, formatarDataHoraSaoPaulo)"
  - "PixComprovanteService.renderizarHtml e gerarPng, registrado no EfiModule"
affects: [54-04]
tech-stack:
  added: []
  patterns: ["Puppeteer hardened (rede bloqueada, browser.close em finally) copiado do DanfsePdfService"]
key-files:
  created:
    - apps/backend/src/modules/integrations/chatwoot/chatwoot.service.attachment.test.ts
    - apps/backend/src/modules/integrations/efi/pix-comprovante.util.ts
    - apps/backend/src/modules/integrations/efi/pix-comprovante.util.test.ts
    - apps/backend/src/modules/integrations/efi/pix-comprovante.template.ts
    - apps/backend/src/modules/integrations/efi/pix-comprovante.service.ts
    - apps/backend/src/modules/integrations/efi/pix-comprovante.service.test.ts
  modified:
    - apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts
    - apps/backend/src/modules/integrations/efi/efi.module.ts
key-decisions:
  - "Documento mascarado do pagador troca asteriscos por bolinha (U+2022) antes de sanitizar, para nao perder a mascara ao remover markdown"
  - "Template usa so o if nativo do Handlebars (knownHelpersOnly true), sem helpers customizados"
requirements-completed: [P54-CMP]
status: complete
actuals:
  tokens: 7000
  tasks: 3
  commits: 3
plan_head_before: 9fc19b1870407549f16dd0e31fa4b1170fc38959
plan_head_after: 1534fd9f25ef610f182218946d7329e1ee73bfb0
---

# Phase 54 Plan 03: Pecas do comprovante interno do PIX Summary

sendAttachment do Chatwoot agora envia nota privada com texto e anexo numa unica requisicao, com nome e content-type sanitizados; o util monta o texto da nota (D-04) com texto do pagador neutralizado; PixComprovanteService gera o PNG de layout proprio via Puppeteer + Handlebars, registrado no EfiModule (ainda nao ligado ao webhook, fica para o 54-04).

## Tarefas

| Tarefa | Descricao | Commit |
| ------ | --------- | ------ |
| 1 | sendAttachment com opts private/content, sanitizacao de nome/content-type, timeout 30 s | 3d7518b |
| 2 | pix-comprovante.util: texto da nota privada e sanitizacao | 633efbc |
| 3 | PixComprovanteService (PNG), template e registro no EfiModule | 1534fd9 |

## Verificacao

- `npm --prefix apps/backend run test -- src/modules/integrations/chatwoot src/modules/integrations/efi src/modules/integrations/nfse/nfse.service.chatwoot.test.ts`: 13 suites, 235 passed, 1 skipped (smoke do Chromium, que roda so com RUN_PUPPETEER_SMOKE=1).
- `RUN_PUPPETEER_SMOKE=1 ... pix-comprovante.service`: 9/9 passam, incluindo o smoke real (PNG com magic bytes 89 50 4E 47 e mais de 2000 bytes).
- `tsc -p tsconfig.json --noEmit` em apps/backend: limpo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mascara do documento do pagador era destruida pela sanitizacao**
- **Found during:** Tarefa 2 (teste do pagador com documento mascarado `***.123.456-**`)
- **Issue:** sanitizarTextoLivre remove `*` (markdown), entao o documento mascarado virava `.123.456-`.
- **Fix:** antes de sanitizar o documento, `*` vira `•` (U+2022). Aplicado no util e no servico.
- **Files modified:** pix-comprovante.util.ts, pix-comprovante.service.ts (e testes)
- **Commit:** 633efbc / 1534fd9

**2. [Rule 3 - Blocking] Worktree sem node_modules**
- Criados symlinks locais `node_modules` e `apps/backend/node_modules` apontando para o repositorio principal para rodar jest/tsc. Ficam untracked e NAO foram commitados. O `tsc` foi rodado direto em apps/backend (o `npm exec -w @orcamento/backend` resolveria para o repo principal, nao para a worktree).

**3. Ordem RED/GREEN da Tarefa 2 e 3**
- Na Tarefa 1 o RED foi observado (erro TS2554). Nas Tarefas 2 e 3 testes e implementacao foram escritos juntos e rodados em seguida (sem execucao separada de RED).

### Nao executado
- STATE.md e ROADMAP.md nao foram atualizados nesta worktree (execucao paralela por onda; o orquestrador consolida), nem o commit final de metadados.

## Known Stubs

Nenhum.

## Threat Flags

Nenhum. Mitigacoes T-54-06 (sanitizacao multipart), T-54-07 (texto livre do pagador, Handlebars com escape) e T-54-08 (timeout 30 s, rede bloqueada, browser.close em finally) implementadas e testadas.

## Self-Check: PASSED

Arquivos criados/modificados existem; commits 3d7518b, 633efbc e 1534fd9 presentes na branch.
