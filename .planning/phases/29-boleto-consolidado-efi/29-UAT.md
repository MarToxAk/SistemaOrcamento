---
status: testing
phase: 29-boleto-consolidado-efi
source: [29-01-SUMMARY.md, 29-02-SUMMARY.md]
started: 2026-05-22T00:00:00Z
updated: 2026-05-22T00:00:00Z
---

## Current Test

number: 7
name: Estado de sucesso — link e linha digitável
expected: |
  Após geração bem-sucedida, o modal mostra ícone verde de check,
  botão "Abrir Boleto", linha digitável copiável e nome do arquivo.
awaiting: user response

## Tests

### 1. Botão Gerar Boleto aparece com seleção
expected: Em /contas-receber/[idcliente], selecionar um ou mais títulos faz a barra de ações aparecer com o botão "Gerar Boleto".
result: pass

### 2. Modal abre ao clicar Gerar Boleto
expected: Clicar em "Gerar Boleto" abre um modal com campo de data de vencimento e resumo dos títulos selecionados.
result: pass

### 3. Datas iguais — data pré-preenchida
expected: Se todos os títulos selecionados têm a mesma datavencimento, o campo de data é pré-preenchido automaticamente com essa data.
result: pass

### 4. Datas diferentes — alerta e campo vazio
expected: Se os títulos selecionados têm datas diferentes, aparece alerta vermelho e o campo de data fica vazio para preenchimento manual.
result: pass

### 5. Data passada desabilita confirmação
expected: Informar uma data já vencida mantém o botão "Confirmar Geração" desabilitado com mensagem de validação.
result: pass

### 6. Estado de loading durante geração
expected: Ao clicar "Confirmar Geração" com data válida, aparece spinner com texto "Gerando boleto..." e os botões ficam ocultos.
result: pass

### 7. Estado de sucesso — link e linha digitável
expected: Após geração bem-sucedida, o modal mostra ícone verde de check, link "Abrir Boleto" e a linha digitável copiável. O nome do arquivo segue o padrão "idcliente - NOME CLIENTE data.pdf".
result: issue
reported: "Erro 500 — EFI retornou 400: A propriedade [payment] é obrigatória (code 3500034). Body usava settings.payment_method em vez de payment.banking_billet."
severity: major
fixed: "commit 29735ca — trocado settings por payment.banking_billet no body EFI"

### 8. Botão Copiar linha digitável
expected: Clicar em "Copiar" copia a linha digitável e o botão muda para "Copiado! ✔" por 2 segundos.
result: [pending]

### 9. Webhook e registro no banco
expected: Cobrança registrada na tabela cobranca_boleto com status "pendente". Quando pago via EFI, status muda para "pago".
result: [pending]

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0
blocked: 0

## Gaps
