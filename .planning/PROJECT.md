# Sistema de Orcamento BomCusto

## What This Is

Sistema interno de gestao de orcamentos da Bom Custo (Ilhabela-SP). Cobre o ciclo completo: criacao de orcamentos, aprovacao por link publico, cobranca PIX/boleto, emissao de NFS-e, dashboard de inadimplencia e comunicacao via Chatwoot. Operacao estavel em ambientes Docker com fluxo de migration confiavel.

## Core Value

Orcamentos criados, aprovados e cobrados sem intervencao manual, com integracoes confiaveis e observaveis.

## Current State

**Entre milestones.** v2.4 (Defaults Inteligentes no Cadastro de Produto) enviado em 2026-06-28 — Fases 37-38, auditoria `passed`. Próximo passo: `/gsd-new-milestone`.

## Last Shipped Milestone: v2.4 — Defaults Inteligentes no Cadastro de Produto

Shipped: 2026-06-28 (auditoria: passed). Fases 37-38 (2 planos). Arquivo: `.planning/milestones/v2.4-ROADMAP.md`.

**Goal:** Produtos criados pela API saem prontos para uso (ativos, vendaveis e fiscalmente validos) sem ajuste manual no Athos, preenchendo campos faltantes com os valores mais usados pelos produtos ja existentes (moda).

**Target features:**
- Defaults operacionais: produto nasce ativo/vendavel (`statusproduto`/`vendeproduto`) e com estoque sensato (`controlaestoque`/`baixarestoque`)
- Defaults fiscais (ICMS/NF-e): `icms`/`icmsnfe`, `tributacao`/`tributacaonfe`, `codigocsosn`/`codigocsosnnfe`, `origem`/`origemnfe`, `tipoitem`, `piscst`/`cofinscst`, `idcfopsaida`, `ncm`
- Descoberta dinamica: servico calcula a moda (valor mais comum) de cada campo a partir dos produtos ativos do Athos
- Override: valor enviado no DTO sempre prevalece sobre o default
- Robustez: sem dados para a moda -> fallback seguro, nunca quebra o insert
- Observabilidade: log de quais defaults foram aplicados em cada cadastro

**Key context:** continuacao direta do v2.2 (API de produto; escrita liberada APENAS na tabela `produto`). Backend/API apenas, sem frontend. Numeracao de fases continua a partir de 36.

## Last Shipped Milestone: v2.1 - Cobrança e Fiscal do Cliente

Shipped em 2026-06-08 (auditoria: passed).

Entregas principais:
- Página de detalhe do cliente (/contas-receber/[idcliente]) com dados PF/PJ e títulos AVC/VEN selecionáveis
- Boleto consolidado via EFI Bank (/v1/charge/one-step) com modal de 4 estados e webhook de pagamento
- Emissão de NFS-e a partir de títulos selecionados (dedução de produto físico, valor read-only)
- Histórico de NFS-e emitidas (banco próprio) + consulta de NF-e do Athos por número, em seções lazy
- 4 modelos Prisma novos (CobrancaBoleto/Titulo, NfseEmitida) para cobrança e fiscal

Milestone anterior: v2.0 - Gestão Integrada Financeira, Caixa e Dashboards (2026-05-22).

## Last Shipped Milestone: v2.2 — Gestão de Produtos do Athos (API)

Shipped: 2026-06-17. Fases 32-33 entregues (API de busca e escrita de produto via REST). Phase 34 (frontend) descartada por decisão: API-only foi suficiente.

## Last Shipped Milestone: v2.3 — White-Label Multi-Empresa

Shipped: 2026-06-23. Fases 35, 36 e 999.1 (12 planos). Arquivo: `.planning/milestones/v2.3-ROADMAP.md`.

**Goal:** Tornar o sistema implantável para qualquer empresa sem editar código — branding, dados fiscais e layout do PDF configuráveis.

**Entregue:**
- **Configuração via env vars `EMPRESA_*`** (nome, CNPJ, endereço, logo, cor, município IBGE NFS-e) — abordagem por-deploy, em vez de tabela `empresa_config` no banco (ver decisão abaixo).
- Frontend dinâmico: título da aba, cabeçalho das páginas internas e públicas, logo e cor lidos de env vars; CSS theming via custom property.
- PDF e NFS-e dehardcoded: nome/CNPJ/endereço/logo e código IBGE vêm das env vars.
- **Gerenciamento de layout do PDF pela interface (Fase 999.1):** tela `/configuracoes/templates` com galeria de 3 presets, upload de `.hbs`/HTML, preview server-side e troca do template ativo em runtime (sem reiniciar). Render endurecido (anti-SSRF, sanitização de upload, Handlebars restrito), rotas admin protegidas por API key + gate de senha com rate-limit.

**Desvio do plano original:** o painel admin com tabela `empresa_config` + upload de logo para MinIO foi substituído por configuração via env vars (mais simples para o modelo single-deploy-por-empresa). O "painel admin" materializou-se como a tela de gerenciamento de templates PDF da Fase 999.1.

**Segurança:** `999.1-SECURITY.md` — `threats_open: 0`. ⚠ Ação pré-deploy CR-01: definir `ADMIN_API_KEY`, `CONFIG_PANEL_PASSWORD`, `CONFIG_PANEL_SESSION_SECRET` (o gate do painel é fail-open sem elas).

**Fora do escopo (mantido):** credenciais de integração permanecem em env vars; multi-tenant (cada empresa tem deploy próprio).

Tech debt carregado: testes de integração com API live IIBR (Fase 30); UAT/verificação humana das Fases 32/33 (v2.2) diferidos.

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

