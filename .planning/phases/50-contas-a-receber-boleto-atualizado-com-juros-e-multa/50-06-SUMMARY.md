---
phase: 50-contas-a-receber-boleto-atualizado-com-juros-e-multa
plan: 06
subsystem: ui
tags: [nextjs, react, boleto, juros, multa, contas-receber, proxy]

requires:
  - phase: 50-contas-a-receber-boleto-atualizado-com-juros-e-multa
    provides: "50-01/50-03: POST /cobranca/boleto/:id/atualizar e /atualizacao/previa (datas permitidas, taxas, tetos, detalhamento, mensagem)"
  - phase: 50-contas-a-receber-boleto-atualizado-com-juros-e-multa
    provides: "50-05: titulos-em-uso com valorBoleto, boletoOrigemId, juros/multa por titulo e alertaPagamentoDuplicado"
provides:
  - "Proxies Next POST previa e atualizar com requireAdminSession e repasse restrito a data e taxas"
  - "ModalBoletoAtualizado: previa do servidor, escolha entre as duas datas permitidas, taxas editaveis com tetos, confirmacao e resultado"
  - "Aba Boletos: botao Atualizar, passagem ao modal de e-mail existente com o boleto novo e recarga ao fechar"
  - "Lista com total com juros e multa, marca 'Atualizado - substitui #N', juros/multa por titulo e alerta de pagamento em dobro"
affects: [50-07]

actuals:
  tokens: 9500
  tasks: 2
  commits: 2
plan_head_before: bdb2254cfec769a4df09cabff444e285b6e49086
plan_head_after: 54a8f586f74c622f933de847a18f6866438c2acf

tech-stack:
  added: []
  patterns:
    - "Previa com espera de 400 ms e contador em useRef que descarta respostas antigas; revalidacao local dos tetos antes de chamar o servidor"
    - "Guarda em useRef contra duplo clique na confirmacao que cria cobranca real"
    - "Recarga da lista adiada para o fechamento do modal de e-mail (fecharModalEmail + marca em useRef)"

key-files:
  created:
    - apps/frontend/src/app/api/cobranca/boleto/[id]/atualizacao/previa/route.ts
    - apps/frontend/src/app/api/cobranca/boleto/[id]/atualizar/route.ts
    - apps/frontend/src/app/contas-receber/[idcliente]/_abas/modal-boleto-atualizado.tsx
  modified:
    - apps/frontend/src/app/contas-receber/[idcliente]/_abas/aba-boletos.tsx
    - apps/frontend/src/app/contas-receber/[idcliente]/_abas/compartilhado.tsx
    - apps/frontend/src/app/contas-receber/[idcliente]/_abas/use-dados-cliente.ts

key-decisions:
  - "Campos de juros e multa sao texto (inputMode decimal) e nao type=number, para aceitar virgula de forma independente do idioma do navegador; a conversao e a validacao de teto ficam no modal"
  - "O modal nao constroi objetos de data: so formata strings YYYY-MM-DD do servidor com formatarDataEmissao; sem campo de data livre"
  - "Os proxies usam backendFetch (chave interna) como o plano pede, pois o backend nao marca esses endpoints como AdminOnly; a sessao de admin protege a chamada no Next"

patterns-established:
  - "Rotulos das datas derivados de hoje devolvido pelo servidor: 'Hoje' quando a primeira data e hoje, senao 'Primeiro dia util' / 'Dia util seguinte'"

requirements-completed: [BA-01, BA-03, BA-07, BA-08, BA-10]

coverage:
  - id: D1
    description: "Operador clica Atualizar num boleto pendente, ve a previa do servidor (duas datas, taxas, detalhamento, mensagem), confirma e segue para o modal de e-mail existente com o boleto novo"
    requirement: BA-07
    verification:
      - kind: other
        ref: "npx tsc --noEmit -p apps/frontend/tsconfig.json (exit 0) e npm --prefix apps/frontend run build (exit 0)"
        status: pass
      - kind: manual_procedural
        ref: "human-check da Task 1 (UAT de fim de fase)"
        status: unknown
    human_judgment: true
  - id: D2
    description: "Novo vencimento so entre as duas datas do servidor, sem calculo de data no browser; juros acima de 1% e multa acima de 2% desabilitam a confirmacao com aviso"
    requirement: BA-03
    verification:
      - kind: other
        ref: "grep: sem new Date( e sem type=date no modal; tetos vindos da previa"
        status: pass
    human_judgment: false
  - id: D3
    description: "Lista mostra total com juros e multa, marca de substituicao, juros/multa por titulo e alerta de pagamento em dobro"
    requirement: BA-10
    verification:
      - kind: other
        ref: "tsc + build; mapeamento campo a campo de titulos-em-uso (50-05 T1..T5 cobre o backend)"
        status: pass
      - kind: manual_procedural
        ref: "human-check da Task 2 (UAT de fim de fase)"
        status: unknown
    human_judgment: true

