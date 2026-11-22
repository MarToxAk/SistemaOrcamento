---
phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
plan: 08
subsystem: pesquisa-satisfacao
tags: [nextjs, admin, formulario, sri, proxy, acessibilidade, validacao]
status: complete

requires:
  - phase: 52-12
    provides: PesquisaAdminController com GET/PUT /pesquisa/admin/config e RespostaConfigAdmin (config, padroes, limites, placeholders, hostsGoogle)
  - phase: 52-07
    provides: PesquisaConfigService.atualizar com validacao no servidor e erro por campo { message, campos }
provides:
  - PA_NAV_ITEMS com Cupons (/cupons) e Pesquisa e recompensa (/configuracoes/pesquisa)
  - RecursosBootstrap com SRI sha384 e crossOrigin nos tres recursos do CDN (script de icones 404 removido)
  - lib/pesquisa-admin.ts (tipos ConfigAdmin/RespostaConfigAdmin, MSG_SESSAO, lerNumero, formatarDataHora, formatarReais, formatarPercentual, renderizarPrevia, validarConfigCliente)
  - proxy GET/PUT /api/admin/pesquisa-config com requireAdminSession e lista explicita de chaves
  - ConfigForm (client component) com cinco blocos, validacao espelhada, previa e barra sticky
affects:
  - 52-09 (a pagina monta ConfigForm dentro de PasswordGate e AdminShell)
  - 52-10 (reusa os formatadores e a lib de pesquisa-admin)

actuals:
  tokens: 11091
  tasks: 2
  commits: 2
  plan_head_before: 9d3f97c9b56f35ed52131c0052e997d37280daba
  plan_head_after: 7685e6ee5f5cb3342c3ae4657accba0ef4337d98

tech-stack:
  added: []
  patterns:
    - "SRI sha384 + crossOrigin em todo recurso de CDN carregado pelas telas admin, com hash recomputado antes de gravar"
    - "proxy de admin: sessao por cookie, lista explicita de chaves com tipo conferido e payload montado do zero (nunca ...body)"
    - "formulario admin com estado original/atual, dirty por comparacao, validacao client espelhando o servidor e barra sticky bloqueada por erro visivel"
    - "beforeunload registrado em useEffect apenas enquanto dirty (padrao novo em relacao a configuracoes/cobranca)"

key-files:
  created:
    - apps/frontend/src/lib/pesquisa-admin.ts
    - apps/frontend/src/app/api/admin/pesquisa-config/route.ts
    - apps/frontend/src/app/configuracoes/pesquisa/config-form.tsx
  modified:
    - apps/frontend/src/app/contas-receber/admin-shell.tsx
    - apps/frontend/src/app/contas-receber/_shared/recursos-bootstrap.tsx

key-decisions:
  - "O proxy confere 20 chaves (a lista do contrato ConfigEntrada); o plano citava 21, mas a interface e o backend tem 20 campos"
  - "A validacao de link no cliente confere apenas https:// (como o UI-SPEC); a allowlist de hosts do Google fica no servidor"
  - "Os hashes SRI foram recomputados sobre os bytes atuais do CDN e conferem exatamente com o UI-SPEC, sem atualizacao silenciosa"
  - "O formulario nao monta PasswordGate/AdminShell: entrega so o client component para a pagina do plano 52-09"
  - "A previa usa valores ficticios fixos (10%, R$ 2,00, R$ 6,00, 22/12/2026) e renderiza como texto via renderizarPrevia"

patterns-established:
  - "Recurso de CDN em tela admin sempre com integrity+crossOrigin e hash documentado; script que responde 404 removido"
  - "Campo de formulario admin com label visivel, ajuda em aria-describedby, erro com aria-invalid e invalid-feedback sempre visivel"
  - "Salvar tudo de uma vez: nada vale antes do clique, bloqueio por erro visivel e aviso de saida com alteracao pendente"

requirements-completed: []

