---
id: 260526-kqd
mode: quick
description: Arrumar emissao boleto EFI - criar 1 item por venda_item seguindo logica NFS-e
---

# Quick Task 260526-kqd — Itens EFI por venda_item

## Objetivo

Substituir a lógica atual de itens EFI (agrupados por número de NF-e/NFS-e) por **um item por `venda_item`** do Athos — mesma fonte usada pela emissão de NFS-e (`verificarTipoProdutoVenda`).

Resultado esperado no payload EFI:
```json
"items": [
  { "name": "<descricaoproduto>", "value": <centavos>, "amount": <quantidade> },
  ...
]
```

## Estratégia

1. **Athos**: criar `buscarItensVenda(idvenda)` em `athos.service.ts` retornando TODOS os itens da venda (produtos + serviços), reaproveitando o JOIN `venda_item ⇒ produto` já usado em `verificarTipoProdutoVenda`. Retorna `{ nome, quantidade, valor, tipoFisico }[]`.

2. **Cobranca**: em `criarBoleto` e `previewBoleto`, substituir o loop que agrupa por NF-e/NFS-e por:
   - Para cada título: pegar `idvenda`, buscar `venda_total` (do Athos) e os itens da venda.
   - Calcular fator = `valorTitulo / valorVendaTotal` (1.0 quando título = venda inteira).
   - Para cada `venda_item`: gerar EFI item com `name=nome`, `value=round(valor * fator * 100)` em centavos, `amount=quantidade`.
   - Agregar quando o mesmo item aparece em múltiplos títulos selecionados (chave: `idvenda + sequenciaitem`).
   - Ajuste de arredondamento no último item para garantir `Σ items.value == totalValor`.

3. **Fallback**: se a busca de itens da venda falhar ou retornar vazio, manter lógica antiga (NF-e/NFS-e por número) para não quebrar boletos sem itens detalhados.

## Tasks

### T1. Adicionar `buscarItensVenda` no AthosService

**Files**: `apps/backend/src/modules/integrations/athos/athos.service.ts`

**Action**:
- Adicionar método `buscarItensVenda(idvenda: number)` que executa:
  ```sql
  SELECT p.descricaoproduto AS nome,
         vi.quantidadeitem AS quantidade,
         vi.vendavalorfinalitem AS valor,
         COALESCE(p.tipoproduto, false) AS tipo_fisico,
         vi.sequenciaitem AS sequencia
  FROM venda_item vi
  JOIN produto p ON p.idproduto = vi.idproduto
  WHERE vi.idvenda = $1
    AND COALESCE(vi.vendavalorfinalitem, 0) > 0
  ORDER BY vi.sequenciaitem
  ```
- Retornar `Array<{ nome: string; quantidade: number; valor: number; tipoFisico: boolean; sequencia: number }>`.
- Try/catch silencioso (retorna `[]` em erro) — o boleto cai no fallback.

- Adicionar `buscarValorTotalVenda(idvenda: number): Promise<number>` para obter o total da venda (usado como denominador no fator de proporção). Query: `SELECT valortotal FROM venda WHERE idvenda = $1`.

**Verify**: `tsc --noEmit` em `apps/backend` passa.

**Done**: dois novos métodos públicos disponíveis no `AthosService`.

### T2. Reescrever montagem de itens em `criarBoleto` e `previewBoleto`

**Files**: `apps/backend/src/modules/cobranca/cobranca.service.ts`

**Action**:
- Extrair função privada `montarItensEfi(titulosFiltrados, totalValor)` que:
  1. Agrupa títulos por `idvenda`.
  2. Para cada venda: chama `buscarItensVenda(idvenda)` + `buscarValorTotalVenda(idvenda)` em paralelo.
  3. Computa fator = `Σ valor_dos_titulos_da_venda / valorVendaTotal` (1.0 quando os títulos cobrem a venda inteira).
  4. Para cada item da venda: acumula em `Map<string, {name, valueCentavos, amount}>` com chave = `${idvenda}-${sequencia}`.
  5. Se algum venda não retornar itens (ou total <= 0): fallback do título inteiro como item único `{name: "Venda #idvenda", value: valorTitulo*100, amount: 1}`.
  6. Após o loop: ajustar centavos do último item para `Σ valueCentavos == round(totalValor*100)`.
  7. Truncar `name` a 255 chars (limite EFI).
- `criarBoleto` e `previewBoleto` chamam `montarItensEfi` em vez do bloco existente.
- Remover o código de agrupamento por NF-e/NFS-e (incluindo `buscarTodasNfesParaTitulos`, `tipoPorVenda` e a lógica de `valorNfse`/`valorFisico` para montar itens — mas manter `verificarNFTitulos` para a validação "título precisa ter NF emitida").

**Verify**:
- `tsc --noEmit` passa.
- Log `EFI boleto payload` mostra itens com nomes de produtos (não mais "NF-e #X" / "NFS-e #Y").

**Done**: itens EFI refletem `venda_item` 1:1; total bate com soma dos títulos.

### T3. Commit

**Action**:
- `git add` apenas os 2 arquivos modificados.
- Commit message: `feat(cobranca): itens EFI gerados por venda_item do Athos`.

## must_haves

- T1: `buscarItensVenda` e `buscarValorTotalVenda` existem em `AthosService` e compilam.
- T2: `criarBoleto.efiItems` é construído a partir de `venda_item` do Athos, não mais de NF-e/NFS-e number.
- T2: `Σ efiItems[].value === Math.round(totalValor * 100)` (invariante EFI).
- T2: `previewBoleto.itens` usa a mesma fonte que `criarBoleto.efiItems`.
- Fallback ativa quando venda sem itens ou erro: preserva geração do boleto.
