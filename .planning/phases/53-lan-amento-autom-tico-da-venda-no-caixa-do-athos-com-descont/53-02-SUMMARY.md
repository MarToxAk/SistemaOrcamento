---
phase: 53
plan: 02
status: complete-with-pending-validation
commit: c8e2daf
---

# 53-02 — AthosVendaService

- `lancarVendaDeOrcamento`: transacao unica (BEGIN/COMMIT/ROLLBACK), `SET TRANSACTION READ ONLY` na simulacao, `FOR UPDATE` no orcamento, ordem de escrita da captura (venda RETURNING idvenda, itens, forma_pagamento_venda RETURNING, recebimento_cartao AVC, estoque RELATIVO so com controlaestoque, `dataultimavenda`, orcamento usado, `relacao_orcamento_venda`, `sfnfce = 1`).
- Pre-condicoes: flag `ATHOS_VENDA_AUTOMATICA`, orcamento existente/nao usado/nao cancelado, idempotencia por `relacao_orcamento_venda`, caixa `ABE`, produto vendavel, orcamento sem desconto nos itens, desconto <= `conf_vendas.permitedescontode`, forma 5.
- Trava `AMBIENTE_TESTE_HOST_REAL` em NODE_ENV=test (igual a baixa de contas a receber).
- 21 testes com `pg` simulado; nenhum conectou a banco. `athos-venda.integracao.test.ts` pulado (so roda no clone local com variaveis `ATHOS_TESTE_*`).

## NAO validado (bloqueia ligar em producao)

1. **Esquema real.** As colunas de `venda`/`venda_item` vem da captura do PDV; o dump `.planning/DATABASE_SCHEMA.md` e mais antigo e nao tem, por exemplo, `codigocanalvenda`, `descricaocanalvenda`, `deliveryfiscal`. Rodar o teste de integracao no clone `athos-teste`.
2. **`AliquotaECF`** foi ligada a `produto.icms` por inferencia ('18' e 'FF' nas capturas). Confirmar no clone.
3. **`senha_pdv`**: o INSERT usa `(select senha+1 from senha_pdv limit 1)` como o PDV, mas o servico NAO faz `update senha_pdv`. O teste de integracao imprime antes/depois para descobrir se ha trigger.
4. **IBPT / tributos aproximados**: `impostoAproximado*` ficam 0 e `venda.obs` vazio. A NFC-e pode sair sem a frase "Trib aprox" (exigencia fiscal). Decisao fiscal pendente.
5. **`relacao_orcamento_venda` dispara `notify_n8n()`** (trigger do Athos) e o nosso `AthosListenerService` escuta esse canal. Lancar a venda por aqui aciona o mesmo fluxo de aprovacao/notificacao de quando o PDV fecha a venda.
6. `idcliente` fica NULL (como na captura); cliente identificado/CPF na nota nao foi capturado.
7. `descontomaximo` do cliente/funcionario nao e validado, so o limite global.
