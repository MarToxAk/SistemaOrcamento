# Fase 52 - Roteiro de homologação manual: pesquisa de satisfação, cupom e convite do Google

**Quem executa:** somente o operador (Diego). Nenhum agente executa este roteiro, altera env de
produção, reinicia container ou chama o Chatwoot real. Executar a homologação em **UM CHATWOOT DE
TESTE LOCAL** (instância separada, conta de teste, inbox `Channel::Api` e um número da equipe) e no
sistema de teste. A ativação em produção é o Passo 18, só depois da homologação assinada.

**O que a fase faz:**

- Ao fechar uma conversa (mensagem de encerramento da fase 51), o cliente recebe um único link para a
  pesquisa de satisfação própria (`/pesquisa/<token>` no domínio público do frontend).
- Quem responde (qualquer nota, de 1 a 5) recebe um cupom único por cliente (desconto em % com teto e
  compra mínima) e, em mensagem separada, um convite para avaliar a empresa no Google, sem recompensa
  e sem qualquer vínculo com o cupom.
- A resposta aparece no Chatwoot em quatro lugares: relatório nativo de CSAT, nota privada na conversa,
  atributos do contato e etiquetas (`avaliou` e `csat-baixo` para nota 1 ou 2).
- Uma aba em `/configuracoes/pesquisa` edita tudo e mostra o painel de resultados; a tela `/cupons`
  permite ao balcão validar e dar baixa no cupom (o desconto é lançado manualmente no Athos/PDV).

**Regras deste roteiro:**

- **Nunca** execute nada em Chatwoot, Evolution ou Athos de produção durante a homologação (Passos 0 a
  17). Produção só no Passo 18, por empresa, uma de cada vez, e somente após a homologação assinada e as
  pré-condições cumpridas.
- Use **conta de teste, inbox de teste e o número da equipe**. Nada de clientes reais: as mensagens desta
  fase vão para um WhatsApp de verdade.
- O token do Chatwoot (`CHATWOOT_API_TOKEN`) fica só em variável de ambiente do servidor de teste. O token
  de **administrador** é digitado na hora do Passo 3, sem eco. **Nunca cole token, segredo de webhook ou
  senha em chat, em log, em commit ou neste arquivo.**
- Nada aqui escreve no Athos.
- As consultas SQL deste roteiro são somente de leitura, exceto as dos Passos 14 e 15 (e as reversões
  indicadas), que rodam **apenas no banco do sistema de teste**.

**Premissas que a homologação precisa confirmar:**

- **A1:** a mensagem privada `input_csat` criada no Chatwoot **não chega ao WhatsApp** do cliente.
  - Se A1 falhar: definir `PESQUISA_CSAT_NATIVO_ATIVO=false` (fallback: só nota privada, atributos e
    etiqueta) e registrar o achado.
- **A2:** o relatório nativo do Chatwoot (`/app/accounts/{conta}/reports/csat`) recebe a nota e o
  comentário enviados pela nossa página.
  - Se A2 falhar: definir `PESQUISA_CSAT_NATIVO_ATIVO=false` e registrar o achado.

---

## Passo 0 - Pré-condições (não pule)

1. **PR #75 já está nesta base (D-41).** O PR #75 (envs `CHATWOOT_AUTOMATION_*` e `CHATWOOT_AI_*`) foi
   mesclado em `origin/main` e está na base desta branch, então a conferência no repositório é
   SOMENTE DE LEITURA e não bloqueia:
   `git grep -q CHATWOOT_AUTOMATION_WEBHOOK_TOKEN origin/main -- deploy/stack.env.example`
   (exit 0 = presente). Em cada servidor, conte a variável (nunca o valor) no container do backend:
   `docker exec box-backend env | grep -c '^CHATWOOT_AUTOMATION_WEBHOOK_TOKEN='` e o equivalente em
   `orcamento-backend`, esperado `1`, para confirmar que a implantação já recebeu esse commit.
   - Reverter: nada (somente leitura).
2. **Lista de status que liberam o fechamento:**
   `CHATWOOT_AUTOMATION_STATUS_FECHAMENTO=PRONTO_PARA_ENTREGA,ENTREGUE,ENVIADO,CANCELADO`.
