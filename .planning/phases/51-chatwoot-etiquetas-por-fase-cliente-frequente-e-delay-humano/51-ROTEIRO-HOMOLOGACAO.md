# Fase 51 - Roteiro de homologação manual: etiquetas por fase, cliente frequente e mensagem de fechamento

**Quem executa:** somente o operador (Diego). Nenhum agente executa este roteiro, altera env de produção, reinicia container ou
chama o Chatwoot real. Executar **uma vez em cada instalação** (Box e Bom Custo). Cada passo traz ação, resultado esperado e como
reverter.

**O que a fase faz:**

- A cada troca de status de um orçamento com conversa do Chatwoot (criação, envio ao cliente, mudança manual, lote, pagamento PIX e
  cartão da EFI), a conversa recebe a etiqueta da fase; etiquetas manuais são preservadas.
- Cliente com 3 ou mais pedidos concretizados (aprovado, em produção, pronto para entrega, entregue) nos últimos 6 meses recebe
  `cliente-frequente` (a etiqueta permanece na conversa finalizada).
- Ao resolver uma conversa liberada: `finalizado` (+ `cliente-frequente`) na hora, e a mensagem de encerramento sai depois de um
  atraso aleatório (padrão 45 a 180 s). Conversa com pedido pendente é reaberta com nota privada, sem mexer em etiquetas.

**Regras deste roteiro:**

- Use **cotações e conversas de teste**. Nunca use cotações de clientes reais sem avisar o cliente e a equipe: a mensagem de
  encerramento é enviada ao cliente de verdade.
- O token do Chatwoot (`CHATWOOT_API_TOKEN`) fica só em variável de ambiente no servidor. **Nunca cole o token em chat, em log, em
  commit ou neste arquivo.**
- Nada aqui escreve no Athos.

**Etiquetas de conta esperadas (as 10 foram verificadas e criadas em 2026-11-21):** `orcamento-pendente`, `orcamento-enviado`,
`pagamento-parcial`, `aprovado`, `em-producao`, `pronto-entrega`, `entregue`, `cancelado`, `finalizado`, `cliente-frequente`.

| Status do orçamento | Etiqueta da fase |
|---|---|
| PENDENTE | `orcamento-pendente` |
| ENVIADO | `orcamento-enviado` |
| PAGAMENTO_PARCIAL | `pagamento-parcial` |
| APROVADO | `aprovado` |
| EM_PRODUCAO | `em-producao` |
| PRONTO_PARA_ENTREGA | `pronto-entrega` |
| ENTREGUE | `entregue` |
| CANCELADO | `cancelado` |

---

## Passo 0 - Pré-condições (não pule)

1. **PR #75 implantado** (branch `fix/compose-chatwoot-automation-env`, commit `3709ae5`): ele entrega `CHATWOOT_AUTOMATION_*` e
   `CHATWOOT_AI_*` ao container. Conferir no repositório:
   `git merge-base --is-ancestor 3709ae5 origin/main || git grep -q CHATWOOT_AUTOMATION_WEBHOOK_TOKEN origin/main -- deploy/stack.env.example`
   (sem saída de erro = presente). Sem ele, o webhook de fechamento não funciona nos composes.
2. **Lista de status que liberam o fechamento no ambiente do servidor:**
   `CHATWOOT_AUTOMATION_STATUS_FECHAMENTO=PRONTO_PARA_ENTREGA,ENTREGUE,ENVIADO,CANCELADO`. O padrão do PR #75
   (`ENTREGUE,ENVIADO,CANCELADO`) bloquearia conversas em PRONTO_PARA_ENTREGA.
3. **Envs novas presentes** (os composes já as repassam com os padrões): `CHATWOOT_ETIQUETAS_ATIVAS=true`,
   `CHATWOOT_CLIENTE_FREQUENTE_MIN=3`, `CHATWOOT_CLIENTE_FREQUENTE_MESES=6`, `CHATWOOT_FECHAMENTO_ATRASO_MIN_S=45`,
   `CHATWOOT_FECHAMENTO_ATRASO_MAX_S=180`.
