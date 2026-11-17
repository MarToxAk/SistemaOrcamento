---
phase: 50-contas-a-receber-boleto-atualizado-com-juros-e-multa
plan: 04
subsystem: api
tags: [nestjs, nextjs, admin, configuracoes, juros, multa, cobranca, encargos]

requires:
  - phase: 50-01
    provides: CobrancaEncargosConfigService.obter, validarTaxas e constantes de padrao/teto, modelo CobrancaEncargosConfig
provides:
  - GET/PUT cobranca/encargos-config (AdminOnly) com padroes e tetos na resposta
  - CobrancaEncargosConfigService.atualizar com validarTaxas
  - proxy admin /api/admin/cobranca-encargos (so taxaJurosMes e multaPercentual)
  - tela /configuracoes/cobranca (PasswordGate + AdminShell)
  - menu Configuracoes em grupo (Templates de PDF, Juros e multa) e /configuracoes redirecionando
affects: [50-05, 50-06, 50-07]

actuals:
  tokens: 9500
  tasks: 2
  commits: 2
plan_head_before: 7202190f2508254b8a08886398d1e48eddb53a6c
plan_head_after: 12a7038b2c5bca8cc312ba9e0d4aabbc41f251ad

tech-stack:
  added: []
  patterns:
    - "Tetos aplicados em quatro camadas: input da tela, proxy (so numeros), DTO (@Max) e servico (validarTaxas)"
    - "Proxy admin repassa apenas chaves conhecidas; chave de admin injetada so no servidor"

key-files:
  created:
    - apps/backend/src/modules/cobranca/cobranca-encargos-config.controller.ts
    - apps/backend/src/modules/cobranca/dto/atualizar-encargos-config.dto.ts
    - apps/backend/src/modules/cobranca/cobranca-encargos-config.test.ts
    - apps/frontend/src/app/api/admin/cobranca-encargos/route.ts
    - apps/frontend/src/app/configuracoes/cobranca/page.tsx
    - apps/frontend/src/app/configuracoes/page.tsx
  modified:
    - apps/backend/src/modules/cobranca/cobranca-encargos-config.service.ts
    - apps/backend/src/modules/cobranca/cobranca.module.ts
    - apps/frontend/src/app/contas-receber/admin-shell.tsx

key-decisions:
  - "Tela usa input type=text com inputMode decimal para aceitar virgula; a conversao para ponto ocorre no cliente antes de validar e enviar"
  - "Envio duplo barrado por useRef alem do botao desabilitado (o estado de salvando so atualiza apos o render)"

requirements-completed: [BA-04]

coverage:
  - id: D1
    description: "Admin le e altera as taxas padrao; valores salvos persistem no singleton e voltam na proxima leitura com padroes (0,99 / 2) e tetos (1 / 2)"
    requirement: BA-04
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/cobranca/cobranca-encargos-config.test.ts#K1,K2,K3,K7"
        status: pass
    human_judgment: false
  - id: D2
    description: "Taxas acima dos tetos, negativas, ausentes, em texto ou com campos extras sao recusadas no DTO e no servico, sem gravar"
    requirement: BA-04
    verification:
      - kind: unit
        ref: "cobranca-encargos-config.test.ts#K4,K6"
        status: pass
    human_judgment: false
  - id: D3
    description: "Leitura e escrita exigem admin (AdminAuthGuard no backend, requireAdminSession no proxy); nenhuma chave exposta ao browser"
    requirement: BA-04
    verification:
      - kind: unit
        ref: "cobranca-encargos-config.test.ts#K5"
        status: pass
      - kind: integration
        ref: "grep NEXT_PUBLIC nos dois arquivos do frontend = 0; npm --prefix apps/frontend run build"
        status: pass
    human_judgment: false
  - id: D4
    description: "Menu Configuracoes vira grupo com Templates de PDF e Juros e multa; /configuracoes redireciona para templates; tela aceita virgula e mostra aviso de limite"
    requirement: BA-04
    verification:
      - kind: integration
        ref: "npm --prefix apps/frontend run build (rotas /configuracoes e /configuracoes/cobranca geradas); tsc frontend exit 0"
        status: pass
      - kind: manual
        ref: "verificacao no navegador (human-check do plano) nao executada nesta sessao"
        status: unrun
    human_judgment: true

