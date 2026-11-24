# Fase 53 — Capturas do PDV Athos (Frida/REA) — insumo da pesquisa

Fonte: hook Frida em `send`/`WSASend` do `D:\Athos2\PDV.exe`, filtrando a porta 5432 (PostgreSQL sem SSL). O PDV usa SOMENTE query simples com valores literais (nenhuma `P`/`B`). Autenticação não capturada. Os `#` são o índice da mensagem na captura.

Legenda: **Observado** = SQL enviado. **Inferido** = significado/regra. **Não observado** = código do PDV (UPX), triggers, funções `precovendaproduto`, `estanapromocao`, `nomecliente`, `cnpj_cpf_cliente`.

REGRA DA FASE: o Athos de produção (PostgreSQL 9.0.5) NUNCA recebe escrita. Escrita de teste só no clone `athos-teste` (127.0.0.1:5440, db `athos`, PG14). Ver `memory/athos_postgres_9_0_5.md`.

## Captura 1 — venda à vista a partir de orçamento + NFC-e

Cenário: orçamento 26707 do dia (produto 60 e produto 28528, 1 un. cada, total R$ 5,20), forma de pagamento 5 (à vista), finalizar com NFC-e, abrir "Busca Venda". 815 mensagens `Q`.

### Fluxo

| # | Fase | Operação | Tabelas |
|---|------|----------|---------|
| 0 | Abertura da tela | `select` total em caixa (polling) | `forma_pagamento_venda`, `forma_pagamento`, `venda`, `caixa_movimento_suprimento`, `caixa_movimento_saida`, `caixa_movimento_recebimento`, `conta_recebida` |
| 1–6 | Lista de orçamentos do dia | `select o.* ... where o.dataorcamento = current_date` + itens | `orcamento`, `orcamento_item`, `cliente`, `cancelamento_orcamento`, `funcionario`, `produto` |
| 4–5 | Permissões | `acesso_usuario` por funcionário, tela e botão | `acesso_usuario` |
| 10–18 | Validação de produto | `statusproduto/vendeproduto`, `ncm`, composição | `produto`, `ncm` |
| 12–14 | Caixa/terminal | caixa aberto (`status='ABE'`), último troco, `numerotransacaotef` | `caixa_movimento`, `venda`, `terminal` |
| 30–48 | Configuração | `terminal`, `conf_restaurante`, `conf_financeiro`, `conf_vendas`, `conf_nfce` | idem |
| 37 | Formas de pagamento | formas ativas (`tipodeforma in (1,3,4)` ou `(0,2)` com condição ativa) | `forma_pagamento`, `conta_corrente`, `condicao_pagamento` |
| 39 | Pagamentos do orçamento | `orcamento_forma_pagamento` | idem |
| 41–42 | Desconto máximo | cliente e funcionário, fallback `conf_vendas.permitedescontode` | `cliente`, `funcionario`, `conf_vendas` |
| 43–50 | Telemetria | `insert`/`update` em `monitoramento` | `monitoramento` |
| 53 | Cria a venda | `insert into venda` | `venda` |
| 54 | Lê o ID | `select idvenda ... where idterminal = 3 order by idvenda desc limit 1` | `venda` |
| 55–56 | Itens | um `insert into venda_item` por item | `venda_item` |
| 57 | Pagamento | `insert into forma_pagamento_venda` | `forma_pagamento_venda` |
| 58–62 | Classifica pagamento | lê `tipodeforma`, `tipodyndo`, `tipopix`, parcelas | `forma_pagamento_venda`, `forma_pagamento`, `condicao_pagamento` |
| 63 | Recebimento de cartão | `insert into recebimento_cartao` (status `AVC`) | `recebimento_cartao` |
| 64–71 | Baixa de estoque por item | `update produto set estoqueloja = <valor ABSOLUTO calculado no cliente>`, `dataultimavenda = current_date` | `produto` |
| 72 | Marca orçamento | `update orcamento set statusorcamento = true` | `orcamento` |
| 73 | Vincula | `insert into relacao_orcamento_venda` | `relacao_orcamento_venda` |
| 74–79 | NFC-e | `update venda set sfSAT = NULL, sfNFCe = 1`; tributos aproximados em `venda.obs` | `venda` |
| 80–790 | Aguarda NFC-e | 711x `select sfnfce, xml, sfretorno, xmlcan, sfretornocan, sfretornocomplementar from venda where idvenda = X` | `venda` |
| 792 | XML final | `select xml from venda` | `venda` |
| 793 | Atualiza orçamento (LACUNA) | `update orcamento set statusorcamento = true where idorcamento in (<OUTRO id: 110540769>)` | `orcamento` |
| 794–814 | Pós-venda | troco, TEF, `monitoramento`, "Busca Venda" | várias |

