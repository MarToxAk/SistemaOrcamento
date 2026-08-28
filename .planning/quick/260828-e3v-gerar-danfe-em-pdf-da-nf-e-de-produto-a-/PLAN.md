---
task: "Anexar a NF-e de produto como PDF (DANFE) — nao mais .xml — no e-mail de contas a receber, usando a biblioteca pronta nfe-danfe-pdf (sem renderer do zero)"
quick_id: 260828-e3v-gerar-danfe-em-pdf-da-nf-e-de-produto-a-
branch: fix/orcamento-total-desconto-zerado
type: quick
autonomous: true
depends_on: []
files_modified:
  - apps/backend/package.json
  - package-lock.json
  - apps/backend/src/modules/integrations/nfse/danfe-pdf.service.ts
  - apps/backend/src/modules/integrations/nfse/nfse.module.ts
  - apps/backend/src/modules/integrations/athos/athos.service.ts
  - apps/backend/src/modules/cobranca/email-envio.service.ts
  - apps/backend/src/modules/cobranca/email-envio.service.test.ts
  - apps/backend/src/modules/cobranca/cobranca.controller.ts
  - apps/backend/src/modules/integrations/nfse/danfe-pdf.service.test.ts
  - apps/backend/src/modules/integrations/nfse/danfe-pdf.service.render.test.ts
  - apps/backend/src/modules/integrations/nfse/__fixtures__/nfe-573.xml
  - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx
user_setup:
  - "Nenhum novo para humanos. EMPRESA_LOGO_URL (env ja usada pelo DanfsePdfService) continua OPCIONAL: se setada, o logo entra no DANFE; se vazia ou o download falhar, o DANFE renderiza sem logo (sem erro)."
locked_decisions: .planning/quick/260828-e3v-gerar-danfe-em-pdf-da-nf-e-de-produto-a-/DECISIONS.md
---

# Quick task 260828-e3v — NF-e de produto como PDF (DANFE) no e-mail de contas a receber

A quick **260827-ood** ja entrega o e-mail (boleto PDF + NFS-e PDF + NF-e como **XML cru**). Esta task troca a NF-e de produto de `.xml` para **PDF (DANFE)** renderizado pela biblioteca pronta **`nfe-danfe-pdf`** (`@1.0.3`, MIT, deps 100% JS — `pdfkit`/`bwip-js`/`qrcode`/`xml2js`/`date-fns`; sem build nativo). Substitui a abordagem anterior de construir renderer do zero.

Fluxo: `EmailEnvioService` renderiza cada NF-e (`nfeProc` XML do Athos) num DANFE PDF via novo `DanfePdfService` e anexa `NF-e-<numero>.pdf` (`application/pdf`). Em **qualquer** erro de render → `logger.warn` + fallback para anexar o `.xml` cru (`application/xml`) e segue — o e-mail nunca falha. Endpoint autenticado de debug `GET /cobranca/nfe/danfe` devolve o PDF sem disparar e-mail.

## Restricoes travadas (de DECISIONS.md — nao-negociaveis)

- Lib `nfe-danfe-pdf@1.0.3`. **NAO** construir parser/template/renderer de DANFE do zero. **NAO** usar Puppeteer para NF-e. `node-sped-pdf` descartada (puxa `canvas` nativo).
- API: `import { gerarPDF } from "nfe-danfe-pdf"` → `gerarPDF(xml: string, opcoes?: { pathLogo?: string; cancelada?: boolean; textoRodape?: string }): Promise<PDFKit.PDFDocument>`.
- **Pegadinha:** NAO chamar `doc.end()` — a lib finaliza internamente. Coletar via `doc.on("data"|"end"|"error")` em `Buffer.concat(chunks)`.
- `pathLogo` e caminho de **arquivo** no disco (nao data URI, nao Buffer) — por isso o `DanfePdfService` baixa `EMPRESA_LOGO_URL` para um arquivo temp.
- Somente modelo 55. NFC-e / modelo 65 fora de escopo.
- Branch `fix/orcamento-total-desconto-zerado`. **NAO** tocar `main` nem a PR #56. Sem push. Segredos intocados.

## Fatos do codigo verificados nesta investigacao

