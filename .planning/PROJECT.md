# Sistema de Orcamento BomCusto

## What This Is

Sistema interno de gestao de orcamentos da Bom Custo (Ilhabela-SP). Cobre o ciclo completo: criacao de orcamentos, aprovacao por link publico, cobranca PIX/boleto, emissao de NFS-e, dashboard de inadimplencia e comunicacao via Chatwoot. Operacao estavel em ambientes Docker com fluxo de migration confiavel.

## Core Value

Orcamentos criados, aprovados e cobrados sem intervencao manual, com integracoes confiaveis e observaveis.

## Last Shipped Milestone: v2.1 - Cobrança e Fiscal do Cliente

Shipped em 2026-06-08 (auditoria: passed).

Entregas principais:
- Página de detalhe do cliente (/contas-receber/[idcliente]) com dados PF/PJ e títulos AVC/VEN selecionáveis
- Boleto consolidado via EFI Bank (/v1/charge/one-step) com modal de 4 estados e webhook de pagamento
- Emissão de NFS-e a partir de títulos selecionados (dedução de produto físico, valor read-only)
- Histórico de NFS-e emitidas (banco próprio) + consulta de NF-e do Athos por número, em seções lazy
- 4 modelos Prisma novos (CobrancaBoleto/Titulo, NfseEmitida) para cobrança e fiscal

Milestone anterior: v2.0 - Gestão Integrada Financeira, Caixa e Dashboards (2026-05-22).

## Next Milestone: a definir

**Status:** entre milestones desde 2026-06-08. Rodar `/gsd-new-milestone` para iniciar o próximo ciclo (questionamento → pesquisa → requisitos → roadmap).

Tech debt carregado: testes de integração com API live IIBR (Fase 30, deferidos por indisponibilidade da API no fechamento).

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
- checkmark Testes automatizados Jest + CI GitHub Actions -- v1.1
- checkmark Paginas publicas de aprovacao e status aprimoradas -- v1.2
- checkmark Mensagens automaticas Chatwoot por eventos -- v1.2
- checkmark Fluxo de migration confiavel no Docker Compose -- v1.3
- checkmark Webhook EFI sem HMAC obrigatorio + idempotencia -- v1.4
- checkmark Conciliacao Athos real + fire-and-forget checagem -- v1.4
- checkmark Desconto controlado (percentual/valor) na emissao NFS-e -- v1.4
- checkmark Encoding UTF-8 e proxy Next.js para NFS-e -- v1.5
- checkmark Calculo de desconto bidirecional no modal NFS-e -- v1.6
- checkmark Correcoes NFS-e RPS, tomador, numeracao -- v1.7
- checkmark Busca de cliente Athos + resolucao deterministica de tomador -- v1.8
- checkmark AthosListenerService hardened + API Contas a Pagar + Upload SMB -- v2.0
- checkmark Dashboard /contas-receber com filtros e accordion lazy -- v2.0

### Active → Validated in v2.1

- checkmark CLI-01..03: Pagina de Detalhe do Cliente -- v2.1
- checkmark BOL-01..03: Boleto Consolidado via EFI Bank -- v2.1
- checkmark NFR-01..05: Emissao NFS-e a partir de titulos (banco proprio Prisma) -- v2.1
- checkmark NFAT-01..02: Consulta de NF no Athos + historico NFS-e emitidas -- v2.1

### Out of Scope

- Reintroduzir n8n para roteamento de pagamentos
- Recalculo retroativo de NFS-e ja emitida
- Refactor completo de dominio de orcamentos
- Troca de ORM (Prisma permanece)
- Mudanca de provedor de banco
- Reescrita de pipeline de deploy para Kubernetes
- Pagamento por cartao de credito

## Context

- Monorepo com NestJS + Prisma + PostgreSQL + Next.js
- Deploy em VPS via Docker Compose com Portainer webhook
- Banco principal remoto (PostgreSQL via Prisma); Athos = banco externo read-only
- Milestones arquivados: v1.0 a v2.0 em .planning/milestones/
- Integracao Athos permanece read-only (somente consulta)
- NFS-e emitidas registradas no banco proprio do sistema (nao no Athos)

## Constraints

- Banco: Nunca destruir dados em producao para resolver migration
- Compatibilidade: Preservar schema e payload legado onde ja integrado
- Operacao: Solucao deve funcionar com docker compose pull/up sem passos manuais ocultos
- Seguranca: Sem segredos em codigo
- Integracao: Fluxo deve ficar 100% no backend desta aplicacao (sem n8n)
- Athos: Somente leitura — nunca gravar no banco Athos

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Autenticacao via x-internal-api-key + guard NestJS | Simples, sem OAuth overhead | checkmark Validado -- v1.0 |
| Prisma migrate deploy em producao | Idempotente por design | checkmark Validado -- v1.3 |
| Buscar cliente de NFS-e direto no Athos | Evita drift de cadastro | checkmark Validado -- v1.8 |
| clienteAthosId com prioridade na resolucao do tomador | Previsibilidade de emissao | checkmark Validado -- v1.8 |
| NFS-e emitidas registradas no banco proprio (nao Athos) | Athos e read-only; historico proprio evita dependencia | Em validacao -- v2.1 |
| Boleto consolidado (multiplos titulos) em vez de por titulo | Reduz numero de boletos e simplifica cobranca | Em validacao -- v2.1 |

## Evolution

Este documento evolui a cada transicao de fase e fechamento de milestone.

---
*Last updated: 2026-05-22 after v2.0 — v2.1 started*