Sem `BEGIN`/`COMMIT`: cada comando é auto-commit (falha no meio deixa venda parcial).

### Escritas (modelo)

`venda` (#53):

```sql
insert into venda(descontoRS, idvendedor, idcaixaMovimento, idfuncionariousuario, idorcamento,
  idcliente, idterminal, coo, ccf, data, hora, valor, desconto, troco, numeroordem, cancelada,
  NumeroSerieECF, CRZ, CRO, ValorTotalizadorGeral, obs, observacao, idTransportadora,
  idClienteContato, cpfcnpj, IE, quantidadepessoa, senhapdv, cpfcnpjnomecliente, idcentrodecusto,
  valoracrescimo, transacaodyndo, idMesa, idComanda, idEnderecoCliente, transacaoalbert,
  codigocanalvenda, descricaocanalvenda, deliveryfiscal)
values(0, 3, 291, 3, 26707, NULL, 3, '', '', (select current_date), (select current_time),
  5.2, 0, 0, '', FALSE, '', '', '', 0, '', '', NULL, NULL, '', '', 0,
  (select (senha+1) from senha_pdv limit 1), '', NULL, 0, FALSE, '', '', 0, FALSE,
  1, 'VENDA NO LOCAL', FALSE)
```

Campos: `idvendedor`/`idfuncionariousuario` = usuário logado (3); `idcaixaMovimento` = caixa aberto (291); `idorcamento` = orçamento importado; `idcliente` NULL = não identificado; `idterminal` 3; `data`/`hora` do servidor; `valor` = total final; `senhapdv` = `(select senha+1 from senha_pdv limit 1)` (sequência manual; não vimos o `update senha_pdv`); canal 1 / 'VENDA NO LOCAL'; `coo/ccf/NumeroSerieECF/CRZ/CRO` vazios (só ECF).

`venda_item` (um por item):

```sql
insert into venda_item(idvenda, pesoBruto, pesoLiquido, idproduto, quantidadeitem, valorcustoitem,
  valorvendaitem, cancelada, valorcomissao, AliquotaECF, valordesconto, vendaDesconto,
  vendaValorFinalItem, sequenciaitem, idfuncionariousuario, observacao, aplicacaoOrigem, valortaxa,
  origem, tributacao, csosn, cfop, cest, impostoAproximadoEST, impostoAproximadoMun,
  impostoAproximadoNAC, impostoAproximadoChave, bscanntech, bscanntechcancelado, bscanntechenviado,
  promocaostatus, utilizareducaoicms, desoneradoaliquota, desoneradomotivo, codigobeneficiofiscal,
  depositoloja, atacadostatus1, atacadostatus2)
values(<idvenda>, 0, 0, 60, 1, 0.853, 3.3, FALSE, 0, '18', 0, 0, 3.3, 1, 3, '', '', 0, '0', '',
  '102', '5102', '', 0.594, 0, 0.44385, 'AA45DF', TRUE, FALSE, FALSE, FALSE, FALSE, 0, 0, '',
  FALSE, FALSE, FALSE)
```

Item 2 (produto 28528): custo 0.515, preço 1.9, `sequenciaitem` 2, `AliquotaECF` 'FF'. `csosn/cfop/origem/tributacao` copiados do produto na hora da venda. `valorcustoitem` = `produto.custorealunitario` (inferido); `valorvendaitem` = `precovendaproduto()`. Impostos aproximados via tabela IBPT (chave `AA45DF`), soma em `venda.obs`.

`forma_pagamento_venda` (#57):

```sql
insert into forma_pagamento_venda(idvenda, idformapagamento, valor, valorRecebido, taxajuros,
  valorjurosdia, valorjurosparcela, idcondicaopagamento, tefnumeroautorizacao, tefmaskedpan, transaction_id)
values(37641, 5, 5.2, 5.2, 0, 0, 0, 0, '', '', '')
```

`recebimento_cartao` (#63): forma 5 gerou recebimento de cartão.

```sql
insert into recebimento_cartao(idformapagamentovenda, valorparcelacartao, datavencimento, status, taxacobrada)
values(<idformapagamentovenda>, 5.2, '2026-11-23'::date, 'AVC', 0)
```

Estoque (#64–71): o PDV calcula o novo saldo no cliente e grava VALOR ABSOLUTO (`estoqueloja = 99`), só quando `controlaestoque = true`. Produto 60 ficou com `estoqueloja = -6633` (estoque negativo permitido).

Vínculo (#72–73):

```sql
update orcamento set statusorcamento = true where idorcamento in ('26707');
insert into relacao_orcamento_venda(idOrcamento, idVenda) values(26707, 37641);
```

NFC-e (#74–792):

```sql
select utilizacontingencia from conf_nfce;
update venda set sfSAT = NULL, sfNFCe = 1 where idVenda = 37641 and idTerminal = 3;
update venda set obs = 'Trib aprox R$:0,87 Federal, 0,94 Estadual e 0,00 Municipal Fonte:IBPT [AA45DF] ' where idVenda = 37641;
```

`sfNFCe = 1` = pendente de NFC-e. O PDV NÃO transmite a nota pelo banco: outro processo (ACBr/emissor) lê, emite e grava `xml/sfretorno/sfnfce`; o PDV só faz polling.

### Leituras úteis

- Total em caixa: vendas em dinheiro (`tipodeForma=1`, não canceladas) + suprimentos − saídas + recebimentos em dinheiro, por `idcaixamovimento`.
- Caixa aberto: `caixa_movimento where idCaixaMovimento = X and status = 'ABE'`.
- Produto vendável: `produto where idProduto = X and (statusproduto = false or vendeproduto = false)` → se retornar linha, bloqueia.
- Preço: `precovendaproduto(idproduto)`; promoção `estanapromocao(idproduto)`.
- Desconto máximo: `coalesce(cliente.descontomaximo, conf_vendas.permitedescontode)`; idem funcionário.

## Captura 2 — venda com desconto (5%) e cancelamento

Cenário (orçamento 26698, venda 37642): produto 28 × 12 un. a R$ 15,00 e produto 42 × 2 un. a R$ 25,00; desconto total 5%; forma 5; NFC-e; cancelamento na "Busca Venda" com justificativa "erro de lançamento". 129 mensagens `Q`.

### Desconto (#50, #52–53) — rateado nos itens

| Campo | Venda | Item 1 | Item 2 |
|-------|-------|--------|--------|
| bruto | 230,00 | 12 × 15,00 = 180,00 | 2 × 25,00 = 50,00 |
| `venda.desconto` (%) | 5 | | |
| `venda.descontoRS` | 11,5 | | |
| `venda_item.valordesconto` | | 0 | 0 |
| `venda_item.vendaDesconto` (R$) | | 9 | 2,5 |
| `venda_item.vendaValorFinalItem` | | 171 | 47,5 |
| `venda.valor` | 218,5 | | |

`valorvendaitem` = preço unitário SEM desconto; `valordesconto` ficou 0 (inferido: é o desconto do item vindo do orçamento) e o desconto de venda foi para `vendaDesconto`. `forma_pagamento_venda.valor` e `recebimento_cartao.valorparcelacartao` usam o valor final (218,5). Produto 42 com ST: `csosn '500'`, `cfop '5405'`, `cest '1902700'`; produto 28: `'102'`/`'5102'`. O PDV validou `descontomaximo` (cliente/funcionário) mas não gravou aprovação.

### Cancelamento de venda (#87–126)

| # | Operação | SQL (resumo) |
|---|----------|--------------|
| 92 | A prazo? | `forma_pagamento_venda` + `forma_pagamento where tipodeforma = 0 and idvenda = X` |
| 99 | Troca/devolução | `venda_item` + `historico_troca_item` (se tiver, bloqueia) |
| 104 | Log | `insert into log(idFuncionarioUsuario, mensagem, data, hora) values(3, 'Motivo do Cancelamento da venda X=''motivo''', ...)` |
| 105 | Itens a estornar | `venda_item` não cancelados + produto + departamento |
| 106–114 | Estorno de estoque por item | `update produto set dataultimavenda = current_date, estoqueloja = coalesce(estoqueloja,0) + <qtd> where idproduto = P and controlaestoque = True` (RELATIVO) |
| 116 | Cancela a venda | `update venda set cancelada = true, motivocancelamento = '...', idresponsavelcancelamento = <func> where idvenda = X` |
| 117 | Registro | `insert into cancelamento_venda(idvenda, idfuncionario, datacancelamento, motivo, horacancelamento, valor, idfuncionariocancelamento)` |
| 118 | Contas a receber | `update conta_receber set statusconta = 'CAN' where idvenda = X` |
| 119 | Cartão | `update recebimento_cartao set status = 'CAN' where idformapagamentovenda in (...)` |
| 120 | Itens | `update venda_item set cancelada = true where idvenda = X` |
| 121 | Cartão preferencial | `delete from cliente_cartao_preferencial where idvenda = 'X'` |
| 122 | Cheques | `update cheque_recebido set ativo = false where id_venda = 'X'` |
| 123 | Boletos | `update boleto set statusboleto = 'CAN' where idboleto in (select idboleto from conta_receber_boleto where idcontareceber in (select idcontareceber from conta_receber where idvenda = X))` |

Observações: estorno é relativo, a baixa da venda é absoluta (inconsistente). Estoque negativo permitido (produto 28: -1165; produto 42: -91). O cancelamento NÃO tocou em `xmlcan/sfretornocan` no banco além de leituras; hipótese (não confirmada) de que o emissor externo lê `venda.cancelada = true` e transmite o evento — verificar `venda.xmlcan/sfretornocan` da venda 37642. Sem transação (~10 comandos). `#78` (cap. 2): `update orcamento set statusorcamento = true where idorcamento in (5682)` — outro orçamento (mesmo padrão do #793 da cap. 1), sem explicação.

## Lacunas e riscos (pesquisa e discussão da fase)

1. Sem transação no PDV: a versão web deve usar transação única.
2. `idvenda` via `order by idvenda desc limit 1` é inseguro com vários terminais: usar `RETURNING idvenda`.
3. `senha_pdv`: não vimos o `update` correspondente (trigger? fora da captura?).
4. Estoque absoluto calculado no cliente (corrida entre terminais): usar `estoqueloja = estoqueloja - qtd`. Confirmar o -6633 antes de replicar.
5. IDs de orçamento inexplicados (#793 = 110540769; #78 cap. 2 = 5682).
6. NÃO capturado: cliente identificado (CPF na nota), pagamento misto/dinheiro/troco, TEF, PIX, cancelamento de item isolado, sangria/suprimento, abertura/fechamento de caixa, contingência de NFC-e, impressão do cupom, cancelamento da NFC-e (evento SEFAZ), arredondamento do rateio com centavos, desconto no item do orçamento (`orcamento_item.valordesconto`) importado pelo PDV.
7. A emissão da NFC-e fica fora do banco: gravar `sfNFCe = 1` e deixar o emissor do Athos agir, ou emissor próprio.
8. IBPT (`impostoAproximado*`, chave `AA45DF`) depende de tabela local do Athos.
9. O cupom da pesquisa não existe no Athos (só cupom fiscal: `venda.coo`, `venda.cupomcancelado`); hoje o atendente dá baixa em `/cupons` e lança o desconto à mão no Athos/PDV.

## Alternativa mais segura a avaliar

Aplicar o desconto no ORÇAMENTO (`orcamento_item.valordesconto` / `orcamentovalorfinalitem`) antes do PDV importá-lo, deixando o PDV gerar venda, estoque e NFC-e. Falta capturar um orçamento com desconto no item importado e finalizado no PDV.

## Modelo web sugerido (numa transação)

1. Validar caixa aberto e permissões.
2. Por item: validar `produto.statusproduto/vendeproduto`; ler preço, custo e dados fiscais.
3. `insert into venda ... returning idvenda`.
4. `insert into venda_item` por item (copiando dados fiscais do produto).
5. `insert into forma_pagamento_venda` por forma; se cartão, `insert into recebimento_cartao`.
6. `update produto set estoqueloja = estoqueloja - qtd, dataultimavenda = current_date` (se `controlaestoque`).
7. Se veio de orçamento: `update orcamento set statusorcamento = true` e `insert into relacao_orcamento_venda`.
8. `update venda set sfNFCe = 1, obs = <tributos aproximados>` e acompanhar `venda.sfnfce/xml/sfretorno`.
