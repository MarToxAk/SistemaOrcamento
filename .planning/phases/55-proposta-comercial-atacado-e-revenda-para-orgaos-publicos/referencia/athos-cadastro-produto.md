# Athos — Cadastro de Produto (Retaguarda, SQL capturado)

Fonte: hook Frida (REA) em `send`/`WSASend` do `C:\Athos\Athos.exe` (PID 10120, ia32), filtrando a porta
5432 (PostgreSQL, sem SSL), em 2026-11-27. 196 mensagens `Q` (query simples); nenhuma `P`/`B`.
Usuário: idfuncionariousuario = 3, PC DESKTOP-0CDD2JQ. Os números entre `#` são o índice da mensagem.

Cenário: abrir "Cadastro de Produtos", consultar produtos existentes (20960, 29394), criar um produto
novo ("LAPIS COR 12 KIT ONDA TESTE", gerou **idproduto 29806**) e gravar.

> Observado: SQL enviado. Inferido: significado de campos. Não observado: código (Clarion/UPX), triggers
> no servidor. Ids (fornecedor 2490, unidade 9, depósito 1) são desta instalação.

## 1. Fluxo em ordem

| # | Fase | Operação |
|---|------|----------|
| 16–43 | Abre a tela | contagens (`produto_setor`, `produto`), configs (`conf_vendas`, `conf_gerais`, `conf_nfe.csosn`, `conf_grade.utilizagrade`, `conf_gerais.utilizavariante`), listas de apoio: `produto_unidade`, `deposito_loja`, `produto_marca`, `produto_setor`, `produto_grupo`, `produto_subgrupo`, `produto_linha`, `produto_cardapio_categoria`, fornecedores (`fornecedor_fisico` ∪ `fornecedor_juridico`), `produto_departamento` ativos, `funcionario`, `produto_genero`, `cst_beneficio_fiscal` (UF SP), `produto_receita`, tabelas da reforma tributária (`cst_ibscbs`, `ibscbs_cclasstrib`, `nbs`, `nbs_indop`, `nbs_cclasstrib`, `nbs_beneficio`) |
| 46 | Permissões | `select upper(botao), status from acesso_usuario where trim(upper(tela)) = upper('produto') and idfuncionariousuario = 3` |
| 50 | Telemetria | `insert into monitoramento(... 'Cadastro de Produtos' ...)` |
| 53–58, 108–136 | Pesquisa de produto | tela "Pesquisa de Produto" (lista `limit 20`, ver §4) |
| 120, 137–145 | Carrega um produto | `select * from produto where idproduto = X` + tabelas filhas (ver §3) |
| 165 | Valida duplicidade | `select * from produto where descricaoProduto = '<descrição>'` |
| 166–171 | Valida fiscal | `ncm` (`idncm`), `csosn` (`codigocsosn`), `cfop` (`idcfop`) |
| 172 | **Gera o ID** | `SELECT nextval('produto_idproduto_seq'::regclass), false, now(), false` |
| 173 | **Insere** | `INSERT INTO public.produto (217 colunas) VALUES (...)` |
| 182–189 | Regrava filhas | `delete` em todas as tabelas filhas do produto (ver §3) |
| 190–191 | Compostos | `conf_gerais.atualizarcompostotipo`; produtos compostos que usam este produto como item |
| 192 | Marca alterado | `update produto set alterado = true where idproduto = 29806` |

Sem `BEGIN`/`COMMIT`: cada comando vai separado (auto-commit).

## 2. INSERT do produto (#172–173)

Diferente do PDV/Orçamento, o ID **é obtido antes** por `nextval('produto_idproduto_seq')` e enviado
explícito no INSERT (`INSERT INTO public.produto (...)` com todas as 217 colunas, a maioria `NULL`).
O formato parece gerado pelo driver de banco do Clarion, não escrito à mão.

Colunas com valor (as demais foram `NULL`):