3. **Envs da fase 52 presentes no backend de teste:** `PESQUISA_PERCENTUAL_PADRAO`,
   `PESQUISA_TETO_PADRAO`, `PESQUISA_COMPRA_MINIMA_PADRAO`, `PESQUISA_TETO_MENSAL_PADRAO`,
   `PESQUISA_PREFIXO_PADRAO`, `PESQUISA_CSAT_NATIVO_ATIVO`, `PESQUISA_RETENCAO_ATIVA`,
   `PESQUISA_RETENCAO_MESES` e `CHATWOOT_WEBHOOK_SECRET`. Conferir a presença, nunca imprimir o valor
   do segredo.
   - Reverter: nada (somente leitura).
4. **Migração aplicada:** o bootstrap do container roda `prisma migrate deploy`; a migração da fase 52 é
   aditiva e idempotente. Se o deploy já subiu, está aplicada.
5. **`APP_BASE_URL`** aponta para o domínio público do frontend de teste (é a base do link
   `/pesquisa/<token>`).
6. **Parecer jurídico (D-38):** ainda não é exigido para a homologação. Ele é **pré-condição de ligar em
   produção** (Passo 18) e cobre a base legal da oferta pós-venda, o prazo de processamento do SAIR e a
   anonimização em 12 meses. Enquanto não houver parecer, a retenção fica desligada
   (`PESQUISA_RETENCAO_ATIVA=false`).

## Passo 1 - Montar o Chatwoot de teste

1. Suba uma **instância local separada** do Chatwoot, com conta de teste.
2. Crie uma inbox `Channel::Api` ligada ao WhatsApp da equipe ou, sem Evolution de teste, a um receptor
   que registra as requisições recebidas.
3. Crie um contato com o **número da equipe** (não use número de cliente).
4. Guarde o token de agente e o token de administrador **só em variáveis de ambiente** do backend de
   teste e do shell do operador.
   - Reverter: destrua a instância de teste ao final.

## Passo 2 - Desligar e conferir o CSAT nativo (D-29)

1. Desligue `csat_survey_enabled` nas inboxes WhatsApp de teste (tela da inbox ou
   `UPDATE inboxes SET csat_survey_enabled = false WHERE id IN (...)` no banco **do Chatwoot de teste**).
2. Confira POR LEITURA:
   `SELECT id, name, channel_type, csat_survey_enabled FROM inboxes` no banco do Chatwoot de teste.
   Todas as inboxes WhatsApp devem aparecer com `csat_survey_enabled = f`.
3. **Atenção em produção:** a inbox 1 do Box está LIGADA hoje. Com o CSAT nativo ligado, o cliente recebe
   **dois links** (o nativo dispara na hora, antes do atraso de 45 a 180 s). O desligamento e a
   conferência de leitura são pré-condição obrigatória do Passo 18. A conta do Bom Custo estava com todas
   desligadas na última consulta; reconfirme por leitura antes de ativar.
4. Depois do primeiro fechamento (Passo 6), confira nos logs do backend de teste que **NÃO** aparece o
   aviso de CSAT nativo ligado na inbox (o sistema lê a inbox antes de criar a `input_csat`; se encontrar
   o CSAT nativo ligado, registra o aviso no log e deixa a nota fora do relatório nativo).
   - Reverter: religar `csat_survey_enabled` na inbox de teste, se quiser repetir outro cenário.

## Passo 3 - Criar as etiquetas `avaliou` e `csat-baixo` com token de administrador digitado (D-33)

Criar etiqueta de conta exige administrador e corpo aninhado na chave `label`. O token é digitado na hora,
sem eco, fora do histórico do shell, usado só neste comando e descartado logo depois. **Nenhuma env,
arquivo ou endpoint do sistema guarda esse token.**

1. No shell do operador, com `CHATWOOT_BASE_URL` e `CHATWOOT_ACCOUNT_ID` do Chatwoot de teste já no
   ambiente:
   ```bash
   read -rs -p 'Token de ADMINISTRADOR do Chatwoot (não será gravado): ' TOKEN_ADMIN; echo
   ```
