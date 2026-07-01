# Phase 35: Backend White-Label - Pattern Map

**Mapped:** 2026-06-18
**Files analyzed:** 6 (4 modified + 1 new file + 1 new directory artifact)
**Analogs found:** 6 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/backend/src/modules/integrations/nfse/nfse.service.ts` | service | request-response | mesmo arquivo (refactor interno) | exact — getter pattern já existe nas linhas 66-68 |
| `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts` | service | request-response | mesmo arquivo (refactor interno) + `nfse.service.ts` padrão de getter ConfigService | exact |
| `apps/backend/src/modules/app.module.ts` | config | request-response | mesmo arquivo (adição ao array existente) | exact |
| `apps/backend/templates/quote-default.hbs` | template | transform | `apps/backend/src/modules/quotes/quotes-pdf.template.ts` (conteúdo extraído) | exact — extração direta |
| `apps/backend/Dockerfile` | config | — | mesmo arquivo (adição de linha COPY) | exact |
| `.env.example` | config | — | mesmo arquivo (adição de seção comentada) | exact — segue padrão de seções existentes |

---

## Pattern Assignments

### `apps/backend/src/modules/integrations/nfse/nfse.service.ts` (service, NFSE-01)

**Analog:** Próprio arquivo — padrão de getter computado já presente nas linhas 66-68.

**Imports pattern** (linhas 1-8):
```typescript
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { createHash } from "crypto";
import * as soap from "soap";

