# Fase 44 - Roteiro de verificacao manual da API de orcamento para IA no Athos

**Quem executa:** somente o usuario (Diego). Nenhum agente, executor ou verificador automatizado conecta ao Athos real
nem executa qualquer passo deste roteiro (D-03). Voce decide quando cada passo roda e quando a escrita e ligada.

**O que este roteiro prova:** que um orcamento criado pela API do Sistema (`POST /api/athos/orcamentos`) aparece no Balcao do
Athos real exatamente como um orcamento feito na tela, e que o Athos de producao (PostgreSQL 9.0.5, permissoes reais) aceita o
SQL da API. Os testes automatizados usam banco falso e o clone `athos-teste` (PostgreSQL 14); so voce consegue provar o
comportamento contra o Athos real e a tela do Balcao.

**Regras deste roteiro:**

- Todas as consultas SQL abaixo sao SELECT (somente leitura). Nao ha nenhuma instrucao de escrita para rodar direto no banco;
  as permissoes que faltarem sao descritas em prosa e concedidas pelo DBA, fora do Sistema.
- Toda gravacao no Athos acontece pela API do Sistema (chamadas `curl`), e so a partir do Passo 5.
- URL da API: `https://orcamentoapi.bomcustoilhabela.com.br/api/athos/orcamentos` primeiro; se nao responder, use
  `http://localhost:4000/api/athos/orcamentos` (no proprio servidor). Defina antes de comecar, no terminal que voce usar:

```bash
export API="https://orcamentoapi.bomcustoilhabela.com.br/api/athos/orcamentos"
export INTERNAL_API_KEY="<cole aqui a chave interna; nunca salve a chave real neste arquivo>"
```

- Todas as chamadas levam o header `x-internal-api-key: <INTERNAL_API_KEY>` (nos exemplos, `$INTERNAL_API_KEY`).
- O banco do Athos e PostgreSQL 9.0.5: nao use recursos de versoes novas nas suas proprias consultas.
- As consultas SQL rodam com `psql` conectado ao Athos de producao **com o mesmo usuario de `ATHOS_PG_USER`** do Sistema
  (isso e o que prova as permissoes no Passo 1). Nunca use a senha de superusuario para conferir permissoes.
- Use sempre um produto barato e **um unico** orcamento de teste. Um erro na resposta traz `codigo` e `mensagem`: anote os dois.

---

## Passo 0 - Pre-requisitos (nao pule)

1. **Backup.** Com `pg_dump` (leitura), gere um dump das tabelas `orcamento`, `orcamento_item` e `orcamento_forma_pagamento`.
   Guarde o arquivo fora do servidor do Athos e confirme que ele abre (tamanho maior que zero). Sem backup, nao continue:
   o Athos nao tem rollback por comando.
2. **Deploy com a escrita desligada.** No servidor, `ATHOS_ORCAMENTO_ESCRITA=false` (e o padrao em `deploy/stack.env.example`).
   Somente o texto exato `true` liga a escrita; qualquer outro valor mantem o POST respondendo 503 `ESCRITA_DESABILITADA`.
3. **Migration aplicada** no banco do Sistema (`20261109120000_add_athos_orcamento_ia`): o deploy faz `prisma migrate deploy`.
   Ela cria a tabela de auditoria e idempotencia `AthosOrcamentoIa`; nao altera o Athos.
4. **Chave interna em maos:** o valor de `INTERNAL_API_KEY` do backend, para o header `x-internal-api-key`.
5. **Variaveis do Athos ja funcionando** (`ATHOS_PG_HOST`, `ATHOS_PG_DB`, `ATHOS_PG_USER`, `ATHOS_PG_PASS`): as mesmas das outras
   funcoes que leem o Athos.