4. **Conferência SOMENTE LEITURA das 10 etiquetas de conta:** pela tela de etiquetas do Chatwoot (Configurações > Etiquetas) ou por
   GET em `/api/v1/accounts/{conta}/labels`. Todas as 10 devem existir, com esses nomes exatos.
   - Reverter: nada a reverter (somente leitura). Se faltar alguma, crie-a manualmente na tela de etiquetas com o nome exato.

## Passo 1 - SONDA SOMENTE DE LEITURA da premissa A3 (antes de ativar o fechamento)

O re-check do fechamento depende do formato de `created_at` e de `message_type` na resposta de `GET conversations/:id`. Confirme:

1. Escolha uma conversa de teste **já resolvida**.
2. No servidor, com `CHATWOOT_BASE_URL`, `CHATWOOT_ACCOUNT_ID` e `CHATWOOT_API_TOKEN` lidos do ambiente (nunca colados em chat nem
   em log), faça um **GET** em `/api/v1/accounts/{conta}/conversations/{id}`.
3. Confira, sem imprimir o token:
   - o campo `status` é `resolved`;
   - `messages` é uma **lista**;
   - `created_at` é inteiro em **segundos** (ou outro formato, registre qual);
   - `message_type` das mensagens de entrada (cliente) é `0` (ou `"incoming"`) e o das de saída é `1`.
4. **Resultado esperado:** formato igual ao acima. **Se o formato diferir, NÃO ative o fechamento** e registre o achado (o código
   trata formato desconhecido como "indeterminado" e descarta a despedida, o que é seguro mas inutiliza a mensagem).
   - Reverter: nada (somente leitura).

## Passo 2 - Troca de status com etiqueta manual

1. Em uma conversa de teste, adicione uma etiqueta manual qualquer (ex.: `teste-manual`).
2. Num orçamento de teste vinculado à conversa, troque o status (ex.: PENDENTE para APROVADO).
3. **Esperado:** a etiqueta da fase muda (some a anterior, entra `aprovado`) e `teste-manual` permanece.
   - Reverter: remova as etiquetas de teste na tela da conversa.

## Passo 3 - Cliente frequente

1. Use um cliente de teste com **3 pedidos concretizados nos últimos 6 meses** (aprovado, em produção, pronto para entrega ou
   entregue; enviado e cancelado não contam).
2. Troque o status de um orçamento dele que tenha conversa.
3. **Esperado:** a conversa recebe a etiqueta da fase **e** `cliente-frequente`. Com 2 pedidos, apenas a da fase.
   - Reverter: remova `cliente-frequente` manualmente se necessário.

## Passo 4 - Troca em lote

1. Selecione dois orçamentos de teste de **conversas diferentes** e troque o status em lote.
2. **Esperado:** as duas conversas ficam com a etiqueta da fase correta, sem etiqueta trocada entre elas e sem erro no log.
   - Reverter: restaure os status e remova as etiquetas de teste.

## Passo 5 - Pagamento e envio ao cliente

1. Em um orçamento de teste, confirme um pagamento (PIX de teste ou conciliação): a etiqueta acompanha o novo status
   (`pagamento-parcial` ou `aprovado`).
2. Envie o orçamento de teste ao cliente (status ENVIADO): a conversa recebe `orcamento-enviado`.
3. **Esperado:** etiquetas atualizadas logo após cada ação, sem atrasar a mensagem ao cliente.
   - Reverter: restaure o status e remova as etiquetas de teste.

## Passo 6 - Resolver conversa com status liberado

1. Orçamento de teste em ENTREGUE (ou outro status da lista do Passo 0) e conversa aberta. Resolva a conversa.
2. **Esperado:** na hora a conversa fica **só** com `finalizado` (+ `cliente-frequente` se o cliente for frequente); todas as demais
   etiquetas, inclusive manuais, somem (D-06). A mensagem de encerramento chega **entre 45 e 180 s depois**, uma só.
3. No log do backend: linha `Mensagem de fechamento agendada conversationId=... atrasoMs=...`.
   - Reverter: reabra a conversa e recoloque as etiquetas desejadas.

