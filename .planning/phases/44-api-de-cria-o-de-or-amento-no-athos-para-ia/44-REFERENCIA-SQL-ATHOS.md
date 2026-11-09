# Fase 44 — Referência SQL: Orçamento no Balcão do Athos

Fonte primária: captura pktmon do `Balcao.exe` (2026-11-09, fornecida pelo usuário — texto integral
preservado na seção "Captura original" abaixo). Complementada por introspecção no **clone** `athos-teste`.

## Ambiente de teste (OBRIGATÓRIO)

- Clone: container Docker `athos-teste`, `127.0.0.1:5440`, db `athos`, user `postgres` / senha `athosteste`
  (PostgreSQL 14 restaurado de `pg_dump` read-only feito em 2026-11-09 — 331 tabelas, 25.833 orçamentos, max id 25865).
- **NUNCA** executar escrita contra o Athos original (`ATHOS_PG_HOST=192.168.33.198`, mesmo servidor de
  `100.102.146.44` via Tailscale). Atenção: o usuário `usuario_leitura` TEM `INSERT` em `orcamento` — o
  "read-only" não protege; a proteção tem que ser de processo/config.
- Produção roda **PostgreSQL 9.0.5**: o clone é PG14, então o SQL do código deve ser compatível com 9.0
  (sem `ON CONFLICT`, sem `FILTER`, sem `jsonb`, sem `GENERATED`; `RETURNING` OK).

## Achados da introspecção no clone (resolvem lacunas da captura)

### Schema
- `orcamento`: PK `idorcamento` serial (`orcamento_idorcamento_seq`); `senhabalcao` NOT NULL default
  `nextval('orcamento_senhabalcao_seq')`; `statusimpressao` default false; `valoracrescimo` default 0.
  FKs: `idcliente → cliente`, `idfuncionariousuario → funcionario_usuario`, `idterminal → terminal`.
  Colunas extras não usadas na captura: `statusmobile`, `cancelado`, `statusromaneio`,
  `idenderecodestinatario`, `idclientedestinatario`, `observacaoentrega`.
- `orcamento_item`: PK `iditemorcamento` serial; FKs `idorcamento → orcamento`, `idproduto → produto`;
  `orcamentodesconto` e `orcamentovalorfinalitem` default 0; também `quantidadeentrega`, `quantidadeentregue`.
- `orcamento_forma_pagamento`: PK `idformapagamentoorcamento` serial; `idformapagamento` e `idorcamento` NOT NULL.
- Nenhum trigger de usuário nas 3 tabelas.

### Semântica
- **`statusorcamento`**: `NULL` = aberto (3.712), `t` = convertido em venda (22.112; 20.792 têm
  `relacao_orcamento_venda`), `f` = 9 casos. → Orçamento criado pela API deve ficar `NULL`.
- **R$ 1,00 "não explicado" da captura RESOLVIDO**: o orçamento 25862 tem item `sequenciaitem=2`,
  produto 52, R$ 1,00 — o insert não apareceu no pktmon. Total 2 + 1 + 3,3 = 6,3 ✔.
- **`orcamentovalorfinalitem` = total da LINHA** (`quantidadeitem × valoritem − orcamentodesconto`),
  não unitário. Ex.: 6 × 8,39 = 50,34 − 0,01 = 50,33.
- **`orcamento.valor` = total bruto** (soma qtd×valoritem, antes do desconto). Desconto do cabeçalho:
  `descontors` (R$) e `desconto` (%) — ex. 25483: valor 177,04, descontors 0,04, desconto 0,023%;
  o desconto em R$ é rateado por item em `orcamentodesconto`. `valordesconto` do item = 0 nos exemplos.
- `validadeorcamento` nunca é preenchido (0 casos); `idcliente` preenchido em 2.339 orçamentos.

### Função de preço
`precovendaproduto(idproduto)` (plpgsql, retorna domínio `monetario`): escolhe `valorvenda1..6` por
`p.precousado`, ou `valorvendapromocao` se `promocaostatus` e data dentro de `iniciopromocao..terminopromocao`.

## Captura original (Balcao.exe)

Origem: captura de rede (pktmon) em 2026-11-09 do `Balcao.exe` (Athos Empresarial) falando com o
PostgreSQL em `100.102.146.44:5432` (Tailscale). Tráfego **sem SSL**.
Usuário na captura: idfuncionariousuario = 3, terminal 3.
Cenário: orçamento de teste, 2 produtos (na verdade 3 — ver achado acima), pagamento forma 1, impressão.