- **`nfe-danfe-pdf@1.0.3`** (registro npm): `main: lib/index.js` (CommonJS), `types: lib/index.d.ts`. Export unico: `gerarPDF(xmlNFe: string, opcoes?: OpcoesPDF): Promise<PDFKit.PDFDocument>`. `OpcoesPDF = { pathLogo?: string; cancelada?: boolean; textoRodape?: string }`. Deps runtime: `bwip-js@4.2.0`, `date-fns@4.1.0`, `ordate@^0.0.1` (→ `orerror`), `pdfkit@0.17.2`, `qrcode@1.5.4`, `xml2js@0.6.2` — todas puro-JS/MIT, sem node-gyp. `ordate`/`orerror` sao libs minusculas de data/erro nao listadas no DECISIONS mas inertes.
- `gerarPDF` exige o wrapper `<nfeProc>` (acessa `nf.nfeProc.NFe.infNFe...`), com `<pag><detPag>` presente; `<cobr>/<dup>` opcional; despacha por `ide.mod === "55"`. O `fixture-nfe-573.xml` desta pasta atende (nfeProc 4.00 + protNFe + pag + cobr/dup, Simples Nacional CSOSN 500, 5 itens, vNF 489,29) e ja foi validado localmente → PDF 1 pagina ~84 KB.
- **`@types/pdfkit` NAO vem transitivo** — e `devDependency` do `nfe-danfe-pdf`. O `.d.ts` publicado referencia o namespace global `PDFKit`. `apps/backend/tsconfig.json` tem `skipLibCheck: true` (protege os `.d.ts` internos da lib), mas o nosso codigo ao dar `await gerarPDF(...)` precisa de `PDFKit` resolvivel → **adicionar `@types/pdfkit` como devDependency do backend**.
- `apps/backend/tsconfig.json`: `module: Node16`, `moduleResolution: node16`, `strict: true`, `skipLibCheck: true`. O projeto ja importa CJS via `import * as nodemailer` / `import axios from "axios"` / `import Handlebars from "handlebars"` — interop CJS funcionando. Se `import { gerarPDF } from "nfe-danfe-pdf"` reclamar sob Node16, usar `import * as danfePdf from "nfe-danfe-pdf"` e `danfePdf.gerarPDF`.
- **`DanfsePdfService`** (`apps/backend/src/modules/integrations/nfse/danfse-pdf.service.ts`) e `@Injectable()`, injeta `ConfigService`, esta em `providers` **e** `exports` do `NfseModule`. `CobrancaModule` ja faz `imports: [EfiModule, AthosModule, NfseModule]` e `CobrancaService` injeta `danfsePdfService` por esse export. `EmailEnvioService` ja e provider do `CobrancaModule`. → registrar `DanfePdfService` do mesmo jeito (providers + exports do `NfseModule`) e injeta-lo no `EmailEnvioService`.
- `DanfsePdfService.resolveLogoDataUri` (mesmo arquivo) e o molde do logo: le `EMPRESA_LOGO_URL`, `axios.get` arraybuffer, timeout 5000, `maxContentLength` 5 MB, exige `content-type` `image/*`, cache em `Map` com TTL, `catch → warn + undefined`. O `DanfePdfService` faz igual mas grava um **arquivo** em `os.tmpdir()` e cacheia o **path**.
- **`AthosService.buscarNotasFiscaisXmlPorTitulos(idcontasReceber: number[])`** (`athos.service.ts` ~l.2077) hoje retorna `Array<{ numero: string; xml: string }>`. Pool read-only (`getPool()` → `client.release()` no `finally`), `= ANY($1)`, `SELECT DISTINCT n.numero, n.xml FROM conta_receber cr JOIN venda_nota vn ON vn.idvenda = cr.idvenda JOIN nota n ON n.idnota = vn.idnota WHERE cr.idcontareceber = ANY($1) AND n.xml IS NOT NULL AND n.nfechaveacesso IS NOT NULL AND COALESCE(n.cancelada, false) = false ORDER BY n.numero`, dedupe por `numero` num `Map`, `catch → this.logger.warn("buscarNotasFiscaisXmlPorTitulos: ...") + return []`. Athos PG e 9.0.5 (sem `left()`).
- **Nao existe teste** cobrindo `buscarNotasFiscaisXmlPorTitulos` (`git grep` so acha o metodo em `athos.service.ts`, `email-envio.service.ts`, `email-envio.service.test.ts` e docs). `athos.service.test.ts` / `athos-notas-fiscais.test.ts` NAO tocam nele.
- **`EmailEnvioService`** (`apps/backend/src/modules/cobranca/email-envio.service.ts`): construtor injeta `config, prisma, cobrancaService, athosService`. No loop de NF-e (l.104-121) monta `{ filename: \`NF-e-${numero}.xml\`, content: xml, contentType: "application/xml" }` e `nfeNumeros = notasXml.map(n => n.numero)`. Frase do corpo (l.137): `Serão anexados: boleto (PDF) + ${nNfse} NFS-e (PDF) + ${mNfe} NF-e (XML)`. `create({ data: { ..., nfeNumeros } })` grava igual. Imports de `@nestjs/common`: `BadRequestException, Injectable, InternalServerErrorException, Logger`.
- **`email-envio.service.test.ts`**: `jest.mock("nodemailer")`; `Object.create(EmailEnvioService.prototype)` + `(service as any).dep = { ...jest.fn()... }`. `makeService()` seta `config/prisma/cobrancaService/athosService`. Teste 1 hoje: `mail.attachments` length **5** (1 boleto + 2 NFS-e + 2 NF-e), filtra `contentType === "application/xml"` → 2, filenames `["NF-e-440.xml","NF-e-441.xml"]`, `content === "<NFe/>"`. `athosService.buscarNotasFiscaisXmlPorTitulos` mock → `[{numero:"440",xml:"<NFe/>"},{numero:"441",xml:"<NFe/>"}]`. Teste 5: sem NF-e → `attachments` length 2, `nfeNumeros: []`.
- **`cobranca.controller.ts`**: `@Controller("cobranca")` + prefixo global `api`. Topo tem `type ExpressResponse = any`; imports `Body, Controller, Get, Param, ParseIntPipe, Post, Query, Res` (de `@nestjs/common`) e `Public` (de `../security/public.decorator`). Construtor injeta `cobrancaService` e `emailEnvioService`. Guard global `InternalAuthGuard` exige `x-internal-api-key` exceto handlers `@Public()`. Ordem importa (`nfse/emitir` antes de `nfse/:id/pdf`); `nfe/danfe` e prefixo distinto de `nfse/*`, sem colisao — declarar junto dos GET de `nfse/*`, logo apos `@Get("nfse/:id/pdf")`.
- **`CobrancaService`** injeta `danfsePdfService: DanfsePdfService` (l.39) e usa `gerarPdfDoXml`. `Object.create` nos testes unitarios → mudar construtor nao quebra `cobranca.service.unit.test.ts` / `cobranca.service.cliente.test.ts`. (Nesta task NAO mexemos no `CobrancaService`.)
- **Frontend** `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` (client component): modal de e-mail, `<small className="text-muted d-block">` ~l.2015-2018:
  `Serão anexados: boleto (PDF) + {emailCtx.nfseEmitidaIds.length} NFS-e (PDF) +{" "}` / `{emailCtx.nfeCount} NF-e (XML)`. **Unico** match de `NF-e (XML)` no arquivo. A lista de sucesso (`emailResult.anexos`, ~l.2056-2060) ja renderiza os filenames que o backend devolve — vira `NF-e-573.pdf` sozinha. Frontend so tem `next build` (sem typecheck isolado).