## Passo 7 - Resolver conversa com status bloqueado

1. Orçamento de teste em EM_PRODUCAO (fora da lista). Resolva a conversa.
2. **Esperado:** a conversa **reabre**, recebe a nota privada de pedido pendente, e a etiqueta da fase é mantida (nenhuma etiqueta
   muda). Nenhuma mensagem ao cliente.
   - Reverter: nada além de apagar a nota privada, se quiser.

## Passo 8 - Resolver e reabrir antes do prazo

1. Resolva uma conversa liberada e **reabra-a em menos de 45 s**.
2. **Esperado:** a mensagem **não sai**; `finalizado` some e voltam a etiqueta da fase e `cliente-frequente` (quando aplicável).
   Log: `motivo=reaberta`.
   - Reverter: ajuste etiquetas manualmente se necessário.

## Passo 9 - Resolver e o cliente responde antes do prazo

1. Resolva uma conversa liberada; antes do prazo, o cliente de teste manda uma mensagem.
2. **Esperado:** a mensagem de encerramento **não sai** (log `motivo=resposta_nova`). As etiquetas ficam como estão.
   - Reverter: reabra a conversa se quiser continuar o atendimento.

## Passo 10 - Repetir a resolução no mesmo dia

1. Na mesma conversa do Passo 6, reabra e resolva de novo no mesmo dia.
2. **Esperado:** as etiquetas são aplicadas novamente, **sem segunda mensagem** (limite de uma por dia).
   - Reverter: nada.

## Passo 11 - Opcional: reinício entre a resolução e o prazo

1. Resolva uma conversa liberada e reinicie o backend antes de passar o atraso.
2. **Esperado:** a mensagem **se perde** (aceito, D-12/D-24); as etiquetas já aplicadas ficam.
   - Reverter: nada. Só faça fora do horário de atendimento.

## Passo 12 - Desligar as etiquetas

1. Defina `CHATWOOT_ETIQUETAS_ATIVAS=false` no ambiente do servidor e reaplique o serviço backend.
2. Troque o status de um orçamento de teste com conversa.
3. **Esperado:** **nenhuma etiqueta muda** com a troca de status. Atenção: o kill-switch cobre a sincronização por status; resolver
   conversa continua gravando `finalizado` (e `cliente-frequente`) e enviando a mensagem.
   - Reverter: volte `CHATWOOT_ETIQUETAS_ATIVAS=true` (ou remova a linha) e reaplique o backend.

---

## Ordem recomendada de ativação

1. Implantar o PR #75 e ajustar `CHATWOOT_AUTOMATION_STATUS_FECHAMENTO` (Passo 0).
2. Implantar esta fase com `CHATWOOT_ETIQUETAS_ATIVAS=true` (padrão) em horário de baixo atendimento.
3. Passo 1 (sonda de leitura) antes de qualquer teste de fechamento.
4. Passos 2 a 5 (etiquetas por status) e, depois, 6 a 10 (fechamento), primeiro na Box e depois no Bom Custo.
5. Sem backfill (D-17): conversas antigas só recebem etiquetas a partir da próxima troca de status do orçamento.

## Comportamentos conhecidos (aceitos nesta fase)

1. `finalizado` só sai pelo re-check de reabertura (dentro da janela do atraso) ou manualmente.
2. Se o status do orçamento mudar depois do fechamento (ex.: ENVIADO para APROVADO por pagamento), a etiqueta da fase aparece ao
   lado de `finalizado`.
3. Se a conversa for reaberta **depois** de a mensagem ter disparado (ou depois de um reinício), `finalizado` permanece até o
   operador removê-lo ou até o próximo fechamento.
4. Se o cliente responder e o Chatwoot ainda reportar a conversa como resolvida, só a despedida é descartada; as etiquetas ficam.
5. A mensagem agendada se perde em reinício do backend; agendamento e fila são em memória (instância única por tenant).
6. O kill-switch `CHATWOOT_ETIQUETAS_ATIVAS=false` não desliga a gravação de `finalizado` no fechamento da conversa.
