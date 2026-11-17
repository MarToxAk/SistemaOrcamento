---
phase: 50-contas-a-receber-boleto-atualizado-com-juros-e-multa
verified: 2026-11-17T14:14:29Z
status: passed
score: 11/11 must-haves verified (BA-01..BA-11; BA-11 pelo aceite do usuario sobre a homologacao D-17)
covered_files: [".planning/phases/50-contas-a-receber-boleto-atualizado-com-juros-e-multa/50-01-PLAN.md", ".planning/phases/50-contas-a-receber-boleto-atualizado-com-juros-e-multa/50-01-SUMMARY.md", ".planning/phases/50-contas-a-receber-boleto-atualizado-com-juros-e-multa/50-02-PLAN.md", ".planning/phases/50-contas-a-receber-boleto-atualizado-com-juros-e-multa/50-02-SUMMARY.md", ".planning/phases/50-contas-a-receber-boleto-atualizado-com-juros-e-multa/50-03-PLAN.md", ".planning/phases/50-contas-a-receber-boleto-atualizado-com-juros-e-multa/50-03-SUMMARY.md", ".planning/phases/50-contas-a-receber-boleto-atualizado-com-juros-e-multa/50-04-PLAN.md", ".planning/phases/50-contas-a-receber-boleto-atualizado-com-juros-e-multa/50-04-SUMMARY.md", ".planning/phases/50-contas-a-receber-boleto-atualizado-com-juros-e-multa/50-05-PLAN.md", ".planning/phases/50-contas-a-receber-boleto-atualizado-com-juros-e-multa/50-05-SUMMARY.md", ".planning/phases/50-contas-a-receber-boleto-atualizado-com-juros-e-multa/50-06-PLAN.md", ".planning/phases/50-contas-a-receber-boleto-atualizado-com-juros-e-multa/50-06-SUMMARY.md", ".planning/phases/50-contas-a-receber-boleto-atualizado-com-juros-e-multa/50-07-PLAN.md", ".planning/phases/50-contas-a-receber-boleto-atualizado-com-juros-e-multa/50-07-SUMMARY.md", ".planning/phases/50-contas-a-receber-boleto-atualizado-com-juros-e-multa/50-ROTEIRO-HOMOLOGACAO.md", "apps/backend/prisma/migrations/20261117120000_add_cobranca_boleto_atualizado/migration.sql", "apps/backend/prisma/schema.prisma", "apps/backend/src/modules/cobranca/cobranca-baixa-athos.boleto-atualizado.tracer.test.ts", "apps/backend/src/modules/cobranca/cobranca-baixa-athos.service.test.ts", "apps/backend/src/modules/cobranca/cobranca-baixa-athos.service.ts", "apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.controller.ts", "apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.http.test.ts", "apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.service.test.ts", "apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.service.ts", "apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.util.test.ts", "apps/backend/src/modules/cobranca/cobranca-boleto-atualizado.util.ts", "apps/backend/src/modules/cobranca/cobranca-encargos-config.controller.ts", "apps/backend/src/modules/cobranca/cobranca-encargos-config.service.ts", "apps/backend/src/modules/cobranca/cobranca-encargos-config.test.ts", "apps/backend/src/modules/cobranca/cobranca.module.ts", "apps/backend/src/modules/cobranca/cobranca.service.baixa-hook.test.ts", "apps/backend/src/modules/cobranca/cobranca.service.emissao-efi.test.ts", "apps/backend/src/modules/cobranca/cobranca.service.titulos-em-uso.test.ts", "apps/backend/src/modules/cobranca/cobranca.service.ts", "apps/backend/src/modules/cobranca/dto/atualizar-encargos-config.dto.ts", "apps/backend/src/modules/cobranca/dto/gerar-boleto-atualizado.dto.ts", "apps/backend/src/modules/cobranca/email-envio.service.test.ts", "apps/backend/src/modules/cobranca/email-envio.service.ts", "apps/backend/src/modules/integrations/athos/athos-baixa-encargos.util.test.ts", "apps/backend/src/modules/integrations/athos/athos-baixa-encargos.util.ts", "apps/backend/src/modules/integrations/athos/athos-conta-receber-baixa.service.test.ts", "apps/backend/src/modules/integrations/athos/athos-conta-receber-baixa.service.ts", "apps/frontend/src/app/api/admin/cobranca-encargos/route.ts", "apps/frontend/src/app/api/cobranca/boleto/[id]/atualizacao/previa/route.ts", "apps/frontend/src/app/api/cobranca/boleto/[id]/atualizar/route.ts", "apps/frontend/src/app/configuracoes/cobranca/page.tsx", "apps/frontend/src/app/configuracoes/page.tsx", "apps/frontend/src/app/contas-receber/[idcliente]/_abas/aba-boletos.tsx", "apps/frontend/src/app/contas-receber/[idcliente]/_abas/compartilhado.tsx", "apps/frontend/src/app/contas-receber/[idcliente]/_abas/modal-boleto-atualizado.tsx", "apps/frontend/src/app/contas-receber/[idcliente]/_abas/use-dados-cliente.ts", "apps/frontend/src/app/contas-receber/admin-shell.tsx"]
covered_digest: "v4:sha256:4a00d72a9bf470e06dfe2731d7de273b7a3f7feabc35f28888086483826ba24e"
behavior_unverified: 0
overrides_applied: 0
---

