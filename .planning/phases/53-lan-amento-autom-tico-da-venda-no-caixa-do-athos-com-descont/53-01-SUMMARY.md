---
phase: 53
plan: 01
status: complete
commit: 765b9f5
---

# 53-01 — Calculo puro da venda (tracer)

- `athos-venda.util.ts`: `montarVenda` + `VendaAthosError`. Reaproveita `ratear` (maior resto) e as conversoes em BigInt de `athos-orcamento-calc.util.ts`.
- Reproduz as capturas do PDV: 3,30 + 1,90 = 5,20 sem desconto; 12 x 15,00 e 2 x 25,00 com desconto 11,50 => 9,00 e 2,50, finais 171,00 e 47,50, valor 218,50, desconto 5%.
- Recusa forma de pagamento diferente de 5, desconto negativo ou maior que o total, item zerado e precos com casas demais.
- Sobra de centavos: 1,00 em tres itens iguais => 0,33 / 0,33 / 0,34 (empate vai para o indice maior, regra do `ratear`). O comportamento do PDV com sobra NAO foi capturado.
- 9 testes, sem banco.