- **Jest backend** (`apps/backend/jest.config.js`): `rootDir: src`, `testRegex: .*\.test\.ts$`, `testEnvironment: node`, ts-jest com `module: CommonJS`. Testes `*.test.ts` ao lado do fonte. `collectCoverageFrom` so `.ts/.js` (fixture `.xml` inerte). `.planning/` pode ser arquivado pelo `gsd-cleanup` → **copiar** o fixture para `src/.../__fixtures__/nfe-573.xml` (nao referenciar `.planning/` no teste).

## Decisao de design forcada pelo codigo

- **`@types/pdfkit` como devDependency do backend** (nao vem transitivo; o `.d.ts` da lib usa o global `PDFKit`; `skipLibCheck` nao cobre o uso no nosso codigo).
- **Endpoint de debug usa `?cobrancaBoletoId=<id>&numero=<n>`**, nao `?idclienteAthos=<id>&numero=<n>` como esbocado no DECISIONS. Motivo: reaproveita **exatamente** o caminho do envio (`prisma.cobrancaBoleto.titulos[].idcontareceber` → `buscarNotasFiscaisXmlPorTitulos`), zero consulta Athos nova, e `cobrancaBoletoId` e o que o frontend ja tem. `numero` opcional (sem ele → renderiza a 1a NF-e do boleto). Esta e a variante "via `buscarNotasFiscaisXmlPorTitulos`" que o DECISIONS admite.
- **`previewDanfePdf` mora no `EmailEnvioService`** (ja tem `prisma` + `athosService`, e a Task 3 injeta `danfePdfService`), nao no `CobrancaService` — evita nova dep no construtor do `CobrancaService` e mantem o blast radius pequeno.
- **`cancelada` fica plumbado ate a lib mas e `false` na pratica**: `buscarNotasFiscaisXmlPorTitulos` continua filtrando `COALESCE(n.cancelada, false) = false` (NF-e cancelada NAO deve ir pro cliente). O campo existe pela assinatura da lib e para o endpoint de debug / uso futuro.
- **`nfe-danfe-pdf` le `.ttf` embutidos do proprio `node_modules` em runtime** — ok no deploy atual (`tsc` + `node_modules`, sem bundler/tree-shaking).

---

## Tarefas (ordem obrigatoria)

### Task 1 — `npm install nfe-danfe-pdf` + `DanfePdfService` + registro no `NfseModule`

**Arquivos:**
- `apps/backend/package.json` (editar via `npm install`)
- `package-lock.json` (raiz — monorepo npm workspaces, atualizado pelo install)
- `apps/backend/src/modules/integrations/nfse/danfe-pdf.service.ts` (criar)
- `apps/backend/src/modules/integrations/nfse/nfse.module.ts` (editar)

**Acao:**

1. `cd apps/backend && npm install nfe-danfe-pdf && npm install -D @types/pdfkit`.

