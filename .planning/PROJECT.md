# Sistema de Orcamento BomCusto

## What This Is

Sistema interno de gestao de orcamentos da Bom Custo (Ilhabela-SP). Cobre o ciclo completo: criacao de orcamentos, aprovacao por link publico, cobranca PIX, emissao de NFS-e e comunicacao via Chatwoot. Operacao estavel em ambientes Docker com fluxo de migration confiavel e procedimentos de update reproduziveis.

## Core Value

Orcamentos criados, aprovados e cobrados sem intervencao manual, com integracoes confiaveis e observaveis.

## Current State

Milestone em andamento: v1.9 - Webhook EFI PIX e Robustez de URLs.

Estado atual validado:
- Busca de cliente Athos por nome/documento/idcliente entregue no backend.
- Emissao de NFS-e com clienteAthosId explicito e resolucao prioritaria de tomador.
- Modal frontend com busca/selecao de cliente e envio de clienteAthosId no payload.
- Observabilidade com logs Tomador-A/B/C e Athos-busca.
- Testes e builds de frontend/backend executados com sucesso no fechamento.

## Last Shipped Milestone: v1.8 - Busca de Cliente Athos para NFS-e

Shipped em 2026-05-05.

Entregas principais:
- API interna de busca de clientes Athos com paginacao e validacoes.
- Resolucao deterministica de tomador por cliente selecionado na emissao NFS-e.
- UX do modal NFS-e com busca/selecao e preenchimento assistido.
- Logs estruturados e cobertura de testes PF/PJ/falhas de resolucao.

## Current Milestone: v1.9

Phase 22: Corrigir getWebhookUrl() no EFI Service (retornar URL com sufixo /pix) e tratar NFSE_SOAP_URL vazia no NfseService.
- EFIWH-01: getWebhookUrl() com /pix
- EFIWH-02: NfseService trata string vazia em URL
- EFIWH-03: Testes unitários cobrindo /pix
## Requirements

### Validated

- checkmark Criacao de orcamentos com itens e carimbos -- fase 0
- checkmark Geracao de PDF e upload MinIO -- fase 0
- checkmark Envio via Chatwoot + link de aprovacao por token -- fase 0
- checkmark Emissao de NFS-e via SOAP iiBrasil -- fase 0
- checkmark Cobranca PIX via EFI Pay com webhooks -- fase 0
- checkmark Integracao read-only Athos ERP e PDV -- fase 0
- checkmark Deploy CI/CD via GitHub Actions + VPS Tailscale -- fase 0
- checkmark Autenticacao global via x-internal-api-key + guard NestJS -- v1.0
- checkmark Webhooks EFI validados com HMAC-SHA256 -- v1.0
- checkmark Fail-fast de variaveis de ambiente criticas -- v1.0
- checkmark Rate limiting global -- v1.0
- checkmark Logger estruturado em todas as integracoes -- v1.0
- checkmark enviarParaCliente assicrono (fire-and-forget) -- v1.0
- checkmark pg.Pool para Athos (max 5 conexoes) -- v1.0
- checkmark Health check com status das integracoes -- v1.0
- checkmark Maquina de estados integra (approveByToken via changeStatus) -- v1.0
- checkmark Paginacao take=50, max 200, retorna total -- v1.0
- checkmark isAssociated como campo booleano real no response -- v1.0
- checkmark Testes automatizados Jest + CI GitHub Actions -- v1.1
- checkmark Paginas publicas de aprovacao e status aprimoradas -- v1.2
- checkmark Mensagens automaticas Chatwoot por eventos -- v1.2
- checkmark Fluxo de migration confiavel no Docker Compose -- v1.3
- checkmark Webhook EFI sem HMAC obrigatorio + idempotencia -- v1.4
- checkmark Conciliacao Athos real (verificarPagamentoPorOrcamento) -- v1.4
- checkmark Fire-and-forget checagem Athos em getById/enviarParaCliente -- v1.4
- checkmark Desconto controlado (percentual/valor) na emissao NFS-e -- v1.4
- checkmark Encoding UTF-8 correto nas strings de servico NFS-e -- v1.5
- checkmark Proxy Next.js NFS-e repassa body do POST ao backend -- v1.5
- checkmark UI de desconto bidirecional no modal de emissao NFS-e -- v1.5
- checkmark Campo valor total no modal NFS-e pre-preenchido com total real do orcamento -- v1.6
- checkmark Calculo de desconto bidirecional funcionando com base correta -- v1.6
- checkmark Valor pos-desconto enviado corretamente ao backend e ao SOAP da NFS-e -- v1.6
- checkmark ProximoRPS sem +1 -- API iiBrasil retorna proximo numero diretamente -- v1.7
- checkmark buscarTomador() com NotFoundException catch e clienteId > 0 -- v1.7
- checkmark Logs [Tomador] diagnosticos e [Athos] identifierColumn -- v1.7
- checkmark Busca de cliente Athos para NFS-e por nome, CPF/CNPJ e idcliente -- v1.8
- checkmark Selecao explicita de cliente Athos no fluxo de emissao NFS-e -- v1.8
- checkmark Resolucao deterministica do tomador com dados PF/PJ/endereco -- v1.8
- checkmark Validacoes e mensagens de erro claras para cliente inexistente ou dados incompletos -- v1.8
- checkmark Testes automatizados cobrindo mapeamento de cliente e emissao com cliente selecionado -- v1.8

