# Quick Task 260905-cyr: Melhorar o layout do dashboard /contas-receber - Context

**Gathered:** 2026-09-05
**Status:** Ready for planning

<domain>
## Task Boundary

Melhorar o layout do dashboard `/contas-receber` para ter mais cara de painel administrativo, mais fácil de analisar e buscar cliente, inspirado no template PlainAdmin Bootstrap admin (github.com/PlainAdmin/plain-free-bootstrap-admin-template). Escopo restrito a esta página — não afeta `[idcliente]/page.tsx` nem outras rotas.

</domain>

<decisions>
## Implementation Decisions

### Estrutura de navegação
- Adicionar sidebar lateral fixa, estilo admin (PlainAdmin). Usuário pretende adicionar mais conteúdo/seções a este dashboard no futuro — a sidebar deve ser pensada como navegação extensível (não um componente hardcoded de item único), mesmo que hoje só tenha 1-2 itens úteis.

### Busca de cliente
- Trocar o campo de busca simples atual por algo mais robusto: autocomplete/dropdown de resultados enquanto digita (não apenas filtro de lista já carregada — considerar se precisa de um endpoint de busca dedicado ou se a lista já carregada é suficiente para o volume de clientes).

### Estilo visual / paleta
- Copiar cores e componentes do template PlainAdmin diretamente para esta página, em vez de manter a paleta/tokens do skill `bom-custo-design`. Decisão explícita do usuário — diverge do padrão de marca usado no resto do app. Isso é uma ilha visual: só esta página, não um novo design system para o produto todo.
- Não é possível clonar o template PlainAdmin 1:1 sem acesso ao seu HTML/CSS-fonte; a implementação deve se basear no que for possível inferir da estrutura pública do repositório (sidebar + topbar + cards + tabelas densas, paleta escura/neutra típica de admin templates Bootstrap) e não travar a fase esperando acesso exato ao design.

### Escopo
- Somente a página `/contas-receber` (dashboard). `[idcliente]/page.tsx` e o resto do app ficam como estão.

### Claude's Discretion
- Estrutura exata de arquivos/componentes para a sidebar (componente novo reutilizável vs. inline no page.tsx)
- Mecanismo exato da busca com autocomplete (client-side sobre dados já carregados vs. novo endpoint) — decidir com base no volume de clientes observado no dashboard atual
- Itens exatos do menu da sidebar além do item ativo desta página

</decisions>

<specifics>
## Specific Ideas

- Template de referência: https://github.com/PlainAdmin/plain-free-bootstrap-admin-template (Bootstrap admin template gratuito) — usar como inspiração estrutural/visual, não como fonte de código a importar diretamente (é um repositório de terceiros, não uma dependência do projeto)

</specifics>

<canonical_refs>
## Canonical References

- https://github.com/PlainAdmin/plain-free-bootstrap-admin-template — inspiração visual/estrutural (repositório externo, referência de design apenas)
- `.planning/phases/41-contas-a-pagar-layout-pain-is-fiscais-e-fix-efi/41-UI-SPEC.md` — contrato de UI já existente para esta página (será parcialmente substituído nesta tarefa quanto a cores/componentes, mas a estrutura de dados dos cards/painéis construídos na Fase 41 deve ser preservada)

</canonical_refs>
