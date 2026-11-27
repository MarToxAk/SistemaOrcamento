# Fase 55 - Roteiro de ativacao da proposta comercial (atacado e revenda para orgaos publicos)

**Quem executa:** somente o usuario (Diego). Nenhum agente faz deploy, aplica migration, liga a flag, altera env de producao ou
escreve no Athos de producao (D-07, D-30). A escrita de proposta no Athos e **one-way**: por isso a ordem e sempre
**deploy com a flag desligada -> conferencia -> verificacao visual -> so entao ligar a flag e fazer um primeiro lancamento pequeno**.

**Regras deste roteiro:**

- Toda consulta SQL abaixo e SELECT (somente leitura) e roda **somente no banco do Sistema** (`POSTGRES_DB`). Nenhuma consulta
  ao Athos. Nao ha instrucao de escrita para rodar direto em nenhum banco.
- URL da API: `https://orcamentoapi.bomcustoilhabela.com.br` primeiro; se nao responder, `http://localhost:4000` (no proprio servidor).
- Nunca cole senhas, chaves ou o resultado de consultas com dados de clientes em chat, issue ou commit.

---

## (a) O que a fase entrega e o que NAO faz

**Entrega:**

- Area **Propostas** no admin: lista, montagem de rascunho, busca de produto do Athos, ajuste de preco por item (percentual ou
  "Preco final R$"), "Aplicar % em todos os itens", custo e margem visiveis so na tela, linha vermelha abaixo do custo
  (sem bloquear), cliente do Athos com razao social real, dados de orgao (processo/pregao, setor, contato), validade e prazo
  (padroes 1 e 15), observacao e assinante.
- PDF institucional da proposta (sem custo, margem, preco base, desconto; previa com marca d'agua e sem numero; "Não informado"
  nos campos ausentes), gerado a partir de um snapshot gravado no momento do lancamento.
- Galeria de templates por familia (abas Orcamento e Proposta) em Configuracoes > Templates de PDF.
- **Lancamento**: "Gerar proposta e lancar no Athos" grava a proposta como **orcamento aberto no Athos** (preco final em
  `valoritem`, desconto 0), com compare-and-set RASCUNHO -> LANCANDO -> ENVIADA, idempotencia por marcador `[PROPOSTA] ref:...` e
  recuperacao de lancamento ambiguo. Tudo atras da flag `PROPOSTA_ESCRITA_ATIVA`.

**NAO faz:**

- Nao cadastra produto nem cliente no Athos (cadastro continua no Athos desktop).
- Nao cancela orcamento no Athos (o cancelamento do Sistema e local; ver secao g).
- Nao envia a proposta por e-mail nem por WhatsApp (o PDF e baixado/aberto pelo admin).
- Nao grava validade nem observacao no orcamento do Athos (ficam so no Sistema e no PDF).

---

## (b) Ordem segura de ativacao

1. **Deploy** do codigo da fase com `PROPOSTA_ESCRITA_ATIVA` **ausente ou `false`** na stack (padrao dos dois compose:
   `PROPOSTA_ESCRITA_ATIVA: ${PROPOSTA_ESCRITA_ATIVA:-false}`), seguindo `deploy/UPDATE_RUNBOOK.md` (pull, `up -d`, logs do backend
   sem `DB_READINESS_FAILED` nem `MIGRATION_DEPLOY_FAILED`). As migrations `20261128120000_add_pdf_template_familia` e
   `20261128130000_add_proposta_comercial` rodam sozinhas no `prisma migrate deploy` do bootstrap.
2. **Conferencia do banco** do Sistema (secao c).
3. **Conferencia das variaveis** da stack (secao d) e dos **GRANTs** do Athos (secao e).
4. **Verificacao visual** em producao com a flag desligada (checkpoint do plano 55-11, tarefa 3): lista, montagem, ajuste, previa do
   PDF e a resposta "escrita desabilitada" ao gerar, sem prender a proposta.
5. **So entao** ligar a flag (`PROPOSTA_ESCRITA_ATIVA=true` na stack, reiniciar somente o backend) e fazer **um primeiro lancamento
   pequeno** (plano 55-12), conferindo o resultado no Balcao.

Health apos o deploy (rota publica, somente leitura): `GET $API/health` deve responder status ok.

---

## (c) Conferencia do banco do Sistema (somente SELECT)

