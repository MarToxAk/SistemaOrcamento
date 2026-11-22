---
phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google
plan: 11
subsystem: deploy-e-homologacao
tags: [deploy, docker-compose, env, homologacao, chatwoot, csat, parecer-juridico]

requires:
  - phase: 52-02
    provides: pagina publica /pesquisa/<token>, proxy do Next e rota /responder fora do prefixo de API
  - phase: 52-03
    provides: montarConfigPadrao com as envs PESQUISA_*_PADRAO e os valores de configuracao
  - phase: 52-06
    provides: webhook de SAIR com HMAC (CHATWOOT_WEBHOOK_SECRET) e job de retencao (PESQUISA_RETENCAO_ATIVA/MESES)
  - phase: 52-09
    provides: painel de resultados, tela de configuracao e revogacao de pesquisa
  - phase: 52-10
    provides: tela /cupons com paginacao e resgate
provides:
  - envs PESQUISA_* e CHATWOOT_WEBHOOK_SECRET nos dois composes e no stack.env.example, com padroes de Bom Custo e Box
  - 52-ROTEIRO-HOMOLOGACAO.md com os passos 0 a 18 (homologacao em Chatwoot de teste e ativacao em producao), sem segredos
affects:
  - ativacao em producao das duas empresas (Box e Bom Custo), condicionada ao roteiro assinado e ao parecer juridico
  - operador responsavel pela homologacao e pela ativacao

actuals:
  tokens: 7215
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - envs novas sempre nos tres arquivos de deploy, inseridas depois do bloco da fase anterior sem tocar envas existentes
    - segredo de webhook e token de administrador nunca versionados: compose com `${VAR:-}` e exemplo com chave vazia
    - homologacao documentada como roteiro do operador (acao, esperado, reverter) com pre-condicoes de leitura e ativacao por etapas reversivel

key-files:
  created:
    - .planning/phases/52-chatwoot-csat-com-recompensa-e-convite-do-google/52-ROTEIRO-HOMOLOGACAO.md
  modified:
    - deploy/docker-compose.vps.yml
    - deploy/docker-compose.box.vps.yml
    - deploy/stack.env.example

key-decisions:
  - "As envs da fase 52 entram depois de CHATWOOT_FECHAMENTO_ATRASO_MAX_S (bloco da fase 51) nos dois composes, sem alterar nenhuma linha existente, incluindo o bloco CHATWOOT_AUTOMATION_*/CHATWOOT_AI_* do PR #75."
  - "Padroes por empresa: Bom Custo 10/5/30/300/BC e Box 10/2/6/300/BOX; PESQUISA_CSAT_NATIVO_ATIVO=true, PESQUISA_RETENCAO_ATIVA=false e PESQUISA_RETENCAO_MESES=12 em ambos."
  - "Nenhuma env de token de administrador do Chatwoot: as etiquetas avaliou e csat-baixo sao criadas a mao no roteiro, com read -rs e unset imediato."
  - "O roteiro usa os numeros de passo do plano (Passo 0 a Passo 18) e cobre roteamento do proxy publico, limite por IP real, A/B, backstops de UI e revogacao, com o fallback PESQUISA_CSAT_NATIVO_ATIVO=false."
  - "A anonimizacao de 12 meses e declarada como limitada ao banco do Sistema, nao ao Chatwoot, e isso entra no pedido de parecer juridico antes de ligar em producao."

patterns-established:
  - "Roteiro de homologacao executavel: cada passo com Acao, Esperado e Reverter, pre-condicoes somente de leitura e ativacao em producao por empresa com reversao sem deploy."
  - "Gate de segredo por grep: composes com ${VAR:-}, exemplo com chave vazia e zero ocorrencias de token de administrador nos arquivos versionados."

requirements-completed: []