2. Criar `DanfePdfService` (`@Injectable()`), injetando `ConfigService`. Molde de logo/cache = `DanfsePdfService.resolveLogoDataUri` (mesmo diretorio), mas gravando **arquivo** temp.

   - `import { gerarPDF } from "nfe-danfe-pdf";` (se o `tsc` reclamar sob Node16, trocar por `import * as danfePdf from "nfe-danfe-pdf"` + `danfePdf.gerarPDF`).
   - `async gerarDanfe(input: { xml: string; cancelada?: boolean }): Promise<Buffer>`:
     - `const pathLogo = await this.resolveLogoPath();`
     - montar `opcoes: { cancelada: input.cancelada ?? false }` e adicionar `pathLogo` **so se** definido (nao passar a chave com `undefined`).
     - `const doc = await gerarPDF(input.xml, opcoes);`
     - coletar o stream SEM `doc.end()`: `const chunks: Buffer[] = []; await new Promise<void>((res, rej) => { doc.on("data", (c: Buffer) => chunks.push(c)); doc.on("end", () => res()); doc.on("error", rej); });` → `return Buffer.concat(chunks);`
     - **timeout de seguranca ~20s**: `Promise.race` entre a promise de coleta e um `setTimeout` que rejeita `new Error("DANFE render timeout")` (limpar o timer no fim).
     - qualquer rejeicao (evento `error`, timeout, throw da lib) sobe como excecao — quem chama trata.
   - privado `resolveLogoPath(): Promise<string | undefined>`:
     - `const url = this.config.get<string>("EMPRESA_LOGO_URL")?.trim();` → vazio: `return undefined`.
     - se ja for caminho local existente (`fs.existsSync`), retorna ele.
     - se `http(s)`: cache em campo de instancia (`Map<url, path>`); senao `axios.get(url, { responseType: "arraybuffer", timeout: 5000, maxContentLength: 5*1024*1024, maxBodyLength: 5*1024*1024 })`, exigir `content-type` `image/*`, gravar em `path.join(os.tmpdir(), \`danfe-logo-<sha1(url).slice(0,12)>.<ext>\`)`, cachear e retornar o path.
     - `catch → this.logger.warn(...) + return undefined` (logo e best-effort, nunca quebra o render).

3. Em `nfse.module.ts`, adicionar `DanfePdfService` ao `providers` **e** ao `exports` (import no topo, mesmo padrao de `DanfsePdfService`).

**Aceite (da raiz do repo):**
- `cd apps/backend && npx tsc -p tsconfig.build.json --noEmit` → sem erros.
- `node -e "const p=require('./apps/backend/package.json'); process.exit(p.dependencies['nfe-danfe-pdf'] && p.devDependencies['@types/pdfkit'] ? 0 : 1)"` → exit 0.
- `grep -n "from \"nfe-danfe-pdf\"" apps/backend/src/modules/integrations/nfse/danfe-pdf.service.ts` → import presente.
- `grep -vc '^\s*//' apps/backend/src/modules/integrations/nfse/danfe-pdf.service.ts` e `grep -c 'doc.end()' apps/backend/src/modules/integrations/nfse/danfe-pdf.service.ts` → **0** (nunca finaliza o doc manualmente).
- `grep -c 'DanfePdfService' apps/backend/src/modules/integrations/nfse/nfse.module.ts` → `>= 3` (import + provider + export).
- Sanity da lib crua + fixture (prova lib+fixture ponta a ponta, sem nosso codigo):
  ```
  cd apps/backend && node -e "(async()=>{const {gerarPDF}=require('nfe-danfe-pdf');const fs=require('fs');const xml=fs.readFileSync('../../.planning/quick/260828-e3v-gerar-danfe-em-pdf-da-nf-e-de-produto-a-/fixture-nfe-573.xml','utf8');const doc=await gerarPDF(xml,{});const chunks=[];doc.on('data',c=>chunks.push(c));doc.on('end',()=>{const b=Buffer.concat(chunks);console.log('bytes',b.length,'head',b.subarray(0,5).toString());process.exit(b.subarray(0,4).toString()==='%PDF'&&b.length>10240?0:1)});doc.on('error',e=>{console.error(e);process.exit(1)})})()"
  ```
  → imprime `head %PDF-` e `bytes` > 10240, exit 0.

---

### Task 2 — Athos: `buscarNotasFiscaisXmlPorTitulos` passa a retornar `cancelada`

**Arquivos:**
- `apps/backend/src/modules/integrations/athos/athos.service.ts` (editar — so esse metodo)

**Acao:**

- SELECT: `SELECT DISTINCT n.numero, n.xml` → `SELECT DISTINCT n.numero, n.xml, n.cancelada`.
- Manter a clausula `WHERE ... AND COALESCE(n.cancelada, false) = false` (NF-e cancelada continua fora do e-mail do cliente — por isso `cancelada` sera `false` na pratica hoje; o campo existe pela assinatura da lib e uso futuro).
- Tipo de retorno: `Promise<Array<{ numero: string; xml: string; cancelada: boolean }>>`.
- O `Map` de dedupe passa a guardar `{ xml: string; cancelada: boolean }` (chave = `numero`); manter "1a ocorrencia com `xml` nao-vazio".
- Mapear `cancelada: r["cancelada"] === true` (Athos PG pode devolver `boolean` ou `"t"/"f"`; se vier string, normalizar: `r["cancelada"] === true || r["cancelada"] === "t"`).
- Manter pool read-only + `client.release()` no `finally` + `catch → this.logger.warn("buscarNotasFiscaisXmlPorTitulos: ...") + return []`.
- Nenhum teste cobre esse metodo (`git grep` confirma) — nada mais a atualizar aqui. O consumidor (`EmailEnvioService` + seu teste) e a Task 3.