**O que esperar:** nada gravado. A chamada de teste abaixo deve responder 401 sem a chave e 200 com a chave:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "$API/produtos?q=caneta"
curl -s -o /dev/null -w "%{http_code}\n" -H "x-internal-api-key: $INTERNAL_API_KEY" "$API/produtos?q=caneta"
```

As leituras nao dependem das variaveis de autor nem da escrita ligada, entao a segunda chamada ja deve dar 200. Se der 500
`ERRO_BANCO` ou `PERMISSAO_NEGADA`, anote o `codigo` e pare.

**Como reverter o Passo 0:** nada a reverter; nenhuma gravacao ocorreu. Se algo estiver errado, pare aqui.

---

## Passo 1 - Versao do banco e permissoes

Rode com o usuario de `ATHOS_PG_USER`:

```sql
SELECT version();
```

```sql
SELECT has_table_privilege(current_user, 'orcamento', 'INSERT') AS insert_orcamento,
       has_table_privilege(current_user, 'orcamento_item', 'INSERT') AS insert_orcamento_item,
       has_table_privilege(current_user, 'orcamento_forma_pagamento', 'INSERT') AS insert_orcamento_forma_pagamento,
       has_table_privilege(current_user, 'orcamento_forma_pagamento', 'DELETE') AS delete_orcamento_forma_pagamento,
       has_sequence_privilege(current_user, 'orcamento_idorcamento_seq', 'USAGE') AS seq_idorcamento,
       has_sequence_privilege(current_user, 'orcamento_senhabalcao_seq', 'USAGE') AS seq_senhabalcao,
       has_sequence_privilege(current_user, 'orcamento_item_iditemorcamento_seq', 'USAGE') AS seq_item,
       has_sequence_privilege(current_user, 'orcamento_forma_pagamento_idformapagamentoorcamento_seq', 'USAGE') AS seq_pagamento;
```

**O que esperar:** `version()` comeca com `PostgreSQL 9.0.5`. As oito colunas da segunda consulta devem ser `t` (verdadeiro).
Sabe-se apenas que o usuario de leitura ja tinha permissao de INSERT em `orcamento`; as demais sao uma premissa a confirmar (A1).

**Se alguma coluna for `f`:** o DBA precisa conceder a permissao ao usuario de `ATHOS_PG_USER`, fora do Sistema: INSERT nas tres tabelas
(`orcamento`, `orcamento_item`, `orcamento_forma_pagamento`), DELETE em `orcamento_forma_pagamento` e USAGE nas quatro sequencias
(`orcamento_idorcamento_seq`, `orcamento_senhabalcao_seq`, `orcamento_item_iditemorcamento_seq` e
`orcamento_forma_pagamento_idformapagamentoorcamento_seq`). Depois repita a consulta. Se a versao for diferente de 9.0.5, anote e avise.
O proprio Sistema repete esse texto na mensagem `PERMISSAO_NEGADA` se o POST falhar por falta de permissao.

**Como reverter:** nada foi gravado. Concessoes feitas pelo DBA seguem a rotina dele (o roteiro nao revoga nada).

---

## Passo 2 - Escolher autor, vendedor, terminal e confirmar o PIX

Todos os ids abaixo sao escolhidos por voce (D-04); a IA nunca escolhe. Consulte (nunca consulte a coluna de senha):

```sql
SELECT idfuncionariousuario, usuario FROM funcionario_usuario ORDER BY idfuncionariousuario;

SELECT idfuncionario, nome, idfuncionariousuario, statusfuncionario FROM funcionario
 WHERE statusfuncionario = true ORDER BY nome;

SELECT idterminal, nome, descricaoterminal, balcaogeraorcamento, ativo FROM terminal ORDER BY idterminal;

