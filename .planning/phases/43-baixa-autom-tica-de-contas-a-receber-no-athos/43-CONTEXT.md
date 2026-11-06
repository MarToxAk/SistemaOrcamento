# Phase 43: Baixa automática de contas a receber no Athos - Context

**Gathered:** 2026-11-06
**Status:** Ready for planning
**Mode:** discuss (respostas do usuário: 1a, 2a, 3a, 4 confirmado, 5 sim, 6 entra, 7 sem cópia)

<domain>
## Phase Boundary
Quando o boleto EFI passa a `pago` (webhook em `cobranca.service.ts` ~L608-616 e job de reconciliação ~L769), o Sistema dá baixa nos títulos no Athos reproduzindo a tela "Baixar Contas". Inclui também o estorno ("Voltar Contas Recebidas").
SQL de referência: `43-REFERENCIA-SQL-ATHOS.md` (capturado do Athos real; não lido do código).

**In scope:** baixa automática; cálculo de encargos; estorno; idempotência; log/auditoria.
**Out of scope:** auditoria de telas (`monitoramento`); alterar corpo de e-mail; qualquer teste de escrita contra o Athos real.
</domain>

<decisions>
## Implementation Decisions
- **D-01:** Baixa automática assim que o boleto vira `pago` (webhook ou reconciliação). Sem flag obrigatória. (Claude's discretion: permitir desligar com `ATHOS_BAIXA_AUTO=false`, padrão ligado.)
- **D-02:** Valor gravado = valor efetivamente pago; se houver encargos (atraso), gravar `juros`, `multa`, `atraso` calculados como o Athos (multa ≈ 2% do principal; juros pró-rata/dia via `conf_financeiro.taxajurosmes`; carência `carenciadiascobrancajuros`; ler de `conf_financeiro`, não fixar). Sem atraso: encargos 0.
- **D-03:** `datapagamento`/`datalancamento` = data real do pagamento (retroativa se o webhook atrasar). Retroativa grava o log extra "Baixou a conta com ID ... com a data retroativa ...".
- **D-04:** Constantes configuráveis por env, com estes padrões: `idFormaPagamento=10`, `idlivroregistro=2` (EFI Bank), `idfuncionariousuario=1`.
- **D-05:** Boleto com vários `idcontareceber`: baixa em todos, cada um com seu valor, numa única transação.
- **D-06:** Estorno entra na fase (SQL da seção Estorno, com status final AVC/VEN conforme vencimento; não reverte `boleto.statusBoleto` nem `cliente.aviso*`).
- **D-07:** Segurança: NÃO existe cópia do Athos e NENHUM teste deve escrever no Athos real. Testes só com mocks/pg falso; verificação manual guiada pelo usuário. Executores e verificadores proibidos de conectar no Athos real em escrita.
- **D-08 (técnico):** Transação única (BEGIN/COMMIT/ROLLBACK), `RETURNING` do id de `conta_recebida`, validar `statusconta <> 'REC'` (idempotência), título existente, valor compatível; falha na baixa não pode desfazer o `pago` do boleto no Sistema (registrar erro e permitir retentativa).
- **D-09:** Descrição do livro: `Rec. Titulo <numerotitulo> - Cliente: <nome>`. `cliente.aviso1-3=false` ao fim do lote por cliente. Sem caracteres especiais em textos.

## Canonical refs
- `.planning/phases/43-*/43-REFERENCIA-SQL-ATHOS.md`
- `apps/backend/src/modules/cobranca/cobranca.service.ts`, `cobranca-reconciliation.job.ts`
- `apps/backend/src/modules/integrations/athos/athos.service.ts` (conexão `ATHOS_PG_*`)
- `memory/athos_postgres_9_0_5.md` (PG 9.0.5)
</decisions>

<deferred>
- Auditoria `monitoramento`; baixa parcial; baixa de outras formas de pagamento (PIX/cartão).
</deferred>
