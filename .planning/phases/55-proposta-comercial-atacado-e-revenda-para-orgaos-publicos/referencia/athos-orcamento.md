# Athos — Orçamento no Balcão (SQL capturado)

Origem: captura de rede (pktmon) em 2026-11-09 do `Balcao.exe` (Athos Empresarial) falando com o
PostgreSQL em `100.102.146.44:5432` (Tailscale). Tráfego **sem SSL**.
Usuário na captura: idfuncionariousuario = 3 (JOSE DOS SANTOS JUNIOR), terminal 3 (DESKTOP-2TMH7UM).
Captura: 2264 pacotes, ~1 min. Cenário: orçamento de teste, 2 produtos, pagamento forma 1, impressão.

> ATENÇÃO: SQL observado, não lido do código (Balcao.exe está empacotado com UPX). Cada comando foi
> enviado separadamente, sem BEGIN/COMMIT visível. Ao reproduzir use UMA transação e teste em cópia
> do banco. Ids (idterminal=3, idformapagamento=1, produtos 10 e 60) são desta instalação.
> O fluxo de teste foi curto: **não foi capturado** desconto, cliente, validade, transportadora,
> reabrir orçamento nem converter em venda (ver "Lacunas").

## Tabelas envolvidas
- `orcamento` (cabeçalho), `orcamento_item` (itens), `orcamento_Forma_Pagamento` (pagamento)
- Leitura: `produto`, `produto_marca`, `produto_compatibilidade`, `ncm`, `produto_unidade`,
  `forma_pagamento`, `conta_corrente` (PIX), `condicao_pagamento`, `funcionario`, `terminal`,
  `caixa_movimento`, `venda` (só consultas de caixa/NFC-e pendente)
- Config: `conf_vendas`, `conf_gerais`, `conf_financeiro`, `conf_nfce`
- Auditoria: `monitoramento` (telas "Finalização de Pagamento" e "Confirmação de Pagamento")
- Função de preço: `precovendaproduto(idproduto)`; promoção: `estanapromocao(idproduto)`

## Ordem observada
1. **Abertura/ociosidade**: polling de `caixa_movimento` (status 'ABE'), `funcionario`, e
   `select ... from venda where sfnfce = 6` (alerta de NFC-e pendente).
2. **Pesquisa de produto** (a cada tecla, `like '10%'` / `like '60'`): lista com preço e custo.
```sql
select false as compativel, false as variante, pm.nome as marca, p.idproduto, p.descricaoproduto,
  estanapromocao(p.idproduto), p.codigobarra1, p.referencia, p.tipoproduto, p.estoqueloja,
  p.estoquedeposito, p.utilizaplanofaixaetaria, p.margemvenda1, p.dataultimaalteracao,
  precovendaproduto(p.idproduto) as valorvenda1,
  case when p.quantidadecaixa > 0
    then (p.valorcustocaixa / p.quantidadecaixa) + ((p.valorcustocaixa / p.quantidadecaixa) * (p.imposto + p.ipi + p.frete + p.outroimposto) / 100)
    else p.valorcustocaixa + (p.valorcustocaixa * (p.imposto + p.ipi + p.frete + p.outroimposto) / 100)
  end as valorcustounitario
from produto p left join produto_marca pm on (p.idmarca = pm.idmarca)
where statusproduto = true and (coalesce(vendeproduto, true) = true)
  and cast(p.idproduto as varchar(1000)) like '10%'
order by descricaoProduto;
```
3. **Seleção do produto** (ao escolher o item), consultas por idproduto:
   dados completos (`pm.nome, referencia, pesos, cst, custorealunitario, precovendaproduto, sigla,
   icms, estoque*, usacontroleserie, valorvenda1..6, cfopsat, cest, codigocsosn, controlaestoque...`),
   `permitefracionar`, `coalesce(descontomaximo,0)`, NCM vigente
   (`produto p join ncm n on p.NCM = n.idNCM ... dataVigenciaFinal`), `imagemproduto`,
   `informacaoAdicional, localProduto`, `produto_compatibilidade`.
