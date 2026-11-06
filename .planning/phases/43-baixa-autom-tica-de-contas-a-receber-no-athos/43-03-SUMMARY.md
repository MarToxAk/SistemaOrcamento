---
phase: 43-baixa-autom-tica-de-contas-a-receber-no-athos
plan: 03
subsystem: api
tags: [nestjs, prisma, athos, cobranca, baixa, retentativa, auditoria]
status: complete

requires: ["43-01", "43-02"]
provides:
  - "Migration idempotente 20261106120000_add_cobranca_baixa_athos: colunas athosBaixa* em CobrancaBoleto e tabela CobrancaBaixaAthosLog (append-only, sem FK)"
  - "CobrancaBaixaAthosService: registro duravel por tentativa, baixarManual (com simulacao somente leitura) e consultarStatus"
  - "POST /cobranca/boleto/:id/baixar-athos (AdminOnly) e GET /cobranca/boleto/:id/baixa-athos"
  - "CobrancaBaixaAthosRetryJob (30 min, falha/pendente, < 5 tentativas, ate 50 por ciclo)"
  - "buscarBoletosDashboard devolve athosBaixaStatus/ErroCodigo/ErroMensagem; cancelar/remover recusam boleto baixado"
affects: [43-04]

actuals:
  tokens: 40000
  tasks: 3
  commits: 3
plan_head_before: 7d19166
plan_head_after: 54f0c9e84a656b3cc235c6144b93c0d645aa114e
commits: 3

key-files:
  created:
    - apps/backend/prisma/migrations/20261106120000_add_cobranca_baixa_athos/migration.sql
    - apps/backend/src/modules/cobranca/dto/baixar-athos.dto.ts
    - apps/backend/src/modules/cobranca/cobranca-baixa-athos-retry.job.ts
    - apps/backend/src/modules/cobranca/cobranca-baixa-athos-retry.job.test.ts
    - apps/backend/src/modules/cobranca/cobranca-baixa-athos.controller.test.ts
  modified:
    - apps/backend/prisma/schema.prisma
    - apps/backend/src/modules/cobranca/cobranca-baixa-athos.service.ts
    - apps/backend/src/modules/cobranca/cobranca-baixa-athos.service.test.ts
    - apps/backend/src/modules/cobranca/cobranca-baixa-athos.tracer.test.ts
    - apps/backend/src/modules/cobranca/cobranca.service.ts
    - apps/backend/src/modules/cobranca/cobranca.service.baixa-hook.test.ts
    - apps/backend/src/modules/cobranca/cobranca.controller.ts
    - apps/backend/src/modules/cobranca/cobranca.module.ts

key-decisions:
  - "Data/valor da EFI sao persistidos antes de chamar o Athos e reutilizados nas retentativas (sem nova consulta a EFI); falha ao persistir so gera log e a baixa segue com os valores em memoria."
  - "Com ATHOS_BAIXA_AUTO=false o boleto fica pendente (sem contar tentativa); o job so roda com a flag ligada, e a baixa manual ignora a flag e o limite de tentativas."
  - "Mensagem persistida so de BaixaAthosError (texto controlado, truncado em 300); qualquer outro erro vira ERRO_INESPERADO com texto generico."
  - "Codigos de infra (PERMISSAO_NEGADA, ERRO_BANCO, CONFIG_INVALIDA, CONFIG_ATHOS_INCOMPLETA, AMBIENTE_TESTE_HOST_REAL) viram HTTP 500 com mensagem curta sem detalhe; os demais codigos de negocio viram HTTP 422 com { codigo, message }."
  - "Data informada pelo operador so passa a ser a guardada se o Athos nao a recusou como invalida/futura."

requirements-completed: [BX-07, BX-08, BX-01]
completed: 2026-11-06
---

# Phase 43 Plan 03: Registro duravel, baixa manual e retentativa Summary

**Cada tentativa de baixa no Athos agora deixa status no boleto e uma linha append-only de auditoria; ha baixa manual protegida (AdminOnly, com simulacao somente leitura), job de retentativa limitado e guarda contra cancelar boleto ja baixado. Tudo provado com mocks, sem tocar o Athos real.**

## Tarefas

| # | Tarefa | Commit |
|---|--------|--------|
| 1 | Registro duravel (migration + schema + orquestrador), painel e guardas de cancelar/remover. Inclui ja `baixarManual` e `consultarStatus` no servico (mesmo arquivo do orquestrador) | 6951c37 |
| 2 | DTO `BaixarAthosDto`, rotas `POST boleto/:id/baixar-athos` (AdminOnly) e `GET boleto/:id/baixa-athos`, teste do controller | c7ad431 |
| 3 | `CobrancaBaixaAthosRetryJob` + registro no modulo | 54f0c9e |

