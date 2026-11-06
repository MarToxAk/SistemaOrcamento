# Fase 43 - Roteiro de verificacao manual da baixa e do estorno no Athos

**Quem executa:** somente o usuario (Diego). Nenhum agente, executor ou verificador automatizado conecta ao Athos real
nem executa qualquer passo deste roteiro (D-07). Voce decide quando cada passo roda e quando a baixa automatica e religada.

**O que este roteiro prova:** que a baixa (e o estorno) feitas pelo Sistema deixam o Athos exatamente como a tela
"Baixar Contas" (e "Voltar Contas Recebidas") deixaria. Os testes automatizados usam banco falso; so voce consegue provar
o comportamento contra o Athos e a EFI reais.

**Regras deste roteiro:**

- Todas as consultas SQL abaixo sao SELECT (somente leitura). Nao ha nenhuma instrucao de escrita para rodar direto no banco.
- Toda gravacao no Athos acontece pelo painel "Boletos a Receber" do Sistema (botoes Simular, Baixar no Athos, Estornar baixa).
- As consultas usam variaveis do psql: defina antes com `\set idcr 1363` (id do titulo em `conta_receber`) e `\set idcli 2641` (id do cliente).
  Titulo com varios boletos/titulos: repita as consultas para cada `idcontareceber`.
- Banco Athos e PostgreSQL 9.0.5: nao use recursos de versoes novas nas suas proprias consultas.
- Use boletos pequenos e de baixo risco, de preferencia do proprio cliente de teste da empresa.

---

## Passo 0 - Pre-requisitos (nao pule)

1. **Backup.** Com `pg_dump` (leitura), gere um dump das tabelas afetadas: `conta_receber`, `conta_recebida`,
   `livro_registro_io`, `boleto`, `cliente`, `log`, `caixa_entrada`, `caixa_movimento_recebimento` e
   `cliente_cartao_preferencial`. Guarde o arquivo fora do servidor do Athos e confirme que ele abre (tamanho maior que zero).
   Sem backup, nao continue: o Athos nao tem rollback por comando.
2. **Permissoes do usuario `ATHOS_PG_USER`** (feito por voce ou pelo DBA, fora do Sistema):
   - escrita (INSERT e UPDATE) em `conta_recebida`, `livro_registro_io`, `conta_receber`, `boleto`, `cliente` e `log`,
     mais uso das sequences de `conta_recebida`, `livro_registro_io` e `log`;
   - apagar linhas (DELETE) em `conta_recebida`, `livro_registro_io`, `caixa_entrada`, `caixa_movimento_recebimento`
     e `cliente_cartao_preferencial` (necessario so para o estorno).
   O texto exato do que falta aparece na mensagem `PERMISSAO_NEGADA` do Sistema se algo estiver faltando.
3. **Variaveis do Sistema (servidor):** `ADMIN_API_KEY` definida no backend e no frontend (mesma usada nos pdf-templates),
   `CONFIG_PANEL_PASSWORD` para entrar no painel, e `INTERNAL_API_KEY`. Sem `ADMIN_API_KEY` os botoes respondem 401.
4. **Constantes da baixa** (padroes em `.env.example`): `ATHOS_BAIXA_ID_FORMA_PAGAMENTO=10`, `ATHOS_BAIXA_ID_LIVRO_REGISTRO=2`
   (EFI Bank), `ATHOS_BAIXA_ID_FUNCIONARIO=1`. A captura original do Athos usou funcionario 3: confirme qual usuario deve
   aparecer no log/caixa e ajuste a variavel se precisar. `ATHOS_BAIXA_MULTA_PERCENTUAL=2` (percentual de multa assumido).
5. **Migration aplicada** no banco do Sistema (`20261106120000_add_cobranca_baixa_athos`): o deploy faz `prisma migrate deploy`.
6. **Deploy com `ATHOS_BAIXA_AUTO=false`.** Com a flag desligada, boletos que forem pagos ficam com "Baixa pendente" (a data
   real do pagamento fica guardada) e nada e gravado no Athos ate voce mandar.

**Como reverter o Passo 0:** nada a reverter; nenhuma gravacao ocorreu. Se algo estiver errado, pare aqui.

---

## Passo 1 - Localizar um boleto pago de teste

