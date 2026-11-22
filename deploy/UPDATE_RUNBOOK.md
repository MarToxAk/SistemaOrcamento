# Runbook de Update - Stack VPS

## Pre-check

1. Confirmar acesso ao host VPS e permissao para executar Docker.
2. Confirmar que o arquivo de ambiente da stack esta atualizado.
3. Confirmar imagem alvo de backend/frontend e disponibilidade no registry.
4. Validar stack atual:
   - `docker compose -f deploy/docker-compose.vps.yml ps`
   - `docker compose -f deploy/docker-compose.vps.yml logs backend --tail=80`

Criterio de falha imediata:
- Container backend em restart loop antes do update.
- Erros recorrentes de banco/rede nos logs sem acao de mitigacao definida.

## Update passo a passo

1. Atualizar imagens:
   - `docker compose -f deploy/docker-compose.vps.yml pull`
2. Aplicar update da stack:
   - `docker compose -f deploy/docker-compose.vps.yml up -d`
3. Verificar estado dos containers:
   - `docker compose -f deploy/docker-compose.vps.yml ps`
4. Inspecionar logs do backend apos subida:
   - `docker compose -f deploy/docker-compose.vps.yml logs backend --tail=120`

Criterio de sucesso:
- Backend e frontend em estado running.
- Sem erro `DB_READINESS_FAILED` ou `MIGRATION_DEPLOY_FAILED` nos logs do backend.

## Validacao imediata

1. Confirmar backend ativo via endpoint de health:
   - `curl -i http://localhost:4001/health`
   - fallback: `curl -i http://localhost:4001/api/health`
2. Confirmar que nao ha loop de restart:
   - `docker compose -f deploy/docker-compose.vps.yml ps`
3. Confirmar logs sem erro critico de startup/migration:
   - `docker compose -f deploy/docker-compose.vps.yml logs backend --tail=120`

## Rollback tatico

Quando usar:
- Backend em loop de restart apos update.
- Falha de migration nao transitiva apos tentativas de recovery.

Passos:
1. Ajustar `BACKEND_IMAGE` e `FRONTEND_IMAGE` para ultima tag estavel conhecida no arquivo de ambiente.
2. Reaplicar stack:
   - `docker compose -f deploy/docker-compose.vps.yml pull`
   - `docker compose -f deploy/docker-compose.vps.yml up -d`
3. Revalidar:
   - `docker compose -f deploy/docker-compose.vps.yml ps`
   - `docker compose -f deploy/docker-compose.vps.yml logs backend --tail=120`

## Troubleshooting rapido

- Erro de readiness (`DB_READINESS_FAILED`):
  - Revisar `DATABASE_URL`, status do Postgres e conectividade de rede interna.
- Erro de migration (`MIGRATION_DEPLOY_FAILED`):
  - Revisar migrations pendentes e logs do backend para detalhe tecnico.
- Health endpoint sem 200:
  - Verificar se backend iniciou completamente e se a rota de health esta acessivel.

## Chatwoot: etiquetas e mensagem de fechamento (Fase 51)

1. PRE-CONDICAO: o PR #75 (variaveis `CHATWOOT_AUTOMATION_*` e `CHATWOOT_AI_*` no servico backend) precisa estar implantado antes
   desta fase. Sem ele o webhook de fechamento nao funciona nos composes. Conferir antes do update:
   - `git merge-base --is-ancestor 3709ae5 origin/main || git grep -q CHATWOOT_AUTOMATION_WEBHOOK_TOKEN origin/main -- deploy/stack.env.example`
2. Valor de producao: no arquivo de ambiente do servidor, `CHATWOOT_AUTOMATION_STATUS_FECHAMENTO=PRONTO_PARA_ENTREGA,ENTREGUE,ENVIADO,CANCELADO`.
   O padrao do PR #75 e `ENTREGUE,ENVIADO,CANCELADO` e bloquearia (reabriria com nota) o fechamento de conversas em
   PRONTO_PARA_ENTREGA.
