# Phase 35: Backend White-Label - Research

**Researched:** 2026-06-18
**Domain:** NestJS ConfigService, Handlebars templates, Node.js fs, Dockerfile COPY
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Vars obrigatórias (adicionadas a `REQUIRED_ENV_VARS` em `app.module.ts`): `EMPRESA_NOME`, `EMPRESA_CNPJ`, `EMPRESA_ENDERECO`, `EMPRESA_MUNICIPIO_IBGE`. Backend não sobe sem elas.
- **D-02:** Vars opcionais: `EMPRESA_LOGO_URL` (se ausente, o template PDF omite a tag `<img>` do logo — sem imagem quebrada), `EMPRESA_COR_PRIMARIA` (fallback `#0d6efd` definido no serviço TypeScript), `EMPRESA_PDF_TEMPLATE_PATH` (explicitamente opcional por spec PDF-04).
- **D-03:** Mensagem de erro de startup inclui hint: `"See .env.example for EMPRESA_* setup instructions"`.
- **D-04:** Template Handlebars extraído de string TypeScript inline (`quotes-pdf.template.ts`) para arquivo externo `apps/backend/templates/quote-default.hbs`. Dockerfile recebe nova linha `COPY --from=build /app/apps/backend/templates ./apps/backend/templates` na stage `runtime` (mesmo padrão de `prisma/` e `scripts/`).
- **D-05:** Template lido a cada geração de PDF. Ordem de resolução: (1) se `EMPRESA_PDF_TEMPLATE_PATH` está definida → ler esse arquivo; se não existir → erro explícito; (2) tentar `apps/backend/templates/quote-default.hbs`; (3) fallback final: usar a string TypeScript embutida.
- **D-06:** `EMPRESA_PDF_TEMPLATE_PATH` definida + arquivo ausente → lançar erro e falhar a geração do PDF.
- **D-07:** `QuotesPdfStorageService.renderHtml()` passa para o contexto Handlebars: `empresaNome`, `empresaCnpj`, `empresaEndereco`, `empresaLogoUrl` (undefined se ausente), `empresaCor` (com fallback `#0d6efd`).
- **D-08:** No template `.hbs`, o logo usa `{{#if empresaLogoUrl}}<img ...>{{/if}}` — sem imagem quebrada quando ausente.
- **D-09:** Cor primária aplicada via CSS custom property: `:root { --primary: {{empresaCor}}; }` no início do `<style>` do template.
- **D-10:** Template `.hbs` documenta via comentários Handlebars (`{{! ... }}`) todas as variáveis disponíveis.
- **D-11:** `NfseService.CODIGO_MUNICIPIO` passa a ser getter computado: `private get CODIGO_MUNICIPIO() { return this.config.get<string>("EMPRESA_MUNICIPIO_IBGE") ?? "3520400"; }`.
- **D-12 (Claude's Discretion):** `DEFAULT_ENDPOINT` e `DEFAULT_AUX_URL` contêm "3520400" hardcoded nos seus valores de fallback — avaliar se é necessário parametrizar também.

### Claude's Discretion

- Ordem exata das novas entradas no `REQUIRED_ENV_VARS` do `app.module.ts`.
- Estrutura exata do contexto Handlebars passado ao `renderHtml()` (campos, nomes camelCase, tipos).
- Quais elementos CSS do template recebem `var(--primary)` (pesquisador avalia o template atual e aplica de forma consistente).

### Deferred Ideas (OUT OF SCOPE)

- Painel admin no sistema para editar configurações sem acessar o servidor (WL-01)
- Upload de logo pelo sistema (MinIO) sem editar `.env` (WL-02)
- Templates PDF gerenciados pelo painel admin (WL-03)
- Frontend dinâmico (title, logo, nome nas páginas) — Phase 36 (FRONT-01..04)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CFG-01 | `.env.example` documenta todas as variáveis novas com valores BomCusto como defaults e comentários explicativos | `.env.example` existe na raiz do monorepo (não em `apps/backend/`) — nova seção `# Empresa (White-Label)` segue o padrão de seções comentadas existente |
| CFG-02 | `EMPRESA_LOGO_URL` — URL pública do logo da empresa | Var opcional per D-02; `configService.get<string>("EMPRESA_LOGO_URL")` sem fallback, passada como `empresaLogoUrl` ao contexto Handlebars |
| CFG-03 | `EMPRESA_NOME`, `EMPRESA_CNPJ`, `EMPRESA_ENDERECO` — dados textuais | Vars obrigatórias per D-01; lidas via `ConfigService` em `renderHtml()` |
| CFG-04 | `EMPRESA_MUNICIPIO_IBGE` — substitui `"3520400"` hardcoded | Var obrigatória per D-01; getter computado em `NfseService` per D-11 |
| CFG-05 | `EMPRESA_COR_PRIMARIA` — cor primária da marca via CSS custom property | Var opcional per D-02; fallback `#0d6efd` no serviço; injetada como `--primary` no template |
| PDF-01 | Backend passa dados da empresa ao renderizador via env vars | Implementado em `renderHtml()` de `QuotesPdfStorageService` |
| PDF-02 | Template padrão usa variáveis de empresa em vez de texto hardcoded | Strings BomCusto hardcoded identificadas nas linhas 148-161, 276 do template atual |
| PDF-03 | Template PDF extraído para `apps/backend/templates/quote-default.hbs` | Novo arquivo; Dockerfile recebe COPY adicional per D-04 |
| PDF-04 | `EMPRESA_PDF_TEMPLATE_PATH` opcional aponta para template customizado | Lógica de resolução per D-05 implementada em `renderHtml()` |
| PDF-05 | Template padrão documenta via comentários Handlebars todas as variáveis | Comentários `{{! ... }}` no topo do `.hbs` per D-10 |
| NFSE-01 | `CODIGO_MUNICIPIO` lido de `EMPRESA_MUNICIPIO_IBGE` via ConfigService | Getter computado per D-11; `this.config` já injetado |
</phase_requirements>

---

## Summary

Esta fase é uma refatoração de configuração 100% backend. Não há novas dependências externas, nenhuma migration de banco de dados, e nenhuma alteração de API pública. As três áreas de mudança são: (1) extração do template Handlebars de string TypeScript para arquivo `.hbs` externo com substituição de strings BomCusto por variáveis; (2) substituição da constante `CODIGO_MUNICIPIO = "3520400"` por getter que lê `EMPRESA_MUNICIPIO_IBGE` via `ConfigService` já injetado; (3) documentação de todas as novas vars em `.env.example` com valores BomCusto como defaults.

O código existente já usa os padrões corretos: `ConfigModule.forRoot({ validate })` para fail-fast, `Handlebars.compile(template)(context)` para rendering, e getters computados para `WSDL_URL`, `ENDPOINT`, `AUX_URL` no próprio `NfseService`. Não há aprendizado técnico novo — é aplicação consistente de padrões já estabelecidos no codebase.

A decisão D-12 (Claude's Discretion) sobre `DEFAULT_ENDPOINT` e `DEFAULT_AUX_URL` merece atenção especial: ambos contêm `"3520400"` hardcoded nos seus fallbacks. Como esses valores são URLs específicas da prefeitura de Ilhabela (endpoint iiBrasil) e já são sobrescritos por `NFSE_SOAP_URL`/`NFSE_AUX_URL` via ConfigService, a abordagem correta é manter os defaults como estão — eles são fallbacks de instância-específica da Ilhabela, não configuração de município genérico. O `CODIGO_MUNICIPIO` (linha 60) é o único que entra no XML do RPS e precisa vir de env var.

**Primary recommendation:** Implementar as três áreas em ordem: (1) NFS-e getter — mudança mais cirúrgica e sem risco; (2) extração do template para `.hbs` + atualização do Dockerfile; (3) atualização de `renderHtml()` + `REQUIRED_ENV_VARS` + `.env.example`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Validação de vars obrigatórias no startup | API / Backend | — | `ConfigModule.forRoot({ validate })` roda antes do bootstrap NestJS |
| Leitura de vars opcionais com fallback | API / Backend | — | `ConfigService.get()` com operador `??` no serviço que usa a var |
| Extração do template PDF para arquivo externo | API / Backend | — | `fs.readFileSync` no `QuotesPdfStorageService` — lógica de renderização é server-side |
| Template customizável via volume Docker | CDN / Static | API / Backend | O arquivo `.hbs` é um artefato estático montado como volume; o backend faz a leitura |
| Geração do PDF com dados de empresa | API / Backend | — | `renderHtml()` em `QuotesPdfStorageService` — já owner desta lógica |
| Código IBGE do município no XML NFS-e | API / Backend | — | `NfseService.buildRpsXml()` constrói o XML — propriedade interna do serviço |
| Documentação de variáveis de ambiente | — | — | `.env.example` na raiz — artefato de documentação, não runtime |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@nestjs/config` (ConfigService) | já instalado | Leitura de env vars com validação no bootstrap | Padrão NestJS — já em uso em NfseService e QuotesPdfStorageService |
| `handlebars` | já instalado | Compilação e rendering de template `.hbs` | Já em uso em `QuotesPdfStorageService.renderHtml()` |
| `node:fs` | built-in Node.js | Leitura síncrona do arquivo `.hbs` em disco | Já referenciado no padrão CONTEXT.md D-05; zero dependência nova |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:path` | built-in | Resolver caminho do template relativo ao `process.cwd()` | Na resolução de `EMPRESA_PDF_TEMPLATE_PATH` e do template padrão |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `fs.readFileSync` (síncrono) | `fs.promises.readFile` (async) | `renderHtml()` é síncrono hoje; tornando-o async quebraria a assinatura e exigiria refatoração em `generateAndStore()`. O template é pequeno (~10 KB), leitura síncrona é aceitável |
| Getter computado `private get CODIGO_MUNICIPIO()` | Leitura direta na chamada de uso | O getter mantém consistência com `WSDL_URL`, `ENDPOINT`, `AUX_URL` que já usam este padrão no mesmo serviço |

**Installation:** Nenhum pacote novo a instalar. Todas as dependências já existem no projeto. [VERIFIED: codebase inspection]

---

## Package Legitimacy Audit

Nenhum pacote novo será instalado nesta fase. Todas as bibliotecas usadas (`@nestjs/config`, `handlebars`, `node:fs`, `node:path`) já estão presentes no `package.json` do backend.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Startup do Backend (NestJS bootstrap)
    |
    v
ConfigModule.forRoot({ validate: validateEnv })
    |-- REQUIRED_ENV_VARS ausentes? --> Error("Missing ... See .env.example")
    |-- todas presentes? --> bootstrap continua
    v
Runtime: POST /quotes/:id/pdf
    |
    v
QuotesPdfStorageService.generateAndStore(payload)
    |
    v
renderHtml(payload)
    |-- configService.get("EMPRESA_PDF_TEMPLATE_PATH") definida?
    |       |-- sim --> fs.readFileSync(path) 
    |       |               |-- arquivo existe? --> usa template customizado
    |       |               |-- não existe? --> throw Error (D-06)
    |       |-- não --> fs.readFileSync("apps/backend/templates/quote-default.hbs")
    |                       |-- arquivo existe? --> usa template padrão
    |                       |-- não existe? --> fallback QUOTES_PDF_HTML_TEMPLATE (string TS)
    |
    v
contexto Handlebars montado com dados da empresa:
    { empresaNome, empresaCnpj, empresaEndereco,
      empresaLogoUrl (undefined se ausente),
      empresaCor (fallback "#0d6efd"),
      ...payload (idorcamento, cliente, itens, etc.) }
    |
    v
Handlebars.compile(templateSource)(contexto)
    |
    v
renderPdfBuffer(html) via Puppeteer → MinIO

---

Runtime: POST /nfse/emitir
    |
    v
NfseService.emitirNfse(input)
    |
    v
buildRpsXml(...)
    |-- this.CODIGO_MUNICIPIO (getter computado)
    |       --> this.config.get<string>("EMPRESA_MUNICIPIO_IBGE") ?? "3520400"
    v
XML com <CodigoMunicipio> correto para o deploy atual
```

### Recommended Project Structure
```
apps/backend/
├── src/
│   ├── modules/
│   │   ├── app.module.ts          # REQUIRED_ENV_VARS + validateEnv — adicionar EMPRESA_*
│   │   ├── quotes/
│   │   │   ├── quotes-pdf-storage.service.ts  # renderHtml() atualizado
│   │   │   └── quotes-pdf.template.ts         # mantido como fallback (string TS)
│   │   └── integrations/nfse/
│   │       └── nfse.service.ts    # CODIGO_MUNICIPIO vira getter computado
│   └── ...
├── templates/                     # NOVO diretório
│   └── quote-default.hbs          # NOVO arquivo — conteúdo extraído do .template.ts
└── Dockerfile                     # nova linha COPY para templates/
.env.example                       # raiz do monorepo — nova seção # Empresa (White-Label)
```

### Pattern 1: Getter Computado para ConfigService (já estabelecido no NfseService)
**What:** Propriedade que delega ao ConfigService em vez de constante estática.
**When to use:** Quando um valor muda por deploy (empresa, ambiente) e deve ser lido em runtime.
**Example:**
```typescript
// Padrão já existente no nfse.service.ts (linhas 66-68) — [VERIFIED: codebase inspection]
private get WSDL_URL()  { return (this.config.get<string>("NFSE_SOAP_URL")?.trim() || this.DEFAULT_ENDPOINT) + "?wsdl"; }
private get ENDPOINT()  { return this.config.get<string>("NFSE_SOAP_URL")?.trim() || this.DEFAULT_ENDPOINT; }
private get AUX_URL()   { return this.config.get<string>("NFSE_AUX_URL")?.trim()  || this.DEFAULT_AUX_URL;  }

// Novo getter para NFSE-01 (D-11) — mesmo padrão:
private get CODIGO_MUNICIPIO() {
  return this.config.get<string>("EMPRESA_MUNICIPIO_IBGE") ?? "3520400";
}
```

### Pattern 2: Fail-Fast via ConfigModule validate (já estabelecido em app.module.ts)
**What:** Array de vars obrigatórias verificado antes do bootstrap — lança Error com lista e hint.
**When to use:** Vars sem as quais o backend não pode operar corretamente.
**Example:**
```typescript
// Padrão atual em app.module.ts (linhas 22-43) — [VERIFIED: codebase inspection]
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "INTERNAL_API_KEY",
  // ...
  // ADICIONAR: "EMPRESA_NOME", "EMPRESA_CNPJ", "EMPRESA_ENDERECO", "EMPRESA_MUNICIPIO_IBGE"
] as const;

function validateEnv(config: Record<string, unknown>) {
  const missing = REQUIRED_ENV_VARS.filter((key) => {
    const value = config[key];
    return typeof value !== "string" || value.trim().length === 0;
  });
  if (missing.length > 0) {
    // ATUALIZAR: adicionar hint sobre .env.example
    throw new Error(`Missing required environment variables: ${missing.join(", ")} — See .env.example for EMPRESA_* setup instructions`);
  }
  return config;
}
```

### Pattern 3: Leitura de Template com Cadeia de Fallback
**What:** `renderHtml()` tenta ler arquivo externo antes de usar string TS inline.
**When to use:** PDF-03, PDF-04 — template customizável por volume Docker com fallback seguro.
**Example:**
```typescript
// Novo bloco em renderHtml() — [ASSUMED] estrutura baseada em D-05
private renderHtml(payload: QuotePdfData): string {
  let templateSource: string;
  const customPath = this.configService.get<string>("EMPRESA_PDF_TEMPLATE_PATH");

  if (customPath) {
    if (!existsSync(customPath)) {
      throw new InternalServerErrorException(
        `EMPRESA_PDF_TEMPLATE_PATH definida mas arquivo não encontrado: ${customPath}`,
      );
    }
    templateSource = readFileSync(customPath, "utf-8");
  } else {
    const defaultPath = path.resolve(process.cwd(), "apps/backend/templates/quote-default.hbs");
    if (existsSync(defaultPath)) {
      templateSource = readFileSync(defaultPath, "utf-8");
    } else {
      templateSource = QUOTES_PDF_HTML_TEMPLATE; // fallback string TS
    }
  }

  const empresaNome     = this.configService.get<string>("EMPRESA_NOME") ?? "";
  const empresaCnpj     = this.configService.get<string>("EMPRESA_CNPJ") ?? "";
  const empresaEndereco = this.configService.get<string>("EMPRESA_ENDERECO") ?? "";
  const empresaLogoUrl  = this.configService.get<string>("EMPRESA_LOGO_URL"); // undefined se ausente
  const empresaCor      = this.configService.get<string>("EMPRESA_COR_PRIMARIA") ?? "#0d6efd";

  const template = Handlebars.compile(templateSource);
  // ... monta contexto com dados de empresa + payload existente
}
```

### Pattern 4: Variáveis Handlebars de Empresa no Template .hbs
**What:** Substituição das strings BomCusto hardcoded por variáveis Handlebars no arquivo `.hbs`.
**When to use:** PDF-02 — logo, nome, CNPJ, endereço, assinatura, cor primária.
**Example:**
```handlebars
{{! Variáveis de empresa disponíveis neste template:
    empresaNome    — ex: "Bom Custo Papelaria & Gráfica Rápida LTDA"
    empresaCnpj    — ex: "62.391.927/0001-57"
    empresaEndereco — ex: "Rua Olímpio Leite da Silva, 39 — Loja 07, Perequê · Ilhabela / SP"
    empresaLogoUrl  — URL pública do logo (ausente = sem tag img)
    empresaCor     — cor primária hex, ex: "#0d6efd" (fallback do serviço)
    ...demais variáveis de orçamento: idorcamento, dataorcamento, cliente, itens, carimbos, totais
}}
<style>
  :root {
    --primary: {{empresaCor}};
    /* outras CSS vars do template... */
  }
</style>
<!-- Logo condicional (D-08) -->
{{#if empresaLogoUrl}}
<img src="{{empresaLogoUrl}}" class="doc-header__logo" alt="{{empresaNome}}">
{{/if}}
<!-- Nome e CNPJ (PDF-02) -->
<h1>{{empresaNome}}</h1>
<div class="cnpj"><b>CNPJ</b> {{empresaCnpj}}</div>
<!-- Endereço (PDF-02) -->
<span>{{empresaEndereco}}</span>
<!-- Assinatura (PDF-02) -->
<b>Atenciosamente, equipe {{empresaNome}}.</b>
```

### Anti-Patterns to Avoid

- **Ler o template no bootstrap (construtor do serviço):** O CONTEXT.md D-05 especifica leitura a cada geração de PDF — permite trocar o arquivo em disco sem restart do container.
- **Usar `require()` ou import dinâmico para carregar o `.hbs`:** Usar `fs.readFileSync` diretamente; `require()` de arquivos não-JS tem comportamento imprevisível.
- **Definir `empresaLogoUrl` como string vazia em vez de `undefined`:** O template usa `{{#if empresaLogoUrl}}` — string vazia é truthy em Handlebars, causaria `<img src="">` quebrada. Deve ser `undefined` quando ausente.
- **Chamar `configService.get()` para vars obrigatórias com `?? ""`:** Vars já validadas em `REQUIRED_ENV_VARS` chegam ao serviço garantidamente preenchidas — o `?? ""` é apenas defensivo, mas não deve mascarar validação ausente.
- **Parametrizar `DEFAULT_ENDPOINT` e `DEFAULT_AUX_URL` (D-12):** Esses URLs são específicos da prefeitura de Ilhabela e já são sobrescritos por `NFSE_SOAP_URL`/`NFSE_AUX_URL`. Alterar os defaults introduziria complexidade sem ganho: deploy em Ilhabela continua funcionando sem set `NFSE_SOAP_URL`; outro município já precisa setar `NFSE_SOAP_URL` (URL diferente por município/prefeitura). **Recomendação: manter `DEFAULT_ENDPOINT` e `DEFAULT_AUX_URL` como estão.**

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Validação de env vars no startup | Lógica própria de validação | `REQUIRED_ENV_VARS` + `validateEnv()` já em `app.module.ts` | Padrão canônico já testado e em produção |
| Leitura de env var com fallback | `process.env.VAR \|\| default` | `configService.get<string>("VAR") ?? default` | Consistência com o resto do codebase; ConfigService respeita envFilePath configurado |
| Compilação Handlebars | Template engine própria | `Handlebars.compile(source)(context)` já em uso | Já instalado e funcionando em produção |
| Verificar existência de arquivo | Try/catch em `readFileSync` | `existsSync()` de `node:fs` antes de `readFileSync` | Mais legível e intencional; `readFileSync` throw é reservado para erros inesperados |

**Key insight:** Esta fase não requer nenhum novo padrão técnico — é 100% aplicação de padrões já presentes no codebase nas 3-5 linhas certas.

---

## Runtime State Inventory

> Esta fase NÃO é rename/rebrand global — é parametrização de strings BomCusto por variáveis de ambiente. O deploy BomCusto existente continua funcionando desde que as novas vars obrigatórias sejam adicionadas ao `.env` de produção antes do próximo deploy.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Nenhum — não há strings BomCusto em banco de dados desta aplicação | Nenhuma |
| Live service config | `.env` de produção (não em git) — precisa receber as 4 vars obrigatórias `EMPRESA_*` antes do próximo deploy | Operador deve adicionar as vars ao `.env` de produção antes de fazer deploy |
| OS-registered state | Nenhum — não há Task Scheduler, pm2 ou systemd com strings BomCusto | Nenhuma |
| Secrets/env vars | `.env.example` na raiz — receberá nova seção `# Empresa (White-Label)` com valores BomCusto como defaults | Edição de arquivo (tarefa desta fase) |
| Build artifacts | `apps/backend/dist/` — será regenerada no próximo build; `quotes-pdf.template.ts` permanece como fallback (não deletado) | Nenhuma ação especial — build normal recria dist/ |

**Risco de regressão no deploy:** Se o operador fizer deploy da imagem nova sem adicionar as vars obrigatórias ao `.env` de produção, o backend não sobe (fail-fast por design — D-01). O `.env.example` atualizado é a instrução de migração.

---

## Common Pitfalls

### Pitfall 1: `process.cwd()` diferente entre desenvolvimento e Docker
**What goes wrong:** `path.resolve(process.cwd(), "apps/backend/templates/quote-default.hbs")` funciona localmente mas falha no container porque o Dockerfile usa `WORKDIR /app` e copia os templates para `./apps/backend/templates`.
**Why it happens:** No container, `process.cwd()` é `/app` — o path `apps/backend/templates/quote-default.hbs` resolve para `/app/apps/backend/templates/quote-default.hbs`, que é exatamente onde o Dockerfile copia. Logo, o mesmo path funciona em ambos os ambientes.
**How to avoid:** Usar `path.resolve(process.cwd(), "apps/backend/templates/quote-default.hbs")` sem variação por ambiente. Confirmar que o Dockerfile COPY copia para `./apps/backend/templates` (não `./templates`).
**Warning signs:** Fallback para string TS ocorrendo em produção quando `EMPRESA_PDF_TEMPLATE_PATH` não está definida — indica que o path do template padrão não resolveu.

### Pitfall 2: Template padrão não incluso na imagem Docker
**What goes wrong:** `quote-default.hbs` existe localmente mas não é copiado para a imagem — o template padrão nunca é encontrado, e o fallback para a string TS (sem variáveis de empresa) sempre é usado.
**Why it happens:** Stage `runtime` do Dockerfile copia explicitamente `dist/`, `prisma/`, `scripts/` — sem linha para `templates/`, o diretório não existe na imagem.
**How to avoid:** Adicionar `COPY --from=build /app/apps/backend/templates ./apps/backend/templates` após a linha de `scripts/` no Dockerfile (D-04). [VERIFIED: codebase inspection — linha identificada]
**Warning signs:** PDF gerado em produção ainda mostra "Bom Custo Papelaria" hardcoded após o deploy da fase.

### Pitfall 3: `empresaLogoUrl` como string vazia em vez de `undefined`
**What goes wrong:** `{{#if empresaLogoUrl}}` em Handlebars é `true` para string vazia `""` — renderiza `<img src="">`, imagem quebrada no PDF.
**Why it happens:** `configService.get<string>("EMPRESA_LOGO_URL") ?? ""` ou `.trim()` com resultado vazio seria uma string falsa-negativa de `??` mas truthy em Handlebars.
**How to avoid:** Não aplicar `?? ""` para vars opcionais de URL. Deixar `undefined` quando `configService.get()` retorna `undefined`. O template já usa `{{#if empresaLogoUrl}}` justamente para isso (D-08).
**Warning signs:** PDF com `<img src="">` ou imagem quebrada quando `EMPRESA_LOGO_URL` não está definida.

### Pitfall 4: `renderHtml()` permanece síncrono com `readFileSync` bloqueante
**What goes wrong:** `readFileSync` bloqueia o event loop do Node.js durante a geração do PDF.
**Why it happens:** A função `renderHtml()` é síncrona hoje. `readFileSync` é síncrono.
**How to avoid:** Para templates de ~10 KB lidos raramente (uma vez por geração de PDF que já dura segundos por causa do Puppeteer), `readFileSync` é aceitável. O Puppeteer já domina o tempo de execução. Se performance se tornar problema, mover para async na próxima iteração. [ASSUMED]
**Warning signs:** Não aplicável nesta escala de uso.

### Pitfall 5: Vars obrigatórias adicionadas a `REQUIRED_ENV_VARS` mas não ao `.env` de produção antes do deploy
**What goes wrong:** Backend de produção recusa subir após o deploy da fase — D-01 é fail-fast intencional.
**Why it happens:** O `.env` de produção não está em git e precisa ser atualizado manualmente antes do deploy.
**How to avoid:** O plano deve incluir uma tarefa explícita de "atualizar `.env` de produção com as 4 vars EMPRESA_* antes de fazer deploy". Os valores default do `.env.example` (valores BomCusto) servem como guia.
**Warning signs:** Container não sobe após deploy — logs mostram "Missing required environment variables: EMPRESA_NOME...".

---

## Code Examples

### Getter computado para NFSE-01
```typescript
// Source: padrão existente em nfse.service.ts linhas 66-68 [VERIFIED: codebase inspection]
// Substituir (linha 60):
private readonly CODIGO_MUNICIPIO  = "3520400";
// Por:
private get CODIGO_MUNICIPIO() {
  return this.config.get<string>("EMPRESA_MUNICIPIO_IBGE") ?? "3520400";
}
// this.config já é o ConfigService injetado no construtor (linha 70-75 do arquivo)
```

### Bloco de dados de empresa em renderHtml()
```typescript
// Source: padrão de quotes-pdf-storage.service.ts + decisões D-07 [VERIFIED: codebase inspection]
// Adicionar no início de renderHtml(), antes de Handlebars.compile():
const empresaNome     = this.configService.get<string>("EMPRESA_NOME") ?? "";
const empresaCnpj     = this.configService.get<string>("EMPRESA_CNPJ") ?? "";
const empresaEndereco = this.configService.get<string>("EMPRESA_ENDERECO") ?? "";
const empresaLogoUrl  = this.configService.get<string>("EMPRESA_LOGO_URL");     // undefined se ausente
const empresaCor      = this.configService.get<string>("EMPRESA_COR_PRIMARIA") ?? "#0d6efd";

// Adicionar ao objeto de contexto passado ao template (linha 120 do arquivo):
return template({
  // ...campos existentes (idorcamento, dataorcamento, cliente, itens, etc.)
  empresaNome,
  empresaCnpj,
  empresaEndereco,
  empresaLogoUrl,
  empresaCor,
});
```

### Seção do .env.example para CFG-01
```bash
# Empresa (White-Label)
# Dados exibidos no PDF de orçamento e na NFS-e.
# Para customizar, edite estes valores no .env do seu deploy.
EMPRESA_NOME=Bom Custo Papelaria & Gráfica Rápida LTDA
EMPRESA_CNPJ=62.391.927/0001-57
EMPRESA_ENDERECO=Rua Olímpio Leite da Silva, 39 — Loja 07, Perequê · Ilhabela / SP · CEP 11633-078
EMPRESA_MUNICIPIO_IBGE=3520400

# URL pública do logo (opcional — sem definição, o logo é omitido do PDF)
# EMPRESA_LOGO_URL=https://seudominio.com/logo.png

# Cor primária da marca em hex (opcional — fallback: #0d6efd azul Bootstrap)
# EMPRESA_COR_PRIMARIA=#0d6efd

# Caminho para template PDF customizado (opcional — fallback: template padrão do sistema)
# Pode ser montado via volume Docker: -v /host/meu-template.hbs:/app/templates/meu-template.hbs
# EMPRESA_PDF_TEMPLATE_PATH=/app/templates/meu-template.hbs
```

### Linha adicional no Dockerfile
```dockerfile
# Source: Dockerfile stage runtime [VERIFIED: codebase inspection]
# Adicionar após a linha existente:
# COPY --from=build /app/apps/backend/scripts ./apps/backend/scripts
COPY --from=build /app/apps/backend/templates ./apps/backend/templates
```

### REQUIRED_ENV_VARS atualizado com hint no erro
```typescript
// Source: app.module.ts linhas 22-43 [VERIFIED: codebase inspection]
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "INTERNAL_API_KEY",
  "CHATWOOT_BASE_URL",
  "CHATWOOT_API_TOKEN",
  "CHATWOOT_ACCOUNT_ID",
  "NFSE_TOKEN",
  "ATHOS_SISTEMA_USUARIO_ID",
  // Novas vars obrigatórias (Phase 35):
  "EMPRESA_NOME",
  "EMPRESA_CNPJ",
  "EMPRESA_ENDERECO",
  "EMPRESA_MUNICIPIO_IBGE",
] as const;

function validateEnv(config: Record<string, unknown>) {
  const missing = REQUIRED_ENV_VARS.filter((key) => {
    const value = config[key];
    return typeof value !== "string" || value.trim().length === 0;
  });
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")} — See .env.example for EMPRESA_* setup instructions`,
    );
  }
  return config;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| String hardcoded BomCusto no template TypeScript | Variáveis Handlebars lidas de env vars | Phase 35 | Qualquer deploy sem edição de código |
| `private readonly CODIGO_MUNICIPIO = "3520400"` | `private get CODIGO_MUNICIPIO()` lendo `EMPRESA_MUNICIPIO_IBGE` | Phase 35 | NFS-e funciona para qualquer município |
| Template PDF embutido em `quotes-pdf.template.ts` | Arquivo externo `templates/quote-default.hbs` com fallback TS | Phase 35 | Template customizável via volume Docker sem rebuild |

**Deprecated/outdated após esta fase:**
- Strings hardcoded BomCusto nas linhas 148-161, 276 do `quotes-pdf.template.ts` — substituídas por variáveis Handlebars no novo `.hbs`.
- `private readonly CODIGO_MUNICIPIO = "3520400"` na linha 60 de `nfse.service.ts` — substituída por getter computado.
- A constante `HTML_TEMPLATE` em `quotes-pdf-storage.service.ts` (linha 39) usada como fallback — mantida mas não mais o caminho principal de execução.

---

## D-12 Decision Support (Claude's Discretion)

**Questão:** `DEFAULT_ENDPOINT` e `DEFAULT_AUX_URL` em `NfseService` (linhas 63-64) contêm `"3520400"` nos seus valores de fallback. Parametrizar ou não?

**Análise:**

```
DEFAULT_ENDPOINT = "https://ilhabela2.iibr.com.br/rps/3520400/1/soap/producao/rps"
DEFAULT_AUX_URL  = "https://ilhabela2.iibr.com.br/rps/3520400/2/AUXILIARRPS"
```

- Esses URLs são específicos da **prefeitura de Ilhabela** (domínio `ilhabela2.iibr.com.br`). Um deploy em outro município precisaria de uma URL completamente diferente (outro subdomínio iiBrasil ou outro provedor NFS-e).
- `NFSE_SOAP_URL` e `NFSE_AUX_URL` **já existem** no `.env.example` e são os mecanismos corretos para trocar esses endpoints por deploy. Os `DEFAULT_*` são apenas fallbacks de conveniência para o deploy Ilhabela.
- Se um deploy em outro município definir `EMPRESA_MUNICIPIO_IBGE=XXXXXXX` mas esquecer de definir `NFSE_SOAP_URL`, o endpoint continuará apontando para Ilhabela — o que é um erro de configuração, não um bug de código.
- Parametrizar `DEFAULT_ENDPOINT`/`DEFAULT_AUX_URL` com `EMPRESA_MUNICIPIO_IBGE` seria possível mas introduziria complexidade: a URL do iiBrasil não é simplesmente `"https://ilhabela2.iibr.com.br/rps/{IBGE}/1/soap/..."` — o subdomínio `ilhabela2` também é específico de Ilhabela.

**Recomendação:** Manter `DEFAULT_ENDPOINT` e `DEFAULT_AUX_URL` como estão. O suporte white-label para NFS-e em outros municípios é feito por `NFSE_SOAP_URL`/`NFSE_AUX_URL` (já documentados no `.env.example`). Adicionar nota no `.env.example` alertando que para deploy em outro município, `NFSE_SOAP_URL` e `NFSE_AUX_URL` devem ser definidas explicitamente.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `readFileSync` síncrono é aceitável para template de ~10 KB dado que Puppeteer domina o tempo de execução | Common Pitfalls — Pitfall 4 | Impacto mínimo em performance — pode ser migrado para async depois sem breaking change |
| A2 | `process.cwd()` em container Docker com `WORKDIR /app` retorna `/app` | Common Pitfalls — Pitfall 1 | Path do template padrão não resolveríano container — mas Dockerfile COPY já garante o path correto |
| A3 | Estrutura exata do contexto Handlebars (nomes camelCase dos campos de empresa) | Code Examples | Inconsistência de nome entre serviço e template — detectável imediatamente no primeiro teste de geração de PDF |

**Se este log estiver vazio:** Todas as claims foram verificadas ou citadas. Neste caso, 3 assumptions de baixo risco documentadas.

---

## Open Questions

1. **Strings de contato BomCusto no template (telefone, e-mail, Instagram)**
   - O que sabemos: As linhas 156-162 do template atual contêm telefone, e-mail e Instagram da BomCusto hardcoded.
   - O que está claro no CONTEXT.md: Os requisitos CFG-03 e PDF-02 listam "nome, CNPJ, endereço" e "assinatura equipe X" como itens a parametrizar. Telefone, e-mail e redes sociais não são mencionados.
   - Recomendação: Incluir `empresaContato` (string livre) como variável opcional no template para acomodar esses dados? Ou omitir e deixar o template customizado via `EMPRESA_PDF_TEMPLATE_PATH` como mecanismo para esse nível de customização? **Recomendo omitir agora — PDF-02 define o escopo mínimo; template customizado cobre o caso avançado.**

2. **`WEBHOOK_BASE_URL` ainda necessário para deploy com as novas vars?**
   - O que sabemos: `WEBHOOK_BASE_URL` e `APP_BASE_URL` são vars existentes usadas em outros lugares.
   - O que está claro: Esta fase não toca webhooks — não relevante para o planejamento da Phase 35.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (node:fs, node:path) | Leitura do template .hbs | ✓ | Já em uso no projeto | — |
| handlebars | Compilação do template | ✓ | Já instalado | — |
| @nestjs/config | ConfigService | ✓ | Já instalado e configurado | — |
| Docker (para teste de volume) | PDF-04 — template customizado | ✓ | docker-compose.yml presente na raiz | — |

**Missing dependencies with no fallback:** nenhuma.
**Missing dependencies with fallback:** nenhuma.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest + ts-jest |
| Config file | `apps/backend/jest.config.js` |
| Quick run command | `npm --workspace @bomcusto/backend test -- --testPathPattern=quotes-pdf` |
| Full suite command | `npm --workspace @bomcusto/backend test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CFG-01 | `.env.example` contém todas as vars EMPRESA_* | manual | leitura visual do arquivo | N/A |
| CFG-04 + NFSE-01 | `CODIGO_MUNICIPIO` lê `EMPRESA_MUNICIPIO_IBGE` | unit | `npm --workspace @bomcusto/backend test -- --testPathPattern=nfse.service` | ✅ `nfse.service.test.ts` existe |
| PDF-03 + PDF-04 | `renderHtml()` lê template de arquivo externo; fallback chain funciona | unit | `npm --workspace @bomcusto/backend test -- --testPathPattern=quotes-pdf` | ❌ Wave 0 — sem test atual para renderHtml() |
| PDF-01 + PDF-02 | Contexto Handlebars contém dados de empresa; template usa variáveis | unit | mesmo acima | ❌ Wave 0 |
| D-06 | `EMPRESA_PDF_TEMPLATE_PATH` definida + arquivo ausente lança erro | unit | mesmo acima | ❌ Wave 0 |

### Sampling Rate
- **Por commit de tarefa:** `npm --workspace @bomcusto/backend test -- --testPathPattern="nfse|quotes-pdf" --passWithNoTests`
- **Por wave merge:** `npm --workspace @bomcusto/backend test`
- **Phase gate:** Suite completa verde antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `apps/backend/src/modules/quotes/quotes-pdf-storage.service.test.ts` — cobre PDF-01, PDF-02, PDF-03, PDF-04, D-06; necessita mock de `ConfigService` e `fs`
- [ ] Mock de `existsSync`/`readFileSync` em `node:fs` para testar fallback chain sem I/O real

*(Nota: `nfse.service.test.ts` já existe — testar `CODIGO_MUNICIPIO` getter pode ser adicionado ao arquivo existente sem novo arquivo.)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | não | — |
| V3 Session Management | não | — |
| V4 Access Control | não | — |
| V5 Input Validation | sim (marginal) | Vars obrigatórias validadas via `validateEnv()` no bootstrap |
| V6 Cryptography | não | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Path traversal via `EMPRESA_PDF_TEMPLATE_PATH` | Tampering | A var é lida de env var (controlada pelo operador do servidor) — não de input de usuário. Risco controlado. Se houver preocupação futura: validar que o path está dentro de um diretório permitido. |
| SSRF via `EMPRESA_LOGO_URL` | Information Disclosure | A URL é usada diretamente em `<img src="">` no HTML gerado pelo Puppeteer — Puppeteer resolve a URL localmente no container. Não há fetch server-side da URL pelo backend; risco controlado para este cenário. |

---

## Sources

### Primary (HIGH confidence)
- Codebase: `apps/backend/src/modules/integrations/nfse/nfse.service.ts` — linhas 60, 63-64, 66-68, 226, 970, 1022, 1092 (ocorrências de `CODIGO_MUNICIPIO`)
- Codebase: `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts` — assinatura de `renderHtml()`, uso de `HTML_TEMPLATE`, `configService`
- Codebase: `apps/backend/src/modules/quotes/quotes-pdf.template.ts` — strings hardcoded BomCusto nas linhas 148-161, 276
- Codebase: `apps/backend/src/modules/app.module.ts` — `REQUIRED_ENV_VARS`, `validateEnv()`, ConfigModule setup
- Codebase: `apps/backend/Dockerfile` — stage `runtime` sem linha para `templates/`
- Codebase: `.env.example` (raiz) — estrutura atual e seções existentes

### Secondary (MEDIUM confidence)
- `.planning/phases/35-backend-white-label/35-CONTEXT.md` — decisões D-01..D-12, especificações de implementação
- `.planning/REQUIREMENTS.md` — CFG-01..05, PDF-01..05, NFSE-01

### Tertiary (LOW confidence)
- Nenhuma claim de baixa confiança nesta pesquisa — toda implementação é baseada em padrões verificados diretamente no código-fonte.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — todas as bibliotecas verificadas diretamente no código-fonte do projeto
- Architecture: HIGH — padrões verificados nos arquivos de destino, sem extrapolação
- Pitfalls: HIGH (pitfalls 1-3, 5) / LOW (pitfall 4) — os principais são derivados de inspeção direta do Dockerfile e código

**Research date:** 2026-06-18
**Valid until:** Estável (mudanças apenas se houver refatoração do NfseService ou QuotesPdfStorageService)
