---
status: resolved
phase: 18-correcoes-nfse-rps-tomador
source: [18-01-SUMMARY.md]
started: 2026-05-04T00:00:00Z
updated: 2026-05-04T23:50:00Z
---

## Current Test

[testing complete]

## Tests

### 1. RPS numero correto ao emitir NFS-e
expected: |
  Ao emitir uma NFS-e, o numero RPS no log deve ser (ultimo RPS emitido + 1).
  Exemplo: se getInfoNfse() retornar ProximoRPS=11, o log deve mostrar:
  "[RPS] API retornou ultimoRPS=11 -> emitindo rpsNumero=12 serie=..."
  E a NFS-e deve ser aceita pelo iiBrasil com RPS 12 (nao duplicar o 11).
result: issue
reported: "Aconteceu porem estava errado ja pedi para corrigir"
severity: major

### 2. Dados do tomador com orcamento associado ao Athos
expected: |
  Ao emitir NFS-e de um orcamento que tem externalQuoteId preenchido (associado ao Athos),
  os dados do cliente (nome, CPF ou CNPJ, endereco) devem aparecer corretamente no XML/NFS-e.
  Nos logs, espera-se ver a sequencia:
  "[Tomador] buscando: lookupId=\"X\" externalQuoteId=Y ..."
  "[Tomador] orcamento encontrado - idcliente=N"
  "[Tomador] cliente encontrado - tipo=... nome=\"...\" documento=..."
result: issue
reported: "Nao aparece ainda, ele carrega tudo e em branco em vez de carregar o cadastro do cliente."
severity: major

### 3. Logs diagnosticos quando Athos nao encontra o orcamento
expected: |
  Ao emitir NFS-e de um orcamento onde a busca no Athos nao encontra o orcamento
  (NotFoundException), o log deve mostrar claramente:
  "[Tomador] orcamento \"X\" nao encontrado no Athos (NotFoundException) - sem dados do tomador"
  A emissao deve continuar (sem dados do tomador, mas sem crash).
result: issue
reported: "Sempre tem que ter os dados do tomador e obrigatorio"
severity: major

### 4. Emissao sem externalQuoteId continua funcionando
expected: |
  Ao emitir NFS-e de um orcamento sem externalQuoteId (nao associado ao Athos),
  a emissao deve completar normalmente. Tomador pode ficar sem CPF/CNPJ,
  mas a NFS-e e emitida sem erro.
result: issue
reported: "e obrigatorio o campo de CPF/CNPJ"
severity: major

## Summary

total: 4
passed: 0
issues: 4
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "RPS deve usar (ultimo RPS + 1) e emissao deve ser aceita sem duplicidade"
  status: failed
  reason: "User reported: Aconteceu porem estava errado ja pedi para corrigir"
  severity: major
  test: 1
  root_cause: "nfse.service.ts:495 usa ProximoRPS diretamente como rpsNumero, mas ProximoRPS representa o ultimo emitido; deve ser ProximoRPS + 1"
  artifacts: ["apps/backend/src/modules/integrations/nfse/nfse.service.ts"]
  missing: ["correcao do calculo: rpsNumero = infoNfse.proximoRps + 1"]
  debug_session: ""

- truth: "Dados do tomador devem carregar no XML/NFS-e para orcamento associado ao Athos"
  status: failed
  reason: "User reported: Nao aparece ainda, ele carrega tudo e em branco em vez de carregar o cadastro do cliente."
  severity: major
  test: 2
  root_cause: "nfse.service.ts:357-408 busca Athos pelo externalQuoteId mas athos.service.ts:324-411 falha silenciosamente quando nao acha a coluna certa; NotFoundException e swallowed, retorna null e todos os campos do tomador ficam em branco"
  artifacts: ["apps/backend/src/modules/integrations/nfse/nfse.service.ts", "apps/backend/src/modules/integrations/athos/athos.service.ts"]
  missing: ["correcao do mapeamento de coluna no Athos lookup", "fallback para dados locais do cliente quando Athos falha"]
  debug_session: ""

- truth: "Emissao de NFS-e deve exigir dados validos do tomador e nao prosseguir sem tomador"
  status: failed
  reason: "User reported: Sempre tem que ter os dados do tomador e obrigatorio"
  severity: major
  test: 3
  root_cause: "Consequencia do Issue 2 - o guard em nfse.service.ts:590-606 ja bloqueia corretamente quando tomadorCnpj/Cpf e null, mas a causa raiz e o lookup Athos falhando silenciosamente (Issue 2)"
  artifacts: ["apps/backend/src/modules/integrations/nfse/nfse.service.ts"]
  missing: ["fix do Issue 2 resolve este; melhorar mensagem de erro para indicar causa raiz"]
  debug_session: ""

- truth: "Emissao sem externalQuoteId deve garantir CPF/CNPJ do tomador - campo obrigatorio mesmo sem vinculo Athos"
  status: failed
  reason: "User reported: e obrigatorio o campo de CPF/CNPJ"
  severity: major
  test: 4
  root_cause: "Requisito confirmado: CPF/CNPJ e sempre obrigatorio. Codigo ja valida isso em nfse.service.ts:157-162 e 590-596. Para orcamentos sem externalQuoteId, sistema precisa buscar CPF/CNPJ do cliente local (tabela cliente) em vez de depender apenas do Athos"
  artifacts: ["apps/backend/src/modules/integrations/nfse/nfse.service.ts"]
  missing: ["fallback: buscar CPF/CNPJ do cliente local quando nao ha vinculo Athos ou quando Athos falha"]
  debug_session: ""
