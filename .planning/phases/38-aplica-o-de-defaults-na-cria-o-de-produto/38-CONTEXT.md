# Phase 38: Aplicação de Defaults na Criação de Produto - Context

**Gathered:** 2026-06-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Ligar o motor de defaults da Fase 37 (`AthosDefaultsService`) ao endpoint de **criação** de produto. Ao criar um produto, campos omitidos são preenchidos automaticamente — **operacionais** (valores fixos de negócio) e **fiscais** (moda do catálogo via Fase 37). Qualquer valor enviado explicitamente pelo operador é preservado intacto e nunca sobrescrito. A **edição** de produto nunca aplica defaults. Cada criação registra em log, campo a campo, quais defaults foram aplicados.

**In scope (Fase 38):**
- Estender `CreateProdutoDto` com os campos de default ainda ausentes (fiscais + estoque + status/vende), todos opcionais (DFIS-01..03, DOPR-01..02)
- Aplicar defaults operacionais fixos e defaults fiscais (moda) nos campos omitidos na criação
- Garantia de override do operador: valor explícito sempre prevalece (OVRD-01..03)
- Não aplicar defaults na edição (PATCH/PUT) — apenas o que o operador enviou é gravado (OVRD-02)
- Log por cadastro dos defaults aplicados (campo→valor), incluindo o caso "nenhum default necessário" (OBSV-01)

**Out of scope:**
- Qualquer mudança no motor da Fase 37 (read-only, já entregue) — exceto a dívida técnica registrada em Deferred
- Frontend / tela de cadastro (v2.4 é API-only)
- Escrita em qualquer tabela do Athos além de `produto`
</domain>

<decisions>
## Implementation Decisions

### Detecção de omissão e override do operador (OVRD)
- **D-01:** Um campo é considerado "omitido" quando seu valor no DTO é `undefined` **ou** `null`. Ambos disparam a aplicação do default. Apenas um valor real (não-nulo) conta como "enviado pelo operador" e é preservado. (Área 1 = opção 1a)
- **D-02:** O valor do operador **sempre** prevalece. O default só preenche campos omitidos; nunca sobrescreve um valor explícito, mesmo que coincida com o default (critério de sucesso 3).

### Defaults OPERACIONAIS (DOPR — valores fixos de negócio, aplicados direto na Fase 38; operador pode sobrescrever)
- **D-03:** `statusproduto = true` (fixo; produto nasce ativo — DOPR-01, herdado da Fase 37 D-06).
- **D-04:** `vendeproduto = true` (fixo; produto nasce vendável — DOPR-01).
- **D-05:** `controlaestoque = true` (fixo — **não** vem da moda da Fase 37).
- **D-06:** `baixarestoque = true` (fixo — coerente com `controlaestoque=true`: produto que controla estoque dá baixa na venda).
- **D-07:** `estoqueloja = 10` (fixo; campo novo, adicionado ao DTO e ao INSERT; gravado conforme o tipo da coluna — `string|null` no schema Athos).
- Em todos: se o operador enviar o campo, o valor dele prevalece (D-02).

### Defaults FISCAIS (DFIS — do motor da Fase 37, por moda do catálogo)
- **D-08:** Os 13 campos fiscais (`icms`, `icmsnfe`, `tributacao`, `tributacaonfe`, `codigocsosn`, `codigocsosnnfe`, `origem`, `origemnfe`, `tipoitem`, `piscst`, `cofinscst`, `idcfopsaida`, `ncm`) vêm de `AthosDefaultsService.getDefaults()`. Campo fiscal sem moda calculável é **omitido** do INSERT (Fase 37 D-08) — o cadastro segue sem o campo, nunca quebra. O motor nunca lança exceção.

### Extensão do DTO
- **D-09:** `CreateProdutoDto` ganha como **opcionais**: `statusproduto`, `vendeproduto`, `baixarestoque`, `estoqueloja`, e os 12 campos fiscais ainda ausentes (`icms`, `icmsnfe`, `tributacao`, `tributacaonfe`, `codigocsosn`, `codigocsosnnfe`, `origem`, `origemnfe`, `tipoitem`, `piscst`, `cofinscst`, `idcfopsaida`). `ncm` e `controlaestoque` já existem no DTO.

### Fonte de verdade da allowlist
- **D-10:** Reusar `FISCAL_FIELDS` da Fase 37 como **fonte única** que dirige tanto os campos fiscais do DTO quanto a aplicação dos defaults fiscais (sem segunda lista para divergir). Os defaults operacionais fixos (status/vende/controlaestoque/baixarestoque/estoqueloja) são um mapa nomeado próprio da Fase 38.

### Segurança da edição (critério de sucesso 4)
- **D-11:** `editarProduto` (PATCH/PUT) **nunca** chama `getDefaults()` nem aplica defaults. A lógica de defaults vive exclusivamente no caminho de criação (`criarProduto`), não em um helper compartilhado pelo caminho de edição.

### Log de defaults aplicados (OBSV-01)
- **D-12:** Uma linha de log estruturada por criação, listando **campo→valor aplicado** para cada default efetivamente usado (ex.: `criarProduto idproduto=42 defaults aplicados: icms='NAO', controlaestoque=true, estoqueloja=10`). Quando o operador preenche tudo, logar `nenhum default necessário`. Incluir os valores aplicados é aceitável aqui (é o produto único sendo criado), diferente da regra da Fase 37 que evitava expor a moda do catálogo inteiro nos logs do motor.