duration: 14min
completed: 2026-11-17
status: complete
---

# Phase 50 Plan 06: Tela do boleto atualizado Summary

**Botao Atualizar na aba Boletos abre um modal com a previa calculada no servidor (duas datas, taxas com tetos, detalhamento por titulo) e leva ao modal de e-mail existente com o boleto novo; a lista passa a mostrar total com juros e multa, vinculo com o original e alerta de pagamento em dobro.**

## Performance

- **Duration:** 14 min
- **Tasks:** 2
- **Files modified:** 6 (3 criados, 3 alterados)

## Accomplishments

- Dois proxies Next 16 (`params` como Promise) exigem `requireAdminSession`, validam o id e repassam so `novoVencimento`, `taxaJurosMes` e `multaPercentual`; a geracao recusa corpo sem `novoVencimento` com 400.
- `ModalBoletoAtualizado` implementa carregando, pronto, gerando, sucesso e erro: duas opcoes de data vindas do servidor, taxas pre-preenchidas aceitando virgula, avisos "Juros acima do limite de 1% ao mes." / "Multa acima do limite de 2%." (valores dos tetos da previa), previa refeita com espera de 400 ms, tabela com totais, quadro da mensagem, notas informativas, aviso e botao "Repetir cancelamento do original" quando ha sucessor ativo, guarda de duplo clique, resultado com aviso destacado se o cancelamento do original falhar, Baixar PDF e Enviar por e-mail.
- `aba-boletos.tsx`: botao "Atualizar" so para boleto pendente, `fecharModalEmail()` nos cinco pontos de fechamento do modal de e-mail (recarrega a lista quando o fluxo veio do boleto atualizado), total do cabecalho por `valorBoleto`, pilula "Atualizado - substitui #N", pilula vermelha "Pagamento em dobro?" com explicacao, colunas Juros/Multa/Total por titulo apenas em boleto atualizado.
- `compartilhado.tsx` e `use-dados-cliente.ts` ganharam os campos de titulos-em-uso da Fase 50 (`?? null` / `?? false`), sem mudar os existentes.

## Task Commits

1. **Task 1: Tracer botao Atualizar -> modal -> proxy -> e-mail** - `a7b8159` (feat)
2. **Task 2: Lista com boleto atualizado e alerta de pagamento em dobro** - `54a8f58` (feat)

## Verification

- `npx tsc --noEmit -p apps/frontend/tsconfig.json`: exit 0 nos dois commits.
- `npm --prefix apps/frontend run build`: exit 0, sem "Failed to compile".
- Criterios de aceite por grep: requireAdminSession 2/2 nos proxies, ModalBoletoAtualizado 2, fecharModalEmail 6, formatarDataEmissao 5, sem `new Date(` e sem `type="date"` no modal, alertaPagamentoDuplicado 2, boletoOrigemId 1, valorBoleto 2, "Pagamento em dobro" 1.
- Itens `human-check` (fluxo completo com backend de homologacao e EFI de homologacao) ficam para o UAT de fim de fase; nao foram executados aqui por seguranca (nenhuma chamada a EFI ou Athos de producao).

## Deviations from Plan

### Ajustes menores

**1. Campos de taxa como texto em vez de type="number" com step/min/max**
- **Motivo:** o plano pede step/min/max e aceitar virgula; em `type="number"` a virgula depende do idioma do navegador. Campos `type="text"` com `inputMode="decimal"` aceitam virgula sempre; min/max sao aplicados na validacao local contra os tetos devolvidos pela previa.
- **Impacto:** comportamento pedido (limites e aviso) preservado; so muda o controle HTML.

**2. [Rule 3 - Blocking] `apps/frontend/next-env.d.ts` alterado pelo build**
- Revertido com `git checkout` apos cada build, conforme instrucao do orquestrador; nao entrou em commit.

Fora isso, plano executado como escrito.

## Known Stubs

None.

## Threat Flags

None - os dois proxies novos estao cobertos pelo threat model (T-50-24/25/26).

## Self-Check: PASSED

- Arquivos criados e alterados conferidos em disco; commits `a7b8159` e `54a8f58` presentes na branch.
