---
phase: 53
status: human_needed
---

# Fase 53 — Verificacao

| Item | Resultado |
|------|-----------|
| Calculo reproduz as capturas 1 e 2 | passou (testes) |
| Transacao unica, ordem do PDV, estoque relativo, idempotencia | passou (pg simulado) |
| Simulacao nao escreve | passou |
| Desligado por padrao, rota admin | passou |
| Nenhum teste tocou o Athos real | confirmado (pg mockado, trava de host) |
| Esquema real, `AliquotaECF`, `senha_pdv`, IBPT | PENDENTE: exige o clone `athos-teste` |

## Para o dono

1. Rodar `athos-venda.integracao.test.ts` no clone (comando no cabecalho do arquivo) e conferir `senha_pdv`.
2. Decidir o item fiscal (IBPT em `venda.obs`) antes de ligar `ATHOS_VENDA_AUTOMATICA`.
3. Capturar mais cenarios (PIX, dinheiro/troco, cancelamento da NFC-e, orcamento com desconto no item) para as proximas fases.
