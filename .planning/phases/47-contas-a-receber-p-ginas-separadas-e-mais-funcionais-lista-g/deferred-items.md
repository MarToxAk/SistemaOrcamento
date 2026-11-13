# Fase 47 - itens adiados (fora do escopo dos planos)

## 47-03: `buscarNotasFiscaisCliente` consulta coluna inexistente

- **Onde:** `apps/backend/src/modules/integrations/athos/athos.service.ts`, `buscarNotasFiscaisCliente` (SELECT com `n.valornota`).
- **Achado:** validado READ ONLY no clone `athos-teste`: `column n.valornota does not exist`. A coluna real e `nota.totalvalornota`. Como o metodo captura o erro e devolve `[]`, a lista de NF-e por cliente aparece sempre vazia sem nenhum erro visivel.
- **Por que nao foi corrigido:** pre-existente e fora do escopo do 47-03 (D-03: sem mudanca de comportamento existente). Altera o que o usuario ve na aba de NF-e do cliente.
- **Sugestao:** trocar por `n.totalvalornota AS valornota` (e considerar `to_char` na data, como em `buscarNfeResumoPorTitulos`), com teste de regressao. Decisao do usuario.