3. Envs novas (ja nos dois composes, com os padroes do codigo; so preencher para mudar): `CHATWOOT_ETIQUETAS_ATIVAS=true`,
   `CHATWOOT_CLIENTE_FREQUENTE_MIN=3`, `CHATWOOT_CLIENTE_FREQUENTE_MESES=6`, `CHATWOOT_FECHAMENTO_ATRASO_MIN_S=45`,
   `CHATWOOT_FECHAMENTO_ATRASO_MAX_S=180` (teto de 900 s; valor invalido volta ao padrao).
4. Atualizar ou reiniciar o backend descarta as mensagens de encerramento ainda agendadas (no maximo cerca de 3 minutos de espera
   por conversa). As etiquetas nao se perdem, porque sao aplicadas na hora, antes da espera. Evite reiniciar em horario de pico
   de atendimento.
5. Conferir o agendamento no log do backend (apos resolver uma conversa de teste):
   - `docker compose -f deploy/docker-compose.vps.yml logs backend --tail=200 | grep "Mensagem de fechamento agendada"`
   - a linha traz so `conversationId` e `atrasoMs`; motivos de descarte aparecem como `Mensagem de fechamento nao enviada ... motivo=`
     (`reaberta`, `resposta_nova`, `mensagens_indeterminadas`, `falha_recheck`).
6. Desligar as etiquetas: definir `CHATWOOT_ETIQUETAS_ATIVAS=false` no arquivo de ambiente e reaplicar o servico backend
   (`docker compose -f deploy/docker-compose.vps.yml up -d backend`). Isso desliga a sincronizacao por status do orcamento (fase e
   cliente-frequente). O fechamento de conversa continua gravando `finalizado` (e `cliente-frequente` quando aplicavel) e enviando a
   mensagem; para desligar o fechamento, retire o webhook de automacao no Chatwoot.
7. O agendamento e a fila de escrita de etiquetas sao em memoria e supoem uma unica instancia do backend por tenant. Se escalar para
   mais de uma instancia, mensagens de encerramento podem duplicar e a ordem das escritas de etiquetas deixa de ser garantida.
8. Sem backfill: as etiquetas aparecem a partir da proxima troca de status de cada orcamento; conversas antigas nao sao retroativas.
9. As 10 etiquetas de conta (`orcamento-pendente`, `orcamento-enviado`, `pagamento-parcial`, `aprovado`, `em-producao`,
   `pronto-entrega`, `entregue`, `cancelado`, `finalizado`, `cliente-frequente`) ja existem nos dois Chatwoots; o codigo nunca as cria e
   tolera etiqueta inexistente (a falha vira aviso no log, sem derrubar o fluxo).
10. Comportamentos conhecidos (aceitos nesta fase):
    - `finalizado` so sai pelo re-check de reabertura (dentro da janela do atraso) ou manualmente; se a conversa for reaberta depois do
      disparo ou de um reinicio, ele permanece ate o operador remove-lo ou o proximo fechamento.
    - Se o status do orcamento mudar depois do fechamento (por exemplo ENVIADO para APROVADO por pagamento), a etiqueta da fase aparece
      ao lado de `finalizado`.
    - Se o cliente responder e o Chatwoot ainda reportar a conversa como resolvida, so a despedida e descartada; as etiquetas ficam.
11. Roteiro de homologacao manual: `.planning/phases/51-chatwoot-etiquetas-por-fase-cliente-frequente-e-delay-humano/51-ROTEIRO-HOMOLOGACAO.md`.

## Checklist pos-deploy

1. Executar script de verificacao:
   - `powershell -ExecutionPolicy Bypass -File scripts/verify-deploy-health.ps1`
2. Esperado:
   - containers essenciais running
   - logs sem `DB_READINESS_FAILED` e `MIGRATION_DEPLOY_FAILED`
   - endpoint health com HTTP 200