> SQL observado, não lido do código. Cada comando enviado separadamente, sem BEGIN/COMMIT. Ao reproduzir
> use UMA transação. Ids (idterminal=3, idformapagamento=1, produtos 10 e 60) são desta instalação.
> Não capturado: desconto, cliente, validade, transportadora, reabrir, converter em venda.

### Tabelas
- `orcamento` (cabeçalho), `orcamento_item` (itens), `orcamento_Forma_Pagamento` (pagamento)
- Leitura: `produto`, `produto_marca`, `produto_compatibilidade`, `ncm`, `produto_unidade`,
  `forma_pagamento`, `conta_corrente` (PIX), `condicao_pagamento`, `funcionario`, `terminal`,
  `caixa_movimento`, `venda`
- Config: `conf_vendas`, `conf_gerais`, `conf_financeiro`, `conf_nfce`
- Auditoria: `monitoramento`
- Funções: `precovendaproduto(idproduto)`, `estanapromocao(idproduto)`

### Pesquisa de produto
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
Na seleção: `permitefracionar`, `coalesce(descontomaximo,0)`, NCM vigente, estoque etc.

### Formas de pagamento
```sql
select bloqueiavendaprazo from conf_financeiro;
select f.*, cc.chave_pix, cc.texto_pix, cc.account_id,
  (select coalesce(avg(taxajurosrecebimentocartao),0) from condicao_pagamento where idformapagamento = f.idformapagamento) as taxa
from forma_pagamento f left join conta_corrente cc on (cc.idcontacorrente = f.idcontacorrente)
where (f.tipodeforma in (1,3,4) and f.status = true
   or f.tipodeforma in (0,2) and f.status = true
      and f.idformapagamento in (select idformapagamento from condicao_pagamento where status = true))
  and f.utilizacartaopreferencial = false and f.tipodeforma <> 3;
```
Auditoria (`monitoramento`) com hora em `'1899-12-30 hh:mm:ss'::timestamp` (padrão Clarion) — opcional.

### Gravação ("Confirmar")
```sql
select coalesce(pedirTransportadora, false) from conf_vendas;

insert into orcamento(descontoRS, idvendedor, idcliente, idfuncionariousuario, idterminal,
  dataOrcamento, hora, validadeOrcamento, valor, desconto, statusOrcamento, obs, idTransportadora,
  dataentrega, idEnderecoCliente, valoracrescimo)
values (0, 3, NULL, 3, 3, '2026-11-09'::date, '10:01:01'::time, NULL, 6.3, 0, NULL, '', NULL, NULL, 0, 0);

select idorcamento from orcamento where idterminal = 3 order by idorcamento desc limit 1;  -- 25862
-- Na API: usar RETURNING idorcamento.

select comissaopercentualfixoouporprod from conf_vendas;
select comissao from funcionario where idfuncionario = 3;

insert into orcamento_item(idorcamento, sequenciaitem, idproduto, quantidadeitem, valoritem,
  valordesconto, valorcustoitem, valorcomissao, codigoVariante, comprimento, pesoLiquido, pesobruto,
  observacao, depositoloja, orcamentoDesconto, orcamentovalorfinalitem)
values (25862, 1, 10, 1, 2,   0, 0.033, 0, '', 0, 0, 0, '', FALSE, 0, 2);
-- (seq 2: produto 52, R$1,00 — não capturado mas presente no banco)
values (25862, 3, 60, 1, 3.3, 0, 0.853, 0, '', 0, 0, 0, '', FALSE, 0, 3.3);

delete from orcamento_Forma_Pagamento where idOrcamento = 25862;
insert into orcamento_Forma_Pagamento(idorcamento, idformapagamento, valor, valorRecebido, idcondicaopagamento)
values (25862, 1, 6.3, 6.3, 0);
```
`valoritem` = `precovendaproduto`, `valorcustoitem` = custo unitário (fórmula `valorcustounitario`).

### Pós-gravação (impressão no Balcão — fora do escopo da API)
`update orcamento set statusImpressao = true where idOrcamento = 25862;` + leituras de config de cupom.

### Sugestão de modelo
Transação: insert cabeçalho `RETURNING idorcamento` → insert itens → delete+insert pagamentos.
Preço via `precovendaproduto(idproduto)`; custo como `valorcustounitario`.