SELECT idformapagamento, descricao, tipodeforma, status FROM forma_pagamento WHERE idformapagamento = 5;
```

Defina no servidor (por exemplo no `stack.env`) e reinicie o backend **com a escrita ainda desligada**:

- `ATHOS_ORCAMENTO_ID_FUNCIONARIO` = `idfuncionariousuario` do usuario que vai aparecer como autor do orcamento;
- `ATHOS_ORCAMENTO_ID_VENDEDOR` = `idfuncionario` do vendedor;
- `ATHOS_ORCAMENTO_ID_TERMINAL` = `idterminal` onde o orcamento deve aparecer (prefira um terminal com `balcaogeraorcamento` verdadeiro);
- `ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO`: so mude se o PIX desta instalacao **nao** for o id 5 (o padrao e 5).

**O que esperar:** `forma_pagamento` 5 = `PIX`, `status` verdadeiro, `tipodeforma` 4 (o Sistema aceita tipo 1 ou 4). Depois do reinicio,
a simulacao do Passo 4 deixa de responder `CONFIG_INVALIDA`. `CONFIG_INVALIDA` com o nome da variavel significa id inexistente ou ausente.

**Como reverter:** apague as tres variaveis `ATHOS_ORCAMENTO_ID_*` e reinicie. Nada foi gravado no Athos.

---

## Passo 3 - Leituras em producao (provam o SQL no PostgreSQL 9.0.5)

1. Busca de produto (escolha uma palavra de um produto barato que voce conheca; troque `caneta`):

```bash
curl -s -H "x-internal-api-key: $INTERNAL_API_KEY" "$API/produtos?q=caneta&limit=5"
```

2. Anote o `idproduto` de um produto barato com `preco` diferente de `null` e `permiteFracionar` conforme esperado. Compare `preco`,
   `estoqueLoja` e `unidade` com a tela de produtos do Athos. Teste tambem a busca pelo codigo de barras e por um numero de `idproduto`.
3. Consulta de um orcamento **recente feito no Balcao** (use o numero de uma impressao ou da tela de orcamentos):

```bash
curl -s -H "x-internal-api-key: $INTERNAL_API_KEY" "$API/NUMERO_DO_ORCAMENTO"
```

   Compare itens, valores, desconto e forma de pagamento com a tela do Balcao para o mesmo orcamento.
4. Um numero que nao existe deve responder 404 com `codigo` `ORCAMENTO_INEXISTENTE`.

**O que esperar:** resposta 200 com JSON; precos como texto (por exemplo `"68.000"`); nenhum campo de custo na busca; os numeros do orcamento
iguais aos da tela. Isso prova que o SQL de leitura roda no 9.0.5. Erro 500 `ERRO_BANCO` aqui e uma incompatibilidade: anote e pare.

**Como reverter:** nada foi gravado (as leituras rodam numa transacao somente leitura).

---

## Passo 4 - Simular (sem gravar) e confirmar a trava

1. Contagem antes:

```sql
SELECT count(*) AS total, max(idorcamento) AS maior_id FROM orcamento;
```

2. Simulacao (troque `IDPRODUTO` pelo produto barato do Passo 3):

```bash
curl -s -X POST "$API" -H "x-internal-api-key: $INTERNAL_API_KEY" -H "Content-Type: application/json" \
  -d '{"itens":[{"idproduto":IDPRODUTO,"quantidade":1}],"simular":true}'
```

3. Repita a consulta de contagem: o resultado deve ser identico ao de antes.
4. Mesmo corpo **sem** `"simular":true` (escrita ainda desligada):

```bash
curl -s -i -X POST "$API" -H "x-internal-api-key: $INTERNAL_API_KEY" -H "Content-Type: application/json" \
  -d '{"itens":[{"idproduto":IDPRODUTO,"quantidade":1}]}'
```

**O que esperar:** a simulacao responde 201 com `"simulado":true`, `idorcamento` e `senhabalcao` nulos, e os totais (`valorBruto`,
`descontoRS`, `descontoPercentual`, `valorLiquido`) iguais ao preco da tela do Athos. A contagem de `orcamento` nao muda. O POST sem
`simular` responde 503 com `codigo` `ESCRITA_DESABILITADA` e nada e gravado.

**Como reverter:** nada foi gravado.

---

## Passo 5 - Ligar a escrita e criar UM orcamento de teste

So continue se os Passos 1 a 4 passaram e o backup do Passo 0 existe.

1. No servidor, defina `ATHOS_ORCAMENTO_ESCRITA=true` e reinicie o backend.
2. Crie um unico orcamento com o produto barato (a chave abaixo e fixa para o Passo 8 repetir):

```bash
curl -s -i -X POST "$API" -H "x-internal-api-key: $INTERNAL_API_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: roteiro-44-0001" \
  -d '{"itens":[{"idproduto":IDPRODUTO,"quantidade":1}],"obs":"teste roteiro fase 44"}'