4. **Pagamento**: `select bloqueiavendaprazo from conf_financeiro`; lista de formas:
```sql
select f.*, cc.chave_pix, cc.texto_pix, cc.account_id,
  (select coalesce(avg(taxajurosrecebimentocartao),0) from condicao_pagamento where idformapagamento = f.idformapagamento) as taxa
from forma_pagamento f left join conta_corrente cc on (cc.idcontacorrente = f.idcontacorrente)
where (f.tipodeforma in (1,3,4) and f.status = true
   or f.tipodeforma in (0,2) and f.status = true
      and f.idformapagamento in (select idformapagamento from condicao_pagamento where status = true))
  and f.utilizacartaopreferencial = false and f.tipodeforma <> 3;
```
   Auditoria de tela:
```sql
insert into monitoramento(tela, horaentrada, dataentrada, nomeUsuario, nomePC, acao)
values('Finalização de Pagamento', '1899-12-30 10:00:59'::timestamp, '2026-11-09'::date, '<usuario>', '<pc>', '');
-- idem 'Confirmação de Pagamento'; ao sair:
update monitoramento set dataSaida = current_date, horaSaida = '1899-12-30 <hh:mm:ss>'::timestamp
where tela = '...' and nomeUsuario = '<usuario>' and nomePC = '<pc>' and horaSaida isnull and dataSaida isNull;
```
   (A hora é gravada com data fictícia `1899-12-30`, padrão Clarion.)

## Gravação do orçamento (momento "Confirmar")
```sql
select coalesce(pedirTransportadora, false) from conf_vendas;

insert into orcamento(descontoRS, idvendedor, idcliente, idfuncionariousuario, idterminal,
  dataOrcamento, hora, validadeOrcamento, valor, desconto, statusOrcamento, obs, idTransportadora,
  dataentrega, idEnderecoCliente, valoracrescimo)
values (0, 3, NULL, 3, 3, '2026-11-09'::date, '10:01:01'::time, NULL, 6.3, 0, NULL, '', NULL, NULL, 0, 0);

select idorcamento from orcamento where idterminal = 3 order by idorcamento desc limit 1;  -- id gerado: 25862
```
> O id é recuperado por "último do terminal", não por `RETURNING`/`currval`. Na web use `RETURNING idorcamento`.

Comissão (lida antes dos itens): `select comissaopercentualfixoouporprod from conf_vendas`;
`select comissao from funcionario where idfuncionario = 3`.

Itens (um `insert` por item; `sequenciaitem` começa em 1, o do teste pulou o 2 — item removido/reordenado na tela):
```sql
insert into orcamento_item(idorcamento, sequenciaitem, idproduto, quantidadeitem, valoritem,
  valordesconto, valorcustoitem, valorcomissao, codigoVariante, comprimento, pesoLiquido, pesobruto,
  observacao, depositoloja, orcamentoDesconto, orcamentovalorfinalitem)
values (25862, 1, 10, 1, 2,   0, 0.033, 0, '', 0, 0, 0, '', FALSE, 0, 2);
values (25862, 3, 60, 1, 3.3, 0, 0.853, 0, '', 0, 0, 0, '', FALSE, 0, 3.3);
```
Observado: `valoritem` = preço unitário de venda (`precovendaproduto`), `valorcustoitem` = custo unitário,
`orcamentovalorfinalitem` = valoritem − desconto do item (aqui sem desconto). Total do cabeçalho
`valor` = 2 + 3.3 + 1 (item de seq 2?) = **6.3**, ou seja, **há 1,00 não explicado** — provável item
de seq 2 inserido/removido. Verificar na próxima captura.

Pagamento (apaga e reinsere):
```sql
delete from orcamento_Forma_Pagamento where idOrcamento = 25862;
insert into orcamento_Forma_Pagamento(idorcamento, idformapagamento, valor, valorRecebido, idcondicaopagamento)
values (25862, 1, 6.3, 6.3, 0);
```

## Pós-gravação (impressão)
- Config: `conf_nfce.utilizacontingencia`, `conf_vendas` (`imprimecodigoproduto`,
  `imprimirreferencianadescricao`, `imprimeitensnocupomnaofiscalem2`, `imprimirmarcanadescricao`,
  `obsImprimirOBS`, `imprimirvaloresabaixodescricao`, `QuantViasCupomAVista`), `conf_gerais`
  (`imprimelocalizacaonocupomnaofiscal`, `utilizaEntrega`), `conf_financeiro`
  (`saldodevedorimpresso, diassaldodevedor`).