**Aceite (da raiz do repo):**
- `cd apps/backend && npx tsc -p tsconfig.build.json --noEmit` → sem erros.
- `grep -n 'n.numero, n.xml, n.cancelada' apps/backend/src/modules/integrations/athos/athos.service.ts` → SELECT estendido.
- `grep -n 'numero: string; xml: string; cancelada: boolean' apps/backend/src/modules/integrations/athos/athos.service.ts` → tipo de retorno novo.
- `grep -c 'COALESCE(n.cancelada, false) = false' apps/backend/src/modules/integrations/athos/athos.service.ts` → inalterado vs. antes desta task (filtro mantido).
- `cd apps/backend && npm test` → sem regressao.

---

### Task 3 — `EmailEnvioService`: renderiza DANFE PDF (fallback XML) + `previewDanfePdf` + teste

**Arquivos:**
- `apps/backend/src/modules/cobranca/email-envio.service.ts` (editar)
- `apps/backend/src/modules/cobranca/email-envio.service.test.ts` (editar)

**Acao (`email-envio.service.ts`):**

1. Import `import { DanfePdfService } from "../integrations/nfse/danfe-pdf.service";` e adicionar `NotFoundException` ao import de `@nestjs/common`.
2. Construtor: adicionar `private readonly danfePdfService: DanfePdfService` (apos `athosService`).
3. No loop de NF-e (`for (const { numero, xml } of notasXml)`), passar a desestruturar tambem `cancelada` e trocar o anexo XML por render PDF com fallback:
   - `try { const pdf = await this.danfePdfService.gerarDanfe({ xml, cancelada }); attachments.push({ filename: \`NF-e-${numero}.pdf\`, content: pdf, contentType: "application/pdf" }); }`
   - `catch (err) { this.logger.warn(\`DANFE render falhou p/ NF-e ${numero}: ${err instanceof Error ? err.message : String(err)}; anexando XML cru.\`); attachments.push({ filename: \`NF-e-${numero}.xml\`, content: xml, contentType: "application/xml" }); }`
   - `nfeNumeros = notasXml.map((n) => n.numero)` **inalterado**; `prisma.cobrancaEmailEnvio.create({ data: { ..., nfeNumeros } })` **inalterado**.
4. Frase do corpo (`listaAnexosFrase`): `+ ${mNfe} NF-e (XML)` → `+ ${mNfe} NF-e (PDF)` (consistencia com o frontend; nenhum teste asserta essa string).
5. Novo metodo publico `async previewDanfePdf(cobrancaBoletoId: number, numero?: string): Promise<{ pdfBuffer: Buffer; nomeArquivo: string }>`:
   - `const boleto = await this.prisma.cobrancaBoleto.findUnique({ where: { id: cobrancaBoletoId }, include: { titulos: { select: { idcontareceber: true } } } });`
   - `const idcontas = boleto?.titulos.map((t) => t.idcontareceber) ?? [];`
   - `const notas = idcontas.length ? await this.athosService.buscarNotasFiscaisXmlPorTitulos(idcontas) : [];`
   - escolher: `const alvo = numero?.trim() ? notas.find((n) => n.numero === numero.trim()) : notas[0];`
   - se `!alvo` → `throw new NotFoundException("NF-e nao encontrada para esse boleto/numero.");`
   - `const pdfBuffer = await this.danfePdfService.gerarDanfe({ xml: alvo.xml, cancelada: alvo.cancelada });`
   - `return { pdfBuffer, nomeArquivo: \`NF-e-${alvo.numero}.pdf\` };`

**Acao (`email-envio.service.test.ts`):**

- Em `makeService()`, adicionar `(service as any).danfePdfService = { gerarDanfe: jest.fn().mockResolvedValue(Buffer.from("%PDF-1.4 fake-danfe")) };`
- `athosService.buscarNotasFiscaisXmlPorTitulos` mock → incluir `cancelada: false` em cada item: `[{ numero: "440", xml: "<NFe/>", cancelada: false }, { numero: "441", xml: "<NFe/>", cancelada: false }]`.
- **Teste 1** (renomear p/ "…2 NF-e PDF…"): `mail.attachments` continua length **5**; filtrar `a.contentType === "application/pdf"` → **2**, filenames `["NF-e-440.pdf","NF-e-441.pdf"]`, `content` = o Buffer mockado (`content.subarray(0,4).toString() === "%PDF"`); `danfePdfService.gerarDanfe` chamado **2x** com `{ xml: "<NFe/>", cancelada: false }`; `createArg.nfeNumeros` → `["440","441"]` (inalterado).
- **Novo teste** ("render falha p/ uma NF-e → fallback XML"): `danfePdfService.gerarDanfe` `.mockRejectedValueOnce(new Error("boom")).mockResolvedValue(Buffer.from("%PDF-1.4 ok"))`. Enviar com as 2 notas → `attachments` tem 1 anexo `NF-e-440.xml` (`application/xml`, `content === "<NFe/>"`) e 1 anexo `NF-e-441.pdf` (`application/pdf`); `sendMail` chamado 1x; `create` chamado com `nfeNumeros: ["440","441"]`.
- Demais testes (2, 3, 4, 5, 6, 7) seguem passando; Teste 5 (sem NF-e) inalterado (`attachments` length 2).