2. Para cada título (`avaliou` e `csat-baixo`), rode:
   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' \
     -X POST "$CHATWOOT_BASE_URL/api/v1/accounts/$CHATWOOT_ACCOUNT_ID/labels" \
     -H "api_access_token: $TOKEN_ADMIN" \
     -H 'Content-Type: application/json' \
     -d '{"label":{"title":"avaliou","show_on_sidebar":true}}'
   ```
   Repita trocando `avaliou` por `csat-baixo` (no `-d`).
3. Descarte o token da sessão:
   ```bash
   unset TOKEN_ADMIN
   ```
4. **Esperado:** HTTP 200 (criada) ou 422 (já existia). Confirme as duas etiquetas na tela de etiquetas do
   Chatwoot. Nunca escreva o token no comando, no histórico, em log ou neste arquivo.
   - Reverter: apagar as etiquetas de teste na tela de etiquetas.
   - Em produção, repetir este passo uma vez por conta (Box e Bom Custo), somente na ativação (Passo 18).
   - Nota: o Chatwoot também aceita as etiquetas aplicadas por conversa mesmo sem a etiqueta de conta
     existir; a etiqueta de conta serve para aparecer na barra lateral.

## Passo 4 - Webhook de SAIR assinado (D-36)

1. No Chatwoot de teste, crie um **webhook de conta** apontando para
   `https://<backend-de-teste>/api/integrations/chatwoot/pesquisa/webhook`, com **apenas** o evento
   `message_created`.
2. Copie o segredo do webhook para `CHATWOOT_WEBHOOK_SECRET` no ambiente do backend de teste e reinicie
   o backend de teste.
3. **Esperado:** um SAIR enviado pelo WhatsApp de teste chega com `X-Chatwoot-Signature` válida e é
   aceito (HTTP 200). Assinatura ou timestamp inválidos respondem 401 sem efeito.
   - Reverter: apagar o webhook de teste.

## Passo 5 - Ligar a pesquisa

1. Abra `/configuracoes/pesquisa` no sistema de teste.
2. Confira os padrões da empresa (percentual, teto, compra mínima, teto mensal, prefixo), preencha o link
   do Google de **teste** (o host precisa estar na allowlist: `g.page`, `search.google.com`,
   `maps.google.com` ou `business.google.com`, sempre `https`), escolha a variante visual e os textos.
3. Salve com `ativo` LIGADO (a pesquisa nasce desligada; a tela é quem liga).
   - Reverter: desligar na mesma tela (não exige deploy).

## Passo 6 - Fechamento e link único

1. Tenha um orçamento de teste em status liberado (Passo 0) e a conversa de teste aberta.
2. Resolva a conversa no Chatwoot de teste.
3. **Esperado:** o WhatsApp de teste recebe a mensagem de encerramento com **UM** link
   `/pesquisa/<48 hex>` e **nenhuma outra mensagem com link**. A mensagem privada `input_csat` **não**
   chega ao WhatsApp (premissa A1) e aparece só na conversa do Chatwoot.
   - Reverter: reabrir a conversa de teste.

## Passo 7 - Roteamento do proxy público, limite por IP real e resposta

Antes de abrir o link, valide o **domínio público de teste** (`APP_BASE_URL`):

1. **Rota pública no proxy do Next** (deve chegar ao backend; a rota vive fora do prefixo de API de
   propósito):
   ```bash
   curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' \
     -X POST "$APP_BASE_URL/pesquisa/$(printf '0%.0s' $(seq 1 48))/responder" \
     -H 'Content-Type: application/json' -d '{"nota":5}'
   ```
   **Esperado:** `404` com `content-type: application/json` e corpo com estado `INDISPONIVEL` (resposta do
   backend via proxy do Next). Uma página HTML do nginx ou um 502 significa que o proxy não está
   chegando ao Next.
2. **Tela pública de link inexistente:**
   ```bash
   curl -sS "$APP_BASE_URL/pesquisa/$(printf '0%.0s' $(seq 1 48))"
   ```
   **Esperado:** HTTP 200 com a tela `Esta pesquisa não está mais disponível`.
3. **Limite por IP real:** mande 65 POSTs seguidos do mesmo IP ao endereço do item 1, contando os
   códigos de status.
   **Esperado:** 60 respostas `404` e, depois, `429`.
   Se o `429` começar por volta da 21ª requisição, o backend está vendo o IP do socket (balde
   compartilhado) em vez do IP real: confira quais cabeçalhos o proxy de borda envia (`x-real-ip`,
   `x-forwarded-for`) e corrija antes de seguir.
   - Reverter: nada; a janela do limite vence em 1 minuto.
