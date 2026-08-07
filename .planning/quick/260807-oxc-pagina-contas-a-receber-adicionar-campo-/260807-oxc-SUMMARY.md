---
id: 260807-oxc
mode: quick
status: complete
---

# Summary — Busca na listagem de Contas a Receber

## O que mudou

`apps/frontend/src/app/contas-receber/page.tsx`:
- Novo campo de busca (input com ícone) no header, ao lado dos filtros de status — filtra a lista de clientes já carregada por nome (substring, case-insensitive) ou por ID (substring numérica).
- Card de cada cliente agora mostra `#{idcliente}` junto ao nome, facilitando localizar o cliente certo quando há nomes parecidos.
- Estado vazio dedicado ("Nenhum cliente encontrado para ...") quando a busca não encontra resultado, distinto do estado vazio original (nenhum cliente com contas em aberto).

## Verificação

- `npx tsc --noEmit` limpo no arquivo alterado.
- Filtro é client-side (sobre `clientes` já retornado por `/api/athos/contas-receber/dashboard`), sem chamada extra à API.