coverage:
  - id: D1
    description: "Menu com Cupons e Pesquisa e recompensa, telas admin com Bootstrap/icones sob SRI, lib compartilhada e proxy GET/PUT da configuracao"
    verification:
      - kind: automated_ui
        ref: "grep de aceitacao (integrity=3, bootstrap-icons.js=0, /cupons=1, /configuracoes/pesquisa=1, requireAdminSession>=2, pesquisa/admin/config=1, validarConfigCliente=1)"
        status: pass
      - kind: integration
        ref: "npx tsc --noEmit -p apps/frontend/tsconfig.json; npm --workspace @orcamento/frontend run build"
        status: pass
      - kind: other
        ref: "openssl dgst -sha384 dos bytes baixados do CDN == hashes do UI-SPEC (3/3)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Formulario completo de configuracao com cinco blocos, validacao espelhada, previa ao vivo, barra sticky e beforeunload"
    verification:
      - kind: integration
        ref: "npx tsc --noEmit -p apps/frontend/tsconfig.json; npm --workspace @orcamento/frontend run build"
        status: pass
      - kind: automated_ui
        ref: "grep de aceitacao (beforeunload>=2, /api/admin/pesquisa-config>=2, Confira os campos destacados>=1, aria-invalid>=1, dangerouslySetInnerHTML=0, emEnvio>=2)"
        status: pass
    human_judgment: true
    rationale: "Comportamento visual e de interacao (blocos, foco no erro, aviso ao sair, previa e leitura em 360px) exige UAT humano; nao ha runner de testes no frontend."

metrics:
  duration: "~3min"
  started: "2026-11-22T18:46:50Z"
  completed: "2026-11-22T18:49:49Z"
  tasks: 2
  files: 5
  commits: 2
  plan_head_before: 9d3f97c9b56f35ed52131c0052e997d37280daba
  plan_head_after: 7685e6ee5f5cb3342c3ae4657accba0ef4337d98
---

# Phase 52 Plan 08: Tela de configuração da pesquisa e da recompensa

**Menu com Cupons e Pesquisa e recompensa, Bootstrap/ícones sob SRI nas telas admin, proxy seguro da configuração e formulário completo com validação, prévia e barra de salvar sticky.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-11-22T18:46:50Z
- **Completed:** 2026-11-22T18:49:49Z
- **Tasks:** 2
- **Files modified:** 5 (3 criados, 2 modificados)
- **Verificação:** `tsc --noEmit -p apps/frontend/tsconfig.json` sem erros; `npm --workspace @orcamento/frontend run build` concluiu (Next 16.2.5, 34 rotas); hashes SRI recomputados 3/3 iguais ao UI-SPEC.

## Accomplishments

- `PA_NAV_ITEMS` ganhou o item de nível 1 **Cupons** (`/cupons`, `ticket-perforated`) entre Produção e Configurações, e o filho **Pesquisa e recompensa** (`/configuracoes/pesquisa`, `star-half`) depois de Juros e multa; a ordem dos filhos existentes não mudou e `navItemAtivo` já cobre `/cupons`.
- `RecursosBootstrap` agora carrega Bootstrap CSS, Bootstrap bundle JS e bootstrap-icons CSS com `integrity` sha384 e `crossOrigin="anonymous"`; o `<Script>` de `bootstrap-icons.js` (HTTP 404 e não usado) foi removido. Hashes recomputados com `curl | openssl dgst -sha384` conferem exatamente com o UI-SPEC.
- `lib/pesquisa-admin.ts` centraliza os tipos do contrato admin, `MSG_SESSAO`, `lerNumero`, `formatarDataHora`, `formatarReais`, `formatarPercentual`, `renderizarPrevia` e `validarConfigCliente` (regras e mensagens espelhadas do UI-SPEC/servidor), sem imports de servidor.
- Proxy `GET/PUT /api/admin/pesquisa-config` exige `requireAdminSession` nos dois métodos, usa `adminBackendFetch("/pesquisa/admin/config")`, confere tipo de cada chave conhecida e monta um objeto novo (nunca espalha o corpo); chaves de admin/interna nunca chegam ao navegador.
- `ConfigForm` entrega cinco blocos `pa-card` (situação, recompensa, link e variante, mensagens e prévia), largura máxima 720 px, validação a cada alteração com erro por campo (`aria-invalid`, `aria-describedby`, foco no primeiro erro), contadores de 600 caracteres, ajuda calculada do teto, aviso de link do Google vazio, prévia como texto e barra sticky com Descartar/Salvar bloqueado por erro visível, além de `beforeunload` enquanto `dirty`.

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Menu, SRI do CDN, lib compartilhada e proxy da configuração** - `3be33ad` (feat)
2. **Task 2: Formulário de configuração com validação, prévia e barra de salvar** - `7685e6e` (feat)

