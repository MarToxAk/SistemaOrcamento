---
phase: 50-contas-a-receber-boleto-atualizado-com-juros-e-multa
plan: 03
subsystem: api
tags: [nestjs, prisma, efi, boleto, juros, multa, cobranca, previa, idempotencia]

requires:
  - phase: 50-01
    provides: CobrancaBoletoAtualizadoService.gerar, util de dia util/calculo/mensagem, CobrancaEncargosConfigService e campos de vinculo/snapshot
provides:
  - POST /api/cobranca/boleto/:id/atualizacao/previa (200) com datas permitidas, taxas (aplicadas, padrao, tetos), detalhamento por titulo, totais e mensagem, sem EFI e sem gravacao
  - validacao compartilhada entre previa e geracao (404/409/400/422)
  - geracao segura de repetir: retentativa do cancelamento, mutex por boleto, compensacao e traducao do 4600210
affects: [50-04, 50-05, 50-06, 50-07]

actuals:
  tokens: 11200
  tasks: 2
  commits: 3
plan_head_before: 8b722d3287737fea800aa938f4f70ae3db9a0467
plan_head_after: 5048ad659b8b878ba2b90a83c3fda4c23246c788

tech-stack:
  added: []
  patterns:
    - "carregarOriginal + resolverCalculo: uma unica validacao para previa() e gerar()"
    - "Retentativa idempotente: boleto atualizado ativo vira so repeticao do cancelamento estrito, sem nova emissao"
    - "Mutex por processo (Set de originais em geracao, liberado em finally)"

key-files:
  created:
    - apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.service.test.ts
  modified:
    - apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.service.ts
    - apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.controller.ts
    - apps/backend/src/modules/cobranca/dto/gerar-boleto-atualizado.dto.ts
    - apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.http.test.ts

key-decisions:
  - "Com boleto atualizado ativo e original ainda pendente, gerar() nao revalida data/taxas/Athos: so confere o original na EFI e repete o cancelamento (pago -> 409 de pagamento em dobro, sem cancelamento automatico)"
  - "Compensacao: falha ao gravar o novo cancela o charge NOVO na EFI; se isso tambem falhar o 500 cita o numero do charge para cancelamento manual"
  - "Previa usa as taxas PADRAO na mensagem informativa (D-12), mesmo quando o operador editou as taxas do calculo"
  - "Mutex e por processo; com varias replicas a ultima barreira e o 4600210 da EFI (comentado no codigo)"

requirements-completed: [BA-01, BA-03, BA-05, BA-08]

coverage:
  - id: D1
    description: "Previa devolve do servidor datas permitidas, taxas (aplicadas/padrao/tetos), detalhamento por titulo, totais e mensagem D-12, recalculando com taxas editadas, sem EFI e sem gravacao"
    requirement: BA-03
    verification:
      - kind: integration
        ref: "apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.http.test.ts#P1..P5"
        status: pass
    human_judgment: false
  - id: D2
    description: "Boleto pago/cancelado/baixado, sem charge, titulo fora de aberto ou com valor alterado, sem titulo vencido e data/taxa invalidas sao recusados antes de qualquer criacao na EFI"
    requirement: BA-08
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.service.test.ts#S1..S10"
        status: pass
    human_judgment: false
  - id: D3
    description: "Geracao repetida nao cria segundo boleto (retentativa so cancela o original), duplo clique recebe 409, falha de gravacao cancela o charge novo e 4600210 vira 400 amigavel"
    requirement: BA-05
    verification:
      - kind: unit
        ref: "apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.service.test.ts#S11..S16"
        status: pass
    human_judgment: false
  - id: D4
    description: "Regra de data (hoje ou proximo dia util) aplicada igualmente na previa e na geracao"
    requirement: BA-01
    verification:
      - kind: unit
        ref: "cobranca-boleto-atualizado.service.test.ts#S5; cobranca-boleto-atualizado.http.test.ts#P3,H5"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-11-17
status: complete
---

# Phase 50 Plan 03: Previa do boleto atualizado e geracao segura de repetir Summary

**Rota de previa do boleto atualizado (detalhamento por titulo, datas permitidas e taxas editaveis, tudo calculado no servidor, sem EFI e sem gravacao) e geracao endurecida: recusas antes da EFI, retentativa idempotente do cancelamento, mutex por boleto, compensacao na EFI e traducao do 4600210.**

## Performance

- **Duration:** ~12 min
- **Completed:** 2026-11-17
- **Tasks:** 2
- **Files modified:** 5 (1 criado, 4 alterados)

## Accomplishments