## Verificacao

- `npx tsc --noEmit -p apps/backend/tsconfig.json`: exit 0.
- `prisma validate`: schema valido; `prisma generate` executado.
- `npm --prefix apps/backend run test -- cobranca`: 11 suites, 127 passed (pos 43-02: 92; minimo do plano 110).
- `npm --prefix apps/backend run test -- athos`: 24 suites, 395 passed (pos 43-02: 363).
- Suite completa do backend: 52 suites, 673 passed.
- Suites novas/ampliadas: orquestrador 39 (R1-R8 e M1-M8 mais extras), hook 10 originais + G1-G3, controller C1-C3, job J1-J7.
- `@AdminOnly()` no controller: 1 (baseline 0); `@Public()`: 3 (invariante mantida).
- Escrita confinada: `INSERT INTO (conta_recebida|livro_registro_io)` fora de testes so no servico Athos de baixa.
- Sem `192.168.` nos arquivos novos; `cobranca-reconciliation.job.ts` intacto; migration sem DROP/DELETE/TRUNCATE.
- Migration aplicada DUAS vezes apenas no banco dev local (container orcamento-dev-pg, banco orcdev) para provar idempotencia: sem erro, so NOTICEs "already exists, skipping". Nenhum outro banco tocado; nenhuma conexao ao Athos; nenhum deploy; sem push.

## Deviations from Plan

**1. [Rule 3 - Blocking] node_modules ausente no worktree**
- Symlinks locais para os node_modules do checkout principal (nao commitados). Consequencia: `prisma generate` atualizou o client gerado em `node_modules/.prisma` do checkout principal (aditivo: novos campos/modelo); sem efeito em runtime ate o deploy.

**2. [Organizacao] `baixarManual`/`consultarStatus` entraram no commit da Task 1**
- Estao no mesmo arquivo do orquestrador e compartilham o caminho unico de execucao (exigencia do plano para que baixa automatica e manual nunca divirjam); a Task 2 traz DTO, rotas e testes do controller. Os testes M1-M8 do servico ficaram no commit da Task 1.

**3. [Rule 1 - Teste desatualizado] Ajuste de testes 43-01**
- Teste 1 do orquestrador (flag desligada nao consultava o banco) passou a refletir o novo contrato (boleto fica `pendente`, ver R4); mocks de prisma ganharam `update` e `cobrancaBaixaAthosLog.create`. No tracer, a contagem de `update` passou a filtrar pelas gravacoes de `status: "pago"` (o orquestrador agora tambem grava data/valor e resultado).

**4. [Rule 2 - Robustez] Casos extras**
- M3b (simulacao que falha nao grava), M4b (limite de tentativas ignorado), M5b (data futura recusada nao vira a guardada), M7b (config invalida em baixa real) e C1b/C2b.

**5. [Nota] Ciclo RED/GREEN em commit unico por tarefa** (mesmo padrao de 43-01/43-02).

Nenhuma deviation de Rule 4.

## Pendencias / observacoes para a verificacao guiada

- A migration precisa ser aplicada pelo `prisma migrate deploy` do bootstrap no deploy (nao aplicada em nenhum banco real). Ate la, o codigo novo nao deve ir para producao sem ela.
- Formula de encargos (43-02) continua sem validacao contra dados reais; a baixa manual com `simular=true` e o caminho recomendado para o primeiro caso.
- Rollout sugerido (D-01): `ATHOS_BAIXA_AUTO=false` acumula `pendente`; validar a primeira baixa por `POST .../baixar-athos` (simular, depois real); ao religar a flag o job baixa os pendentes com a data real do pagamento.
- Boletos pagos antes da fase (athosBaixaStatus nulo) nunca sao baixados pelo job; so por acao manual.
- Frontend (proxy do endpoint admin e colunas do painel) fica para o plano 43-04.

## Known Stubs

Nenhum.

## Threat Flags

Nenhum alem do threat model do plano (T-43-15 a T-43-21 mitigados: AdminOnly + C1; filtro do job + J1/J2; teto/tentativas/guarda de ciclo; log append-only; mensagem controlada; guardas G1/G2; idempotencia no Athos).

## Self-Check: PASSED

- Arquivos criados presentes (migration, dto, job, testes) e commits 6951c37, c7ad431, 54f0c9e ancestrais de HEAD.