**Plan metadata:** commit do SUMMARY (docs).

## Files Created/Modified

- `apps/frontend/src/app/contas-receber/admin-shell.tsx` - itens Cupons e Pesquisa e recompensa em `PA_NAV_ITEMS`.
- `apps/frontend/src/app/contas-receber/_shared/recursos-bootstrap.tsx` - SRI/crossOrigin nos três recursos; script de ícones 404 removido.
- `apps/frontend/src/lib/pesquisa-admin.ts` - tipos, formatadores pt-BR, prévia e validação espelhada.
- `apps/frontend/src/app/api/admin/pesquisa-config/route.ts` - proxy admin GET/PUT da configuração.
- `apps/frontend/src/app/configuracoes/pesquisa/config-form.tsx` - Client Component do formulário completo.

## Decisions Made

- O proxy confere 20 chaves, que é o total real do `ConfigEntrada`/interface do plano (o texto do plano citava 21).
- A validação de link no cliente cobre só `https://` (UI-SPEC); a allowlist de hosts do Google permanece no servidor como fonte final.
- Hashes SRI foram recomputados sobre os bytes entregues pelo CDN hoje e conferem com o UI-SPEC; nenhum hash foi atualizado em silêncio.
- `ConfigForm` não monta `PasswordGate`/`AdminShell`: é só o formulário, como previsto para a página do plano 52-09.
- A prévia usa `renderizarPrevia` com valores fictícios e renderiza como texto (sem HTML bruto).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- O build do Next reescreveu `apps/frontend/next-env.d.ts` (troca `./.next/dev/types` por `./.next/types`). Como é artefato gerado e fora do escopo, a alteração foi revertida a cada task antes do commit; nenhuma mudança desse arquivo entrou no plano.
- O plano descreve "21 chaves conhecidas" no proxy, mas a interface `ConfigAdmin` e o `ConfigEntrada` do backend têm 20 campos. O proxy valida as 20 reais (1 booleano, 7 números, 11 strings + `linkGoogle` anulável), sem inventar chave extra.
- O worktree não tem `node_modules` próprio; `tsc` e `next build` resolveram os módulos a partir de `/root/SistemaOrcamento/node_modules` (mesma abordagem dos planos anteriores da fase).

## User Setup Required

None - no external service configuration required.

## Known Stubs

Nenhum. Todos os campos do formulário estão ligados ao contrato real do backend, a prévia é renderizada com valores fictícios por definição (não é stub de dado) e não há TODO/FIXME nem valor vazio hardcoded que chegue à tela.

## Threat Flags

Nenhum além do `threat_model` do plano. T-52-42 mitigado (sessão nos dois métodos + lista explícita de chaves com tipo e payload montado do zero); T-52-43 mitigado (SRI/crossOrigin nos três recursos, hashes conferidos, script 404 removido); T-52-44 mitigado (chamadas ao backend só em route handler com `adminBackendFetch`, nenhuma `NEXT_PUBLIC_`); T-52-45 mitigado (nada vale antes de Salvar + `beforeunload`); T-52-46 mitigado (prévia e textos como texto, `dangerouslySetInnerHTML` ausente).

## Next Phase Readiness

- Pronto para o plano 52-09 importar `ConfigForm` e montá-lo dentro de `PasswordGate` + `AdminShell` com as abas Configuração/Resultados.
- `lib/pesquisa-admin.ts` está pronto para ser reusado pelo painel de resultados (52-09) e pela tela de cupons (52-10).
- Nenhuma rota `/configuracoes/pesquisa` ou `/cupons` foi criada neste plano (as páginas são do 52-09 e 52-10); o build já lista `/api/admin/pesquisa-config`.

---

*Phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google*
*Completed: 2026-11-22*

## Self-Check: PASSED

- Os 5 arquivos do plano existem no disco e nos commits `3be33ad` e `7685e6e` (ancestrais de HEAD).
- `git rev-list --count 9d3f97c..HEAD` = 2 (uma por task).
- `npx tsc --noEmit -p apps/frontend/tsconfig.json`: sem erros.
- `npm --workspace @orcamento/frontend run build`: concluído sem "Failed to compile"/"Type error".
- Hashes SRI recomputados: Bootstrap CSS, bundle JS e icons CSS iguais aos do UI-SPEC (3/3).
