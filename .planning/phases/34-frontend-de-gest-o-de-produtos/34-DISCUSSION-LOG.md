# Phase 34: Frontend de Gestão de Produtos - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-16
**Phase:** 34-frontend-de-gest-o-de-produtos
**Areas discussed:** Onde fica a tela, Criar/Editar modal ou página, Campos do formulário, Listagem e status visual

---

## Onde fica a tela

| Option | Description | Selected |
|--------|-------------|----------|
| /produtos (rota própria) | Página dedicada, acessada por URL direta | ✓ |
| Tab na página principal (/) | Adicionar aba 'Produtos' na lista de orçamentos | |
| Você decide | Pesquisador/planejador escolhe o encaixe | |

**User's choice:** `/produtos` (rota própria)

### Navegação até /produtos

| Option | Description | Selected |
|--------|-------------|----------|
| Link no cabeçalho da página de orçamentos | Adicionar 'Produtos' junto com links existentes em / | |
| Navbar/header global compartilhado | Criar componente global de navegação | |
| Você decide | Pesquisador avalia o padrão de navegação existente | ✓ |

**User's choice:** Claude's discretion

---

## Criar/Editar: modal ou página

| Option | Description | Selected |
|--------|-------------|----------|
| Modal (overlay) | Formulário abre sobre a lista sem sair de /produtos | ✓ |
| Página separada /produtos/novo e /produtos/[id]/editar | URL própria para cada operação | |
| Painel lateral (split view) | Lista à esquerda, formulário à direita | |

**User's choice:** Modal (overlay)

### Modal único ou modais separados

| Option | Description | Selected |
|--------|-------------|----------|
| Um modal, dois modos (criar vs editar) | Modal reutilizável com título e botões diferentes | ✓ |
| Modais separados | Componente próprio por operação | |

**User's choice:** Um modal, dois modos

---

## Campos do formulário

| Option | Description | Selected |
|--------|-------------|----------|
| Subset essencial (~10 campos) | Apenas descrição, código de barras, dep/grp/marca, venda1, custo, NCM | |
| Todos os 25 campos, agrupados | Blocos: Identificação, Classificação, Preços, Outros | ✓ |
| Você decide | Pesquisador avalia o contexto BomCusto e propõe | |

**User's choice:** Todos os 25 campos, agrupados

### Organização dos campos no modal

| Option | Description | Selected |
|--------|-------------|----------|
| Seções com título (sem tabs) | Blocos visíveis de uma só vez, scroll no modal | |
| Tabs (Dados / Preços / Mais) | Uma aba ativa por vez, modal menor | |
| Você decide | Pesquisador decide a organização Bootstrap | ✓ |

**User's choice:** Claude's discretion

### Dropdowns de departamento/grupo/marca

| Option | Description | Selected |
|--------|-------------|----------|
| Dropdowns carregados via lookup | <select> com opções da API ao abrir o modal | ✓ |
| Campo texto livre (ID manual) | Operador digita o ID numérico | |
| Você decide | Pesquisador decide | |

**User's choice:** Sim, dropdowns carregados via lookup

---

## Listagem e status visual

| Option | Description | Selected |
|--------|-------------|----------|
| Só ativos (statusproduto=true) | Padrão limpo — maioria dos produtos está ativa | |
| Todos (ativos e inativos) | Operador vê tudo, útil para reativar | ✓ |
| Você decide | Pesquisador propõe o default mais adequado | |

**User's choice:** Todos (ativos e inativos)

### Visual de produto inativo

| Option | Description | Selected |
|--------|-------------|----------|
| Badge 'Inativo' + linha opaca | Badge cinza + opacity-50 na linha | ✓ |
| Badge 'Inativo' apenas | Badge cinza sem mudar opacidade | |
| Você decide | Pesquisador decide o tratamento visual | |

**User's choice:** Badge 'Inativo' + linha opaca

### Filtro de status na listagem

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, botões de filtro de status | Todos / Só ativos / Só inativos — padrão /contas-receber | ✓ |
| Não, sem filtro de status | Sempre exibe todos | |
| Você decide | Pesquisador avalia | |

**User's choice:** Sim, botões de filtro de status

### Colunas da tabela

| Option | Description | Selected |
|--------|-------------|----------|
| Essenciais: descrição, código de barras, departamento, venda1, status | 5 colunas + ações | ✓ |
| Expandido: + marca, grupo, custo, NCM | 8-9 colunas | |
| Você decide | Pesquisador propõe as colunas | |

**User's choice:** Essenciais (5 colunas: descrição, código de barras, departamento, valorvenda1, status)

---

## Claude's Discretion

- Como integrar link de navegação para /produtos (link no header ou navbar global)
- Organização visual dos 25 campos dentro do modal (seções, tabs, acordeão)
- Implementação do modal como React state overlay (sem Bootstrap Modal JS — padrão fase 29)

## Deferred Ideas

- Paginação com navegação de páginas → pesquisador avalia se o retorno `{ total, page, take }` é suficiente
- Busca full-text com trigram/pg_trgm → backlog de fase 32
- Cache de lookups (dep/grp/marca mudam raramente) → otimização futura
- Importação em lote de produtos → REQUIREMENTS.md Out of Scope
- Gestão de grade/composição/série → v2 requirements (PADV-01..03)
