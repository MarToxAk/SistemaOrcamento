# Fase 45 - Roteiro de ativacao do aviso de boletos a vencer e atrasados

**Quem executa:** somente o usuario (Diego). Nenhum agente ativa o aviso, altera env de producao, reinicia container ou chama a
API de producao (D-07). O aviso manda **e-mail real a clientes**; por isso a ordem e sempre: **previa -> dry-run agendado -> envio real**.

**O que a fase faz:**

- Um job (`cobranca-aviso-vencimento`) roda as 08:00 e as 14:00 (America/Sao_Paulo) e avisa por e-mail, com CC padrao do cliente,
  link e PDF do boleto: D-3 (3 a 2 dias antes), D-1 (1 dia antes), A+2 (2 a 6 dias de atraso), A+7 (7 a 13) e A+14 (14 a 20).
  Depois de 20 dias de atraso so existe o alerta interno no painel.
- O painel `/contas-receber` mostra pills de vencimento, contadores e o ultimo aviso (alerta interno).
- Uma previa (`GET /api/cobranca/aviso-vencimento/previa`) lista quem receberia aviso hoje, sem enviar nada.

**Regras deste roteiro:**

- Toda consulta SQL abaixo e SELECT (somente leitura) e roda **somente no banco do Sistema** (`POSTGRES_DB`, tabela
  `"CobrancaAvisoVencimento"`). Nenhuma consulta ao Athos. Nao ha instrucao de escrita para rodar direto no banco.
- URL da API: `https://orcamentoapi.bomcustoilhabela.com.br` primeiro; se nao responder, `http://localhost:4000` (no proprio
  servidor). Defina antes de comecar:

```bash
export API="https://orcamentoapi.bomcustoilhabela.com.br"
export INTERNAL_API_KEY="<cole aqui a chave interna; nunca salve a chave real neste arquivo>"
export ADMIN_API_KEY="<cole aqui a chave de administrador; nunca salve a chave real neste arquivo>"
```

- Variaveis de ambiente do aviso (no stack env da VPS): `COBRANCA_AVISO_ATIVO` e `COBRANCA_AVISO_DRY_RUN`. Somente o texto
  exato `true` liga; ausente, `false`, `TRUE` ou qualquer outro texto mantem desligado. `COBRANCA_AVISO_DRY_RUN` so vale com
  o aviso ligado.

---

## Passo 0 — Pre-requisitos (nao pule)

1. **Deploy feito com o envio desligado:** `COBRANCA_AVISO_ATIVO` ausente ou `false` no stack env (e o padrao dos dois compose:
   `COBRANCA_AVISO_ATIVO: ${COBRANCA_AVISO_ATIVO:-false}`).
2. **Migration aplicada** no banco do Sistema (a migration `20261110120000_add_cobranca_aviso_vencimento`; o deploy faz
   `prisma migrate deploy`). Confira (SELECT, banco do Sistema):

```sql
SELECT to_regclass('"CobrancaAvisoVencimento"');
```

   O resultado deve ser `"CobrancaAvisoVencimento"` (nao nulo).
3. **Variaveis presentes no stack env da VPS:** `ADMIN_API_KEY` (a mesma usada pelas rotas AdminOnly da Fase 43, necessaria para
   a previa), `SMTP_*`, `SMTP_FROM` e `APP_BASE_URL` (o e-mail usa o SMTP real e o link do boleto).
4. **Log do backend nos horarios 08:00 ou 14:00** deve mostrar a linha de "Aviso de vencimento desligado
   (COBRANCA_AVISO_ATIVO diferente de true) - ciclo ignorado." a cada disparo. Isso prova que o job esta registrado e desligado.

## Passo 1 — Painel

Abra `/contas-receber` no frontend e confira o painel **Boletos a Receber**:

1. Boletos **pendentes** mostram a pill "Vence em Nd" (1 a 3 dias), "Vence hoje" ou "Atrasado há Nd" (amarelo para a vencer,
   vermelho para atrasado). Boletos pagos ou cancelados nao mostram pill de situacao.
2. Os contadores do cabecalho **"A vencer"** e **"Atrasados"** batem com a quantidade de pills correspondentes na lista.
3. A data usada e a de Sao Paulo (entre 21:00 e 23:59 o painel nao pode adiantar um dia).
4. Ainda nao ha linha de ultimo aviso (nada foi enviado); ela so aparece depois do Passo 4 (ou se algum cliente sem e-mail for
   registrado).

## Passo 2 — Previa (nada e enviado)

A previa roda a mesma logica do job em dry-run: **nao envia e-mail, nao grava linha em `"CobrancaAvisoVencimento"`**. Exige as
duas chaves.

```bash
curl -s "$API/api/cobranca/aviso-vencimento/previa" \
  -H "x-internal-api-key: $INTERNAL_API_KEY" \
  -H "x-admin-api-key: $ADMIN_API_KEY"
```

Se a VPS nao responder, no proprio servidor troque `$API` por `http://localhost:4000`.

Como ler a resposta `{ hoje, dryRun, candidatos, semEmail, jaProcessados, lookupFalhou, itens }`:

- `hoje` deve ser a data de hoje em Sao Paulo (formato `AAAA-MM-DD`) e `dryRun` deve ser `true`.
- `candidatos` e o total de boletos dentro das janelas de aviso.
- Cada item de `itens` traz `cobrancaBoletoId`, `idclienteAthos`, `tipo` (`D-3`, `D-1`, `A+2`, `A+7`, `A+14`),
  `diasParaVencer`, `desfecho`, `destinatarioMascarado` e `ccQuantidade`.
- `desfecho`:
  - `previa_enviaria`: receberia o e-mail agora. **Conte esses itens.** Se forem **dezenas**, pare e investigue antes de ligar
    (risco de rajada de e-mails na primeira ativacao; so ligue depois de conferir a lista e aceitar a quantidade).
  - `previa_sem_email`: o cliente nao tem e-mail valido no cadastro. Corrija o cadastro **pelo proprio Athos** (este roteiro e
    o Sistema nao escrevem no Athos); no ciclo real esses clientes virariam "Sem e-mail cadastrado" no painel.
  - `ja_processado`: aquele aviso ja tem linha na tabela (nao reenvia).
  - `lookup_falhou`: nao foi possivel ler o cadastro do cliente agora; tenta de novo no proximo disparo.
- **Sem a chave de administrador** (omita o header `x-admin-api-key`) a resposta deve ser **401**.

Confirme que a previa nao gravou nada (SELECT, banco do Sistema); o resultado deve ser `0`:

```sql
SELECT count(*) FROM "CobrancaAvisoVencimento";
```

## Passo 3 — Dry-run agendado (opcional)

Prova o job real agendado, ainda sem enviar e-mail:

1. No stack env da VPS defina `COBRANCA_AVISO_ATIVO=true` e `COBRANCA_AVISO_DRY_RUN=true`.
2. Reinicie **somente o backend** (o deploy/stack da VPS, por voce).
3. Depois do disparo das 08:00 ou das 14:00, filtre o log do backend por `[dry-run]`. Cada linha tem o formato
   `[dry-run] boleto=... tipo=... dias=... destinatario=<mascarado> cc=N`. Confira tambem a linha de resumo do ciclo
   ("Aviso de vencimento: ciclo concluido (dryRun=true)" com candidatos, enviados, semEmail, jaProcessados, erros, lookupFalhou).
   A lista deve bater com a previa do Passo 2.
4. Confirme que nada foi gravado (SELECT, banco do Sistema); deve continuar `0`:

```sql
SELECT count(*) FROM "CobrancaAvisoVencimento";
```

## Passo 4 — Envio real (decisao do usuario)

**Esta e a unica etapa que manda e-mail real a clientes. A decisao de executar e sua; nenhum agente faz isso.**

1. No stack env da VPS defina `COBRANCA_AVISO_DRY_RUN=false` com `COBRANCA_AVISO_ATIVO=true`.
2. Reinicie **somente o backend**.
3. Depois do primeiro disparo (08:00 ou 14:00), confira o historico (SELECT, banco do Sistema):

```sql
SELECT "status", "tipo", count(*)
FROM "CobrancaAvisoVencimento"
GROUP BY "status", "tipo"
ORDER BY "status", "tipo";
```

   Status possiveis: `enviando`, `enviado`, `erro`, `sem_email`. Em caso de `erro`, veja o motivo (SELECT):

```sql
SELECT "cobrancaBoletoId", "tipo", "tentativas", "erro"
FROM "CobrancaAvisoVencimento"
WHERE "status" = 'erro'
ORDER BY "id" DESC
LIMIT 20;
```

   Cada aviso (boleto + tipo) tem no maximo **3 tentativas**; a retomada acontece no disparo seguinte. Um ciclo envia no maximo
   **100** e-mails (o restante fica para o proximo disparo, com pausa entre envios).
4. No painel `/contas-receber`, confira a linha **"Aviso ... enviado em DD/MM"** nos boletos avisados e **"Sem e-mail cadastrado"**
   nos clientes sem e-mail.
5. Confira, com o cliente ou com o CC, que o e-mail chegou com o link e o PDF do boleto.

## Passo 5 — Desligar

1. No stack env da VPS volte `COBRANCA_AVISO_ATIVO` para `false` (ou remova a variavel).
2. Reinicie **somente o backend**.
3. O historico de `"CobrancaAvisoVencimento"` permanece e impede reenvio do mesmo aviso (boleto + tipo) se voce religar mais
   tarde; religar nao dispara tudo de novo.

---

## Notas finais

- O e-mail pede para **desconsiderar a mensagem se o cliente ja pagou**. Um boleto pago fora do EFI (dinheiro, transferencia)
  continua `pendente` no Sistema e pode receber lembrete; a checagem no Athos antes de avisar ficou **fora desta fase**.
- O aviso passa a aparecer como **ultimo e-mail** na tela do cliente (historico `CobrancaEmailEnvio`).
- O job **nao recupera disparo perdido** alem do segundo horario do dia: se o backend ficar fora do ar nos dois disparos de um
  dia, aquele dia de janela e perdido (as janelas de varios dias reduzem o impacto, mas o D-1 tem janela de um dia).
- Nenhuma etapa deste roteiro escreve no Athos.
