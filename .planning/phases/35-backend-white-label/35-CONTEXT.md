# Phase 35: Backend White-Label - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Tornar o backend completamente configurável por empresa via variáveis de ambiente `EMPRESA_*` — sem editar nenhum arquivo TypeScript. Três áreas de mudança: (1) PDF: extrair template Handlebars para arquivo `.hbs` externo e substituir dados BomCusto hardcoded por variáveis; (2) NFS-e: substituir `CODIGO_MUNICIPIO = "3520400"` hardcoded por leitura de `EMPRESA_MUNICIPIO_IBGE` via `ConfigService`; (3) `.env.example`: documentar todas as novas vars com valores BomCusto como defaults e comentários explicativos. Fase 100% backend — sem alteração no frontend.

</domain>

<decisions>
## Implementation Decisions

### Variáveis de Ambiente — Obrigatoriedade

- **D-01:** Vars obrigatórias (adicionadas a `REQUIRED_ENV_VARS` em `app.module.ts`): `EMPRESA_NOME`, `EMPRESA_CNPJ`, `EMPRESA_ENDERECO`, `EMPRESA_MUNICIPIO_IBGE`. Backend não sobe sem elas.
- **D-02:** Vars opcionais: `EMPRESA_LOGO_URL` (se ausente, o template PDF omite a tag `<img>` do logo — sem imagem quebrada), `EMPRESA_COR_PRIMARIA` (fallback `#0d6efd` definido no serviço TypeScript), `EMPRESA_PDF_TEMPLATE_PATH` (explicitamente opcional por spec PDF-04).
- **D-03:** Mensagem de erro de startup inclui hint: `"See .env.example for EMPRESA_* setup instructions"`.

### Template PDF — Extração e Carregamento

- **D-04:** Template Handlebars extraído de string TypeScript inline (`quotes-pdf.template.ts`) para arquivo externo `apps/backend/templates/quote-default.hbs`. Dockerfile recebe nova linha `COPY --from=build /app/apps/backend/templates ./apps/backend/templates` na stage `runtime` (mesmo padrão de `prisma/` e `scripts/`).
- **D-05:** Template lido a cada geração de PDF (não no startup). Ordem de resolução: (1) se `EMPRESA_PDF_TEMPLATE_PATH` está definida → ler esse arquivo; se não existir → erro explícito (não falhar silenciosamente); (2) tentar `apps/backend/templates/quote-default.hbs`; (3) fallback final: usar a string TypeScript embutida (zero risco de regressão).
- **D-06:** `EMPRESA_PDF_TEMPLATE_PATH` definida + arquivo ausente (volume mal configurado) → lançar erro e falhar a geração do PDF. Se a variável está definida, o arquivo deve existir.

### Template PDF — Dados da Empresa

- **D-07:** `QuotesPdfStorageService.renderHtml()` passa para o contexto Handlebars as seguintes vars lidas via `ConfigService`: `empresaNome`, `empresaCnpj`, `empresaEndereco`, `empresaLogoUrl` (undefined se ausente), `empresaCor` (com fallback `#0d6efd`).
- **D-08:** No template `.hbs`, o logo usa `{{#if empresaLogoUrl}}<img src="{{empresaLogoUrl}}" ...>{{/if}}` — sem logo definido, nenhuma tag `<img>` é renderizada (sem imagem quebrada).
- **D-09:** Cor primária aplicada via CSS custom property: `:root { --primary: {{empresaCor}}; }` no início do `<style>` do template. Substitui todas as cores BomCusto hardcoded no cabeçalho, bordas de tabela e área de totais. Fallback `#0d6efd` já vem do serviço — o template sempre recebe um valor concreto.
- **D-10:** Template `.hbs` documenta via comentários Handlebars (`{{! ... }}`) todas as variáveis disponíveis — dados da empresa, cliente, itens, totais, carimbos (PDF-05).

### NFS-e — Código IBGE

