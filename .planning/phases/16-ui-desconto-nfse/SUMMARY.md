# SUMMARY.md — Phase 16: UI de desconto no modal NFS-e

**Milestone:** v1.5
**Phase:** 16
**Status:** Complete
**Date:** 2026-05-04

## Entregue
- Adicionadas 4 variáveis de estado no modal NFS-e: `nfseDescontoAtivo`, `nfseDescontoPercent`, `nfseDescontoValor`, `nfseValorTotal`.
- Função `syncDesconto(field, value)` que mantém os três campos bidirecionais sincronizados (editar qualquer um recalcula os outros dois).
- `handleEmitirNfse` inclui `descontoAtivo`, `descontoPorcentagem`, `descontoValor` no body enviado ao proxy, quando o switch estiver ativo.
- Modal JSX expandido com switch "Aplicar desconto" e painel com três campos numéricos (% desconto, R$ desconto, Valor total) visíveis apenas quando o switch está ativo. Exibe o valor base do orçamento como referência.

## Validação
- Sem erros de tipo no arquivo.
- Campos de desconto só são enviados ao backend quando `descontoAtivo` é `true` e `nfseDescontoValor` está preenchido.

## Requisitos atendidos
- NFSFIX-03

## Milestone v1.5
Todas as fases concluídas:
- Phase 15: NFSFIX-01 (encoding), NFSFIX-02 (proxy body) ✓
- Phase 16: NFSFIX-03 (UI desconto bidirecional) ✓