```

3. Anote `idorcamento` e `senhabalcao` da resposta (e os valores `valorBruto` e `valorLiquido`).

**O que esperar:** 201 com `"simulado":false`, `idorcamento` e `senhabalcao` preenchidos e a linha `pagamento` com a forma PIX.
Se vier 500 `PERMISSAO_NEGADA`, volte ao Passo 1 (o DBA concede o que faltou) e **nao** repita o POST ate a permissao existir.
Se vier outro erro, anote `codigo` e `mensagem` e pare.

**Como reverter:** cancele o orcamento de teste pela tela do Balcao (Passo 9) e, se quiser parar de gravar, desligue a escrita
(`ATHOS_ORCAMENTO_ESCRITA=false` e reinicie o backend).

---

## Passo 6 - Conferir no banco (3 tabelas)

Troque `NUMERO` pelo `idorcamento` anotado no Passo 5:

```sql
SELECT idorcamento, senhabalcao, statusorcamento, statusimpressao, cancelado, obs, idfuncionariousuario, idvendedor, idterminal,
       dataorcamento, hora, valor, desconto, descontors
  FROM orcamento WHERE idorcamento = NUMERO;

SELECT sequenciaitem, idproduto, quantidadeitem, valoritem, valordesconto, orcamentodesconto, orcamentovalorfinalitem, valorcustoitem
  FROM orcamento_item WHERE idorcamento = NUMERO ORDER BY sequenciaitem;

SELECT idformapagamento, idcondicaopagamento, valor, valorrecebido
  FROM orcamento_forma_pagamento WHERE idorcamento = NUMERO;
```

**O que esperar:**

- `orcamento`: `statusorcamento` nulo, `statusimpressao` falso (`f`), `cancelado` falso ou nulo, `obs` comecando com `[IA] ref:` e terminando
  com o texto enviado, `idfuncionariousuario`, `idvendedor` e `idterminal` iguais as variaveis do Passo 2, `valor` igual a `valorBruto` da resposta.
- `orcamento_item`: uma linha por item, `sequenciaitem` 1, 2, ..., `valoritem` igual ao preco atual do Athos (`preco` da busca),
  `orcamentovalorfinalitem` igual a `quantidadeitem x valoritem` menos o desconto.
- `orcamento_forma_pagamento`: exatamente uma linha PIX (`idformapagamento` 5), `idcondicaopagamento` igual a 0, `valor` e `valorrecebido`
  iguais ao `valorLiquido` da resposta.

**Como reverter:** cancele pelo Balcao (Passo 9). Nao altere o banco por comando.

---

## Passo 7 - Conferir no Balcao (premissas A2 e A3)

1. Abra o Balcao no terminal escolhido em `ATHOS_ORCAMENTO_ID_TERMINAL` e procure o orcamento pelo numero (`senhabalcao` / `idorcamento`).
2. Confira itens, quantidades, valor unitario, total e a forma de pagamento PIX.
3. Procure o **mesmo** orcamento em **outro** terminal (premissa A3: o terminal gravado nao restringe a visibilidade).
4. Observe como o Balcao trata o orcamento por `statusimpressao` falso (premissa A2): ele deve abrir normalmente; anote qualquer aviso
   de reimpressao, bloqueio ou mensagem estranha.
5. **Nao converta o orcamento em venda.**

**O que esperar:** o orcamento aparece com itens, total e PIX, aberto (nao convertido), como se tivesse sido digitado na tela.
Se ele nao aparecer, aparecer so em um terminal ou o Balcao mostrar aviso, **pare e registre**: ha divergencia nas premissas A2/A3.

**Como reverter:** cancele o orcamento de teste pelo Balcao (Passo 9).

---

## Passo 8 - Idempotencia e desconto

1. Repita **exatamente** o mesmo POST do Passo 5 (mesma chave `roteiro-44-0001`, mesmo corpo):

```bash
curl -s -i -X POST "$API" -H "x-internal-api-key: $INTERNAL_API_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: roteiro-44-0001" \
  -d '{"itens":[{"idproduto":IDPRODUTO,"quantidade":1}],"obs":"teste roteiro fase 44"}'
