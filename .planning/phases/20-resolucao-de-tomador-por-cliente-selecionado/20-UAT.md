---
status: completed
phase: 20-resolucao-de-tomador-por-cliente-selecionado
source: [20-01-SUMMARY.md]
started: 2026-05-05T00:09:12.9790666-03:00
updated: 2026-05-05T00:21:00.0000000-03:00
---

## Current Test

number: none
name: UAT concluido
expected: Todos os 6 testes foram validados.
awaiting: none
## Tests

### 1. Emissao aceita clienteAthosId no payload
expected: POST /nfse com clienteAthosId valido e aceito sem erro de contrato, mantendo compatibilidade com payload existente.
result: pass

### 2. Prioridade de resolucao por clienteAthosId
expected: Com clienteAthosId informado, o tomador deve ser resolvido por buscarClientePorId (caminho A), sem depender de lookup por orcamento.
result: pass

### 3. Bloqueio quando clienteAthosId nao encontrado
expected: Quando clienteAthosId nao existe, emissao deve falhar com BadRequestException clara informando clienteAthosId invalido/nao encontrado.
result: pass

### 4. Bloqueio quando documento ausente apos resolucao
expected: Se cliente resolvido nao tiver CPF/CNPJ, emissao deve bloquear com mensagem clara de documento ausente (TOMAD-04).
result: pass

### 5. Bloqueio quando endereco ausente apos resolucao
expected: Se cliente resolvido nao tiver endereco minimo, emissao deve bloquear com mensagem clara de endereco ausente (TOMAD-04).
result: pass

### 6. Compatibilidade com fluxo legado sem clienteAthosId
expected: Sem clienteAthosId, o fluxo legado deve continuar funcionando (caminhos B/C), sem obrigar novo campo.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]