- **D-11:** `NfseService.CODIGO_MUNICIPIO` deixa de ser propriedade privada com valor fixo e passa a ser lido de `EMPRESA_MUNICIPIO_IBGE` via `this.config.get<string>("EMPRESA_MUNICIPIO_IBGE")`. ConfigService já está injetado (`this.config`) — zero rewiring de módulo.
- **D-12 (Claude's Discretion):** `DEFAULT_ENDPOINT` e `DEFAULT_AUX_URL` em `NfseService` também contêm "3520400" nos seus valores de fallback. Como `NFSE_SOAP_URL` e `NFSE_AUX_URL` já existem no `.env.example` e são lidos via `ConfigService`, o pesquisador avalia se é necessário atualizar também os defaults hardcoded nas constantes privadas.

### Claude's Discretion

- Ordem exata das novas entradas no `REQUIRED_ENV_VARS` do `app.module.ts`.
- Estrutura exata do contexto Handlebars passado ao `renderHtml()` (campos, nomes camelCase, tipos).
- Quais elementos CSS do template recebem `var(--primary)` (pesquisador avalia o template atual e aplica de forma consistente).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### NFS-e — Arquivo de destino NFSE-01

- `apps/backend/src/modules/integrations/nfse/nfse.service.ts` — `CODIGO_MUNICIPIO` hardcoded na linha 60; `DEFAULT_ENDPOINT` e `DEFAULT_AUX_URL` nas linhas 63-64; `ConfigService` já injetado como `this.config`

### PDF — Arquivos de destino PDF-01..05

- `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts` — serviço que chama `renderHtml()`; `ConfigService` já injetado como `this.configService`; lógica de leitura do template deve entrar aqui
- `apps/backend/src/modules/quotes/quotes-pdf.template.ts` — string TypeScript inline `QUOTES_PDF_HTML_TEMPLATE` que será extraída para `.hbs`; conteúdo atual: nome/CNPJ/endereço/logo BomCusto hardcoded nas linhas 148-161, 276

### Configuração — Arquivo de destino CFG-01..05

- `apps/backend/.env.example` — documentação das vars; padrão atual: seções comentadas com valores de exemplo; novas `EMPRESA_*` seguem o mesmo estilo
- `apps/backend/src/modules/app.module.ts` — `REQUIRED_ENV_VARS` array + `validateEnv()` onde novas vars obrigatórias entram (linha 22-30)

### Dockerfile

- `apps/backend/Dockerfile` — stage `runtime` copia `dist/`, `prisma/`, `scripts/`; nova linha para `templates/` deve ser adicionada após `COPY --from=build /app/apps/backend/scripts ./apps/backend/scripts`

### Requisitos

- `.planning/REQUIREMENTS.md` — CFG-01..05, PDF-01..05, NFSE-01
- `.planning/ROADMAP.md` — Phase 35 success criteria (4 critérios de aceite)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`ConfigService`** (já injetado em `NfseService` e `QuotesPdfStorageService`) — zero rewiring de módulo; adicionar apenas `.get<string>("EMPRESA_*")` calls
- **`REQUIRED_ENV_VARS` + `validateEnv()`** (`app.module.ts:22-43`) — padrão canônico de fail-fast; adicionar novas vars obrigatórias ao array existente
- **`requireEnv()`** (`quotes-pdf-storage.service.ts`) — helper privado que já lança erro se var ausente; pode ser reutilizado para `EMPRESA_*` obrigatórias ou omitido em favor do ConfigModule validate

### Established Patterns

- **Fail-fast via `ConfigModule.forRoot({ validate })`** — validação ocorre antes do bootstrap; lançar `Error` com lista de vars ausentes + hint `.env.example`
- **Handlebars + Puppeteer** — `Handlebars.compile(template)(context)` em `renderHtml()`; contexto já é um objeto TypeScript passado diretamente
- **`fs.readFileSync`** — para leitura síncrona de arquivo de template a cada chamada; usar `node:fs`
- **Template fallback chain** — padrão já usado para MINIO_USE_SSL, MINIO_REGION: `configService.get<string>("VAR") ?? "default"`

### Integration Points

- **Nova propriedade computada** em `NfseService`: substituir `private readonly CODIGO_MUNICIPIO = "3520400"` por `private get CODIGO_MUNICIPIO() { return this.config.get<string>("EMPRESA_MUNICIPIO_IBGE") ?? "3520400"; }` (mesmo padrão de `WSDL_URL`, `ENDPOINT`, `AUX_URL` já existentes no mesmo arquivo)
- **Novo arquivo**: `apps/backend/templates/quote-default.hbs` — conteúdo extraído de `QUOTES_PDF_HTML_TEMPLATE` com substituições das strings hardcoded por variáveis Handlebars
- **`renderHtml()` atualizado**: adicionar bloco de leitura das vars `EMPRESA_*` via `this.configService.get()` antes de chamar `Handlebars.compile(template)(context)`

</code_context>

<specifics>
## Specific Ideas

- `CODIGO_MUNICIPIO` em `NfseService` deve virar getter computado (`private get`) para manter consistência com `WSDL_URL`, `ENDPOINT`, `AUX_URL` que já são getters no mesmo arquivo (linhas 66-68)
- O template `.hbs` padrão deve mostrar os valores atuais da BomCusto como exemplo nas variáveis: `{{! empresaNome: "Bom Custo Papelaria & Gráfica Rápida LTDA" }}` nos comentários
- Mensagem de erro de startup: `"Missing required environment variables: EMPRESA_NOME, ... — See .env.example for EMPRESA_* setup instructions"`

</specifics>

<deferred>
## Deferred Ideas

- Painel admin no sistema para editar configurações sem acessar o servidor → WL-01 (backlog v2 requirements)
- Upload de logo pelo sistema (MinIO) sem editar `.env` → WL-02 (backlog v2 requirements)
- Templates PDF gerenciados pelo painel admin (upload/preview/ativação) → WL-03 (backlog v2 requirements)
- Frontend dinâmico (title, logo, nome nas páginas) → Phase 36 (FRONT-01..04)

</deferred>

---

*Phase: 35-backend-white-label*
*Context gathered: 2026-06-17*