**Aceite (da raiz do repo):**
- `cd apps/backend && npx tsc -p tsconfig.build.json --noEmit` → sem erros.
- `grep -n 'gerarDanfe\|application/pdf\|previewDanfePdf' apps/backend/src/modules/cobranca/email-envio.service.ts` → os 3 presentes.
- `grep -c 'NF-e (XML)' apps/backend/src/modules/cobranca/email-envio.service.ts` → **0**; `grep -c 'NF-e (PDF)' ...` → **1**.
- `cd apps/backend && npx jest src/modules/cobranca/email-envio.service.test.ts` → todos verdes.
- `cd apps/backend && npm test` → suite completa sem regressao.

---

### Task 4 — Endpoint autenticado de debug `GET /cobranca/nfe/danfe` + copy do modal no frontend

**Arquivos:**
- `apps/backend/src/modules/cobranca/cobranca.controller.ts` (editar)
- `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` (editar)

**Acao (`cobranca.controller.ts`):**

Adicionar, logo apos `@Get("nfse/:id/pdf")` (agrupado com os GET de `nfse/*`; `nfe/danfe` e prefixo distinto, sem colisao de rota):

```
/** Debug: renderiza o DANFE (PDF) de uma NF-e por tras de um boleto, sem disparar e-mail. AUTHED (guard global). */
@Get("nfe/danfe")
async previewDanfe(
  @Query("cobrancaBoletoId", ParseIntPipe) cobrancaBoletoId: number,
  @Query("numero") numero: string | undefined,
  @Res() res: ExpressResponse,
) {
  const { pdfBuffer, nomeArquivo } = await this.emailEnvioService.previewDanfePdf(cobrancaBoletoId, numero);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${nomeArquivo}"`);
  res.send(pdfBuffer);
}
```

- **NAO** por `@Public()` — o guard global protege (mesmo padrao dos outros GET `cobranca/*` de PDF).
- `Query`, `ParseIntPipe`, `Res`, `ExpressResponse` ja existem no arquivo.

**Acao (`page.tsx`):**

- Trocar a unica ocorrencia de `NF-e (XML)` (`<small className="text-muted d-block">`, ~l.2017) por `NF-e (PDF)`. Nada mais no arquivo muda (a lista de sucesso ja mostra os filenames vindos do backend → `NF-e-573.pdf`).

**Aceite (da raiz do repo):**
- `cd apps/backend && npx tsc -p tsconfig.build.json --noEmit` → sem erros.
- `grep -n '@Get("nfe/danfe")' apps/backend/src/modules/cobranca/cobranca.controller.ts` → 1 match.
- `grep -c '@Public()' apps/backend/src/modules/cobranca/cobranca.controller.ts` → **inalterado** vs. antes (endpoint novo NAO e publico).
- `git grep -c 'NF-e (XML)' "apps/frontend/src/app/contas-receber/[idcliente]/page.tsx"` → **0**; `git grep -c 'NF-e (PDF)' "apps/frontend/src/app/contas-receber/[idcliente]/page.tsx"` → **1**.
- `cd apps/frontend && npm run build` → compila sem erro de tipo/lint no arquivo alterado.
- `cd apps/backend && npm test` → sem regressao.

---

### Task 5 — Testes do `DanfePdfService`: unit (mock) + render real do fixture 573

**Arquivos:**
- `apps/backend/src/modules/integrations/nfse/__fixtures__/nfe-573.xml` (criar — copia byte a byte de `.planning/quick/260828-e3v-gerar-danfe-em-pdf-da-nf-e-de-produto-a-/fixture-nfe-573.xml`)
- `apps/backend/src/modules/integrations/nfse/danfe-pdf.service.test.ts` (criar — `jest.mock("nfe-danfe-pdf")`)
- `apps/backend/src/modules/integrations/nfse/danfe-pdf.service.render.test.ts` (criar — render real, SEM mock)

**Acao:**

1. Copiar o fixture para `src/.../__fixtures__/nfe-573.xml` (o teste NAO pode depender de `.planning/`, que o `gsd-cleanup` arquiva).

2. `danfe-pdf.service.test.ts` — `jest.mock("nfe-danfe-pdf")` no topo. Helper que devolve um "doc" fake tipo `EventEmitter`:
   - `const { gerarPDF } = require("nfe-danfe-pdf");` → `(gerarPDF as jest.Mock).mockImplementation(async () => { const ev = new (require("events").EventEmitter)(); process.nextTick(() => { ev.emit("data", Buffer.from("%PDF-1.4 ")); ev.emit("data", Buffer.from("rest")); ev.emit("end"); }); return ev; });`
   - `Object.create(DanfePdfService.prototype)` + `(service as any).config = { get: (k) => ({ EMPRESA_LOGO_URL: "" }[k]) }` + `(service as any).logger = { warn: jest.fn() }`.
   - Casos:
     1. `gerarDanfe({ xml: "<x/>" })` → resolve `Buffer` cujos primeiros 4 bytes sao `%PDF` e concatena os 2 chunks (`length === 12`); `gerarPDF` chamado com `("<x/>", expect.objectContaining({ cancelada: false }))`.
     2. `gerarDanfe({ xml: "<x/>", cancelada: true })` → `gerarPDF` recebe `cancelada: true` nas opcoes.
     3. `EMPRESA_LOGO_URL` vazia → opcoes passadas a `gerarPDF` **sem** `pathLogo` (`expect(opts.pathLogo).toBeUndefined()`).
     4. doc emite `error` → `gerarDanfe` **rejeita** (impl: mock que faz `ev.emit("error", new Error("x"))`).
   - (Opcional) timeout: com `jest.useFakeTimers()`, mock que nunca emite `end` → avancar 20s → `rejects` com `/timeout/i`.

3. `danfe-pdf.service.render.test.ts` — SEM `jest.mock`. Usa o `DanfePdfService` real e o `gerarPDF` real:
   - `jest.setTimeout(20000);`
   - `const service = Object.create(DanfePdfService.prototype);` + `(service as any).config = { get: () => "" }` (EMPRESA_LOGO_URL vazio → sem logo) + `(service as any).logger = { warn: jest.fn() }`.
   - `const xml = fs.readFileSync(path.join(__dirname, "__fixtures__/nfe-573.xml"), "utf8");`
   - `const buf = await service.gerarDanfe({ xml });`
   - `expect(buf.subarray(0, 5).toString()).toBe("%PDF-");`
   - `expect(buf.length).toBeGreaterThan(10 * 1024);`

**Aceite (da raiz do repo):**
- `cd apps/backend && npx jest src/modules/integrations/nfse/danfe-pdf.service.test.ts src/modules/integrations/nfse/danfe-pdf.service.render.test.ts` → todos verdes (o render real produz PDF `%PDF-` > 10 KB a partir do fixture 573).
- `cd apps/backend && npx tsc -p tsconfig.build.json --noEmit` → sem erros (tsconfig.build exclui `*.test.ts`, mas rodar mesmo assim como sanidade).
- `cd apps/backend && npm test` → suite completa verde, sem regressao.
- `git status --porcelain` mostra `__fixtures__/nfe-573.xml` + os 2 novos `*.test.ts`.

---

## Verificacao manual (ponta a ponta, local)

Pre: `npm run dev` (backend :4000). `apps/backend/.env` com `INTERNAL_API_KEY`, `DATABASE_URL`, SMTP + `APP_BASE_URL` (ja usados pela 260827-ood). `EMPRESA_LOGO_URL` opcional.

1. **Achar o boleto de teste.** Cliente **3504** / boleto **139** (mesmo par da 260827-ood) — `cobrancaBoletoId = 139`, titulos incluem a NF-e **573**.

2. **Endpoint de debug (sem e-mail):**
   ```
   curl -s "http://localhost:4000/api/cobranca/nfe/danfe?cobrancaBoletoId=139&numero=573" \
     -H "x-internal-api-key: $INTERNAL_API_KEY" -o /tmp/danfe-573.pdf
   file /tmp/danfe-573.pdf        # => PDF document
   ```
   Abrir `/tmp/danfe-573.pdf` e conferir:
   - **Emitente:** BOM CUSTO PAPELARIA & GRAFICA RAPIDA LTDA — CNPJ 62.391.927/0001-57 — RUA OLIMPIO LEITE DA SILVA, 39, PEREQUE, ILHABELA/SP.
   - **Destinatario:** ENOTEC ENGENHARIA OBRAS E TECNOLOGIA LTDA — CNPJ 56.096.886/0001-73 — SAO PAULO/SP.
   - **Itens (5):** HUB USB 3.0A 7 PORTAS; FITA DP FCE MASSA 19X2 (x2); BLOCO FLIP CHART 50F; ATAC PAP SULF A4 75G REPORT 500F; FITA DP FCE MASSA 19X2.
   - **Totais:** vProd / vNF = **R$ 489,29**; ICMS 0,00 (Simples Nacional, CSOSN 500).
   - **Chave de acesso:** 3526 0862 3919 2700 0157 5500 1000 0005 7317 6355 9432 + **codigo de barras** (Code128 da chave) legivel.
   - **Protocolo:** 135263532093935 — "Autorizado o uso da NF-e" — 26/08/2026 12:08:56.
   - **Logo:** presente se `EMPRESA_LOGO_URL` setada; ausente (sem erro) se vazia.
   - Se tiver `pdftotext`: `pdftotext /tmp/danfe-573.pdf - | head -40` mostra emitente/itens (os content streams sao Flate-comprimidos — `strings`/`grep` no PDF nao acham texto).
   - `numero` errado / boleto sem NF-e → HTTP **404** ("NF-e nao encontrada…").

3. **E-mail real (contas a receber):** na UI `/contas-receber/3504`, header do grupo do boleto 139 → **E-mail** → destinatario = **seu proprio e-mail** → **Enviar e-mail**. (Ou `POST /api/cobranca/email/enviar` com `{"idclienteAthos":3504,"cobrancaBoletoId":139}` + `x-internal-api-key`.)
   - Texto do modal (pre-envio): "… + N NFS-e (PDF) + M **NF-e (PDF)**".
   - Na caixa de entrada: **1 e-mail**, anexo **`NF-e-573.pdf`** abre num leitor de PDF (NAO e XML). Corpo: "… + 1 NF-e (PDF)".
   - Lista de sucesso na UI mostra `NF-e-573.pdf` entre os anexos.

4. **Fallback:** (opcional) apontar `EMPRESA_LOGO_URL` para uma URL invalida NAO deve quebrar (render sai sem logo). Para exercitar o fallback XML, um XML corrompido em `nota.xml` faria o anexo cair para `NF-e-<n>.xml` + `logger.warn` — o e-mail ainda sai.

5. **Testes e build:**
   ```
   cd apps/backend && npx jest src/modules/integrations/nfse/danfe-pdf.service.test.ts src/modules/integrations/nfse/danfe-pdf.service.render.test.ts src/modules/cobranca/email-envio.service.test.ts
   cd apps/backend && npm test
   cd apps/backend && npx tsc -p tsconfig.build.json --noEmit
   cd apps/frontend && npm run build
   ```

---

## Riscos / fora de escopo

- **`nfe-danfe-pdf` e v1.0.x (jovem, mantenedor unico).** Mitigacao: cada render de NF-e no `EmailEnvioService` esta em `try/catch` — em **qualquer** erro (evento `error`, timeout 20s, throw da lib) o `.xml` cru volta a ser anexado (`application/xml`) e o e-mail sai normalmente. O endpoint de debug expoe o erro direto (500 / 404) pra diagnostico.
- **Deps transitivas fora da lista do DECISIONS:** `ordate` → `orerror` (utilitarios minusculos de data/erro). Todas MIT, puro-JS, sem node-gyp — imagem Docker Alpine intocada. `@types/pdfkit` entra como **devDependency** (o `.d.ts` publicado da lib usa o global `PDFKit`, que e devDep da lib e nao vem transitivo).
- **Somente modelo 55.** NFC-e / modelo 65 fora de escopo (a lib suporta, nos nunca emitimos).
- **Logo e best-effort:** `EMPRESA_LOGO_URL` baixado uma vez pra arquivo temp; se vazia ou o download falhar, o DANFE sai sem logo (sem erro).
- **`cancelada` fica `false` na pratica:** `buscarNotasFiscaisXmlPorTitulos` mantem o filtro `COALESCE(n.cancelada, false) = false` — NF-e cancelada NAO deve ir pro cliente. O flag existe pela assinatura da lib e pra uso futuro/debug.
- **Fontes:** a lib le `.ttf` embutidos do proprio `node_modules` em runtime — ok no deploy atual (`tsc` + `node_modules`, sem bundler).
- **XML nao revalidado:** o DANFE e renderizado do `<nfeProc>` ja autorizado como o Athos guarda; sem re-emissao, sem consulta SEFAZ, sem validar assinatura.
- **Segredos intocados.** Nenhum env var novo obrigatorio. `deploy/stack.env.example` e os composes NAO mudam.
- **Branch `fix/orcamento-total-desconto-zerado` apenas.** NAO tocar `main` nem a PR #56. Sem push.
- **Fora de escopo:** botao "Ver DANFE"/"Baixar" em tela (o unico botao clicavel segue sendo "Confirmar recebimento" no e-mail); fila/retry; cache de PDF; DANFE paisagem/canhoto customizado (a lib faz retrato padrao 55); mexer no `CobrancaService`.

## Rollback

`git revert` do(s) commit(s) das tasks. Depois: `cd apps/backend && npm uninstall nfe-danfe-pdf @types/pdfkit`; conferir que voltaram — `nfse.module.ts` (sem `DanfePdfService` em providers/exports), `email-envio.service.ts` (anexo XML de novo), `athos.service.ts` (`buscarNotasFiscaisXmlPorTitulos` sem `cancelada`), `cobranca.controller.ts` (sem `@Get("nfe/danfe")`), `page.tsx` ("NF-e (XML)"); apagar `danfe-pdf.service.ts`, os 2 `danfe-pdf.service*.test.ts` e `__fixtures__/nfe-573.xml`. Sem migration, sem env var — nada de infra pra desfazer.
