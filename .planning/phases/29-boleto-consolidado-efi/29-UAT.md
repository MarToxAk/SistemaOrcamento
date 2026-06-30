---
status: complete
phase: 29-boleto-consolidado-efi
source: [29-01-SUMMARY.md, 29-02-SUMMARY.md]
started: 2026-05-22T00:00:00Z
updated: 2026-05-23T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Botão Gerar Boleto aparece com seleção
expected: Selecionar títulos faz a barra de ações aparecer com botão "Gerar Boleto".
result: pass

### 2. Modal abre ao clicar Gerar Boleto
expected: Modal abre com campo de data e resumo dos títulos.
result: pass

### 3. Datas iguais — data pré-preenchida
expected: Campo de data pré-preenchido quando todos os títulos têm mesma datavencimento.
result: pass

### 4. Datas diferentes — alerta e campo vazio
expected: Alerta vermelho e campo de data vazio para preenchimento manual.
result: pass

### 5. Data passada desabilita confirmação
expected: Botão "Confirmar Geração" desabilitado para data vencida.
result: pass

### 6. Estado de loading durante geração
expected: Spinner "Gerando boleto..." e botões ocultos durante chamada EFI.
result: pass

### 7. Geração bem-sucedida — sucesso e nome do arquivo
expected: Modal de sucesso com linha digitável copiável e nome "idcliente - NOME CLIENTE data.pdf".
result: pass

### 8. Botão Copiar linha digitável
expected: Clicar em "Copiar" copia a linha digitável e muda para "Copiado! ✔" por 2 segundos.
result: pass

### 9. Badge NF-e na tabela de títulos
expected: Títulos com nota fiscal mostram badge "NF-e #308" (azul) ou "NFS-e #123" (verde). Títulos sem NF mostram "Sem NF" (cinza).
result: pass

### 10. Bloqueio de NF para boleto
expected: Selecionar título sem NF mostra aviso "X título(s) sem NF — boleto bloqueado" e desabilita botão "Gerar Boleto".
result: pass

### 11. Agrupamento — títulos com mesmo boleto
expected: Títulos que já têm boleto aparecem em card separado acima da tabela livre, agrupados por boleto com sub-tabela interna.
result: pass

### 12. Ações do boleto — verificar pagamento
expected: Botão "Verificar" consulta EFI e atualiza o status do boleto (pendente → pago se quitado).
result: pass

### 13. Ações do boleto — cancelar
expected: Botão "Cancelar" chama EFI PUT /cancel, remove do banco e os títulos ficam disponíveis novamente.
result: pass

### 14. Registro no banco
expected: Cobrança salva em cobranca_boleto com status "pendente", txidEfi, nomeArquivo e expireAt. Títulos registrados em cobranca_boleto_titulo.
result: pass

## Summary

total: 14
passed: 14
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
