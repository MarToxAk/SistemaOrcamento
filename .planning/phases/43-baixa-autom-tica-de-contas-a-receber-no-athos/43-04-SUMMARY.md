---
phase: 43-baixa-autom-tica-de-contas-a-receber-no-athos
plan: 04
subsystem: api
tags: [nestjs, nextjs, pg, athos, cobranca, estorno, painel, roteiro-manual]
status: complete-with-pending-validation

requires: ["43-01", "43-02", "43-03"]
provides:
  - "AthosContaReceberBaixaService.estornarBaixa: transacao unica ('Voltar Contas Recebidas'), so os pares (idcontareceber, idcontarecebida) registrados pelo Sistema, validacao total antes do primeiro DELETE, simulacao READ ONLY"
  - "montarRegexCartaoPreferencial: regex com fronteira numerica no lugar do LIKE do Athos"
  - "CobrancaBaixaAthosService.estornarBaixa e POST /cobranca/boleto/:id/estornar-baixa-athos (AdminOnly, confirmar=true ou simular=true)"
  - "Proxies Next baixar-athos e estornar-baixa-athos (requireAdminSession + adminBackendFetch)"
  - "Painel Boletos a Receber: coluna Athos e botoes Simular, Baixar no Athos, Estornar baixa (digitar ESTORNAR)"
  - "43-ROTEIRO-VERIFICACAO-MANUAL.md (Passo 0 a 10, somente SELECT de conferencia)"
affects: []

actuals:
  tokens: 33000
  tasks: 3
  commits: 3
plan_head_before: c533a2c4503a54498d4728e5b20d46ef43e308ba
plan_head_after: 5df47bd4bf4640d2eeb1bd26014e113cf36bab44
commits: 3

key-files:
  created:
    - apps/backend/src/modules/cobranca/dto/estornar-baixa-athos.dto.ts
    - apps/frontend/src/app/api/cobranca/boleto/[id]/baixar-athos/route.ts
    - apps/frontend/src/app/api/cobranca/boleto/[id]/estornar-baixa-athos/route.ts
    - .planning/phases/43-baixa-autom-tica-de-contas-a-receber-no-athos/43-ROTEIRO-VERIFICACAO-MANUAL.md
  modified:
    - apps/backend/src/modules/integrations/athos/athos-conta-receber-baixa.service.ts
    - apps/backend/src/modules/integrations/athos/athos-conta-receber-baixa.service.test.ts
    - apps/backend/src/modules/cobranca/cobranca-baixa-athos.service.ts
    - apps/backend/src/modules/cobranca/cobranca-baixa-athos.service.test.ts
    - apps/backend/src/modules/cobranca/cobranca-baixa-athos.controller.test.ts
    - apps/backend/src/modules/cobranca/cobranca.controller.ts
    - apps/frontend/src/app/contas-receber/page.tsx

key-decisions:
  - "Estorno usa regex com fronteira numerica no DELETE de cliente_cartao_preferencial (BAIXA CONTA RECEBER(.*[^0-9])?<id>([^0-9]|$)) em vez do LIKE do Athos, que casaria o titulo 13 com a descricao do titulo 1302. Decisao do usuario."
  - "Estorno so apaga o que o Sistema baixou: pares (idcontareceber, idcontarecebida) vem da ultima linha de trilha operacao baixa resultado baixado; entradas ja_baixado (idcontarecebida null) sao descartadas; qualquer divergencia (status, zero ou mais de um recebimento, id diferente) aborta antes de qualquer DELETE. Decisao do usuario."
  - "Log no Athos: somente baixa retroativa e estorno gravam em log (uma linha por titulo no estorno). Decisao do usuario."
  - "Falha de estorno nao altera athosBaixaStatus (continua baixado) e grava linha de trilha operacao estorno resultado falha; sucesso grava estornado e nao toca CobrancaBoleto.status."
  - "Proxies validam id numerico (400) e repassam so as chaves permitidas (baixar: dataPagamento, simular, ignorarValorEfi; estornar: confirmar, simular)."

requirements-completed: [BX-09, BX-10, BX-11]
completed: 2026-11-06
---

# Phase 43 Plan 04: Estorno, controles do painel e roteiro de verificacao Summary

**Estorno transacional ("Voltar Contas Recebidas") que so apaga o que o Sistema baixou (ids da trilha de auditoria), com regex de fronteira numerica no cartao preferencial, endpoint AdminOnly com confirmacao ou simulacao somente leitura, controles Simular/Baixar/Estornar no painel de boletos e roteiro de verificacao guiada (somente SELECT) para o usuario validar no Athos real; tudo provado com mocks, sem nenhum acesso ao Athos.**

## Tarefas

| # | Tarefa | Commit |
|---|--------|--------|
| 1 | Servico Athos de estorno (TDD, 15 testes E1-E13 com pg falso) | 5e170fe |
| 2 | Orquestrador, DTO e endpoint AdminOnly (X1-X8 e C4-C6) | 8a15a42 |
| 3 | Proxies Next, coluna Athos e botoes no painel, roteiro manual | 5df47bd |

## Verificacao

