---
phase: 20-resolucao-de-tomador-por-cliente-selecionado
plan: 01
subsystem: api
tags: [nestjs, nfse, athos, tomador, validation, jest]

requires:
  - phase: 19-api-de-busca-de-cliente-athos
    provides: buscarClientePorId para resolucao explicita de tomador
provides:
  - clienteAthosId no contrato EmitirNfseInput
  - resolucao prioritaria do tomador por clienteAthosId (caminho A)
  - fallback legado com caminhos B/C preservados
  - validacoes TOMAD-04 para documento e endereco obrigatorios
affects: [nfse, backend-quality, integrations]

tech-stack:
  added: []
  patterns:
    - resolucao de tomador por prioridade de fonte
    - validacao fail-fast antes da montagem/envio do XML

key-files:
  created: []
  modified:
    - apps/backend/src/modules/integrations/nfse/nfse.service.ts
    - apps/backend/src/modules/integrations/nfse/nfse.service.test.ts

key-decisions:
  - "clienteAthosId > 0 tem prioridade sobre lookup por orcamento"
  - "mensagens de erro de TOMAD-04 informam a fonte da resolucao"

patterns-established:
  - "caminhos de resolucao Tomador-A/B/C com logs dedicados"
  - "bloqueio de emissao quando documento/endereco nao sao resolvidos"

requirements-completed: [TOMAD-01, TOMAD-02, TOMAD-03, TOMAD-04]

# Metrics
duration: 14min
completed: 2026-05-05
---

# Phase 20 Summary

A fase 20 foi executada com sucesso, habilitando resolucao de tomador por cliente Athos selecionado explicitamente e mantendo compatibilidade com o fluxo legado de emissao de NFS-e.

## Performance

- Duration: 14 min
- Completed: 2026-05-05
- Tasks: 2
- Files modified: 2

## Accomplishments
- EmitirNfseInput passou a aceitar clienteAthosId opcional.
- Fluxo de emissao implementa prioridade por fonte com caminhos Tomador-A/B/C.
- Caminho A usa buscarClientePorId quando clienteAthosId valido e preserva endereco manual informado no input.
- Validacoes TOMAD-04 bloqueiam emissao com BadRequestException clara quando documento ou endereco estao ausentes apos resolucao.
- Testes de servico cobrem cenarios de cliente encontrado, nao encontrado, sem documento, sem endereco e preservacao de fluxo legado sem clienteAthosId.

## Files Created/Modified
- apps/backend/src/modules/integrations/nfse/nfse.service.ts - clienteAthosId, resolucao prioritaria e validacoes TOMAD-04.
- apps/backend/src/modules/integrations/nfse/nfse.service.test.ts - cenarios de resolucao por clienteAthosId e regressao de fluxo legado.

## Verification
- PASS: npm --workspace @bomcusto/backend test -- --testPathPatterns="nfse.service.test" --no-coverage
- PASS: npm --workspace @bomcusto/backend run build

## Deviations from Plan

None - plan executed as specified.
