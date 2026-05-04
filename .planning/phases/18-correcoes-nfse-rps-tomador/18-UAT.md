---
status: testing
phase: 18-correcoes-nfse-rps-tomador
source: [18-01-SUMMARY.md]
started: 2026-05-04T00:00:00Z
updated: 2026-05-04T00:00:00Z
---

## Current Test

number: 1
name: RPS numero correto ao emitir NFS-e
expected: |
  Ao emitir uma NFS-e, o numero RPS no log deve ser (ultimo RPS emitido + 1).
  Exemplo: se getInfoNfse() retornar ProximoRPS=11, o log deve mostrar:
  "[RPS] API retornou ultimoRPS=11 -> emitindo rpsNumero=12 serie=..."
  E a NFS-e deve ser aceita pelo iiBrasil com RPS 12 (nao duplicar o 11).
awaiting: user response

## Tests

### 1. RPS numero correto ao emitir NFS-e
expected: |
  Ao emitir uma NFS-e, o numero RPS no log deve ser (ultimo RPS emitido + 1).
  Exemplo: se getInfoNfse() retornar ProximoRPS=11, o log deve mostrar:
  "[RPS] API retornou ultimoRPS=11 -> emitindo rpsNumero=12 serie=..."
  E a NFS-e deve ser aceita pelo iiBrasil com RPS 12 (nao duplicar o 11).
result: pending

### 2. Dados do tomador com orcamento associado ao Athos
expected: |
  Ao emitir NFS-e de um orcamento que tem externalQuoteId preenchido (associado ao Athos),
  os dados do cliente (nome, CPF ou CNPJ, endereco) devem aparecer corretamente no XML/NFS-e.
  Nos logs, espera-se ver a sequencia:
  "[Tomador] buscando: lookupId="X" externalQuoteId=Y ..."
  "[Tomador] orcamento encontrado - idcliente=N"
  "[Tomador] cliente encontrado - tipo=... nome="..." documento=..."
result: pending

### 3. Logs diagnosticos quando Athos nao encontra o orcamento
expected: |
  Ao emitir NFS-e de um orcamento onde a busca no Athos nao encontra o orcamento
  (NotFoundException), o log deve mostrar claramente:
  "[Tomador] orcamento "X" nao encontrado no Athos (NotFoundException) - sem dados do tomador"
  A emissao deve continuar (sem dados do tomador, mas sem crash).
result: pending

### 4. Emissao sem externalQuoteId continua funcionando
expected: |
  Ao emitir NFS-e de um orcamento sem externalQuoteId (nao associado ao Athos),
  a emissao deve completar normalmente. Tomador pode ficar sem CPF/CNPJ,
  mas a NFS-e e emitida sem erro.
result: pending

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0
blocked: 0

## Gaps

[none yet]
