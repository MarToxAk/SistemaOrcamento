---
phase: 55-proposta-comercial-atacado-e-revenda-para-orgaos-publicos
plan: 15
subsystem: frontend/configuracoes-templates
tags: [nextjs, templates-pdf, familia, proposta, proxy, regras-puras]
status: complete
requires: [55-05, 55-13, 55-18]
provides:
  - galeria de templates de PDF separada por familia (abas Orcamento | Proposta)
  - familiaTemplateValida e rotaPreviewTemplate (regras puras provadas por script)
  - POST templates/preview liberado na lista permitida do proxy /api/propostas
affects: [55-11]
requirements-completed: [P55-PDF]
tech-stack:
  added: []
  patterns:
    - "Decisoes de seguranca (familia aceita, rota de previa por familia) em funcoes puras com checagem executavel; rota e componente so as usam"
    - "Guarda de requisicao por ref para a resposta atrasada de uma familia nao sobrescrever a lista da familia atual"
key-files:
  created: []
  modified:
    - apps/frontend/src/lib/propostas-rotas.ts
    - apps/frontend/scripts/checar-propostas-rotas.mjs
    - apps/frontend/src/app/api/admin/templates/route.ts
    - apps/frontend/src/app/configuracoes/templates/templates-manager.tsx
key-decisions:
  - "O GET do proxy admin monta /pdf-templates?familia=<valor> somente com o retorno de familiaTemplateValida; qualquer outro valor e descartado e a lista segue sem filtro, como antes."
  - "O POST do proxy admin ja repassa o corpo inteiro; o campo familia do envio chega ao backend sem mudar o codigo da rota."
  - "O proxy /api/propostas ja devolve PDF binario (application/pdf), entao a previa de proposta reutiliza o fluxo de blob existente sem mudanca no proxy alem da lista permitida."
metrics:
  duration: 15 min
  completed: 2026-11-27
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
plan_head_before: 4d6e9fa51d393920f9b5732108f51434cb1b1560
plan_head_after: 0f1828e5f37552d7427f284ed1445d4fd38c6570
---

# Phase 55 Plan 15: Galeria de templates por familia Summary

Galeria de templates de PDF com abas Orcamento | Proposta (lista, envio e ativacao por familia) e previa roteada por familia: Proposta pelo proxy de propostas (POST templates/preview, unica rota de template liberada), Orcamento como antes.

## Tasks

| Task | Name | Commit |
|------|------|--------|
| 1 | Tracer: abas Orcamento | Proposta e lista de templates por familia pelo proxy admin | 0ab6ef6 |
| 2 | previa por familia e liberacao de templates/preview no proxy de propostas | 0f1828e |

## Accomplishments

- `familiaTemplateValida` aceita apenas os textos exatos "ORCAMENTO" e "PROPOSTA" (12 casos no script: 2 aceitos, 10 recusados, incluindo minuscula, espaco, lista, caminho e array).
- `GET /api/admin/templates` repassa `?familia=` filtrado por `familiaTemplateValida`; `requireAdminSession` e o formato de erro seguem iguais.
- `templates-manager.tsx`: estado `familia`, abas acima da lista, refetch ao trocar, `familia` no corpo do envio, texto de ajuda da aba Proposta (variaveis proprias: numero, cliente, itens, banco, assinante), guarda contra resposta atrasada de outra familia.
- `rotaPropostaPermitida` aceita APENAS POST ["templates","preview"]; script prova o aceito e as quatro rejeicoes (GET, POST templates, segmento extra, templates/outro).
- `rotaPreviewTemplate` (pura): PROPOSTA -> `/api/propostas/templates/preview`, ORCAMENTO -> `/api/admin/templates/preview`, invalido -> null; as duas previas da tela (existente e conteudo colado) usam essa funcao e mostram erro em portugues quando a URL e nula.

## Verification

- `node apps/frontend/scripts/checar-propostas-rotas.mjs`: exit 0, 81+ linhas OK, sem SKIP (Node 22.22).
- `tsc --noEmit` (frontend): exit 0, sem `error TS`.
- Gates de ligacao: `grep -c PROPOSTA` em templates-manager = 3 (>=3); `familia` em route.ts = 4 (>=2); `familiaTemplateValida` em route.ts = 2 (>=2); `rotaPreviewTemplate` em templates-manager = 3 (>=3).
- Tracer gate: `<verify>` re-executado de ponta a ponta depois da Task 1 e antes da Task 2, passando.
- A verificacao visual da galeria fica para o plano 55-11.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Resposta atrasada de uma familia sobrescrevendo a outra**
- **Found during:** Task 1
- **Issue:** ao trocar de aba com uma consulta em andamento, a resposta da familia anterior podia chegar por ultimo e substituir a lista da familia atual (risco direto do T-55-46: ativar template da familia errada).
- **Fix:** ref de requisicao incremental em `fetchTemplates`; resposta antiga e ignorada. A lista e limpa ao trocar de aba.
- **Files modified:** apps/frontend/src/app/configuracoes/templates/templates-manager.tsx
- **Commit:** 0ab6ef6

**2. [Rule 2 - Missing critical] Mensagem de erro do backend na previa**
- **Found during:** Task 2
- **Issue:** o backend de propostas (NestJS) devolve o erro em `message`, nao em `error`; a previa de Proposta mostraria so a mensagem generica (inclusive a recusa de template de orcamento, T-55-46).
- **Fix:** os dois handlers de previa leem `error` ou `message`.
- **Files modified:** apps/frontend/src/app/configuracoes/templates/templates-manager.tsx
- **Commit:** 0f1828e

## Known Stubs

None.

## Threat Flags

None. T-55-46 e T-55-60 mitigados conforme o plano (parametro familia restrito, previa roteada por familia, lista permitida com POST templates/preview exato e sessao admin exigida pelo proxy).

## Self-Check: PASSED

- Arquivos modificados existem; commits 0ab6ef6 e 0f1828e presentes no historico do branch.
- STATE.md e ROADMAP.md nao foram modificados (a cargo do orquestrador).