| Grupo | Coluna = valor | Observação (inferido) |
|-------|----------------|-----------------------|
| Identificação | `idproduto` 29806, `descricaoproduto` / `descricaocurta` `'LAPIS COR 12 KIT ONDA TESTE'`, `referencia` `'7908363802718'`, `codigobarra1` `''` | o EAN foi para `referencia` neste teste |
| Ligações | `idfornecedor` 2490, `idunidade` 9, `idunidadetrib` 9, `iddeposito` 1, `idusuariocadastro` 3 | marca, departamento, setor, grupo, subgrupo, linha = NULL |
| Status | `statusproduto` TRUE, `controlaestoque` TRUE, `vendeproduto` TRUE, `tipoproduto` TRUE, `permitefracionar` TRUE, `utilizagrade` FALSE | |
| Custo | `valorcustocaixa` 78, `quantidadecaixa` 5, `valorcustounitario` 15.6, `custorealcaixa` 78, `custorealunitario` 15.6, `ipi`/`frete`/`imposto`/`outroimposto` 0 | unitário = caixa / quantidade |
| Preço | `valorvenda1` 70.2, `margemvenda1` 350, `precousado` 0, `margemliquidavenda1` 0.78 | **margem é markup sobre custo**: 15,6 × (1 + 350%) = 70,2; **margem líquida** = (venda − custo) / venda = (70,2 − 15,6) / 70,2 = 0,78 |
| Fiscal NFC-e | `ncm` `'96091000'`, `codigocsosn` `'102'`, `tributacao` `'00'`, `origem` 2, `icms` `'18,0'`, `idcfopsaida` `'5102'`, `cfopsat` `'5102'` | `icms` é **texto com vírgula** |
| Fiscal NF-e | `icmsnfe` `'18,0'`, `origemnfe` 2, `codigocsosnnfe` `'102'`, `tributacaonfe` `'00'` | cópia dos campos NFC-e |
| Reforma (IBS/CBS) | `ibsaliquota`, `cbsaliquota`, `porcreducaoibs`, `porcreducaocbs`, `nfseibsaliquota`, `nfsecbsaliquota` = 0; `utilizareducaoibscbs` FALSE | `cstibscbs`/`cclasstribibscbs` NULL |
| Atacado | `atacadostatus1/2` FALSE, valores/margens/comissões 0, `inicioatacado1/2` e `terminoatacado1/2` `'2026-02-03'` | data fixa estranha (default antigo da tela?) |
| Comissões | `comissaovenda`, `comissaovenda2..6` = 0 | |
| Datas | `datacadastro` e `dataultimaalteracao` `'2026-11-27'`, `horaultimaalteracao` `'09:52:05'`, `ultimaalteracao` `'2026-11-27 09:57:01'` | hora de abertura do formulário × hora da gravação |
| Outros | `valorst` 0, `vbcstret` 0, `margemperda` 0, `st_modalidade`/`modalidade` 0, `percentualglp*` 0, `sincronizado` FALSE, `usacomandaautomatica` FALSE, `utilizafcp` FALSE, `utilizalocalizacao` FALSE, `utilizainformacaofisco` FALSE, `enviaremailvendaprazo` FALSE, `utilizareducaoicms` FALSE | |

**Estoque**: `estoqueloja`, `estoquedeposito`, `estoqueentregar` ficaram **NULL** no cadastro (não há estoque inicial no INSERT).

Mapa completo coluna=valor (217 colunas): `athos-produto-insert-map.txt`.

## 2b. Edição do produto (UPDATE) — captura 2

