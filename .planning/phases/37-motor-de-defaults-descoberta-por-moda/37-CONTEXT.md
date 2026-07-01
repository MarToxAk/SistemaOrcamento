# Phase 37: Motor de Defaults (Descoberta por Moda) - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Serviço NestJS dedicado, **read-only**, que lê a tabela `produto` do banco Athos e calcula, por campo configurável, o valor mais frequente (moda) entre os produtos ativos. Expõe os defaults calculados via método/serviço, com cache em memória e fallback seguro quando não há amostra suficiente.

**In scope (Fase 37):**
- Cálculo da moda por campo a partir dos produtos ativos do Athos (DEFD-01, DEFD-02)
- Cache em memória do resultado entre criações (DEFD-03)
- Fallback seguro quando não há amostra suficiente, sem lançar exceção (DEFD-04)

**Out of scope (vai para a Fase 38):**
- Injeção dos defaults no fluxo de criação de produto
- Garantia de override do operador
- Não-aplicação de defaults na edição
- Log por cadastro de quais defaults foram aplicados
- Qualquer escrita no Athos (esta fase é estritamente leitura)
</domain>

<decisions>
## Implementation Decisions

### Definição de "produto ativo" (população da amostra)
- **D-01:** A amostra da moda usa produtos com `statusproduto = true AND vendeproduto = true`. Esta é a noção de "ativo" do próprio sistema — `alterarStatusProduto` liga/desliga os dois campos juntos.
- **D-02:** Sem janela temporal — usa todo o catálogo ativo. Catálogo da Bom Custo (papelaria/gráfica) é estável; mais dados = moda mais robusta.

### Estratégia de cache (DEFD-03)
- **D-03:** Cache em memória (estrutura tipo `Map`) dentro do serviço, com **TTL de 24h**. Carregado na primeira solicitação (lazy) e recalculado ao expirar.
- **D-04:** Sem invalidação por escrita — a inserção de 1 produto novo praticamente não move a moda; TTL longo minimiza carga no Athos e mantém a simplicidade. Backend é instância única, então cache em memória basta.

### Campos cobertos pela moda vs defaults fixos
- **D-05:** O motor calcula a moda para os campos **fiscais** (`icms`, `icmsnfe`, `tributacao`, `tributacaonfe`, `codigocsosn`, `codigocsosnnfe`, `origem`, `origemnfe`, `tipoitem`, `piscst`, `cofinscst`, `idcfopsaida`, `ncm`) e para os campos de **estoque** (`controlaestoque`, `baixarestoque`).
- **D-06:** `statusproduto` e `vendeproduto` **não são campos de moda** — são default fixo `true` (regra de negócio DOPR-01: produto sempre nasce ativo/vendável, independente da estatística do catálogo). A aplicação desse default fixo é da Fase 38; o motor da Fase 37 não precisa calcular moda para eles.

### Fallback quando não há amostra (DEFD-04)
- **D-07:** Campos de **estoque** (`controlaestoque`/`baixarestoque`) são mode-driven; no cenário-limite sem amostra, fallback hardcoded `false` (decisão revisável pelo operador — ver Deferred). Nunca lança exceção.
- **D-08:** Campos **fiscais** sem moda calculável → o motor **omite o campo** (não retorna default), em vez de "chutar" um valor fiscal possivelmente errado. O insert segue sem o campo (Fase 38), nunca quebrando o cadastro. Na prática a Bom Custo tem produtos ativos com dados fiscais, então a moda quase sempre existirá; o fallback é rede de segurança para catálogo vazio.

### Limiar e desempate
- **D-09:** Amostra mínima de **5 produtos** com o campo preenchido para que a moda seja considerada confiável; abaixo disso, aplica-se o fallback de D-07/D-08.
- **D-10:** **Sem** limiar de dominância — a moda é a moda, independente do percentual que representa.
- **D-11:** Empate de frequência resolvido de forma determinística (menor valor) — empates são raros e de baixo impacto; determinismo garante testabilidade.

### Claude's Discretion
- Forma exata da query SQL (uma query com `GROUP BY/ORDER BY count` por campo vs. uma varredura única computada em Node) — decisão de implementação/performance para research/planner, respeitando o padrão `pg` Pool cru existente.
- Nomes exatos de métodos/classe do serviço e formato da estrutura de retorno dos defaults.
- Constante de configuração para TTL (24h) e amostra mínima (5) — manter como constantes nomeadas no código.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos e roadmap
- `.planning/REQUIREMENTS.md` — requisitos v2.4; esta fase cobre DEFD-01, DEFD-02, DEFD-03, DEFD-04
- `.planning/ROADMAP.md` §"Phase 37" — goal e critérios de sucesso

### Código existente (padrão a seguir)
- `apps/backend/src/modules/integrations/athos/athos-produto.service.ts` — padrão de acesso ao Athos via `pg` Pool cru (`getPool`/`getDbConfig` com `ATHOS_PG_*`), SQL parametrizado, allowlist de campos, uso de `Logger`. O motor de defaults deve seguir o mesmo padrão de conexão/consulta.
- `apps/backend/src/modules/integrations/athos/produto.types.ts` — tipos dos campos de produto
- `apps/backend/src/modules/integrations/athos/dto/create-produto.dto.ts` — DTO de criação (será estendido na Fase 38 com os campos fiscais/estoque)

### Mapas do codebase
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONVENTIONS.md` — convenções gerais de NestJS/serviços

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AthosProdutoService.getPool()` / `getDbConfig()`: padrão de pool `pg` com `ATHOS_PG_*` reutilizável pelo motor de defaults (leitura).
- Padrão de `Logger` por serviço já estabelecido.

### Established Patterns
- Acesso ao Athos é via `pg` Pool cru + SQL parametrizado (não Prisma). O motor de defaults deve consultar a tabela `produto` por esse caminho.
- Allowlist explícita de campos (`ALLOWED_UPDATE_FIELDS`) é o padrão para evitar injection — o conjunto de campos cobertos pela moda (D-05) deve ser uma allowlist nomeada no código.

### Integration Points
- O serviço da Fase 37 será consumido pela Fase 38 (criação de produto) — deve expor um método claro que retorne o mapa de defaults (campo → valor), com campos sem moda/fallback ausentes do mapa quando a decisão for omitir (D-08).
- Nenhuma escrita: a Fase 37 só lê do Athos.
</code_context>

<specifics>
## Specific Ideas

- Contexto fiscal: Bom Custo é Simples Nacional — por isso os campos relevantes são CSOSN (`codigocsosn`/`codigocsosnnfe`) e `origem`, não CST de ICMS de regime normal. A moda calculada sobre o catálogo real já reflete naturalmente o regime correto, então não há necessidade de valores fiscais hardcoded por padrão.
</specifics>

<deferred>
## Deferred Ideas

- **Valor de fallback de `controlaestoque`/`baixarestoque` no cenário sem amostra (D-07):** fixado em `false` por ora, mas o operador pode revisar. Cenário extremo (catálogo vazio) que não deve ocorrer na prática.
- **Endpoint de preview/dry-run dos defaults (DEFV-01) e UI de revisão (DEFV-02):** requisitos v2 já marcados como deferidos em REQUIREMENTS.md — fora do escopo v2.4.
- **Defaults configuráveis por env var:** explicitamente fora de escopo (decisão: defaults vêm da moda do banco).

</deferred>

---

*Phase: 37-Motor de Defaults (Descoberta por Moda)*
*Context gathered: 2026-06-26*
