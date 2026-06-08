---
status: complete
reconciled: 2026-06-08 — os 4 gaps diagnosticados foram fechados pelo gap-closure plan 18-02 (remoção do +1 do RPS via AUXILIARRPS, fallback de tomador por nome) e verificados em produção (commit 14f1317 "verificacao aprovada em producao — RPS e tomador OK"). Milestone v1.7 shipado.
phase: 18-correcoes-nfse-rps-tomador
source: [18-01-SUMMARY.md]
started: 2026-05-04T00:00:00Z
updated: 2026-05-05T00:10:00Z
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
reported: "obrigatorio esse campo"
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
  root_cause: "A logica de emissao usa diretamente infoNfse.proximoRps como numero do RPS (sem +1), contrariando a regra operacional esperada para o retorno da API auxiliar."
  artifacts:
    - path: "apps/backend/src/modules/integrations/nfse/nfse.service.ts"
      issue: "Em emitir(), rpsNumero recebe infoNfse.proximoRps e o log explicita 'sem +1'."
  missing:
    - "Ajustar calculo do RPS para aplicar +1 quando a origem da API representar ultimo RPS emitido."
    - "Atualizar mensagem de log para refletir claramente o valor recebido e o valor efetivamente emitido."
    - "Adicionar/ajustar teste unitario cobrindo retorno ProximoRPS e numero final emitido."
  debug_session: ".planning/phases/18-correcoes-nfse-rps-tomador/18-UAT.md"

- truth: "Dados do tomador devem carregar no XML/NFS-e para orcamento associado ao Athos"
  status: failed
  reason: "User reported: Nao aparece ainda, ele carrega tudo e em branco em vez de carregar o cadastro do cliente."
  severity: major
  test: 2
  root_cause: "A resolucao automatica do tomador depende de idcliente mapeado no retorno do Athos; quando esse campo vem ausente/invalido, o fluxo cai em fallback por nome (potencialmente ambiguo) e a consulta de pre-preenchimento retorna tomador vazio no frontend."
  artifacts:
    - path: "apps/backend/src/modules/integrations/athos/athos.service.ts"
      issue: "Mapeamento de idcliente pode nao cobrir variacoes do schema legado e retornar undefined."
    - path: "apps/backend/src/modules/integrations/nfse/nfse.service.ts"
      issue: "buscarTomador() aceita idcliente ausente e pode concluir sem documento/endereco."
    - path: "apps/frontend/src/app/orcamento/[id]/page.tsx"
      issue: "Modal abre mesmo quando pre-preenchimento retorna tomador vazio, gerando UX de 'tela em branco'."
  missing:
    - "Fortalecer mapeamento do cliente no Athos para resolver idcliente de forma confiavel no ambiente legado."
    - "No consultar() da NFS-e, retornar sinalizacao explicita quando tomador automatico nao foi resolvido (com motivo)."
    - "No frontend, exibir orientacao obrigatoria e estado de erro orientado quando tomador vier vazio."
  debug_session: ".planning/phases/18-correcoes-nfse-rps-tomador/18-UAT.md"

- truth: "Emissao de NFS-e deve exigir dados validos do tomador e nao prosseguir sem tomador"
  status: failed
  reason: "User reported: Sempre tem que ter os dados do tomador e obrigatorio"
  severity: major
  test: 3
  root_cause: "O caminho de busca do tomador trata NotFoundException do Athos como aviso e segue sem tomador em etapas de consulta/preenchimento; a regra de negocio atual exige bloqueio obrigatorio com feedback objetivo antes da emissao."
  artifacts:
    - path: "apps/backend/src/modules/integrations/nfse/nfse.service.ts"
      issue: "Branch de NotFound em buscarTomador() prioriza continuidade com dados nulos."
    - path: "apps/frontend/src/app/orcamento/[id]/page.tsx"
      issue: "Fluxo de emissao nao evidencia previamente que tomador e requisito mandatorio de negocio."
  missing:
    - "Aplicar regra obrigatoria de tomador no fluxo de emissao com erro funcional claro e acionavel."
    - "Separar comportamento de diagnostico (consulta) de bloqueio de emissao, mantendo logs tecnicos e mensagem de negocio para operador."
    - "Cobrir com testes de integracao/unitarios o caso Athos not found com tomador obrigatorio."
  debug_session: ".planning/phases/18-correcoes-nfse-rps-tomador/18-UAT.md"

- truth: "Campo de tomador e obrigatorio e nao pode ficar em branco"
  status: failed
  reason: "User reported: obrigatorio esse campo"
  severity: major
  test: 4
  root_cause: "A UI permite disparar emissao com campos de tomador vazios e delega validacao apenas ao backend, sem bloqueio preventivo nem destaque de obrigatoriedade no formulario."
  artifacts:
    - path: "apps/frontend/src/app/orcamento/[id]/page.tsx"
      issue: "handleEmitirNfse monta payload com campos opcionais e nao valida obrigatoriedade local antes do POST."
    - path: "apps/frontend/src/app/api/quotes/[id]/nfse/route.ts"
      issue: "Proxy apenas repassa erro do backend; nao ha contrato de validacao frontend para obrigatoriedade."
  missing:
    - "Adicionar validacao de formulario para bloquear emissao sem documento e endereco de tomador."
    - "Marcar campos obrigatorios visualmente e exibir mensagens de validacao antes do envio."
    - "Adicionar teste de comportamento frontend para garantir bloqueio quando tomador estiver incompleto."
  debug_session: ".planning/phases/18-correcoes-nfse-rps-tomador/18-UAT.md"