- Reler o orçamento: `select max(idorcamento) from orcamento where idvendedor = '3' and idterminal = 3`;
  `select dataorcamento ...`; `select cast(hora as varchar(8)) from orcamento where idorcamento = 25862`.
- Por item: `pesoBruto/pesoLiquido`, `produto_unidade.sigla`, `localproduto`, `unidadeporcaixa`.
- Marca como impresso: `update orcamento set statusImpressao = true where idOrcamento = 25862;`
- Fecha a tela de pagamento (update de `monitoramento`).

## Lacunas (refazer captura se for necessário para a web)
- **Cliente** (`idcliente` foi NULL), **desconto** (`descontoRS`, `desconto`, `valordesconto`,
  `orcamentoDesconto`), **validade** (`validadeOrcamento`), `obs`, transportadora/entrega.
- **Status** (`statusOrcamento` ficou NULL) e valores possíveis.
- **Reabrir** e **editar** um orçamento; **converter em venda**; **cancelar/excluir**.
- Transação: nada de BEGIN/COMMIT observado.

## Captura 2 — REA/Frida (2026-11-27)

Hook Frida em `send`/`WSASend` do `C:\Athos\Balcao.exe` (PID 6876), terminal **4**, PC DESKTOP-0CDD2JQ.
284 mensagens `Q`. Cenário: dois orçamentos simples do produto 60, forma de pagamento 1, com impressão.

| Orçamento | Item | `valoritem` | `valorcustoitem` | Total |
|-----------|------|-------------|------------------|-------|
| 26940 (#126–152) | prod. 60 × 1 | 3.3 | 1 | 3.3 |
| 26942 (#236–262) | prod. 60 × 1 | **3.2** | 1 | 3.2 |

Confirma o fluxo da captura 1, sem nada novo de cliente/desconto/validade:
```sql
select coalesce(pedirTransportadora, false) from conf_vendas;
insert into orcamento(...) values(0, 3, NULL, 3, 4, '2026-11-27'::date, '10:07:04'::time, NULL, 3.3, 0, NULL, '', NULL, NULL, 0, 0);
select idorcamento from orcamento where idterminal = 4 order by idorcamento desc limit 1;
insert into orcamento_item(...) values (26940, 1, 60, 1, 3.3, 0, 1, 0, '', 0, 0, 0, '', FALSE, 0, 3.3);
delete from orcamento_Forma_Pagamento where idOrcamento = 26940;
insert into orcamento_Forma_Pagamento(...) values(26940, 1, 3.3, 3.3, 0);
-- impressão: select max(idorcamento) ... where idvendedor = '3' and idterminal = 4; dataorcamento; hora
update orcamento set statusImpressao = true where idOrcamento = 26940;
```

Novidades:
1. **Preço alterado na linha não vira desconto**: no 2º orçamento o preço de 3,30 foi para 3,20 e
   gravou `valoritem = 3.2` com `valordesconto = 0` e `orcamentoDesconto = 0`. Não sobra registro do
   preço original. Antes de aceitar, o Balcão leu `permitefracionar` e `coalesce(descontomaximo,0)` do produto (#196–197).
2. **IDs não sequenciais por terminal**: 26940 e 26942 — o 26941 foi criado por outro terminal entre
   os dois. Confirma o risco de `order by idorcamento desc limit 1` por terminal (funciona só porque filtra
   `idterminal`; dois usuários no mesmo terminal colidiriam).
3. `valorcustoitem = 1` para o produto 60 (na captura 1 era 0.853): o custo é lido do cadastro na hora.
4. Entre orçamentos o Balcão faz polling do total em caixa (`forma_pagamento_venda` + suprimento/saída/recebimento)
   e checa `caixa_movimento` 291 `status = 'ABE'`.

Continuam pendentes: cliente, desconto (campos), validade, obs, reabrir/editar, cancelar, converter em venda.

## Sugestão de modelo para a web
`orcamento` (1) → `orcamento_item` (N, `sequenciaitem`) e `orcamento_Forma_Pagamento` (N).
Criar em uma transação: insert cabeçalho `RETURNING idorcamento` → insert itens → delete+insert
pagamentos. Calcular preço via `precovendaproduto(idproduto)` e custo como em `valorcustounitario`.