1. Abra o painel "Boletos a Receber" (Contas a Receber) e entre com a senha de configuracoes.
2. Escolha um boleto **pago**, pequeno, de **um unico titulo em dia** (pago antes ou no dia do vencimento).
   Boletos pagos antes da fase aparecem como "Nao processado"; boletos pagos depois do deploy aparecem como "Baixa pendente".
3. Anote `idcontareceber` do titulo e `idcliente`, e rode antes de qualquer acao (estado inicial):

```sql
SELECT idcontareceber, idcliente, numerotitulo, valor, datavencimento, statusconta
  FROM conta_receber WHERE idcontareceber = :idcr;

SELECT idcontarecebida, valorpago, datapagamento FROM conta_recebida WHERE idcontareceber = :idcr;

SELECT idcliente, aviso1, aviso2, aviso3 FROM cliente WHERE idcliente = :idcli;
```

**O que esperar:** `statusconta` igual a `AVC` ou `VEN`, nenhuma linha em `conta_recebida`.
No painel, a coluna Athos mostra "Baixa pendente" (ou "Nao processado") e os botoes **Simular** e **Baixar no Athos**.

**Como reverter:** nada foi gravado.

---

## Passo 2 - Simular e comparar com a tela "Baixar Contas"

1. No painel, clique em **Simular** no boleto. O alerta mostra "Simulacao: nada foi gravado", a quantidade de titulos e o valor total.
2. Abra no Athos a tela "Baixar Contas" para o **mesmo titulo** (sem confirmar a baixa) e compare valor, juros, multa e
   dias de atraso com o que o Sistema calculou (titulo em dia: encargos zero).
3. Repita a consulta de estado inicial do Passo 1: nada deve ter mudado.

**O que esperar:** o valor da simulacao e identico ao da tela do Athos; as tabelas continuam como antes (simulacao e somente leitura).

**Como reverter:** nada foi gravado.

---

## Passo 3 - Baixar de verdade e conferir cada tabela

1. No painel, clique em **Baixar no Athos** e confirme. O alerta informa os titulos e o valor total.
2. Confira no Athos:

```sql
-- titulo baixado
SELECT idcontareceber, statusconta FROM conta_receber WHERE idcontareceber = :idcr;

-- recebimento (valor, juros, multa, atraso, data, forma de pagamento, usuario)
SELECT idcontarecebida, idcontareceber, valorpago, juros, multa, atraso, datapagamento, horapagamento,
       idformapagamento, idfuncionariousuario
  FROM conta_recebida WHERE idcontareceber = :idcr;

-- livro do banco: descricao padrao 'Rec. Titulo <numero> - Cliente: <nome>' e livro 2
SELECT l.idlivroregistro, l.idfuncionario, l.datalancamento, l.descricao, l.valorentrada, l.idcontarecebida
  FROM livro_registro_io l
  JOIN conta_recebida r ON r.idcontarecebida = l.idcontarecebida
 WHERE r.idcontareceber = :idcr;

-- boleto do Athos (se existir) e avisos do cliente
SELECT idcontareceber, statusboleto FROM boleto WHERE idcontareceber = :idcr;
SELECT idcliente, aviso1, aviso2, aviso3 FROM cliente WHERE idcliente = :idcli;
```

3. Confira tambem, nas telas do Athos, a lista de contas recebidas e o caixa/livro do banco EFI.
4. Confira o Sistema: o painel passa a mostrar "Baixado". Opcional, no banco do **Sistema** (nao o Athos):

```sql
SELECT "operacao", "origem", "resultado", "codigoErro", "dataPagamento", "valorTotal", "criadoEm"
  FROM "CobrancaBaixaAthosLog" WHERE "cobrancaBoletoId" = 0 ORDER BY "id" DESC;
```

(troque o 0 pelo id do boleto no Sistema, que aparece como `#id` nas mensagens do painel).

**O que esperar:** `statusconta` = `REC`; uma linha em `conta_recebida` com o valor e a data corretos; uma linha no livro com a
descricao padrao e `idlivroregistro` 2; `statusboleto` = `REC` (quando houver boleto no Athos); `aviso1`, `aviso2`, `aviso3`
em falso; o titulo some da lista de abertos do cliente e aparece como recebido no Athos.

**Como reverter:** Passo 4 (Estornar baixa). Em ultimo caso, restauracao do backup do Passo 0 pelo DBA.

---

## Passo 4 - Estornar o mesmo titulo

1. No painel, clique em **Estornar baixa**, leia o aviso e digite exatamente `ESTORNAR`.
2. Confira no Athos:

```sql
SELECT idcontareceber, statusconta FROM conta_receber WHERE idcontareceber = :idcr;
SELECT idcontarecebida FROM conta_recebida WHERE idcontareceber = :idcr;

SELECT l.idcontarecebida, l.descricao
  FROM livro_registro_io l
  JOIN conta_recebida r ON r.idcontarecebida = l.idcontarecebida
 WHERE r.idcontareceber = :idcr;

SELECT idcontareceber FROM caixa_movimento_recebimento WHERE idcontareceber = :idcr;

SELECT descricaolancamento FROM cliente_cartao_preferencial
 WHERE descricaolancamento ~ ('BAIXA CONTA RECEBER(.*[^0-9])?' || :idcr::text || '([^0-9]|$)');

SELECT idfuncionariousuario, data, hora, mensagem FROM log
 WHERE mensagem LIKE 'Voltou a conta recebida: ' || :idcr::text || ' %' ORDER BY data DESC, hora DESC LIMIT 5;
```

Para `caixa_entrada`, use o id do recebimento anotado no Passo 3 (`idcontarecebida`, que nao existe mais em `conta_recebida`):

```sql
-- \set idrec <idcontarecebida anotado no Passo 3>
SELECT * FROM caixa_entrada WHERE idcontarecebida = :idrec;
```

**O que esperar:** `statusconta` volta para `AVC` (vencimento hoje ou futuro) ou `VEN` (vencimento passado); as consultas de
`conta_recebida`, livro, `caixa_movimento_recebimento`, `cliente_cartao_preferencial` e `caixa_entrada` retornam **zero linhas**;
a ultima consulta mostra a linha `Voltou a conta recebida: <id> Valor: R$ x,xx Valor Pago: R$ x,xx`.
O `statusboleto` do Athos **nao** e revertido e os avisos do cliente tambem nao (igual ao "Voltar Contas Recebidas" do Athos).
No painel o boleto continua pago e a coluna Athos mostra "Estornado", com os botoes Simular e Baixar no Athos de volta.

**Como reverter:** clique em **Baixar no Athos** novamente (a baixa pode ser refeita). Faca isso se quiser seguir para os proximos passos com o mesmo boleto.

---

## Passo 5 - Caso retroativo

1. O Sistema guarda a data real do pagamento informada pela EFI. Com `ATHOS_BAIXA_AUTO=false`, escolha um boleto que foi pago em
   **dia anterior** e esta como "Baixa pendente" (se nao houver, aguarde um pagamento real; o painel nao permite digitar a data).
2. Rode **Simular** e **Baixar no Athos**.
3. Confira `conta_recebida.datapagamento` e `livro_registro_io.datalancamento` (devem ser a data real do pagamento, nao hoje) e o log:

```sql
SELECT idfuncionariousuario, data, hora, mensagem FROM log
 WHERE mensagem LIKE 'Baixou a conta com ID: ' || :idcr::text || ' com a data retroativa%' ORDER BY data DESC, hora DESC LIMIT 5;
```

**O que esperar:** data igual a do pagamento na EFI; uma linha de log no formato
`Baixou a conta com ID: <id> com a data retroativa. Data atual: dd/mm/aaaa Data Informada: dd/mm/aaaa`.

**Como reverter:** Estornar baixa (Passo 4).

---

## Passo 6 - Caso com atraso (juros, multa, atraso)

1. Use um boleto cujo titulo foi **pago depois do vencimento** (idealmente poucos dias).
2. Rode **Simular**. Compare juros, multa, dias de atraso e valor total com a tela "Baixar Contas" do Athos para o mesmo titulo e data.
   A formula foi validada apenas contra dois casos com 10 dias de atraso (principal 457,00 => 467,65; 252,93 => 258,82).
   Se houver diferenca de centavos ou de unidade, **pare** e reporte: nao baixe.
3. Baixe e confira `conta_recebida.juros`, `multa`, `atraso` e `valorpago` com as consultas do Passo 3.
4. Nos logs do backend, localize a linha `Baixa Athos baixado ... fonteData=... fonteValor=...` e registre:
   qual campo da EFI forneceu a data (`payment.paid_at`, `payment.received_by_bank_at`, `paid_at` ou `fallback_hoje`) e se o valor
   veio da EFI (`payment.paid_value`) ou `nao_informado`. Isso confirma o payload real da EFI.