4. **Resposta:** abra o link do Passo 6 no celular e envie **nota 2 com comentário**. Confira:
   - a tela de agradecimento com o cupom e o botão do Google (sem vínculo entre cupom e Google);
   - a nota privada na conversa;
   - as etiquetas `avaliou` e `csat-baixo`;
   - os atributos do contato (`ultima_nota_csat`, `data_ultima_avaliacao`, `cupom_ativo`,
     `cupom_validade`);
   - o WhatsApp do cupom **sem link** e, entre 60 e 180 s depois, o convite do Google com **UM** link e
     **sem nenhuma menção ao cupom**.

## Passo 8 - Relatório nativo (premissa A2)

1. Aguarde alguns segundos (a gravação do Chatwoot é assíncrona) e consulte
   `GET /api/v1/accounts/{conta}/csat_survey_responses` e a tela
   `/app/accounts/{conta}/reports/csat`.
2. **Esperado:** a nota 2 e o comentário aparecem no relatório.
3. **Se o relatório NÃO receber a nota:** aplicar o fallback do CONTEXT, definindo
   `PESQUISA_CSAT_NATIVO_ATIVO=false` (só nota privada, atributos e etiqueta) e registrar o achado.
   - Reverter: voltar `PESQUISA_CSAT_NATIVO_ATIVO=true` ou remover a linha, e reiniciar o backend de
     teste.

## Passo 9 - Segunda pesquisa na mesma conversa (D-28)

1. Repita o fechamento (resolvendo de novo a conversa de teste e contornando o limite diário de uma
   mensagem por dia pelo meio que o operador tiver, por exemplo uma conversa nova com o mesmo contato).
2. **Esperado:** **não** há segunda `input_csat`. A pesquisa nova existe só no nosso banco, com nota
   privada e etiquetas.
   - Reverter: nada.

## Passo 10 - SAIR (D-35, D-36)

1. Envie `SAIR` pelo WhatsApp de teste.
2. **Esperado:**
   - a linha em `PesquisaSupressao` (consulta somente de leitura no banco do sistema de teste);
   - um novo fechamento sai **sem** bloco de pesquisa;
   - a conversa resolvida **REABRIU** (esperado e aceito: comportamento nativo do Chatwoot para inbox de
     API, D-35).
   - Reverter: apagar a linha de supressão de teste se quiser repetir o cenário.

## Passo 11 - Balcão: resgate do cupom em `/cupons`

1. Em `/cupons`, busque o código do cupom emitido no Passo 7.
2. Informe um valor **abaixo do mínimo**: deve aparecer o erro visível (compra mínima).
3. Informe um valor válido: deve aparecer o resumo com o desconto calculado (% limitado ao teto).
4. Confirme o uso: deve aparecer o sucesso com o valor a lançar no Athos ou no PDV, **sem lançar nada de
   verdade**.
5. Tente dar baixa de novo: `409` com `Este cupom já foi usado`.
6. Teto mensal: baixe temporariamente o teto mensal na configuração de teste até o gasto do mês
   ultrapassá-lo; o resgate deve bloquear com `TETO_MENSAL` e o próximo fechamento deve usar o texto **sem
   recompensa**.
   - Reverter: restaurar o teto mensal e o estado do cupom de teste.

## Passo 12 - Teste A/B

1. Com a variante `Alternar`, abra vários links de pesquisa de teste.
2. **Esperado:** estrelas e carinhas aparecem; a mesma pesquisa mostra sempre a mesma variante ao
   recarregar.
3. Abra o painel Resultados e confira a marcação `Amostra pequena`.
   - Reverter: escolher outra variante na configuração, se quiser.

## Passo 13 - Backstop de UI: página pública em 320 px e comentário de 500 caracteres

Plano 52-02, executado **só no sistema de teste**.

1. Abra um link de pesquisa válido de teste com a janela em **320 px** de largura (celular ou ferramentas
   de desenvolvedor).
2. Cole um comentário de exatamente 500 caracteres. **Esperado:** o contador mostra `500/500` e não dá
   para digitar o 501º.