coverage:
  - id: D1
    description: "Envs PESQUISA_* e CHATWOOT_WEBHOOK_SECRET nos dois composes e no stack.env.example, com padroes por empresa e sem segredos"
    verification:
      - kind: other
        ref: "python3 -c 'import yaml; yaml.safe_load(...)' deploy/docker-compose.box.vps.yml deploy/docker-compose.vps.yml + gates grep das acceptance_criteria (13/13)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Roteiro de homologacao em Chatwoot de teste e checklist de ativacao em producao, com passos 0 a 18"
    verification:
      - kind: manual_procedural
        ref: "operador executa 52-ROTEIRO-HOMOLOGACAO.md em Chatwoot de teste local e assina o resultado"
        status: unknown
    human_judgment: true
    rationale: "Depende de um Chatwoot de teste, de WhatsApp real da equipe e de leitura de telas; nenhuma rotina automatizada alcanca a cadeia completa sem tocar a producao"

metrics:
  duration: "~12min"
  started: "2026-11-22T18:53:00Z"
  completed: "2026-11-22T19:06:00Z"
  tasks: 2
  files: 4
  commits: 2
  plan_head_before: 7060cb389d801d20a8a72f611ffd36e119a97d79
  plan_head_after: 2d1d1667541368d54d466e99197e60eeee710735
---

# Phase 52 Plan 11: Envs de deploy e roteiro de homologação/ativação

**As nove envs da pesquisa (com padrões distintos de Bom Custo e Box) entram nos três arquivos de deploy sem tocar envas existentes e sem segredo versionado, e o roteiro de 19 passos prova a cadeia completa em Chatwoot de teste antes da ativação por etapas em produção.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-11-22T18:53:00Z
- **Completed:** 2026-11-22T19:06:00Z
- **Tasks:** 2
- **Files modified:** 4 (1 criado, 3 modificados)
- **Verificação:** YAML dos dois composes válido; 13/13 gates grep da Task 1; 14/14 gates grep do roteiro; suíte completa do backend 99 suítes / 1648 testes verdes (2 suítes e 28 testes pulados por configuração); `tsc --noEmit` do backend e do frontend sem erros.

## Accomplishments