**O que esperar:** encargos iguais aos da tela do Athos; `fonteData` e `fonteValor` diferentes de `fallback_hoje` / `nao_informado`
quando a EFI informa os campos. Se a baixa falhar com `VALOR_INCOMPATIVEL`, o valor da EFI nao bate com principal + encargos: nada foi gravado.

**Como reverter:** Estornar baixa (Passo 4).

---

## Passo 7 - Boleto com varios titulos

1. Escolha um boleto pago que cubra **2 ou mais titulos** do mesmo cliente.
2. Simule, baixe e rode as consultas do Passo 3 para **cada** `idcontareceber` (use `\set idcr` para cada um).
3. Confira que cada titulo tem seu proprio recebimento e sua linha no livro, e que os avisos do cliente foram zerados uma vez.
4. Estorne e confira que **todos** os titulos voltaram (Passo 4) e que o valor estornado e a soma.

**O que esperar:** tudo ou nada: ou todos os titulos foram baixados, ou nenhum. O mesmo vale para o estorno.

**Como reverter:** Estornar baixa.

---

## Passo 8 - Falha de permissao e retentativa

1. Peca ao DBA para retirar temporariamente a permissao de escrita do usuario `ATHOS_PG_USER` em `conta_recebida`
   (ou use um boleto de teste enquanto a permissao ainda nao foi dada).
2. No painel, clique em **Baixar no Athos** em um boleto pendente.
3. O painel mostra erro de permissao e, depois de atualizar, a coluna Athos exibe **"Falha na baixa"** (passe o mouse para ver o codigo).
4. Confira no Athos que nada mudou (`statusconta` continua `AVC`/`VEN`, sem linha em `conta_recebida`).
5. Devolva a permissao e clique em **Baixar no Athos** novamente: a baixa deve concluir.

**O que esperar:** a falha nao desfaz o "pago" do boleto no Sistema; a retentativa manual funciona depois de corrigir a permissao.

**Como reverter:** nada a reverter na falha; estorne se quiser desfazer a baixa que concluiu depois.

---

## Passo 9 - Religar a baixa automatica

Somente depois dos Passos 1 a 8 aprovados.

1. No deploy, remova `ATHOS_BAIXA_AUTO=false` (ou defina `true`) e reinicie o backend.
2. Boletos "Baixa pendente" ou com "Falha na baixa" (menos de 5 tentativas) sao reprocessados pelo job a cada 30 minutos,
   usando a data real do pagamento guardada. Aguarde um ciclo e confira no painel e com as consultas do Passo 3.
3. Para um pagamento novo, observe o boleto passar de pago para "Baixado" logo depois do webhook, e confira o log do backend.

**O que esperar:** boletos pendentes passam para "Baixado" sozinhos; nenhum titulo recebe duas baixas.

**Como reverter:** defina `ATHOS_BAIXA_AUTO=false` de novo e reinicie; baixas ja feitas podem ser estornadas pelo painel.

---

## Passo 10 - Criterio de aceite e como desligar de novo

**Aceite da fase:** todos os itens abaixo conferidos por voce.

- Simulacao igual a tela "Baixar Contas" (Passo 2) e sem nenhuma gravacao.
- Baixa deixa `conta_receber`, `conta_recebida`, `livro_registro_io`, `boleto` e `cliente` como a tela do Athos (Passo 3).
- Estorno devolve o titulo a `AVC`/`VEN`, remove recebimento e livro, grava a linha de log e nao mexe em boleto/avisos (Passo 4).
- Retroativa grava a data real e a linha de log (Passo 5); atraso bate com o Athos (Passo 6); varios titulos sao tudo ou nada (Passo 7).
- Falha de permissao aparece como "Falha na baixa" e e recuperavel (Passo 8); o job baixa os pendentes depois de religar (Passo 9).
- Backup do Passo 0 guardado ate o fim da validacao.

**Para desligar de novo:** `ATHOS_BAIXA_AUTO=false` no deploy e reinicio do backend. O painel continua permitindo baixa e estorno
manuais mesmo com a flag desligada.

**Se algo divergir do Athos:** pare, nao religue a flag, anote o titulo, o que o Athos mostra e o que o Sistema gravou,
e reporte antes de continuar. Os botoes de baixa e estorno exigem chave de administrador e sessao do painel; nenhum
agente automatizado deve acionar essas acoes.
