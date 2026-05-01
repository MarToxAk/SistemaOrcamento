# Sistema de Orçamento BomCusto

## What This Is

Sistema interno de gestão de orçamentos para a empresa Bom Custo (Ilhabela-SP). Cobre o ciclo completo: criação de orçamentos por carimbos/gravações/brindes, aprovação pelo cliente via token, cobrança PIX, emissão de NFS-e e comunicação via Chatwoot. Operado pela equipe interna; clientes acessam apenas páginas de status e aprovação.

## Core Value

Orçamentos criados, aprovados e cobrados sem intervenção manual — integrações (NFS-e, EFI PIX, Chatwoot) devem funcionar de forma confiável e visível, nunca silenciosamente.

## Requirements

### Validated

<!-- Funcionalidades já em produção e validadas -->

- ✓ Criação de orçamentos com itens e carimbos — fase 0
- ✓ Geração de PDF e upload MinIO — fase 0
- ✓ Envio via Chatwoot + link de aprovação por token — fase 0
- ✓ Emissão de NFS-e via SOAP iiBrasil — fase 0
- ✓ Cobrança PIX via EFI Pay com webhooks — fase 0
- ✓ Integração read-only Athos ERP e PDV — fase 0
- ✓ Deploy CI/CD via GitHub Actions + VPS Tailscale — fase 0

### Active

<!-- Escopo atual sendo construído -->

- [ ] Autenticação e autorização por role (acesso restrito ao Chatwoot)
- [ ] Validação de webhook EFI com assinatura HMAC
- [ ] Observabilidade de integrações — erros visíveis, não silenciosos
- [ ] Validação de variáveis de ambiente na inicialização
- [ ] Área do cliente — status e aprovação com autenticação leve
- [ ] Testes automatizados para fluxos críticos (status machine, aprovação, pagamento)
- [ ] UX e usabilidade do painel interno

### Out of Scope

- Sistema de estoque — gerenciado pelo Athos ERP
- Emissão de NF-e (produto) — apenas NFS-e (serviço) está no escopo
- App mobile — sistema web responsivo é suficiente
- Multi-tenant / multi-empresa — sistema é mono-empresa (Bom Custo)
- Pagamentos além de PIX (cartão próprio) — EFI já suporta parcelamentos

## Context

- Empresa pequena (~5 usuários internos), atendimento via Chatwoot
- Municípios: Ilhabela-SP — NFS-e iiBrasil com regras tributárias da reforma 2026 (IBS/CBS)
- Stack: NestJS + Prisma + PostgreSQL (backend), Next.js App Router (frontend), Docker + Tailscale (produção)
- Codebase brownfield com zero cobertura de testes e todos os endpoints sem autenticação
- Maior risco operacional: integrações externas (NFS-e, EFI) falhando silenciosamente sem log estruturado
- Autenticação deve usar Chatwoot como único IdP — não deve haver acesso fora do contexto do Chatwoot

## Constraints

- **Autenticação**: Apenas via Chatwoot — sem cadastro próprio de usuários no sistema
- **Compatibilidade**: Payload legado de orçamentos deve ser mantido (não quebrar integrações existentes)
- **NFS-e**: Lógica de hash, alíquotas e template XML não podem ser alterados (validado em produção)
- **Banco**: Banco de produção é remoto (VPS) — migrations devem ser feitas com cuidado
- **Athos/PDV**: Read-only — nunca escrever nestes bancos externos

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Chatwoot como único IdP | Equipe já usa Chatwoot; não criar mais um sistema de login | — Pending |
| NestJS global guard com API key interna | Simples, sem OAuth próprio; frontend passa key via header | — Pending |
| BullMQ para envio assíncrono | `enviarParaCliente` faz 5 operações síncronas — risco de timeout | — Pending |
| Extrair sub-services de `quotes.service.ts` | God class com ~1800 linhas — refactor gradual | — Pending |

---
*Last updated: 2026-05-01 — inicialização do projeto GSD*