### Robustez na criação (DFIS / DEFD-04)
- **D-13:** Se o motor não retornar defaults fiscais (amostra vazia/insuficiente), a criação **segue normalmente** — os campos fiscais simplesmente ficam omitidos; nunca bloqueia o INSERT (garantia da Fase 37).

### Claude's Discretion
- Estrutura exata do merge "DTO do operador + defaults" (ex.: helper `applyDefaults(dto, defaults)` vs. inline em `criarProduto`).
- Formato/string exato da linha de log (desde que cumpra D-12).
- Tipagem/serialização de `estoqueloja = 10` para a coluna `string|null`.
- Ordem de aplicação (operacionais fixos vs. fiscais por moda) — desde que o override do operador (D-02) seja respeitado em ambos.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos e roadmap
- `.planning/REQUIREMENTS.md` — DOPR-01/02, DFIS-01/02/03, OVRD-01/02/03, OBSV-01
- `.planning/ROADMAP.md` §"Phase 38" — goal e 5 critérios de sucesso

### Fase 37 (motor de defaults — dependência direta)
- `.planning/phases/37-motor-de-defaults-descoberta-por-moda/37-CONTEXT.md` — decisões D-01..D-11 do motor (definição de "ativo", campos cobertos, fallback)
- `.planning/phases/37-motor-de-defaults-descoberta-por-moda/37-SUMMARY.md` — o que foi entregue
- `apps/backend/src/modules/integrations/athos/athos-defaults.service.ts` — `AthosDefaultsService.getDefaults()` a ser consumido
- `apps/backend/src/modules/integrations/athos/athos-defaults.util.ts` — `FISCAL_FIELDS`, `STOCK_FIELDS`, tipo `ProductDefaults`

### Código a estender (padrão a seguir)
- `apps/backend/src/modules/integrations/athos/dto/create-produto.dto.ts` — DTO de criação a estender (D-09)
- `apps/backend/src/modules/integrations/athos/athos-produto.service.ts` — `criarProduto` (INSERT dinâmico via `optionalFields`) e `editarProduto` (não tocar com defaults)
- `apps/backend/src/modules/integrations/athos/produto.types.ts` — tipos das colunas (`controlaestoque`/`baixarestoque` boolean; `estoqueloja` string; fiscais)

### Mapas do codebase
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONVENTIONS.md` — convenções NestJS/serviços
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AthosDefaultsService.getDefaults()` (Fase 37): retorna o mapa de defaults fiscais (fiscal omitido quando sem moda) + estoque por moda. A Fase 38 consome **apenas a parte fiscal** desse retorno (os campos de estoque viram default operacional fixo — ver Deferred).
- `criarProduto` já monta o INSERT dinamicamente a partir de uma allowlist `optionalFields` — o ponto de injeção dos defaults é logo antes de montar `columns/params`, preenchendo só os campos ausentes.

### Established Patterns
- INSERT dinâmico com allowlist explícita de colunas + parâmetros `$N` (anti-injection). Os novos campos (fiscais + estoque) entram nessa mesma allowlist.
- `Logger` por serviço já estabelecido — D-12 adiciona uma linha por criação.
- Pré-validação de FK e tratamento de exceções já existem em `criarProduto`; defaults não devem alterar esse fluxo de erro.

### Integration Points
- `criarProduto` → `AthosDefaultsService.getDefaults()` (nova dependência injetada, já exportada pelo `AthosModule`).
- `editarProduto` permanece **sem** qualquer chamada ao motor de defaults (D-11).
</code_context>

<specifics>
## Specific Ideas

- Separação conceitual clara: **DOPR = defaults fixos de negócio** (status/vende/controlaestoque/baixarestoque/estoqueloja) aplicados direto na Fase 38; **DFIS = defaults estatísticos** (13 campos fiscais) vindos da moda da Fase 37.
- `estoqueloja = 10` é uma quantidade inicial de estoque na loja — escolha operacional da Bom Custo, sobrescrevível pelo operador.
- Override "à prova de coincidência": mesmo que o operador envie um valor igual ao default, o valor do operador é gravado como veio (critério 3).
</specifics>

<deferred>
## Deferred Ideas

- **Simplificar o motor da Fase 37 removendo `STOCK_FIELDS`:** como `controlaestoque`/`baixarestoque` viraram defaults operacionais **fixos** (D-05/D-06), o cálculo de moda de estoque da Fase 37 fica sem uso na criação. Registrado como dívida técnica (Área B = opção 2) — remover `STOCK_FIELDS` e a parte de estoque de `computeDefaults`/`ProductDefaults` numa limpeza futura. **Não** alterar a Fase 37 nesta fase.
- **Demais campos de estoque** (`estoquedeposito`, `estoqueentregar`, `estoquemaximo`, `estoqueminimo`): fora de escopo — apenas `estoqueloja` recebe default fixo nesta fase.
- Endpoint de preview/dry-run dos defaults (DEFV-01) e UI de revisão (DEFV-02): já deferidos em REQUIREMENTS.md — fora do v2.4.

</deferred>

---

*Phase: 38-Aplicação de Defaults na Criação de Produto*
*Context gathered: 2026-06-27*