3. Confira que **não há rolagem horizontal**, que abaixo de 360 px as cinco opções de nota ficam em
   48 x 48 px com 4 px de espaço e que o botão `Enviar avaliação` continua visível.
4. Envie e confira que o código do cupom na tela de agradecimento cabe em 320 px sem corte.
   - Esperado: tudo sem rolagem horizontal. Reverter: nada.

## Passo 14 - Backstop de UI: gasto contra o teto (R$ 0, R$ 299,99, R$ 300,00 e R$ 412,00)

Plano 52-09, executado **SOMENTE no banco do sistema de TESTE**, nunca em produção.

1. Com o teto mensal em R$ 300,00 na configuração, abra Resultados e olhe o cartão `Gasto real no mês`.
2. Ajuste o desconto de um cupom USADO de teste (do mês atual) para cada valor, recarregando o painel:
   ```sql
   UPDATE "CupomRecompensa" SET "descontoAplicado" = 0 WHERE codigo = '<código de teste>';
   ```
   Repita com `299.99`, `300.00` e `412.00`.
3. **Esperado:**
   - a barra nunca passa de 100%; verde até 69%, amarela de 70% a 99%, vermelha a partir de 100%;
   - o texto `Teto atingido. Novos cupons estão suspensos até o mês seguinte.` aparece em R$ 300,00 e em
     R$ 412,00 e **não** aparece em R$ 299,99;
   - valor e teto sempre escritos (a cor não é a única informação).
   - Reverter: restaurar o `descontoAplicado` original do cupom de teste.

## Passo 15 - Backstop de UI: paginação com mais de 50 cupons

Plano 52-10, executado **SOMENTE no banco do sistema de TESTE**.

1. Gere 55 pesquisas e 55 cupons de teste:
   ```sql
   INSERT INTO "PesquisaSatisfacao" (id, token, "conversationId", telefone, variante, "expiraEm")
   SELECT gen_random_uuid()::text,
          substr(md5(random()::text) || md5(random()::text), 1, 48),
          900000 + g, '5512999990000', 'ESTRELAS', now() + interval '7 days'
   FROM generate_series(1, 55) g;
   ```
   ```sql
   INSERT INTO "CupomRecompensa" (id, codigo, "pesquisaId", telefone, percentual, teto,
                                  "compraMinima", "validadeAte")
   SELECT gen_random_uuid()::text,
          'TST-' || lpad((row_number() OVER ())::text, 6, '2'),
          id, '5512999990000', 10, 5, 30, now() + interval '30 days'
   FROM "PesquisaSatisfacao" WHERE "conversationId" > 900000;
   ```
   Antes, compare nomes e colunas obrigatórias com `\d "PesquisaSatisfacao"` e `\d "CupomRecompensa"` e
   ajuste se alguma coluna sem valor padrão faltar. Esses códigos servem só para a lista, não para a
   busca.
2. Abra `/cupons`. **Esperado:** a lista mostra 50 linhas, o botão `Carregar mais` acrescenta as
   restantes (55 ou mais no total) e o botão some quando acaba.
3. Trocar o filtro de situação recomeça a lista.
4. Abaixo de 992 px a tabela rola na horizontal **dentro do card** sem quebrar o layout, com as duas
   primeiras colunas fixas.
   - Reverter:
     ```sql
     DELETE FROM "CupomRecompensa" WHERE codigo LIKE 'TST-%';
     DELETE FROM "PesquisaSatisfacao" WHERE "conversationId" > 900000 AND telefone = '5512999990000';
     ```

## Passo 16 - Revogação de pesquisa (D-02)

Planos 52-12 e UI do 52-09.

1. Em `/configuracoes/pesquisa`, aba Resultados, escolha a resposta de teste que tem cupom disponível e
   clique `Revogar pesquisa`.
2. **Esperado:** confirmação inline `Revogar esta pesquisa? O link deixa de funcionar e, se houver cupom
   disponível, ele será cancelado. Esta ação não pode ser desfeita.`
3. `Cancelar` não muda nada.
4. `Confirmar revogação` mostra `Pesquisa revogada.` e `Cupom cancelado.`, a linha passa a mostrar
   `Revogada` sem o botão e o painel recarrega do servidor.