### Validated in v2.2

- checkmark BPROD/SPROD: API de busca de produto (read autenticado, filtros, paginacao) -- v2.2 (fase 32)
- checkmark CPROD/EPROD/DPROD: API de escrita de produto (create/edit/soft-delete, trigger respeitado, log) -- v2.2 (fase 33)

### Validated in v2.3

- checkmark CFG-01..05 / NFSE-01: Configuracao por empresa via env vars EMPRESA_* (dados fiscais, municipio IBGE) -- v2.3 (fase 35)
- checkmark PDF-01..05: Template PDF externo (.hbs) com variaveis de empresa + cadeia de fallback -- v2.3 (fase 35)
- checkmark FRONT-01..04: Frontend white-label (nome/logo/CNPJ/endereco/cor via env vars + CSS theming) -- v2.3 (fase 36)
- checkmark Gerenciamento de layout do PDF pela interface (upload/preview/ativacao em runtime, render seguro) -- v2.3 (fase 999.1)

### Validated in v2.4 (Defaults Inteligentes no Cadastro de Produto)

- checkmark DEFD-01..04: Descoberta dinamica da moda dos campos a partir dos produtos ativos do Athos (motor read-only com cache 24h + fallback seguro) -- v2.4 (fase 37)
- checkmark DOPR-01/02: Defaults operacionais aplicados na criacao (produto nasce ativo/vendavel; controlaestoque/baixarestoque=true, estoqueloja=10) -- v2.4 (fase 38)
- checkmark DFIS-01/02/03: Defaults fiscais (ICMS/CSOSN/origem/tributacao/tipoitem/pis/cofins/cfop/ncm) aplicados por moda quando nao informados; fiscal sem moda e omitido -- v2.4 (fase 38)
- checkmark OVRD-01/02/03: Override do operador sempre prevalece (deteccao `== null`, prova de coincidencia); edicao nunca aplica defaults (D-11) -- v2.4 (fase 38)
- checkmark Fallback seguro quando nao ha dados para a moda (estoque=false no motor; fiscal omitido) sem quebrar o insert -- v2.4 (fases 37/38)
- checkmark OBSV-01: Log de defaults aplicados por cadastro (campo->valor; "nenhum default necessario") -- v2.4 (fase 38)

### Out of Scope

- Frontend/tela de cadastro de produto (v2.4 e API-only, como v2.2)
- Escrita em qualquer tabela do Athos alem de `produto`
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
- Athos: Read-only por padrao — EXCECAO controlada (v2.2): escrita permitida APENAS na tabela `produto` (insert/update). Todo o resto do Athos permanece somente leitura
- Produto: Nunca apagar fisicamente (sem DELETE) — "remover" = desativar via statusproduto/vendeproduto = false
- Produto: Escrita deve respeitar trigger tg_alterarproduto, rules atualizardatahora* e FKs/constraints existentes

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Autenticacao via x-internal-api-key + guard NestJS | Simples, sem OAuth overhead | checkmark Validado -- v1.0 |
| Prisma migrate deploy em producao | Idempotente por design | checkmark Validado -- v1.3 |
| Buscar cliente de NFS-e direto no Athos | Evita drift de cadastro | checkmark Validado -- v1.8 |
| clienteAthosId com prioridade na resolucao do tomador | Previsibilidade de emissao | checkmark Validado -- v1.8 |
| NFS-e emitidas registradas no banco proprio (nao Athos) | Athos e read-only; historico proprio evita dependencia | Em validacao -- v2.1 |
| Boleto consolidado (multiplos titulos) em vez de por titulo | Reduz numero de boletos e simplifica cobranca | Em validacao -- v2.1 |
| Liberar escrita no Athos APENAS na tabela `produto` (excecao a regra read-only) | Necessidade de cadastrar/editar produtos pelo sistema sem trocar de ferramenta | checkmark Validado -- v2.2 (fase 33) |
| Soft-delete de produto (statusproduto/vendeproduto=false), nunca DELETE fisico | Preservar integridade referencial (venda_item etc.) e historico | checkmark Validado -- v2.2 (fase 33) |
| White-label via env vars EMPRESA_* (nao tabela empresa_config no banco) | Modelo single-deploy-por-empresa; mais simples que painel admin + DB | checkmark Validado -- v2.3 |
| Templates PDF gerenciados em runtime pela UI (upload/preview/ativacao) com render endurecido | Trocar layout sem editar codigo/reiniciar; upload arbitrario exige anti-SSRF + sanitizacao | checkmark Validado -- v2.3 (fase 999.1) |
| Painel admin protegido por API key server-side + senha (fail-open sem env vars) | Deploy interno; ⚠ exige definir env vars antes do deploy (CR-01) | Em validacao -- v2.3 |
| Defaults de produto = moda do catalogo (fiscais) + valores fixos operacionais (status/vende/estoque) | Fiscais refletem o catalogo real (Simples Nacional/CSOSN); operacionais sao regra de negocio fixa | checkmark Validado -- v2.4 (fases 37/38) |
| Override do operador detectado por `== null` (undefined OU null) | Preserva valores falsy validos (false/0/"") enviados pelo operador; default so preenche omissoes | checkmark Validado -- v2.4 (fase 38) |

## Evolution

Este documento evolui a cada transicao de fase e fechamento de milestone.

---
*Last updated: 2026-06-28 after v2.4 milestone — Defaults Inteligentes no Cadastro de Produto enviado (fases 37-38); entre milestones, próximo: /gsd-new-milestone*