- `deploy/docker-compose.vps.yml` (Bom Custo) e `deploy/docker-compose.box.vps.yml` (Box) recebem, logo após `CHATWOOT_FECHAMENTO_ATRASO_MAX_S`, o bloco da fase 52: `PESQUISA_PERCENTUAL_PADRAO`, `PESQUISA_TETO_PADRAO`, `PESQUISA_COMPRA_MINIMA_PADRAO`, `PESQUISA_TETO_MENSAL_PADRAO`, `PESQUISA_PREFIXO_PADRAO`, `PESQUISA_CSAT_NATIVO_ATIVO` (só `false` desliga), `PESQUISA_RETENCAO_ATIVA` (só `true` liga), `PESQUISA_RETENCAO_MESES` e `CHATWOOT_WEBHOOK_SECRET` (padrão vazio). Padrões: Bom Custo 10/5/30/300/BC; Box 10/2/6/300/BOX.
- `deploy/stack.env.example` ganha o bloco documentado com os valores de exemplo do Bom Custo, o segredo com `CHATWOOT_WEBHOOK_SECRET=` sem valor e comentários sobre o Box, o fallback do CSAT nativo, a dependência do parecer jurídico, o CSAT nativo das inboxes e o PR #75 já na base.
- Nenhuma env existente foi alterada (diff só de inserções: 63 linhas) e não existe `CHATWOOT_ADMIN_API_TOKEN` em nenhum arquivo.
- `52-ROTEIRO-HOMOLOGACAO.md` cobre o Passo 0 (PR #75 somente de leitura, status, envs, migração, `APP_BASE_URL`), Passos 1 a 4 (Chatwoot de teste, CSAT nativo, etiquetas com `read -rs`/`unset TOKEN_ADMIN`, webhook de SAIR em `pesquisa/webhook`), Passos 5 a 12 (ligar, fechamento, roteamento e limite por IP real com `x-real-ip`, relatório nativo com fallback `PESQUISA_CSAT_NATIVO_ATIVO=false`, segunda pesquisa, SAIR, resgate, A/B), Passos 13 a 16 (320 px/500 caracteres, gasto R$ 0 a 412,00 com 299.99, paginação com `Carregar mais`, `Revogar pesquisa`), Passo 17 (assinatura) e Passo 18 (ativação com parecer jurídico e reversão).
- O arquivo registra os achados aceitos (SAIR reabre a conversa, mensagens agendadas se perdem em reinício, best-effort, limite por IP real) e a divergência UI-D08 (duas mensagens pós-resposta em vez de uma).

## Task Commits

1. **Task 1: Envs da fase 52 nos composes e no exemplo** - `b16ce10` (feat)
2. **Task 2: Roteiro de homologação e ativação + gate da fase** - `2d1d166` (docs)

**Plan metadata:** commit do SUMMARY (docs).

## Files Created/Modified

- `deploy/docker-compose.vps.yml` - bloco de envs da fase 52 com padrões do Bom Custo, após o bloco da fase 51.
- `deploy/docker-compose.box.vps.yml` - bloco equivalente com padrões do Box.
- `deploy/stack.env.example` - bloco documentado da fase 52, segredo sem valor e comentários de operação.
- `.planning/phases/52-chatwoot-csat-com-recompensa-e-convite-do-google/52-ROTEIRO-HOMOLOGACAO.md` - roteiro manual de homologação e ativação (19 passos).

## Decisions Made

- A inserção foi feita imediatamente após `CHATWOOT_FECHAMENTO_ATRASO_MAX_S`, preservando o bloco `CHATWOOT_AUTOMATION_*`/`CHATWOOT_AI_*` do PR #75 e a ordem dos serviços.
- O roteiro adota os números do plano (Passo 0 a Passo 18) para rastreabilidade com as acceptance_criteria, em vez de renumerar os 10 passos do VALIDATION.md.
- O passo de ativação em produção exige o parecer jurídico cobrindo também o que a anonimização não alcança (nota privada, atributos, etiquetas, `input_csat` e histórico no Chatwoot).
- O gate automatizado da Task 2 (suíte completa e os dois `tsc`) foi executado neste worktree, com a resolução de módulos subindo até `/root/SistemaOrcamento/node_modules`, sem alteração de código.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- O worktree não tem `node_modules` próprio; jest e tsc foram executados a partir do `node_modules` da raiz do monorepo (mesma abordagem dos planos 52-05, 52-06, 52-07 e 52-12). Nenhuma alteração de código foi necessária.

## User Setup Required

O roteiro é do operador, não de um agente: `52-ROTEIRO-HOMOLOGACAO.md` precisa ser executado por uma pessoa em um Chatwoot de teste local antes da ativação. Segredos (`CHATWOOT_WEBHOOK_SECRET`) ficam nas variáveis do servidor; o token de administrador é digitado na hora e nunca armazenado.

## Known Stubs

Nenhum. Os arquivos de deploy estão completos e o roteiro é executável; não há placeholder, valor secreto, TODO ou FIXME.

## Threat Flags

Nenhum além do `threat_model` do plano. T-52-56 mitigado (composes com `${VAR:-}`, exemplo com chave vazia e 13 gates grep); T-52-72 mitigado (`read -rs`, uso pontual no `curl` das etiquetas, `unset TOKEN_ADMIN` e zero env de token de administrador); T-52-57/58/59 mitigados (pesquisa nasce desligada, roteiro em Chatwoot de teste com número da equipe, conferência de leitura do CSAT nativo e nada escreve no Athos). Nenhum segredo foi inserido no repositório.

## Next Phase Readiness

- As envs estão prontas para subir nos dois stacks; a pesquisa continua desligada até a homologação assinada.
- O gate manual restante da fase é o roteiro executado e assinado pelo operador, mais o parecer jurídico antes de ligar em produção.
- `STATE.md` e `ROADMAP.md` não foram tocados (o orquestrador atualiza após o merge).

---

*Phase: 52-chatwoot-csat-com-recompensa-e-convite-do-google*
*Completed: 2026-11-22*

## Self-Check: PASSED

- `deploy/docker-compose.vps.yml`, `deploy/docker-compose.box.vps.yml`, `deploy/stack.env.example` e `52-ROTEIRO-HOMOLOGACAO.md` existem no disco e nos commits `b16ce10` e `2d1d166` (ancestrais de HEAD).
- `git rev-list --count 7060cb3..HEAD` = 2 (uma por task).
- YAML dos composes válido; 13/13 gates da Task 1 e 14/14 do roteiro.
- `jest --no-coverage`: 99 suítes, 1648 testes verdes; `tsc --noEmit` backend e frontend sem erros.
- STATE.md e ROADMAP.md não foram tocados.