```

2. Conte quantos orcamentos tem a marca desse teste (a `obs` guarda `[IA] ref:` seguido de um codigo):

```sql
SELECT idorcamento, senhabalcao, obs FROM orcamento WHERE obs LIKE '[IA] ref:% teste roteiro fase 44' ORDER BY idorcamento;
```

3. Opcional: um segundo orcamento de teste com desconto global pequeno (chave nova, por exemplo `roteiro-44-0002`), com um item de preco
   maior que R$ 10, para conferir no Balcao o desconto em R$ e em %:

```bash
curl -s -i -X POST "$API" -H "x-internal-api-key: $INTERNAL_API_KEY" -H "Content-Type: application/json" \
  -H "Idempotency-Key: roteiro-44-0002" \
  -d '{"itens":[{"idproduto":IDPRODUTO,"quantidade":1}],"descontoTotalRS":0.50,"obs":"teste roteiro fase 44 desconto"}'
```

**O que esperar:** a repeticao devolve o **mesmo** `idorcamento` e `senhabalcao` com `"replay":true`; a consulta mostra uma unica linha para o
primeiro teste. No segundo orcamento, `descontoRS` 0.50, `descontoPercentual` coerente (0.50 dividido pelo valor bruto, vezes 100) e o Balcao exibe
o desconto igual ao da resposta.

**Como reverter:** cancele pelo Balcao os orcamentos de teste (Passo 9).

---

## Passo 9 - Encerramento e criterio de aceite

1. **Cancele os orcamentos de teste** pela tela do Balcao (nao por comando no banco). Se o Balcao nao permitir cancelar, deixe os
   orcamentos abertos e avise quem usa o Balcao; eles tem a marca `[IA]` e `teste roteiro fase 44` na observacao.
2. **Decida o estado final da escrita.** Para a IA gravar orcamentos de verdade, deixe `ATHOS_ORCAMENTO_ESCRITA=true`.
   Para desligar (as leituras e a simulacao continuam funcionando): `ATHOS_ORCAMENTO_ESCRITA=false` e reinicie o backend.
3. Guarde o dump do Passo 0 pelo tempo que o seu processo de backup exigir.

**Criterio de aceite (todos verdadeiros):**

- [ ] Passo 1: `version()` mostra 9.0.5 e as oito permissoes estao `t`.
- [ ] Passo 2: autor, vendedor e terminal definidos; PIX (forma 5, tipo 4) ativo.
- [ ] Passo 3: busca e leitura respondem sem erro no 9.0.5 e batem com a tela.
- [ ] Passo 4: simulacao devolve totais, contagem de `orcamento` inalterada, POST sem simular responde 503.
- [ ] Passos 5 e 6: um orcamento criado pela API, correto nas 3 tabelas.
- [ ] Passo 7: o orcamento aparece no Balcao (e em outro terminal) com itens, total e PIX.
- [ ] Passo 8: repetir a mesma Idempotency-Key nao cria outro orcamento.
- [ ] Passo 9: orcamentos de teste cancelados e estado final da escrita decidido.

**Para o registro da fase:** responda "aprovado" com o `idorcamento` e a `senhabalcao` do teste visto no Balcao. Se algum passo falhar,
descreva o passo, o `codigo` e a `mensagem` da resposta. Divergencias nas premissas A1 (permissoes), A2 (exibicao com `statusimpressao` falso),
A3 (visibilidade por terminal) e A4 (compatibilidade com o 9.0.5) devem ser informadas, pois ficam registradas no resumo do plano 44-04.