- `previa()` + `PreviaBoletoAtualizadoDto` (todos opcionais, mesmos tetos) + `POST boleto/:id/atualizacao/previa` com `@HttpCode(200)`. Sem data usa o proximo dia util; sem taxas usa as configuradas; informa `sucessorAtivoId`.
- Validacao unica (`carregarOriginal` + `resolverCalculo`) usada por previa e geracao: 404 inexistente; 409 pago/cancelado (citando o boleto atualizado ativo)/baixado no Athos; 400 sem charge, data fora de [hoje, proximo dia util], taxa acima do teto, titulo fora de AVC/VEN, valor do titulo alterado no Athos (> 1 centavo); 422 sem titulo vencido.
- `gerar()`: mutex por boleto (segunda chamada simultanea -> 409 "em andamento", liberado em `finally`); boleto atualizado ativo com original pendente vira retentativa (`reaproveitado: true`, sem novo charge; EFI informando original pago -> 409 de pagamento em dobro, sem cancelar nada); falha ao gravar o novo cancela o charge novo na EFI e devolve 500 com original intocado; 4600210 -> 400 amigavel.
- Tracer gate (auto): verify end-to-end re-executado apos o GREEN, 13 passed; expansao liberada.

## Task Commits

1. **Task 1 (tracer), RED:** `760760d` test(50-03): tracer da previa do boleto atualizado (RED)
2. **Task 1 (tracer), GREEN:** `8d17d46` feat(50-03): previa do boleto atualizado e geracao segura de repetir
3. **Task 2:** `5048ad6` test(50-03): suite unitaria da geracao segura de repetir

## Verification

- `npm --prefix apps/backend run test -- cobranca-boleto-atualizado --no-coverage`: 3 suites, 46 passed (13 HTTP + 20 do servico + 13 do util).
- `npm --prefix apps/backend run test -- cobranca --no-coverage`: 27 suites, 363 passed (minimo exigido 353).
- `npx tsc --noEmit -p apps/backend/tsconfig.json`: exit 0.
- Criterios de aceitacao: `atualizacao/previa` no controller = 1, `class PreviaBoletoAtualizadoDto` = 1, `sucessorAtivoId` no servico = 2, `4600210` = 2, `reaproveitado: true` = 1, 20 casos `it(` no teste do servico. Nenhuma remocao de linhas do Prisma (o objeto Prisma falso nao tem funcao de remocao).

## Deviations from Plan

**1. [Documentacao] Criterio de aceitacao do grep `.delete(` casa com `Set#delete`**
- **Found during:** Task 2
- **Issue:** `grep -nE "\.delete(Many)?\(" ...service.ts; test $? -eq 1` encontra `this.gerando.delete(cobrancaId)` (liberacao do mutex em `finally`). A intencao do criterio (nunca apagar linhas no Prisma) esta atendida: nao ha `prisma.*.delete*` no servico e o Prisma falso dos testes nao expoe remocao.
- **Fix:** Nenhuma; mantido o `Set#delete`, que e o idioma natural para o mutex.

**2. Observacao sobre o ciclo TDD da Task 2:** o codigo de endurecimento de `gerar()` (mutex, retentativa, compensacao, 4600210) foi escrito junto com a validacao compartilhada na Task 1, porque ambos reestruturam o mesmo metodo. A suite S1..S16 da Task 2 passou na primeira execucao como teste de caracterizacao; nenhum ajuste de codigo foi necessario.

**3. Observacao de valor de referencia:** no caso P2 (7 dias, juros 0,5%) o juros esperado e 1,19 (o calculo usa a taxa diaria arredondada, igual a baixa do Athos), como o plano indica; um palpite inicial de 1,17 foi corrigido no teste, nao no codigo.

**Total deviations:** 0 correcoes de codigo; 1 divergencia de criterio documentada.

## Authentication Gates

None.

## Known Stubs

None. `barcodeLinhaDigitavel` fica vazio no resultado reaproveitado (retentativa) porque a linha digitavel nao e persistida em `CobrancaBoleto`; o link do PDF e devolvido.

## Threat Flags

None. A previa nao expoe documento nem linha digitavel (T-50-15); T-50-12 e T-50-13 mitigadas por S14/S15 e S12.

## Issues Encountered

None.

## Next Phase Readiness

Pronto para 50-04 em diante: a tela do operador (50-06) pode consumir a previa para datas permitidas e detalhamento.

## Self-Check: PASSED

- Arquivos: service, controller, dto, http.test e service.test existem; commits `760760d`, `8d17d46`, `5048ad6` presentes no HEAD.