### Active

- [ ] Definir requisitos funcionais do proximo milestone (v1.9)
- [ ] Consolidar politica de auditoria de milestone antes de ship

### Out of Scope

- Reintroduzir n8n para roteamento de pagamentos
- Listener PG LISTEN/NOTIFY externo ao backend principal
- Recalculo retroativo de NFS-e ja emitida
- Refactor completo de dominio de orcamentos
- Troca de ORM (Prisma permanece)
- Mudanca de provedor de banco
- Reescrita de pipeline de deploy para Kubernetes

## Context

- Monorepo com NestJS + Prisma + PostgreSQL + Next.js
- Deploy em VPS via Docker Compose com Portainer webhook
- Banco principal remoto; ambiente local com compose opcional
- Milestones arquivados: v1.0 a v1.8 em .planning/milestones/
- Integracao Athos permanece read-only

## Constraints

- Banco: Nunca destruir dados em producao para resolver migration
- Compatibilidade: Preservar schema e payload legado onde ja integrado
- Operacao: Solucao deve funcionar com docker compose pull/up sem passos manuais ocultos
- Seguranca: Sem segredos em codigo
- Integracao: Fluxo deve ficar 100% no backend desta aplicacao (sem n8n)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Autenticacao via x-internal-api-key + guard NestJS | Simples, sem OAuth overhead | checkmark Validado -- v1.0 |
| Prisma migrate deploy em producao | Idempotente por design | checkmark Validado -- v1.3 |
| wait-for-db.js antes de migration | Elimina race condition postgres/backend | checkmark Validado -- v1.3 |
| Runbook manual para VPS | Sem infra CI capaz de executar docker compose | checkmark Validado -- v1.3 |
| Monorepo npm workspaces | Compartilhamento de tipos sem publicacao | checkmark Validado -- historico |
| Buscar cliente de NFS-e direto no Athos (sem replicacao local) | Evita drift de cadastro e aproveita fonte oficial em modo leitura | checkmark Validado -- v1.8 |
| clienteAthosId com prioridade na resolucao do tomador | Reduz erro manual e aumenta previsibilidade da emissao | checkmark Validado -- v1.8 |
| Logs estruturados Tomador-A/B/C e Athos-busca | Aumenta rastreabilidade operacional de emissao | checkmark Validado -- v1.8 |

## Evolution

Este documento evolui a cada transicao de fase e fechamento de milestone.

---
*Last updated: 2026-05-05 after v1.8 milestone shipped*

