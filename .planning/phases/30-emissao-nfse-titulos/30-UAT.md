---
status: partial
phase: 30-emissao-nfse-titulos
source: [30-01-SUMMARY.md, 30-02-SUMMARY.md, 30-04-SUMMARY.md]
started: "2026-05-23T00:00:00Z"
updated: "2026-05-23T00:00:00Z"
---

## Current Test

[testing partial — aguardando API IIBR para testes 6, 7, 8]

## Tests

### 1. Modal NFS-e abre ao selecionar título
expected: |
  Na página /contas-receber/[idcliente], selecione ≥1 título.
  A barra de ações aparece na base da tela com os botões "Gerar Boleto" e "Emitir NFS-e".
  Ao clicar "Emitir NFS-e", o modal abre no estado confirm com:
  - Valor pré-preenchido com a soma dos títulos selecionados
  - Seletor "Tipo de Serviço" com opção padrão "24.01 — Confecção de carimbos..."
  - Campo "Descrição do Serviço" pré-preenchido com os itens da venda
  - Nome do tomador exibido
  - Botão "Confirmar Emissão" habilitado
result: pass

### 2. Valor editável — botão desabilita com valor zero
expected: |
  Com o modal aberto no estado confirm:
  Apague o valor do campo — o botão "Confirmar Emissão" fica desabilitado.
  Digite 0 ou valor negativo — botão permanece desabilitado.
  Restaure um valor válido (ex: 50.00) — botão fica habilitado novamente.
result: issue
reported: "não pode colocar valor diferente trava no valor. Para evitar ter problemas."
severity: major
fixed: "Campo valor alterado para readOnly — form-control-plaintext, sem onChange"

### 3. Tipo de serviço — seletor funciona
expected: |
  No modal confirm, o seletor "Tipo de Serviço" exibe as 4 opções:
  - 24.01 — Confecção de carimbos, banners, placas e sinalização
  - 24.01-02 — Gravação de objetos e joias
  - 13.05 — Composição gráfica e confecção de matrizes
  - 14.08 — Encadernação e acabamento
  Trocar a seleção não fecha o modal nem apaga outros campos.
result: pass

### 4. Aviso de produto físico em venda mista
expected: |
  Selecione um título cujo orçamento/venda tenha itens físicos E de serviço.
  Ao abrir o modal NFS-e: aparece um alerta amarelo informando que a venda contém
  produtos físicos e que a NFS-e cobrirá apenas os itens de serviço.
  O valor pré-preenchido já está deduzido (apenas o valor dos serviços).
  O botão "Confirmar Emissão" permanece habilitado.
result: pass

### 5. Bloqueio de título 100% físico
expected: |
  Selecione um título cujo orçamento seja 100% produto físico (sem serviços).
  Ao abrir o modal: o valor aparece como 0 e o botão "Confirmar Emissão" fica desabilitado.
  Uma mensagem de validação explica que a venda contém apenas produtos físicos.
result: pass

### 6. Emissão com sucesso — estado success
expected: |
  Com valor válido e tipo de serviço selecionado, clique "Confirmar Emissão".
  O modal muda para estado loading com spinner + "Emitindo NFS-e...".
  Após resposta da API: modal exibe estado success com número da NFS-e, número RPS e valor.
  Ao clicar "Fechar", o modal fecha e a lista de títulos é recarregada.
result: blocked
blocked_by: third-party
reason: "API IIBR offline no momento — não foi possível testar a emissão real"

### 7. Duplicidade — erro descritivo no estado error
expected: |
  Tente emitir NFS-e para um título de venda que já teve NFS-e emitida anteriormente.
  O modal vai para estado error com mensagem descritiva (ex: "NFS-e já emitida para esta venda").
  O botão "Tentar Novamente" aparece no estado error e, ao clicar, volta para o estado confirm.
result: blocked
blocked_by: third-party
reason: "API IIBR offline — não foi possível testar emissão real"

### 8. NFS-e de orçamento ainda funciona
expected: |
  Acesse /orcamento/[id] de um orçamento sem NFS-e emitida.
  O modal de NFS-e do orçamento abre normalmente com seletor de serviço e campos do tomador.
  O fluxo de emissão funciona sem regressão.
result: blocked
blocked_by: third-party
reason: "API IIBR offline — não foi possível testar emissão real"

## Summary

total: 8
passed: 4
issues: 1
pending: 0
skipped: 0
blocked: 3

## Gaps

- truth: "Campo de valor da NFS-e deve ser somente-leitura — calculado automaticamente"
  status: resolved
  reason: "User reported: valor editável permite emissão com valor incorreto"
  severity: major
  test: 2
  fix: "Campo alterado para readOnly (form-control-plaintext) — commit 452177f"