# Fase 50: Verificacao do boleto atualizado com juros e multa

**Objetivo da fase:** em Contas a Receber, o operador gera um boleto atualizado (com juros e multa) de um titulo vencido para enviar ao cliente. Novo vencimento somente hoje ou proximo dia util (backend e frontend). Juros e multa calculados a partir do vencimento original registrado no Athos. Padrao 0,99% a.m. e 2%, editaveis na geracao, com tela de configuracao.
**Verificado:** 2026-11-17T14:14:29Z
**Status:** passed
**Re-verificacao:** Nao (verificacao inicial)

## Resultado

Objetivo atingido. Cada decisao D-01..D-18 e cada requisito local BA-01..BA-11 tem implementacao no codigo e, quando o comportamento e de estado ou ordem, teste que exercita o caminho. Nenhum gap bloqueante.

A homologacao D-17 foi aprovada pelo usuario sem tabela preenchida. A3, A5 e A5b nao foram confirmadas formalmente. Conforme decisao do usuario, isso e tratado como risco aceito e nao como gap. Ver a secao "Riscos aceitos".

## Verdades observaveis

| #   | Verdade (decisao / requisito) | Status | Evidencia no codigo e nos testes |
| --- | ----------------------------- | ------ | -------------------------------- |
| 1   | D-01/D-02 (BA-01): novo vencimento so hoje (SP) ou proximo dia util seg-sex; data posterior bloqueada no backend e no frontend | VERIFIED | `cobranca-boleto-atualizado.util.ts` L31-50 (`proximoDiaUtil`, `vencimentosPermitidos`, `novoVencimentoPermitido`). Servico `resolverCalculo` L194-200 recusa com 400. DTO com `@Matches`. Modal so renderiza as duas datas devolvidas pela previa (sem campo de data livre). Testes U1-U3, S5, H5, P3. |
| 2   | D-03/D-04/D-05/D-13 (BA-02): juros pro rata por dia e multa fixa por titulo, desde o `datavencimento` do Athos | VERIFIED | `calcularBoletoAtualizado` (util L126-172) chama `calcularEncargosTitulo` com carencia 0, vencimento = `t.vencimentoOriginal` vindo de `datavencimento` (athos.service L2292-2340, filtro AVC/VEN). Caso dourado 1000,00 / 10-11 / 18-11 = 8 dias, juros 2,64, multa 20,00, total 1022,64 asserido em U5, A1 e H1. |
| 3   | D-06/D-16 (BA-03): taxas editaveis na geracao, pre-preenchidas, tetos 1% a.m. e 2% | VERIFIED | DTO `gerar-boleto-atualizado.dto.ts` com `@Max(TETO_JUROS_MES)` e `@Max(TETO_MULTA_PERCENTUAL)`. `validarTaxas` (util L75-91) chamado em `resolverCalculo` L205. Modal L146-152 mostra aviso e desabilita confirmacao (`taxasValidas`). Testes S6, H6, P2, P3. |
| 4   | D-07/D-18 (BA-04): `/configuracoes/cobranca` com PasswordGate e AdminShell, taxas persistidas, GET/PUT admin, menu em grupo, `/configuracoes` redireciona | VERIFIED | Pagina `configuracoes/cobranca/page.tsx` usa `PasswordGate` e `AdminShell`, valida tetos na tela. Controller `cobranca-encargos-config.controller.ts` com `@AdminOnly()` em GET e PUT. Modelo `CobrancaEncargosConfig` no schema (L449-454) e tabela na migration. `admin-shell.tsx` com grupo "Configuracoes" (Templates de PDF, Juros e multa). `configuracoes/page.tsx` redireciona para `/configuracoes/templates`. Testes K1-K7. |
| 5   | D-08/D-14 (BA-05): criar novo, persistir, cancelar original de forma estrita, sem apagar linha, com vinculo | VERIFIED | `cobranca-boleto-atualizado.service.ts`: `create` (L475) antes de `cancelarOriginalEstrito` (L535). Cancelamento so marca `cancelado` com code 200 (L308-324). Nenhum `delete` no fluxo. Nunca reutiliza `cancelarBoleto`. `boletoOrigemId` gravado. Testes H1 (`ordem` = criar, cancelar, cancelado), H3, S12 (compensacao), S13. |
| 6   | D-11 (BA-05): linhas "Juros de mora" e "Multa por atraso" somadas aos itens das notas; soma igual ao total em centavos | VERIFIED | Servico L402-417 (`NOME_ITEM_JUROS`, `NOME_ITEM_MULTA` do util L15-16) com verificacao de soma e 500 se divergir. Teste H2. |
| 7   | D-12 (BA-09): EFI com `configurations` (fine, interest) apenas apos o novo vencimento; `message` de ate 4 linhas de ate 100 caracteres ASCII; mesma mensagem gravada em `mensagemAtualizacao` | VERIFIED | `configuracoesEfi` (util L178-188: fine = multa x 100, interest = taxa x 1000 / 30) enviado em `payment.banking_billet.configurations` (servico L422-434). `montarMensagemAtualizacao` (util L210-240). Persistida no servico L493. Testes H2, util U-series. |
| 8   | D-09 (BA-06): baixa Athos do titulo original com juros e multa do snapshot, sem ler `conf_financeiro`; pagamento atrasado aceito ate o teto pos-vencimento | VERIFIED | `cobranca-baixa-athos.service.ts` `titulosParaBaixa` (L~620-650) envia `encargosFixos` e `posVencimento` apenas quando o boleto tem `boletoOrigemId`. `athos-conta-receber-baixa.service.ts` ramo `usaFixos` pula a leitura de `conf_financeiro`. `decidirValoresBaixaFixos` em `athos-baixa-encargos.util.ts` (rateio, tolerancia de R$ 0,10, teto pos-vencimento). Tracer A1 asserta a sequencia SQL BEGIN..COMMIT sem `LER_CONF` e valores 2,64 / 20,00 / atraso 8. A2 asserta `VALOR_INCOMPATIVEL` sem INSERT. |
| 9   | D-10 (BA-07): envio pelo fluxo de e-mail existente com CC padrao; e-mail leva a mensagem do boleto atualizado | VERIFIED | `email-envio.service.ts` le `boleto.mensagemAtualizacao` (L193-198) e renderiza o quadro "Boleto atualizado" em HTML (escapado) e texto (L560-580, L664-681). Frontend abre o modal de e-mail existente com `cobrancaId` do boleto novo (aba-boletos `onEnviarEmail`, L213 `cobrancaBoletoId: emailCtx.cobrancaId`). Testes M1 (quadro e CC), M2 (escape), M3 (boleto comum sem quadro). |
| 10  | D-15 (BA-10): pagamento do original ja cancelado gera apenas alerta (log WARN com os dois ids e tela), sem cancelar o novo | VERIFIED | `cobranca.service.ts` `alertarPagamentoBoletoSubstituido` (nunca lanca), chamado no webhook (sem guarda para `cancelado`), na verificacao manual e na reconciliacao. `buscarTitulosComBoletoAtivo` devolve `alertaPagamentoDuplicado` e `boletoRelacionadoId`, ordenado por `cobrancaBoletoId` asc. Frontend mostra pill vermelho e marca "Atualizado - substitui #N". Testes D1-D4 (baixa-hook), T2-T5 (titulos-em-uso). |
| 11  | BA-08: bloqueio de boleto pago, cancelado, baixado no Athos, sem charge, titulo fora de aberto, valor alterado no Athos, ou sem titulo vencido, antes de qualquer chamada EFI, na previa e na geracao | VERIFIED | `carregarOriginal` (L139-185) e `resolverCalculo` (L208-235). Frontend so exibe "Atualizar" para status `pendente` (aba-boletos). Testes S1-S10, P4 (422), P5 (409/404). |
| 12  | D-14 / BA-05 / BA-08: idempotencia e mutex. Repetir geracao com boleto atualizado ativo nao cria outro boleto; duplo clique recebe 409; compensacao cancela o charge novo se a gravacao falhar; 4600210 vira 400 amigavel | VERIFIED | Mutex por processo `gerando` (L121, L288-296, liberado no finally). Retentativa `retentarCancelamento` (L338-375, `reaproveitado: true`). Compensacao L513-531. Traducao 4600210 L462-467. Frontend com `gerandoRef` contra duplo clique. Testes S11, S12, S15, S15b, repete-cancelamento. |
| 13  | BA-09 (migration): aditiva e idempotente, sem executar migracao em banco de producao | VERIFIED | `migration.sql`: `ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, FK protegida por `pg_constraint`, `ON DELETE SET NULL` coerente com o schema. `prisma validate` passou. Aplicacao real e reaplicacao idempotente foram feitas no container descartavel 127.0.0.1:5450 segundo o 50-07 SUMMARY; o verificador nao reexecutou (sem tocar bancos). |
| 14  | BA-11 (D-17): homologacao humana antes de producao | VERIFIED (aceite do usuario) | Roteiro `50-ROTEIRO-HOMOLOGACAO.md` cobre tela de taxas, Atualizar, painel EFI, e-mail, pagamento, baixa no clone `athos-teste` (127.0.0.1:5440), tabela esperado x obtido. Usuario respondeu "aprovado" sem tabela preenchida e decidiu "liberar" (50-07 SUMMARY). A3/A5/A5b aceitas pelo usuario. |

**Score:** 11/11 requisitos locais verificados (BA-11 pelo aceite registrado). Verdades de estado ou ordem com evidencia comportamental: 0 PRESENT_BEHAVIOR_UNVERIFIED.

## Regressao do boleto comum

- `titulosParaBaixa` so acrescenta `encargosFixos` quando juros e multa nao sao nulos; boleto comum continua `{ idcontareceber, valorEsperado }`.
- `posVencimentoOpcional` so existe com `boletoOrigemId` preenchido.
- `criarBoleto` e `cancelarBoleto` nao aparecem no diff da fase. As alteracoes em `cobranca.service.ts` sao: alerta no webhook e na reconciliacao, `buscarTitulosComBoletoAtivo` (campos novos), `montarItensEfiPorVendaItem` (de private para public) e o novo `prepararEmissaoEfi`.
- As suites existentes passam sem edicao de casos antigos (ver gates abaixo).

## Artefatos e ligacoes (niveis 3 e 4)

| De | Para | Via | Status |
| -- | ---- | --- | ------ |
| `CobrancaBoletoAtualizadoController` | `CobrancaBoletoAtualizadoService` | `gerar` e `previa` | WIRED |
| `cobranca.module.ts` | controllers e services novos | registro em `controllers` e `providers` | WIRED |
| Servico de geracao | `CobrancaService` | `prepararEmissaoEfi`, `verificarPagamentoBoleto`, `montarItensEfiPorVendaItem` | WIRED |
| Servico de baixa | `AthosContaReceberBaixaService` | `baixarTitulos` com `encargosFixos` e `posVencimento` | WIRED |
| Proxies `/api/cobranca/boleto/[id]/atualizacao/previa` e `/atualizar` | backend `/cobranca/boleto/:id/...` | `backendFetch` com `requireAdminSession` e corpo filtrado | WIRED |
| Proxy `/api/admin/cobranca-encargos` | backend `/cobranca/encargos-config` | `adminBackendFetch` com `requireAdminSession` | WIRED |
| `modal-boleto-atualizado.tsx` | proxies acima | fetch POST previa e POST atualizar | WIRED |
| `aba-boletos.tsx` | modal de e-mail existente | `abreEmailModal({ ...origem.boleto, cobrancaId: novoId })` | WIRED |
| `use-dados-cliente.ts` | `titulos-em-uso` do backend | mapeamento campo a campo dos campos novos | WIRED |

**Nivel 4 (fluxo de dados):** valores exibidos (previa, total, juros, multa, mensagem, resultado) vem do servidor. Lista de boletos vem de consulta Prisma real (`buscarTitulosComBoletoAtivo`). FLOWING. Nenhum valor cobrado e calculado no browser.

## Gates executados pelo verificador

| Gate | Comando | Resultado |
| ---- | ------- | --------- |
| Typecheck backend | `npx tsc --noEmit -p apps/backend/tsconfig.json` | exit 0 |
| Typecheck frontend | `npx tsc --noEmit -p apps/frontend/tsconfig.json` | exit 0 |
| Suite cobranca | `npm --prefix apps/backend run test -- cobranca --no-coverage` | 28 suites, 383 testes passed |
| Baixa Athos (fora da pasta cobranca) | `npm --prefix apps/backend run test -- athos-conta-receber-baixa athos-baixa-encargos --no-coverage` | 2 suites, 84 testes passed |
| Suite backend completa | `npm --prefix apps/backend run test -- --no-coverage` | 81 suites passed, 2 ignoradas; 1171 testes passed, 28 ignorados, 0 falhas |
| Schema Prisma | `npx prisma validate --schema apps/backend/prisma/schema.prisma` | valido |

Nao reexecutados pelo verificador: `next build` (reportado como exit 0 no 50-07 SUMMARY) e a migration no container 127.0.0.1:5450 (reportada no 50-07 SUMMARY).

## Auditoria de qualidade dos testes

| Arquivo de teste | Testes ativos | Desativados | Circular | Nivel das asserções |
| ---------------- | ------------- | ----------- | -------- | ------------------- |
| cobranca-boleto-atualizado.http.test.ts | 13 | 0 | nao | Comportamental (ordem de chamadas, valores) |
| cobranca-boleto-atualizado.service.test.ts | 20 | 0 | nao | Comportamental (recusas, mutex, compensacao) |
| cobranca-boleto-atualizado.util.test.ts | 13 | 0 | nao | Valor (caso dourado, teto, datas) |
| cobranca-baixa-athos.boleto-atualizado.tracer.test.ts | 2 | 0 | nao | Comportamental (SQL da baixa, valores) |
| cobranca.service.baixa-hook.test.ts | 18 | 0 | nao | Comportamental (alerta D-15) |
| cobranca.service.titulos-em-uso.test.ts | 10 | 0 | nao | Valor (total, vinculo, nulos sem NaN) |
| cobranca-encargos-config.test.ts | 7 | 0 | nao | Valor e guard |
| email-envio.service.test.ts | 45 | 0 | nao | Conteudo (quadro, escape, boleto comum) |
| athos-baixa-encargos.util.test.ts | 28 | 0 | nao | Valor |
| athos-conta-receber-baixa.service.test.ts | 54 | 0 | nao | Comportamental |

Varredura por `it.skip`, `describe.skip`, `xit`, `it.todo` nos arquivos da fase: nenhuma ocorrencia. Varredura por escrita de fixture gerada pelo sistema: nenhuma.

## Gate de cobertura de decisoes

O gate `check.decision-coverage-verify` nao conseguiu ler as decisoes de `50-CONTEXT.md` (retorno `could-not-parse`: o formato usa `- D-01:` sem negrito). Gate nao bloqueante. A cobertura foi feita manualmente na tabela de verdades acima: D-01 a D-18 todos tratados.

## Riscos aceitos

Estes itens nao sao gaps. Sao registrados para acompanhamento.

1. **A3 (EFI aceita vencimento de hoje), A5 (Athos aceita juros, multa e atraso gravados) e A5b (EFI aceita os nomes "Juros de mora" e "Multa por atraso").** Nao confirmadas formalmente na homologacao D-17. Aceitas pelo usuario ao liberar (50-07 SUMMARY). Sugestao: conferir no primeiro uso real (boleto novo na EFI e baixa no Athos).
2. **Feriados nao considerados.** D-02 permite sabado e domingo como unica regra na v1. Um feriado pode gerar vencimento num dia nao util.
3. **Arredondamento da taxa diaria.** A taxa diaria e arredondada a milesimos de % (`round(taxa x 1000 / 30)`), a mesma aritmetica da baixa Athos. Para o padrao 0,99% a.m. o resultado e exato (33 milesimos). Para outras taxas editadas, o valor fica ate cerca de 2% diferente da formula literal de D-04 (exemplo: 0,5% a.m. vira 0,017% ao dia, em vez de 0,01667%). Comportamento intencional para casar com o Athos, mas vale saber ao editar taxas.

## Observacoes (informativas, nao bloqueiam)

- **Gate admin do frontend.** `requireAdminSession` (`apps/frontend/src/lib/admin-session.ts`, L85) libera a requisicao quando `CONFIG_PANEL_PASSWORD` nao esta definida. E o padrao de todas as rotas admin e de cobranca ja existentes, e as novas rotas de atualizacao seguem esse padrao. O backend esta protegido pela chave interna e `AdminAuthGuard` e fail-closed. Vale confirmar que `CONFIG_PANEL_PASSWORD` esta definida em producao. O verificador nao leu arquivos `.env`.
- **Frontend sem teste automatizado.** Debounce da previa, trava de duplo clique e o fluxo do modal nao tem teste automatizado. Estao cobertos pelo roteiro D-17, que o usuario aprovou.
- **Documentacao desatualizada.** `50-VALIDATION.md` ainda esta com `status: draft`, `nyquist_compliant: false` e aprovacao pendente. No `ROADMAP.md`, o item da Fase 50 (L43) segue sem marca de concluido. Nao afeta o objetivo.
- **Limpeza pendente (do 50-07).** Container descartavel `orcamento-homolog-fase50` (127.0.0.1:5450) e clone `athos-teste` (127.0.0.1:5440) seguem de pe. Remocao a critério do usuario.

## Verificacoes de protocolo

- Marcadores de divida (TBD, FIXME, XXX) nos arquivos da fase: nenhum.
- TODO, HACK, PLACEHOLDER: as ocorrencias encontradas sao atributos `placeholder` de campos de e-mail e a palavra "TODOS" em comentarios. Nao sao marcadores de divida.
- Probes: nenhum probe declarado ou descoberto para esta fase. Passo 7c nao aplicavel.
- Nenhum arquivo de codigo ou teste foi alterado pelo verificador. Nenhum banco, container, EFI ou Athos de producao foi acessado.

## Gaps Summary

Nenhum gap. Nenhuma verdade FAILED. Nenhum item de verificacao humana pendente, pois a homologacao D-17 foi aceita pelo usuario.

---

_Verified: 2026-11-17T14:14:29Z_
_Verifier: Claude (gsd-verifier)_