duration: 14min
completed: 2026-11-17
status: complete
---

# Phase 50 Plan 04: Tela de taxas padrao de juros e multa Summary

**Tela /configuracoes/cobranca (senha + AdminShell) lendo e gravando o singleton CobrancaEncargosConfig via proxy admin e controller AdminOnly, com tetos de 1% a.m. e 2% aplicados em tela, proxy, DTO e servico, e menu Configuracoes em grupo.**

## Accomplishments

- Backend: `atualizar()` valida com `validarTaxas` (BadRequest), garante o singleton e grava por id "default"; `CobrancaEncargosConfigController` com `@AdminOnly()` em `GET` e `PUT encargos-config`, resposta com `padroes` e `tetos`; `AtualizarEncargosConfigDto` com `IsNumber` (ate 4 casas), `Min(0)` e `Max` dos tetos; controller registrado no modulo.
- Proxy `api/admin/cobranca-encargos`: 401 sem sessao, PUT repassa somente `taxaJurosMes` e `multaPercentual` numericos (senao 400), falha de rede -> 500.
- Pagina com carga `no-store`, aviso de limite por campo, Salvar desabilitado com erro/carregando/salvando, mensagens "Taxas salvas." e do backend, data da ultima alteracao e nota de limites; virgula aceita como separador.
- Menu: `PA_NAV_ITEMS` com grupo Configuracoes; `/configuracoes` redireciona para `/configuracoes/templates`; pagina de templates intocada.

## Task Commits

1. **Task 1 (tracer):** `acf4f2a` feat(50-04): tela e API das taxas padrao de juros e multa do boleto atualizado
2. **Task 2:** `12a7038` feat(50-04): menu Configuracoes em grupo, redirect de /configuracoes e virgula decimal na tela de taxas

## Verification

- `npm --prefix apps/backend run test -- cobranca-encargos-config --no-coverage`: 7 passed (K1..K7).
- `npm --prefix apps/backend run test -- cobranca --no-coverage`: 28 suites, 370 passed.
- `npx tsc --noEmit` backend e frontend: exit 0.
- `npm --prefix apps/frontend run build`: ok; rotas `/configuracoes` e `/configuracoes/cobranca` listadas.
- Criterios de aceitacao por grep: `@AdminOnly()` no controller, `CobrancaEncargosConfigController` no modulo, `requireAdminSession`, `PasswordGate`, `href: "/configuracoes",` = 1, `"/configuracoes/cobranca"` no shell = 1, `redirect("/configuracoes/templates")` = 1, `NEXT_PUBLIC` = 0, diff de `configuracoes/templates` vazio.

## Deviations from Plan

**1. [Observacao] Tracer sem commit RED separado.** Testes e implementacao do tracer foram commitados juntos (`acf4f2a`); os testes K1..K7 passaram na primeira execucao com a implementacao presente. Nenhum ajuste de codigo posterior.

**2. [Observacao] `apps/frontend/next-env.d.ts` alterado pelo `next build`** (troca do caminho de tipos de rotas); revertido com checkout do arquivo e nao commitado.

**3. [Pendencia] Verificacao humana nao executada.** O `human-check` da Task 2 (navegador com backend local e banco de desenvolvimento) nao foi realizado nesta sessao; ficou como pendente para validacao manual.

Total: nenhuma correcao de codigo; sem desvios de Regra 1-4.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None. T-50-16..T-50-19 mitigadas: K5 (guard), K4/K6 (tetos), grep sem `NEXT_PUBLIC`, proxy com chaves permitidas e `forbidNonWhitelisted`.

## Issues Encountered

None.

## Next Phase Readiness

Taxas padrao ajustaveis sem deploy; 50-05/50-06 podem ler `GET /cobranca/encargos-config` (padroes e tetos) se precisarem. Migration do Prisma (50-01) nao foi aplicada em nenhum banco por esta fase de execucao; precisa estar aplicada antes do uso real da tela.

## Self-Check: PASSED

- Arquivos criados existem; commits `acf4f2a` e `12a7038` presentes no HEAD.