Colunas novas (devem retornar uma linha cada):

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'PdfTemplate' AND column_name = 'familia';

SELECT column_name FROM information_schema.columns
WHERE table_name = 'Proposta' AND column_name = 'pdfSnapshot';
```

Templates (esperado: os tres presets de orcamento com o **mesmo ativo de antes** e `proposta-institucional` **ativo na familia
PROPOSTA**):

```sql
SELECT slug, familia, "isActive" FROM "PdfTemplate" ORDER BY familia, slug;
```

Dados bancarios da proposta (esperado: **uma** linha default com Santander, agencia e conta vazias ate o UPDATE de producao):

```sql
SELECT * FROM "PropostaConfig";
```

**Preencher agencia e conta (unica escrita manual desta fase, no banco do Sistema, NAO no Athos).**
O repositorio e publico, por isso a migration cria a linha com agencia e conta vazias. Rode uma vez em producao,
digitando os numeros reais so no terminal do banco (nunca em commit, issue ou chat):

```sql
UPDATE "PropostaConfig"
   SET "agencia" = '<AGENCIA>', "conta" = '<CONTA>', "atualizadoEm" = CURRENT_TIMESTAMP
 WHERE "id" = 'default';
```

Enquanto agencia ou conta estiverem vazias, "Gerar proposta e lancar no Athos" responde PDF_INDISPONIVEL
**antes** de qualquer escrita no Athos, e a "Previa do PDF" tambem responde PDF_INDISPONIVEL. Por isso o UPDATE vem antes da verificacao visual. Confira de novo com o
`SELECT * FROM "PropostaConfig"` acima.

Nenhuma proposta criada ainda (esperado `0`):

```sql
SELECT count(*) FROM "Proposta";
```

O seed de templates roda a cada start do backend e **nao** altera o ativo de orcamento da familia ORCAMENTO; anote o ativo de
orcamento antes do deploy para comparar.

---

## (d) Variaveis exigidas na stack para escrever

Conferir no arquivo de ambiente da VPS (baseado em `deploy/stack.env.example`); nao grave nada no Athos para testar:

- `ATHOS_ORCAMENTO_ID_FUNCIONARIO`, `ATHOS_ORCAMENTO_ID_VENDEDOR`, `ATHOS_ORCAMENTO_ID_TERMINAL` e `ATHOS_ORCAMENTO_ID_FORMA_PAGAMENTO`:
  **preenchidas com ids validos do Athos** (a Fase 44 pode nunca ter sido ativada em producao). A forma de pagamento precisa estar
  ativa e ser PIX (tipo 1 ou 4). Sem elas o lancamento responde `CONFIG_INVALIDA`.
- `PROPOSTA_ESCRITA_ATIVA`: **inicialmente `false`** (ou ausente). Somente o texto exato `true` liga; qualquer outro valor mantem
  desligado. E **independente** de `ATHOS_ORCAMENTO_ESCRITA` (flag da IA da Fase 44): uma nao liga nem desliga a outra.
- As ja existentes de PDF e armazenamento: `EMPRESA_NOME`, `EMPRESA_CNPJ`, `EMPRESA_ENDERECO` e `MINIO_*`.
  **`EMPRESA_NOME` e `EMPRESA_CNPJ` precisam estar preenchidas**: sem elas, gerar a proposta falha com `PDF_INDISPONIVEL` **antes
  de qualquer gravacao no Athos** (o snapshot do PDF e capturado antes da reserva e do INSERT; decisao do plano 55-07).

---

## (e) GRANTs no Athos para o usuario de conexao

O usuario de conexao do Sistema ao Athos precisa de:

- `INSERT` em `orcamento`, `orcamento_item` e `orcamento_forma_pagamento`;
- `DELETE` em `orcamento_forma_pagamento`;
- `USAGE` nas quatro sequencias usadas por essas tabelas.

**Conferir com o DBA, sem teste de escrita.** Se faltar algum GRANT, o primeiro lancamento falha com `PERMISSAO_NEGADA` (erro
`42501` do Postgres) **antes de qualquer COMMIT**: nada e gravado e a proposta volta a RASCUNHO. Solicite os GRANTs agora, para
nao descobrir no primeiro lancamento.

---

## (f) Como a proposta aparece no Balcao e a regra de ouro

Depois de um lancamento real, o Balcao mostra um **orcamento aberto**, com:

- `obs` comecando por `[PROPOSTA] ref:<12 caracteres hex>` (e o marcador de idempotencia: nao edite);
- forma de pagamento **PIX**, uma linha com o valor total;
- **sem desconto** (o preco ajustado ja esta em `valoritem`; `valordesconto` e `descontors` zerados), com `valor` do cabecalho igual
  a soma dos itens.

**Regra de ouro: NAO converter esse orcamento em venda no Balcao.** A proposta e um orcamento para o orgao; a venda segue o
processo normal de empenho/faturamento. Converter em venda baixaria estoque e geraria cobranca indevidamente.

---

## (g) Reversao

1. **Desligar a flag**: `PROPOSTA_ESCRITA_ATIVA=false` (ou remover) na stack e **reiniciar o backend**. Gerar volta a responder
   "escrita desabilitada" sem prender a proposta.
2. **Cancelar o orcamento pelo Balcao**: o Sistema so cancela **localmente** (D-10 e D-28); o orcamento ja gravado no Athos precisa
   ser cancelado la, manualmente.
3. **Duplicar a proposta** para refazer: a proposta original fica como esta e a copia volta a RASCUNHO.
4. **Redeploy da imagem anterior** (`BACKEND_IMAGE` e `FRONTEND_IMAGE` para a ultima tag estavel, ver "Rollback tatico" do
   `deploy/UPDATE_RUNBOOK.md`): as migrations da fase sao **aditivas e idempotentes** e nao quebram a versao anterior (a coluna
   `familia` tem padrao e as tabelas novas sao ignoradas pelo codigo antigo).

---

## (h) Debitos fora do escopo (lembrete)

- Custo zerado da Fase 44 com imposto `NULL` (margem de produto sem custo cadastrado no Athos aparece distorcida).
- O seed de ORCAMENTO reativa o preset colorido a cada deploy (comportamento anterior a esta fase; a familia PROPOSTA nao e afetada).
- Validade e observacao nao sao gravadas no orcamento do Athos.
- Cancelamento no Athos a partir do Sistema.
- Envio por e-mail ou WhatsApp.

---

## (i) O que a verificacao automatica NAO cobre

O clone `athos-teste` roda **PostgreSQL 14** (restaurado de um `pg_dump` do servidor 9.0, que so pode ser lido por `pg_dump` 14 ou
anterior), enquanto o Athos de producao roda **PostgreSQL 9.0.5**.

A compatibilidade do SQL novo da fase (leituras de produto e cliente do plano 55-03, escrita e recuperacao por ref do plano 55-04,
usadas pelo plano 55-08) com o dialeto 9.0.5 foi verificada por **revisao do texto SQL** e por **assertivas de texto nos testes
unitarios** (sem CTE, sem `UPDATE`, sem advisory lock de transacao, sem funcoes de PG 10 ou mais novo; somente construcoes ja usadas
na Fase 44: parametros `$n`, `ANY($1::int[])`, `RETURNING`, `to_char`, `LIKE`, `SET LOCAL statement_timeout`), e **NAO por execucao
em 9.0.5**.

Portanto o **primeiro lancamento real (plano 55-12) e a primeira e unica execucao em 9.0.5** e deve ser conferido no Balcao
(orcamento criado, itens, valores, forma de pagamento, marcador no `obs`).

---

## Verificacao visual (checkpoint do plano 55-11, tarefa 3)

Com a flag desligada, no admin de producao: ver os 8 passos listados na tarefa 3 do plano `55-11-PLAN.md` (lista e montagem, busca
de produto, ajuste 3,50 +10% = 3,85, ajuste por "Preco final R$" digitado 2,90 = preco unitario 2,90 e nao acrescimo, aplicar % em
todos, linha vermelha abaixo do custo, cliente com razao social real, previa do PDF sem custo/margem/numero e com marca d'agua,
gerar responde escrita desabilitada sem prender a proposta, galeria de templates por familia).

## Notas finais

- Nenhuma etapa deste roteiro, nem os testes do plano 55-11, escreve no Athos de producao. Os testes de clone rodam somente em
  `127.0.0.1:5440` (`athos-teste`).
- Ligar `PROPOSTA_ESCRITA_ATIVA` e decisao sua, no plano 55-12, e somente depois da verificacao visual aprovada.