Cenário: reabrir o produto 29806, preencher preços 2 e 3 e trocar o "preço usado" algumas vezes,
gravando a cada troca (4 gravações, #211–327).

Sequência de cada gravação:
```sql
select idncm from ncm where idncm = '96091000';          -- valida NCM
select codigocsosn from csosn where codigocsosn = '102';  -- valida CSOSN (2x)
select idcfop from cfop where idcfop = '5102';            -- valida CFOP (2x)
select descricaoproduto from produto where idproduto = 29806;
UPDATE public.produto SET <só as colunas alteradas> WHERE idproduto = 29806;
-- depois: delete das 7 tabelas filhas (como no cadastro, §3), checagem de compostos
update produto set alterado = true where idproduto = 29806;  -- só na 1ª gravação (já estava true nas outras)
```

UPDATEs observados:
```sql
-- #217 (preencheu preço 2 e 3 e escolheu o preço 2)
UPDATE public.produto SET idusuarioalteracao=3, valorvenda2=21.06, margemvenda2=35,
  valorvenda3=22.62, margemvenda3=45, precousado=2, horaultimaalteracao='09:53:24'::time,
  margemliquidavenda2=0.26, margemliquidavenda3=0.31 WHERE idproduto=29806
-- #249, #280, #311
UPDATE public.produto SET precousado=0, horaultimaalteracao='09:53:29'::time WHERE idproduto=29806
UPDATE public.produto SET precousado=3, horaultimaalteracao='09:53:35'::time WHERE idproduto=29806
UPDATE public.produto SET precousado=0, horaultimaalteracao='09:53:47'::time WHERE idproduto=29806
```

Observações:
1. **UPDATE só com os campos que mudaram** (o driver compara o registro lido com o editado). Não
   reenvia os 217 campos. `idusuarioalteracao` só foi no primeiro UPDATE porque depois já era 3.
2. `horaultimaalteracao` muda sempre; `dataultimaalteracao` não foi reenviada (mesmo dia, valor igual).
3. Mesmas regras de preço: `valorvendaN = custo × (1 + margemvendaN/100)` (15,6 × 1,35 = 21,06;
   15,6 × 1,45 = 22,62) e `margemliquidavendaN = (valorvendaN − custo) / valorvendaN` (0,26; 0,31).
4. `precousado` escolhe qual preço vale na venda (0 = preço 1; 2..6 = preço N), usado pela pesquisa
   (§4) e provavelmente por `precovendaproduto()`.
5. Mesmo sem mexer nos filhos, toda gravação **apaga as 7 tabelas filhas** e reinsere o que houver na tela.
6. Sem `BEGIN`/`COMMIT`, sem `log` gravado para alteração de preço.

### Captura 3 — preço digitado e NCM inválido (#335–370)

```sql
select idncm from ncm where idncm = '96091001';   -- 2x: NCM digitado não existe → tela recusou
select idncm from ncm where idncm = '96091000';   -- voltou ao NCM válido
...
UPDATE public.produto SET valorvenda1=78, margemvenda1=400, valorvenda2=22, margemvenda2=41.03,
  valorvenda3=27, margemvenda3=73.08, horaultimaalteracao='09:56:04'::time,
  margemliquidavenda1=0.8, margemliquidavenda2=0.29, margemliquidavenda3=0.42 WHERE idproduto=29806
-- deletes das filhas, checagem de compostos
update produto set alterado = true where idproduto = 29806;
update monitoramento set dataSaida = ..., horaSaida = ... where tela = 'Cadastro de Produtos' ...;  -- fechou a tela
```

- Quando o **preço é digitado**, a margem é recalculada ao contrário, com 2 casas:
  `margemvendaN = (valorvendaN / custo − 1) × 100` → 78/15,6 = 400; 22/15,6 → 41,03; 27/15,6 → 73,08.
- NCM é validado só por existência em `ncm.idncm`; não há gravação quando inválido.
- `alterado = true` voltou a ser enviado nesta gravação, mas não nas gravações 2–4 da captura anterior.
  Hipótese: algum serviço (sincronização de PDV/balança) zera `alterado` depois de ler o produto, e o
  Athos só reenvia quando o valor lido estava `false`. **Não confirmado**: conferir `select alterado from produto where idproduto = 29806`.
- Custo, descrição, marca/grupo/setor, código de barras, composto e inativação **não apareceram** nesta
  captura (nenhum UPDATE com essas colunas).

## 2c. Exclusão do produto — captura 4

Cenário: abrir o produto 29806 no Cadastro de Produtos e excluir (#57–63). 74 mensagens no total.

```sql
select upper(botao) as botao, status from acesso_usuario
 where trim(upper(tela)) = upper('produto') and idfuncionariousuario = 3;      -- permissão
delete from referencia_fornecedor_produto where idProduto = 29806;             -- antes de checar!
select distinct on (idcliente) idcliente, idproduto, (<nome de cliente_fisico ∪ cliente_juridico>)
  from cliente_planos_contratados cpc where idProduto = 29806;                  -- produto em plano contratado?
select distinct on (idcliente) ... from cliente_planos_dependentes cpc where idProduto = 29806;
DELETE FROM public.produto WHERE idproduto=29806;
```

Observações:
1. **Exclusão física** (`DELETE`), não inativação. Inativar é `statusproduto = false` (não capturado).
2. A única tabela filha apagada explicitamente foi `referencia_fornecedor_produto`, **antes** das
   checagens de plano. Se a checagem bloquear, essa referência já foi perdida (sem transação).
3. As consultas a `cliente_planos_contratados` / `cliente_planos_dependentes` parecem ser o bloqueio
   ("produto usado em plano de cliente"); aqui vieram vazias e o DELETE seguiu.
4. **Não** apagou explicitamente `produto_composto`, `produto_compatibilidade`, `produto_numero_serie`
   etc., nem checou vendas/orçamentos/estoque. Ou existem FKs com `ON DELETE CASCADE`/`RESTRICT` no
   banco, ou ficam órfãos. Conferir: `select conrelid::regclass, confdeltype from pg_constraint where confrelid = 'produto'::regclass;`
   (`a` = no action, `r` = restrict, `c` = cascade). Produto com venda provavelmente falha no DELETE por FK.
5. Nenhum `insert into log` para a exclusão.
6. **O código apagado não é reutilizado.** O id vem de `nextval('produto_idproduto_seq')` (§2), e a
   sequência do PostgreSQL só avança: um DELETE não devolve o número. Também "queimam" números os
   `nextval` de cadastros cancelados depois do id gerado. É o comportamento esperado — evita que um
   código antigo (em vendas, notas, etiquetas, balanças) passe a apontar para outro produto.
   Próximo código: `select last_value, is_called from produto_idproduto_seq;`

Modelo web: validar planos de clientes e vínculo com vendas/orçamentos/notas antes; preferir inativar
(`statusproduto = false`) a excluir; se excluir, fazer tudo numa transação.

## 3. Tabelas filhas do produto

Ao carregar (#137–145) e ao gravar (#182–189), o Athos trata estas tabelas. Na gravação ele
**apaga tudo e reinsere** (neste teste não havia filhos, então só houve `delete`):

| Tabela | Chave | Conteúdo |
|--------|-------|----------|
| `produto_numero_serie` | `idproduto` | números de série |
| `produto_composto` | `idprodutomaster` (item: `idprodutodetail`) | kit / produto composto |
| `produto_produto_caracteristica` | `idproduto` → `produto_caracteristica` | características |
| `produto_produto_localizacao` | `idproduto` → `produto_localizacao` | localização |
| `informacao_fisco_produto` | `idproduto` → `informacao_fisco` | informações ao fisco |
| `produto_faixaetaria` | `idproduto` | plano faixa etária |
| `produto_compatibilidade` | `idproduto` (`marca, modelo, periodoinicial, periodofinal`) | aplicação/compatibilidade |
| `produto_compativel` | `idProdutoMaster` → `idProdutoDetail` | produtos compatíveis (só leitura aqui) |

Depois verifica se o produto é item de algum composto (`produto_composto where idProdutoDetail = X`)
para recalcular o custo do composto, conforme `conf_gerais.atualizarcompostotipo`.

## 4. Consultas de leitura úteis

- **Pesquisa de produto** (#54): `produto` + `produto_marca` + `deposito_loja`, `where coalesce(statusproduto,true) = true limit 20`. Preço exibido pelo `precousado` (0/1 → `valorvenda1`, 2..6 → `valorvendaN`); custo unitário com impostos igual ao do Balcão.
- **Validações antes de gravar**: descrição duplicada (`select * from produto where descricaoProduto = ...`), NCM em `ncm.idncm`, CSOSN em `csosn.codigocsosn`, CFOP em `cfop.idcfop`.
- **Benefício fiscal**: `cst_beneficio_fiscal where uf = 'SP' and '<cst>' = any(cst)`; natureza da receita SPED: `sped_naturezareceita where position('<cst pis/cofins>' in cst) > 0`.

## 5. Modelo web sugerido (numa transação)

1. Validar NCM, CSOSN, CFOP e descrição duplicada.
2. `insert into produto (...) values (...) returning idproduto` (ou `nextval` antes, como o Athos).
   Preencher pelo menos: descrição, descrição curta, unidade (`idunidade` e `idunidadetrib`), depósito,
   custo (caixa, quantidade, unitário, real), `valorvenda1`/`margemvenda1`, `precousado = 0`,
   `statusproduto`/`vendeproduto`/`controlaestoque`, `ncm`, `codigocsosn`, `tributacao`, `origem`,
   `icms` (texto `'18,0'`), `idcfopsaida`, `cfopsat`, os campos `*nfe` espelhados, datas e `idusuariocadastro`.
3. Inserir as tabelas filhas necessárias (composto, compatibilidade etc.).
4. `update produto set alterado = true` (provável flag para sincronizar balanças/PDVs; não confirmado).
5. Edição: `update produto set <campos alterados>, idusuarioalteracao = <usuário>,
   dataultimaalteracao = current_date, horaultimaalteracao = current_time, alterado = true where idproduto = X`,
   recalculando `margemliquidavendaN` sempre que preço ou custo mudar.

## 6. Lacunas

- Edição de custo, descrição, CSOSN/CFOP (só preços, margens, `precousado` e tentativa de NCM foram capturados).
- Estoque inicial, marca/grupo/setor preenchidos, código de barras em `codigobarra1`, produto composto,
  grade/variante, inativação (exclusão foi capturada, §2c).
- Significado de `alterado`, `sincronizado`, `tipoproduto` (boolean) e das datas fixas `2026-02-03` do atacado.