import { PrismaService } from "../../database/prisma.service";
import { AthosService } from "../athos/athos.service";
```

**Padrão atual — constante hardcoded a ser substituída** (linha 60):
```typescript
private readonly CODIGO_MUNICIPIO  = "3520400";
```

**Getter pattern existente (referência canônica de como escrever o novo getter)** (linhas 66-68):
```typescript
private get WSDL_URL()  { return (this.config.get<string>("NFSE_SOAP_URL")?.trim() || this.DEFAULT_ENDPOINT) + "?wsdl"; }
private get ENDPOINT()  { return this.config.get<string>("NFSE_SOAP_URL")?.trim() || this.DEFAULT_ENDPOINT; }
private get AUX_URL()   { return this.config.get<string>("NFSE_AUX_URL")?.trim()  || this.DEFAULT_AUX_URL;  }
```

**Novo getter a implementar — copiar estrutura dos getters acima** (D-11):
```typescript
// Substituir linha 60 por:
private get CODIGO_MUNICIPIO() {
  return this.config.get<string>("EMPRESA_MUNICIPIO_IBGE") ?? "3520400";
}
```

**ConfigService já injetado no construtor** (linhas 70-75):
```typescript
constructor(
  private readonly config: ConfigService,
  private readonly prisma: PrismaService,
  private readonly athosService: AthosService,
  private readonly chatwootService: ChatwootService,
) {}
```

**Nota D-12:** `DEFAULT_ENDPOINT` (linha 63) e `DEFAULT_AUX_URL` (linha 64) contêm `"3520400"` no valor mas são URLs específicas da prefeitura de Ilhabela — NÃO parametrizar. Apenas `CODIGO_MUNICIPIO` vai para env var.

---

### `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts` (service, PDF-01/03/04)

**Analog:** Próprio arquivo — já usa `configService`, Handlebars e `requireEnv()`. Padrão de fallback com `??` em `buildMinioClient()` (linhas 189, 194, 202).

**Imports atuais** (linhas 1-6):
```typescript
import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Handlebars from "handlebars";
import { Client as MinioClient } from "minio";
import puppeteer from "puppeteer";
import { QUOTES_PDF_HTML_TEMPLATE } from "./quotes-pdf.template";
```

**Novos imports a adicionar** (node:fs e node:path — nenhum pacote novo):
```typescript
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
```

**`renderHtml()` atual — ponto de inserção da lógica de template** (linhas 99-142):
```typescript
private renderHtml(payload: QuotePdfData): string {
  const template = Handlebars.compile(HTML_TEMPLATE);   // <- linha 100: substituir este bloco

  const itens = (payload.itens ?? []).map((item) => ({
    // ... mapeamento de itens
  }));

  return template({
    idorcamento: payload.idorcamento ?? payload.idorcamento_interno,
    // ... campos existentes do contexto
  });
}
```

**`renderHtml()` atualizado — nova lógica de resolução de template** (D-05/06/07):
```typescript
private renderHtml(payload: QuotePdfData): string {
  // Resolução do template (D-05/D-06)
  let templateSource: string;
  const customPath = this.configService.get<string>("EMPRESA_PDF_TEMPLATE_PATH");

  if (customPath) {
    if (!existsSync(customPath)) {
      throw new InternalServerErrorException(
        `EMPRESA_PDF_TEMPLATE_PATH definida mas arquivo nao encontrado: ${customPath}`,
      );
    }
    templateSource = readFileSync(customPath, "utf-8");
  } else {
    const defaultPath = path.resolve(process.cwd(), "apps/backend/templates/quote-default.hbs");
    if (existsSync(defaultPath)) {
      templateSource = readFileSync(defaultPath, "utf-8");
    } else {
      templateSource = QUOTES_PDF_HTML_TEMPLATE; // fallback string TS (zero risco de regressao)
    }
  }

  // Dados de empresa via ConfigService (D-07)
  const empresaNome     = this.configService.get<string>("EMPRESA_NOME") ?? "";
  const empresaCnpj     = this.configService.get<string>("EMPRESA_CNPJ") ?? "";
  const empresaEndereco = this.configService.get<string>("EMPRESA_ENDERECO") ?? "";
  const empresaLogoUrl  = this.configService.get<string>("EMPRESA_LOGO_URL"); // undefined se ausente (D-08)
  const empresaCor      = this.configService.get<string>("EMPRESA_COR_PRIMARIA") ?? "#0d6efd";

  const template = Handlebars.compile(templateSource);

  // ... mapeamento de itens existente (linhas 102-118 — sem alteracao)

  return template({
    // campos existentes (sem alteracao):
    idorcamento: payload.idorcamento ?? payload.idorcamento_interno,
    dataorcamento: this.formatDate(payload.dataorcamento),
    cliente: { /* ... */ },
    // campos novos de empresa:
    empresaNome,
    empresaCnpj,
    empresaEndereco,
    empresaLogoUrl,
    empresaCor,
  });
}
```

**Padrão `requireEnv()` existente para referência** (linhas 230-238):
```typescript
private requireEnv(name: string): string {
  const value = this.configService.get<string>(name)?.trim();
  if (!value) {
    throw new InternalServerErrorException(
      `Configuracao ausente para PDF/MinIO: defina a variavel ${name}.`,
    );
  }
  return value;
}
```

**Padrão de fallback com `??` existente para referência** (linha 202):
```typescript
const region = this.configService.get<string>("MINIO_REGION") ?? "us-east-1";
```

**Anti-pattern:** NÃO usar `?? ""` para `empresaLogoUrl` — deve permanecer `undefined` quando ausente. `{{#if empresaLogoUrl}}` em Handlebars é `false` para `undefined` mas `true` para string vazia `""`.

---

### `apps/backend/src/modules/app.module.ts` (config, CFG-01/D-01/D-03)

**Analog:** Próprio arquivo — `REQUIRED_ENV_VARS` e `validateEnv()` já implementados nas linhas 22-43.

**Array atual** (linhas 22-30):
```typescript
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "INTERNAL_API_KEY",
  "CHATWOOT_BASE_URL",
  "CHATWOOT_API_TOKEN",
  "CHATWOOT_ACCOUNT_ID",
  "NFSE_TOKEN",
  "ATHOS_SISTEMA_USUARIO_ID",
] as const;
```

**Novas entradas a adicionar ao array** (D-01):
```typescript
// Adicionar após "ATHOS_SISTEMA_USUARIO_ID":
"EMPRESA_NOME",
"EMPRESA_CNPJ",
"EMPRESA_ENDERECO",
"EMPRESA_MUNICIPIO_IBGE",
```

**`validateEnv()` atual** (linhas 32-43):
```typescript
function validateEnv(config: Record<string, unknown>) {
  const missing = REQUIRED_ENV_VARS.filter((key) => {
    const value = config[key];
    return typeof value !== "string" || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return config;
}
```

**Linha a atualizar no throw** (D-03) — adicionar hint ao `.env.example`:
```typescript
// Substituir:
throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
// Por:
throw new Error(
  `Missing required environment variables: ${missing.join(", ")} — See .env.example for EMPRESA_* setup instructions`,
);
```

---

### `apps/backend/templates/quote-default.hbs` (template, PDF-02/03/05)

**Analog:** `apps/backend/src/modules/quotes/quotes-pdf.template.ts` — conteúdo extraído integralmente desta string TypeScript.

**Linhas com hardcode BomCusto a substituir por variáveis Handlebars:**

Linha 148 do template atual (logo hardcoded):
```html
<img src="{{#if logoUrl}}{{logoUrl}}{{else}}https://autopyweb.com.br/logo_new.svg{{/if}}" class="doc-header__logo" alt="Bom Custo">
```
Substituir por (D-08 — logo condicional, sem fallback de URL externa):
```handlebars
{{#if empresaLogoUrl}}<img src="{{empresaLogoUrl}}" class="doc-header__logo" alt="{{empresaNome}}">{{/if}}
```

Linha 151 (nome hardcoded):
```html
<h1>Bom Custo Papelaria &amp; Gráfica Rápida LTDA</h1>
```
Substituir por:
```handlebars
<h1>{{empresaNome}}</h1>
```

Linha 152 (CNPJ hardcoded):
```html
<div class="cnpj"><b>CNPJ</b> 62.391.927/0001-57</div>
```
Substituir por:
```handlebars
<div class="cnpj"><b>CNPJ</b> {{empresaCnpj}}</div>
```

Linha 155 (endereço hardcoded):
```html
<span>Rua Olímpio Leite da Silva, 39 — Loja 07, Perequê · Ilhabela / SP · CEP 11633-078</span>
```
Substituir por:
```handlebars
<span>{{empresaEndereco}}</span>
```

Linha 276 (assinatura hardcoded):
```html
<b>Atenciosamente, equipe Bom Custo.</b>
```
Substituir por:
```handlebars
<b>Atenciosamente, equipe {{empresaNome}}.</b>
```

**CSS custom property no `<style>` do template** (D-09 — início do bloco `:root`):
```handlebars
<style>
  @page { size: A4; margin: 0; }
  :root {
    --primary: {{empresaCor}};
    --ink:#0b1220; --ink-soft:#5b6b80; ...
  }
```

**Comentários de documentação no topo do arquivo** (D-10 — bloco `{{! ... }}`):
```handlebars
{{!
  Variáveis de empresa disponíveis neste template:
    empresaNome     — ex: "Bom Custo Papelaria & Gráfica Rápida LTDA"
    empresaCnpj     — ex: "62.391.927/0001-57"
    empresaEndereco — ex: "Rua Olímpio Leite da Silva, 39 — Loja 07, Perequê · Ilhabela / SP · CEP 11633-078"
    empresaLogoUrl  — URL pública do logo (ausente = sem tag <img>)
    empresaCor      — cor primária hex, ex: "#0d6efd" (sempre presente, fallback do serviço)

  Variáveis de orçamento:
    idorcamento, dataorcamento
    cliente.nome, cliente.telefone, cliente.email
    vendedorNome, validade, prazoEntrega, condicaoPagamento, observacoes
    itens[].sequenciaitem, .produto.descricaoproduto, .produto.descricaocurta, .quantidadeitem, .valoritem, .orcamentovalorfinalitem
    carimbos.itens[].numero, .carimbo, .dimensoes, .descricao
    totais.valor, totais.desconto
    pencilsTopUrl, pencilsBottomUrl (decorativos — opcionais)
}}
```

**Nota:** Linhas 156-161 (telefone, e-mail, Instagram BomCusto) ficam como texto estático no template padrão. Template customizado via `EMPRESA_PDF_TEMPLATE_PATH` é o mecanismo para customizar esses dados (Open Question do RESEARCH.md — omitir nesta fase, escopo mínimo CFG-03/PDF-02).

---

### `apps/backend/Dockerfile` (config, D-04)

**Analog:** Próprio arquivo — padrão de `COPY --from=build` no stage `runtime` (linhas 31-36).

**Padrão existente de COPY no stage runtime** (linhas 31-36):
```dockerfile
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=build /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=build /app/apps/backend/scripts ./apps/backend/scripts
COPY --from=build /app/package.json ./package.json
```

**Nova linha a inserir após a linha de `scripts`**:
```dockerfile
COPY --from=build /app/apps/backend/scripts ./apps/backend/scripts
COPY --from=build /app/apps/backend/templates ./apps/backend/templates
```

---

### `.env.example` (config, CFG-01/02/03/04/05)

**Analog:** Próprio arquivo — padrão de seções comentadas já estabelecido (ex: linhas 43-52 seção MinIO, linhas 54-65 seção Efi Pay, linhas 68-74 seção NFS-e).

**Padrão de seção existente para referência** (linhas 68-74):
```bash
# NFS-e (Prefeitura de Ilhabela — iiBrasil)
# Token de produção — em homologação o token de teste já está embutido no código
NFSE_TOKEN=SEU_TOKEN_NFSE
NFSE_CNPJ_PRESTADOR=SEU_CNPJ_PRESTADOR
NFSE_INSCRICAO_MUNICIPAL=SUA_INSCRICAO_MUNICIPAL
NFSE_SOAP_URL=https://ilhabela2.iibr.com.br/rps/3520400/1/soap/producao/rps
NFSE_AUX_URL=https://ilhabela2.iibr.com.br/rps/3520400/2/AUXILIARRPS
```

**Nova seção a adicionar** (D-01/D-02/CFG-01..05):
```bash
# Empresa (White-Label)
# Dados exibidos no PDF de orcamento e na NFS-e.
# Para customizar, edite estes valores no .env do seu deploy.
EMPRESA_NOME=Bom Custo Papelaria & Grafica Rapida LTDA
EMPRESA_CNPJ=62.391.927/0001-57
EMPRESA_ENDERECO=Rua Olimpio Leite da Silva, 39 - Loja 07, Perequê · Ilhabela / SP · CEP 11633-078
EMPRESA_MUNICIPIO_IBGE=3520400

# URL publica do logo (opcional — sem definicao, o logo e omitido do PDF sem imagem quebrada)
# EMPRESA_LOGO_URL=https://seudominio.com/logo.png

# Cor primaria da marca em hex (opcional — fallback: #0d6efd azul Bootstrap)
# EMPRESA_COR_PRIMARIA=#0d6efd

# Caminho para template PDF customizado (opcional — fallback: template padrao do sistema)
# Pode ser montado via volume Docker: -v /host/meu-template.hbs:/app/apps/backend/templates/custom.hbs
# EMPRESA_PDF_TEMPLATE_PATH=/app/apps/backend/templates/custom.hbs

# ATENCAO para deploy em outro municipio: definir tambem NFSE_SOAP_URL e NFSE_AUX_URL
# com as URLs do provedor NFS-e do municipio (os defaults apontam para Ilhabela/iiBrasil)
```

**Posição de inserção:** Após a seção NFS-e (linha 74) e antes da seção Seguranca (linha 76).

---

## Shared Patterns

### ConfigService — leitura de env var com fallback
**Fonte:** `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts` linha 202 e `apps/backend/src/modules/integrations/nfse/nfse.service.ts` linhas 66-68
**Aplicar a:** `nfse.service.ts` (getter CODIGO_MUNICIPIO) e `quotes-pdf-storage.service.ts` (bloco de empresa em `renderHtml()`)
```typescript
// Var opcional com fallback de string:
this.configService.get<string>("MINIO_REGION") ?? "us-east-1"

// Var opcional sem fallback (retorna undefined):
this.configService.get<string>("EMPRESA_LOGO_URL")   // undefined quando ausente — intencional

// Getter computado (padrão NfseService):
private get CODIGO_MUNICIPIO() {
  return this.config.get<string>("EMPRESA_MUNICIPIO_IBGE") ?? "3520400";
}
```

### InternalServerErrorException para falha de arquivo
**Fonte:** `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts` linhas 232-236
**Aplicar a:** Lógica de resolução de template em `renderHtml()` quando `EMPRESA_PDF_TEMPLATE_PATH` está definida mas arquivo ausente
```typescript
throw new InternalServerErrorException(
  `Configuracao ausente para PDF/MinIO: defina a variavel ${name}.`,
);
// Adaptar para:
throw new InternalServerErrorException(
  `EMPRESA_PDF_TEMPLATE_PATH definida mas arquivo nao encontrado: ${customPath}`,
);
```

### Fail-fast via REQUIRED_ENV_VARS
**Fonte:** `apps/backend/src/modules/app.module.ts` linhas 22-43
**Aplicar a:** Adição das 4 vars `EMPRESA_*` obrigatórias + atualização da mensagem de erro com hint
```typescript
const REQUIRED_ENV_VARS = [
  // ... existentes ...
  "EMPRESA_NOME",
  "EMPRESA_CNPJ",
  "EMPRESA_ENDERECO",
  "EMPRESA_MUNICIPIO_IBGE",
] as const;

// Mensagem atualizada no throw:
throw new Error(
  `Missing required environment variables: ${missing.join(", ")} — See .env.example for EMPRESA_* setup instructions`,
);
```

---

## Test Pattern

### Padrão de mock ConfigService (para novo teste `quotes-pdf-storage.service.test.ts`)
**Fonte:** `apps/backend/src/modules/integrations/nfse/nfse.service.test.ts` linhas 70-81
```typescript
const mockConfig = {
  get: jest.fn((key: string) => {
    const vals: Record<string, string> = {
      NFSE_TOKEN: "tok",
      NFSE_CNPJ_PRESTADOR: "12345678000190",
      // Adaptar para PDF:
      EMPRESA_NOME: "Empresa Teste",
      EMPRESA_CNPJ: "00.000.000/0001-00",
      EMPRESA_ENDERECO: "Rua Teste, 1",
      EMPRESA_MUNICIPIO_IBGE: "3550308",
      // EMPRESA_LOGO_URL: omitir para testar ausencia = undefined
      // EMPRESA_COR_PRIMARIA: omitir para testar fallback #0d6efd
    };
    return vals[key] ?? undefined;  // undefined para vars ausentes (nao "")
  }),
};
```

**Padrão de TestingModule para serviço** (linhas 85-96):
```typescript
async function buildService(mocks: ReturnType<typeof buildMocks>) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      QuotesPdfStorageService,
      { provide: ConfigService, useValue: mocks.mockConfig },
    ],
  }).compile();
  return module.get<QuotesPdfStorageService>(QuotesPdfStorageService);
}
```

---

## No Analog Found

Nenhum arquivo desta fase está sem analog — todos são modificações de arquivos existentes ou extração de conteúdo já presente no codebase.

---

## Metadata

**Scope de busca de analogs:** `apps/backend/src/modules/` (foco em NfseService e QuotesPdfStorageService)
**Arquivos lidos:** 7 (nfse.service.ts, quotes-pdf-storage.service.ts, quotes-pdf.template.ts, app.module.ts, Dockerfile, .env.example, nfse.service.test.ts)
**Data de extração:** 2026-06-18
