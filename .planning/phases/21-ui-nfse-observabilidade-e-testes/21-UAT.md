---
status: completed
phase: 21-ui-nfse-observabilidade-e-testes
source: [21-01-SUMMARY.md, 21-02-SUMMARY.md]
started: 2026-05-05T00:09:31.3808421-03:00
updated: 2026-05-05T00:14:17.9989459-03:00
---

## Current Test

number: none
name: UAT concluido
expected: |
  Todos os 7 testes foram validados.
awaiting: none
## Tests




### 1. Busca de cliente Athos no modal NFS-e
expected: Ao informar nome ou documento e clicar em buscar, a UI lista clientes retornados pelo Athos e permite selecao.
result: pass

### 2. Selecao de cliente Athos preenche dados do tomador
expected: Ao selecionar cliente na lista, nome/documento/endereco devem ser preenchidos automaticamente no modal.
result: pass

### 3. Payload de emissao inclui clienteAthosId
expected: Ao emitir NFS-e com cliente selecionado, o request deve enviar clienteAthosId para o backend.
result: pass

### 4. Compatibilidade da rota proxy /api/athos/clientes
expected: Rota proxy deve responder com dados do backend e manter fluxo de autenticacao interna (x-internal-api-key e x-api-token opcional).
result: pass

### 5. Logs estruturados de caminho do tomador
expected: No backend, emissao deve registrar caminho Tomador-A/B/C com contexto suficiente para diagnostico sem expor documento completo.
result: pass

### 6. Log Athos-busca com filtros e total
expected: Busca de clientes deve registrar log Athos-busca com filtros aplicados e total de resultados.
result: pass

### 7. Cobertura PF com CPF no XML
expected: Teste unitario deve comprovar que cliente PF gera CPF no XML de emissao NFS-e.
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]













