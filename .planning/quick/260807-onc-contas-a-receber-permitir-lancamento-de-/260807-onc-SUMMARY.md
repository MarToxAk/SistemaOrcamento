---
id: 260807-onc
mode: quick
status: complete
---

# Summary — Boleto com título de desconto (valor negativo, sem NF)

## O que mudou

- `apps/backend/src/modules/cobranca/cobranca.service.ts`: `criarBoleto` agora ignora a exigência de NF para títulos com `valor < 0`.
- `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx`: o cálculo de `selecionadosSemNf` (que desabilita o botão "Gerar Boleto") também ignora títulos com `valor < 0`.

## Por que funciona sem mudar o cálculo dos itens EFI

`montarItensEfiPorVendaItem` já tratava títulos sem venda/NF/NFS-e associada jogando o valor em um item "Outros", mas itens com `valueCentavos <= 0` são descartados (`if (cent <= 0) continue`). O ajuste final da função soma `target - soma` no último item do map — como o `target` (total) já inclui o valor negativo do título de desconto, o desconto é automaticamente subtraído do último item EFI. Ou seja, o desconto não precisa de item próprio: ele só precisa deixar de ser barrado pela checagem de NF.

## Verificação

- `npx tsc --noEmit` limpo nos dois pacotes (backend e frontend) para os arquivos alterados.
- Não testado em runtime (ambiente sem acesso à instância de produção/Athos nesta sessão) — recomenda-se validar gerando um boleto real combinando o título `DESCONTO` do cliente 2708 com um título com NF, e conferir que o valor final do boleto é o total menos o desconto.

## Notas

- Um título de desconto sozinho (sem nenhum outro título com NF no mesmo boleto) resultaria em total negativo — cenário não tratado, pois o desconto é sempre usado para abater outros títulos no mesmo boleto, não sozinho.