- `npx tsc --noEmit -p apps/backend/tsconfig.json`: exit 0.
- `npx tsc --noEmit -p apps/frontend/tsconfig.json`: exit 0.
- `npm --prefix apps/backend run test`: 52 suites, 701 passed (baseline pos 43-03: 673; +28 novos: 15 no servico Athos, 10 no orquestrador, 3 no controller).
- `npm --prefix apps/backend run test -- athos-conta-receber-baixa`: 49 passed (plano exigia >= 38).
- `npm --prefix apps/backend run test -- cobranca-baixa-athos`: 66 passed (plano exigia >= 50).
- `npm --prefix apps/backend run test -- cobranca`: 11 suites, 140 passed.
- Gates de grep: `DELETE FROM livro_registro_io|conta_recebida|caixa_entrada` fora de testes so no servico Athos; `update boleto` = 1 e `update cliente` = 1 no servico (estorno nao toca boleto nem cliente); `@AdminOnly()` = 2 e `@Public()` = 3 no controller; todos os testes que instanciam o servico Athos real tem `jest.mock("pg"`; sem `192.168.` nos arquivos novos; sem `NEXT_PUBLIC` nos proxies; page.tsx: `athosBaixaStatus` 7x, `baixar-athos` 2x, `estornar-baixa-athos` 1x, `ESTORNAR` 2x; `contas-receber/[idcliente]/page.tsx` inalterado.
- Roteiro: 11 secoes `## Passo` (0 a 10); 0 linhas iniciadas por INSERT, UPDATE, DELETE, GRANT, REVOKE, DROP, ALTER, TRUNCATE ou CREATE.
- Nenhuma conexao ao Athos (nem leitura), nenhuma migration, nenhuma dependencia npm, nenhum deploy, sem push.

## Deviations from Plan

**1. [Rule 3 - ambiente] node_modules ausente no worktree**
- Symlinks locais `node_modules`, `apps/backend/node_modules` e `apps/frontend/node_modules` para o checkout principal (nao commitados; aparecem como untracked).

**2. [Nota] Ciclo RED/GREEN em commit unico por tarefa** (mesmo padrao de 43-01 a 43-03). Os testes foram escritos junto da implementacao em cada tarefa.

**3. [Ajuste] GRANT/DELETE no roteiro em prosa**
- O Passo 0 do plano citava GRANTs; para respeitar "roteiro sem comando de escrita", as permissoes (INSERT/UPDATE e DELETE por tabela) estao descritas em texto, sem bloco SQL de GRANT/REVOKE. O texto exato do GRANT continua na mensagem `PERMISSAO_NEGADA` do servico, agora citando tambem DELETE.

**4. [Ajuste] Painel nao permite informar data**
- O proxy de baixa repassa `dataPagamento` (se enviada), mas a UI so envia `simular`. O Passo 5 do roteiro usa a data real guardada na EFI (boleto pago em dia anterior com baixa pendente); nao ha campo de data na tela.

**5. [Rule 2 - robustez] Casos extras:** E4b (valor pago diferente do principal no log), E10b (FOR UPDATE fora da simulacao), X5b (simulacao que falha nao persiste), X7b (falha ao persistir apos estorno so loga). Proxies tambem validam `id` numerico (400) antes de montar o caminho do backend.

Nenhuma deviation de Rule 1 ou Rule 4.

## Auth gates

Nenhum durante a execucao. Em operacao, baixa manual e estorno exigem `ADMIN_API_KEY` (backend e frontend) e sessao admin do painel.

## Known Stubs

Nenhum.

## Pendencias para o usuario

1. **Executar `43-ROTEIRO-VERIFICACAO-MANUAL.md`** (Passos 0 a 10) no Athos real com backup, permissoes (incluindo DELETE para o estorno) e `ATHOS_BAIXA_AUTO=false` ate o fim. Esta e a unica prova de que o SQL se comporta como a tela do Athos (D-07); a formula de encargos (43-02) segue validada so contra 2 casos.
2. Conferir qual funcionario deve aparecer no log/caixa (`ATHOS_BAIXA_ID_FUNCIONARIO`, padrao 1; a captura original usou 3).
3. Aplicar a migration `20261106120000_add_cobranca_baixa_athos` via `prisma migrate deploy` no deploy (planejada em 43-03).
4. Um boleto `estornado` volta a ser elegivel para baixa manual; se o webhook da EFI reenviar `paid` para um boleto ja pago e estornado, o gancho automatico trataria como novo pagamento (`estornado` nao e `baixado` nem `ja_baixado`). Hoje o gancho dispara so na transicao para `pago`; vale confirmar na verificacao guiada.
5. Pagamentos anteriores a fase (athosBaixaStatus nulo) nunca sao baixados pelo job; so por acao manual no painel.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: db-delete | athos-conta-receber-baixa.service.ts | Novo DELETE em tabelas do caixa do Athos (T-43-22 a T-43-25 mitigados: AdminOnly, confirmar=true, ids exatos da trilha, regex de fronteira, validacao total antes de apagar, transacao unica, simulacao READ ONLY) |

## Self-Check: PASSED

- Arquivos criados presentes (dto, duas rotas proxy, roteiro) e commits 5e170fe, 8a15a42, 5df47bd ancestrais de HEAD.
