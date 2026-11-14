# Phase 48: Contas a receber: escolher a ordenação (data, nome, pago) - Context

**Gathered:** 2026-11-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Permitir escolher a ordem das listas de contas a receber por data, nome e pago, com direção asc/desc, guardada na URL.
Sem mudar regras de boleto, baixa, avisos ou notas (D-03 da fase 47 continua valendo). Backend só se alguma lista for paginada no servidor.

</domain>

<decisions>
## Implementation Decisions

### O que ordenar
- D-01 Listas: boletos (`/contas-receber/boletos` e aba Boletos do cliente), notas (`/contas-receber/notas` e aba Notas) e lista de clientes (que já ordena por nome/total devido/total atrasado; passa a guardar a escolha na URL).
- D-02 "Data": boletos = data de vencimento; notas = data de emissão.
- D-03 "Nome": nome do cliente, A→Z / Z→A sem diferenciar acento/maiúscula; na tela do cliente (um cliente só) o critério "nome" não aparece.
- D-04 "Pago": boletos agrupam por situação (pagos no fim/início conforme a direção) com data de pagamento como desempate; clientes ordenam por quem pagou mais/menos; notas não têm "pago" e não mostram o critério.

### Como escolher
- D-05 Seletor "Ordenar por" (Data, Nome, Pago) + botão de direção ↑/↓ acima de cada lista; clique no cabeçalho da tabela também ordena.
- D-06 Padrões: boletos = vencimento mais próximo→mais distante, atrasados primeiro; notas = emissão mais recente primeiro; clientes = total atrasado decrescente (como hoje).
- D-07 URL: `?ordem=data&dir=desc` via `useFiltrosUrl` da fase 47 (vale F5 e link compartilhado); valores inválidos caem no padrão.
- D-08 Ordenar no navegador quando a lista vem completa; se alguma lista for paginada no servidor (ex.: notas), a ordem vai para a consulta do backend para valer em todas as páginas.

### Claude's Discretion
Nomes de funções/arquivos, ícones, desempates adicionais estáveis, estilo (skill bom-custo-design).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/frontend/src/app/contas-receber/page.tsx` (SortKey/SortDir, `handleSort`, `clientesOrdenados`, classes `pa-th-sort`), `_shared/filtros-url.ts` + `use-filtros-url.ts`, `_componentes/boletos-consolidados.tsx`, `_shared/filtros-boletos.ts`, componente `NotasFiscais` e `[idcliente]/_abas/`.
- Backend `GET cobranca/notas` (fase 47-03) e `boleto/dashboard`.

### Established Patterns
- Funções puras em `_shared/*.ts` verificadas por `apps/frontend/scripts/checar-*.mjs` (Node 22.18+); Jest no backend.

### Integration Points
- Filtros na URL de boletos, notas, resumo e abas do cliente.

</code_context>

<specifics>
## Specific Ideas

Usuário pediu: "poder escolher a ordem. Por data, nome, pago".

</specifics>

<deferred>
## Deferred Ideas

Ordenação por valor; ordenação por múltiplos critérios; salvar preferência por usuário.

</deferred>