5. Em `/cupons`, o cupom aparece como `Cancelado` e tentar dar baixa nele devolve o erro de cupom
   cancelado.
6. Abra o link antigo `/pesquisa/<token>` no celular: `Esta pesquisa não está mais disponível` (a mesma
   tela de um link inexistente). Se o convite do Google ainda não tinha saído, ele não sai.
7. Repita a revogação numa pesquisa cujo cupom já foi USADO: mensagem
   `O cupom já havia sido usado e não foi alterado.` e o cupom continua `Já usado`.
   - Reverter: não existe desfazer; use uma pesquisa de teste descartável.

## Passo 17 - Registrar o resultado e assinar

1. Registre no fim deste arquivo: conversation id, nota, horário, achados de A1 e A2 e o resultado dos
   Passos 13 a 16.
2. Assine: nome, data e "homologado" (ou o achado aberto).

## Passo 18 - Ativação em produção (só depois da homologação assinada)

Por empresa, **uma de cada vez** (D-42: uma instância por empresa).

**Pré-condições obrigatórias:**

1. PR #75 conferido **por leitura** na implantação (Passo 0, item 1).
2. CSAT nativo **DESLIGADO** e verificado por leitura (`SELECT id, name, channel_type,
   csat_survey_enabled FROM inboxes`) nas inboxes WhatsApp, **inclusive a inbox 1 do Box**, que está
   ligada hoje.
3. Etiquetas `avaliou` e `csat-baixo` criadas na conta (Passo 3, token digitado na hora, nunca
   armazenado).
4. Webhook de SAIR criado e `CHATWOOT_WEBHOOK_SECRET` configurado.
5. Envs da fase 52 conferidas no servidor.
6. **Parecer jurídico** do responsável sobre a base legal da oferta de desconto pós-venda, o prazo de
   processamento do SAIR e a anonimização em 12 meses, informando que a anonimização cobre o banco do
   Sistema mas **NÃO** a nota privada, os atributos do contato, as etiquetas, a `input_csat` e o
   histórico que já estão no Chatwoot. **Sem o parecer, a pesquisa não liga e a retenção continua
   desligada (`PESQUISA_RETENCAO_ATIVA=false`).**

**Ordem:**

1. Deploy com a pesquisa **desligada**.
2. Conferir a tela `/configuracoes/pesquisa` (padrões da empresa e link do Google de produção).
3. Ligar pela tela.
4. Acompanhar o primeiro fechamento real e o relatório nativo.

**Reversão:**

1. Desligar na aba de configuração (sem deploy).
2. `PESQUISA_CSAT_NATIVO_ATIVO=false` como fallback do relatório nativo.

---

## Achados conhecidos aceitos

1. `SAIR` em conversa resolvida **reabre** a conversa (comportamento nativo do Chatwoot para inbox de
   API); aceito e documentado (D-35).
2. Mensagens agendadas (fechamento, cupom, convite) se perdem em reinício do backend; agendamento e fila
   são em memória.
3. Nota privada, atributos do contato e etiquetas são best-effort, sem re-tentativa; falha no Chatwoot
   nunca bloqueia a resposta do cliente nem o cupom.
4. Conversas com CSAT nativo antigo podem ligar o PUT à mensagem antiga (o PUT grava na primeira
   `input_csat` da conversa).
5. A anonimização de 12 meses **não alcança** a nota privada, os atributos do contato, as etiquetas, a
   `input_csat` e o histórico que já estão no Chatwoot; isso entra no pedido de parecer jurídico (D-38).
6. O limite por IP real depende de o proxy de borda enviar o IP do cliente (`x-real-ip` /
   `x-forwarded-for`); sem isso, todos os clientes compartilham o balde do proxy.
7. O sistema registra aviso no log quando encontra o CSAT nativo ligado na inbox, como segunda guarda
   além do passo manual.

## Observação sobre as mensagens pós-resposta (UI-D08)

O CONTEXT do desenvolvimento previa uma única mensagem de WhatsApp pós-resposta. O UI-SPEC (UI-D08,
confirmado pelo usuário) decidiu por **duas** mensagens: o cupom e, separado, o convite do Google, para
que o convite não pareça incentivado (política do Google) e para não levar dois links na mesma mensagem.
Este roteiro segue as duas.
