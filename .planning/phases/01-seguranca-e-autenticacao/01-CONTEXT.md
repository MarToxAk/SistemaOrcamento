# Phase 1: Seguranca e Autenticacao - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning
**Source:** Derived from PROJECT.md + REQUIREMENTS.md + ROADMAP.md

<domain>
## Phase Boundary

A fase entrega controles de seguranca basicos e obrigatorios para operacao em producao:
- autenticacao para endpoints internos do backend
- excecoes explicitas para rotas publicas de aprovacao/status
- validacao de assinatura dos webhooks EFI
- validacao de variaveis de ambiente criticas em startup
- rate limiting para endpoints sensiveis

Nao inclui nesta fase: refatoracoes amplas do modulo de orcamentos, filas assicronas ou redesign de UX.

</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- D-01: Autenticacao deve usar Chatwoot como unico contexto de identidade; nao criar sistema de login proprio.
- D-02: Endpoints internos devem exigir autenticacao por padrao; apenas rotas publicas definidas podem ficar sem guard.
- D-03: Webhooks EFI devem validar assinatura HMAC-SHA256 via header `x-gn-signature` e retornar 401 quando invalida/ausente.
- D-04: A aplicacao deve falhar no startup quando variaveis criticas estiverem ausentes (fail-fast).
- D-05: Aplicar rate limiting em endpoints de pagamento, NFS-e e PDF.
- D-06: Nao alterar regras fiscais/soap de NFS-e (hash/alicotas/template validado).

### Claude's Discretion
- Definir formato exato do header/token para autenticacao interna com base no padrao do codebase.
- Definir limites numericos de throttling por endpoint de forma conservadora para nao quebrar operacao.
- Escolher entre validacao de env por schema Joi ou class-validator, desde que cumpra fail-fast.

</decisions>

<canonical_refs>
## Canonical References

### Arquitetura e regras do projeto
- docs/ARCHITECTURE.md - limites de responsabilidades e integracoes
- docs/DATA_MODEL.md - convencoes do modelo de dados
- .github/copilot-instructions.md - diretrizes obrigatorias do repositorio

### Contexto de planejamento
- .planning/PROJECT.md - objetivo e restricoes globais
- .planning/REQUIREMENTS.md - requisitos FR/NFR oficiais
- .planning/ROADMAP.md - meta e UAT da fase 1
- .planning/codebase/CONCERNS.md - riscos criticos de seguranca detectados

### Codigo alvo da fase
- apps/backend/src/main.ts - bootstrap e CORS
- apps/backend/src/modules/app.module.ts - modulo raiz e providers globais
- apps/backend/src/modules/integrations/efi/efi.controller.ts - webhooks
- apps/backend/src/modules/integrations/nfse/nfse.controller.ts - emissao NFS-e
- apps/backend/src/modules/quotes/quotes.controller.ts - endpoints principais de quotes

</canonical_refs>

<specifics>
## Specific Ideas

- Priorizar seguranca de borda (guards, assinatura webhook, throttling) antes de refatoracao interna.
- Manter compatibilidade com payload legado de quotes.
- Preferir falha explicita e observavel em vez de fallback silencioso.

</specifics>

<deferred>
## Deferred Ideas

- Refatorar `quotes.service.ts` em multiplos services (fase posterior)
- Introduzir fila BullMQ para `enviarParaCliente` (fase 2)
- Cobertura ampla de testes (fase 4)

</deferred>

---

*Phase: 01-seguranca-e-autenticacao*
*Context gathered: 2026-05-01 via manual fallback (sem gsd-sdk)*
