---
task: "Backfill das NFS-e via Distribuicao de DF-e do ADN (lib nfse-node): preenche NfseEmitida.chaveAcesso + guarda o XML assinado em xmlNacional; renderiza o DANFSe nacional (NT 008/2026) com nfse-node no fluxo de contas a receber"
quick_id: 260828-g45-backfill-das-nfs-e-via-distribuicao-dfe-
branch: fix/orcamento-total-desconto-zerado
type: quick
autonomous: true
depends_on: []
files_modified:
  - apps/backend/package.json
  - package-lock.json
  - apps/backend/prisma/schema.prisma
  - apps/backend/prisma/migrations/20260828120000_add_nfse_xml_nacional_and_dfe_sync/migration.sql
  - apps/backend/src/modules/integrations/nfse/nfse-nacional-cert.util.ts
  - apps/backend/src/modules/integrations/nfse/danfse-nacional-pdf.service.ts
  - apps/backend/src/modules/integrations/nfse/danfse-nacional-pdf.service.test.ts
  - apps/backend/src/modules/integrations/nfse/nfse-nacional-distribuicao.service.ts
  - apps/backend/src/modules/integrations/nfse/nfse-nacional-distribuicao.service.test.ts
  - apps/backend/src/modules/integrations/nfse/nfse.module.ts
  - apps/backend/src/modules/integrations/nfse/__fixtures__/nfse-nacional-239.xml
  - apps/backend/src/modules/cobranca/cobranca.service.ts
  - apps/backend/src/modules/cobranca/cobranca.service.danfse.test.ts
  - apps/backend/src/modules/cobranca/cobranca.controller.ts
  - apps/backend/src/types/nfse-node.d.ts   # CONDICIONAL - so se o tsc nao resolver os tipos de nfse-node
user_setup:
  - "Deploy: rodar a migration nova - `cd apps/backend && npx prisma migrate deploy` (padrao; aplica ALTER TABLE NfseEmitida ADD xmlNacional + CREATE TABLE NfseDfeSync)."
  - "Backfill (rodar UMA vez apos o deploy, manualmente): `POST /api/cobranca/nfse/sincronizar-dfe` com header `x-internal-api-key: $INTERNAL_API_KEY`. Caminha os ~248 NSUs da Distribuicao DF-e do ADN, preenche chaveAcesso + xmlNacional nas NfseEmitida que casam pelo numero, para sozinho no E2220. Idempotente: pode re-rodar sem duplicar nem regredir. Sem cron, sem botao em tela."
  - "Nenhuma env var nova. Reusa NFSE_NACIONAL_CERT_PEM / NFSE_NACIONAL_KEY_PEM / NFSE_NACIONAL_AMBIENTE / NFSE_NACIONAL_CNPJ_PRESTADOR (ja em deploy/stack.env.example)."
locked_decisions: .planning/quick/260828-g45-backfill-das-nfs-e-via-distribuicao-dfe-/DECISIONS.md
---

# Quick task 260828-g45 - Backfill das NFS-e via Distribuicao DF-e + DANFSe nacional no fluxo de contas a receber

**Opcao "B" (confirmada pelo usuario).** Duas entregas acopladas:

1. **Backfill** - novo `NfseNacionalDistribuicaoService.sincronizar()` caminha a **Distribuicao de DF-e do ADN** com `nfse-node/cliente` (mesmo cert mTLS da emissao), le cada documento `NFSE`, e para cada nota cujo emitente e o nosso CNPJ atualiza a `NfseEmitida` correspondente (match por `numeroNfse == nNFSe`) setando `chaveAcesso` + o novo campo `xmlNacional` (cache do XML assinado). Disparado por endpoint autenticado `POST /cobranca/nfse/sincronizar-dfe`. Sem cron.
2. **Render** - `CobrancaService.baixarDanfsePdf(nfseEmitidaId)` (fluxo de contas a receber: `GET /api/cobranca/nfse/:id/pdf` + anexo do e-mail) passa a ter prioridade em 3 niveis: `xmlNacional` -> `chaveAcesso` (consulta SEFIN + persiste) -> comportamento atual (fallback intacto). O DANFSe nacional e renderizado pelo novo `DanfseNacionalPdfService`, wrapper de `nfse-node/danfse` `gerarDanfse` (leiaute NT 008/2026, com canhoto).

O fluxo de **orcamento** (`NfseService.baixarDanfsePdf` + `DanfsePdfService` Puppeteer/Handlebars) **NAO muda**. `DanfePdfService` (DANFE de NF-e) **NAO muda**.

## Restricoes travadas (de DECISIONS.md - nao-negociaveis)

- Lib **`nfse-node@0.3.2`** (Apache-2.0, deps 100% JS: `pdfkit`, `@xmldom/xmldom`, `node-forge`, `qrcode`, `xml-crypto`; sem build nativo). **E ESM puro** (`"type":"module"`, `exports` so `import`).
- Nos servicos: **`await import("nfse-node/danfse")` / `await import("nfse-node/cliente")`** dentro dos metodos (nunca `import` estatico no topo). `tsconfig` `module: Node16` preserva o `import()` nativo em runtime (Node 24 no deploy).
- Nos **testes** (ts-jest, `module: CommonJS`): `jest.mock("nfse-node/danfse", ...)` + `jest.mock("nfse-node/cliente", ...)` - o ESM real **nunca** carrega no jest. **NAO** escrever teste jest que carregue `nfse-node` de verdade. O render real do fixture 239 e so na "Verificacao manual" (snippet `--input-type=module`).
- `NfseEmitida.chaveAcesso` **ja existe** (`String?`) - reusar. Adicionar `NfseEmitida.xmlNacional String? @db.Text`. Nova tabela singleton `NfseDfeSync { id Int @id @default(1); ultimoNsu Int @default(0); atualizadoEm DateTime @updatedAt }` (id fixo = 1).
- Migration **escrita a mao** (padrao do repo, `provider = "postgresql"`), pasta `apps/backend/prisma/migrations/<ts>_<nome>/migration.sql`, constraint naming `"Tab_pkey"`. Ultima existente: `20260827120000`.
- **Matching** (backfill): so `tipoDocumento === "NFSE"`; do XML le `nNFSe` e o `<CNPJ>` dentro de `<emit>`; se emitente (so digitos) === `NFSE_NACIONAL_CNPJ_PRESTADOR` (`62391927000157`) e existir `NfseEmitida` com `numeroNfse == nNFSe` e (`chaveAcesso IS NULL` OU `xmlNacional IS NULL`) -> `update`. Idempotente. Documentos que nao casam so avancam o cursor.
- Fim da Distribuicao: a lib **lanca** `ErroComunicacaoSefin` com `.status === 404` e `.erros[0].codigo === "E2220"` -> tratar como **fim normal**, nao erro. Tambem parar se `statusProcessamento === "NENHUM_DOCUMENTO_LOCALIZADO"` ou lote sem documentos.
- **Cancelamento/substituicao (marca d'agua)**: **fora desta rodada.** `gerarDanfse` chamado **sem** `situacaoEspecial`. Pendencia conhecida (precisaria `listarEventos` por nota).
- Gatilho da sincronizacao: `POST /cobranca/nfse/sincronizar-dfe` (guard global `InternalAuthGuard`, **NAO** `@Public()`). Sem cron. Sem botao em tela.
- Branch **`fix/orcamento-total-desconto-zerado`** apenas. **NAO** tocar `main` nem a PR #56. Sem push. Nenhuma env var nova.

## Fatos da API (validados na sessao de discussao - NAO re-verificar)

- `nfse-node/cliente`: `criarClienteSefin({ ambiente: "producao"|"homologacao", certificado: { chavePrivadaPem, certificadoPem }, timeoutMs? }) -> ClienteSefin`.
  - `baixarDfe(nsu: number, opcoes?: { cnpjConsulta?, lote? }) -> LoteDistribuicaoNsu`. `nsu=0` do inicio; continuar por `max(doc.nsu)+1` (`ultimoNsu` do lote veio `undefined` na pratica). Fim = lanca `ErroComunicacaoSefin` `.status===404` / `.erros[0].codigo==="E2220"`.
  - `consultarNfse(chave) -> { status, corpo }` - `corpo.nfseXmlGZipB64` (base64 de gzip). Descompactar: `zlib.gunzipSync(Buffer.from(b64,"base64")).toString("utf8")` (ou `descompactarGZipBase64(b64)` exportado por `nfse-node/cliente`).
  - `LoteDistribuicaoNsu`: `{ statusProcessamento, documentos: DocumentoDistribuicao[], alertas, erros, ambiente, ... }`.
  - `DocumentoDistribuicao`: `{ nsu:number, chaveAcesso:string, tipoDocumento:"NFSE"|"EVENTO"|"DPS"|..., tipoEvento?:string, xml:string, dataHoraGeracao:string }`. `xml` em **texto puro**. O DF-e traz notas onde somos **prestador E tomador** - filtrar por CNPJ do `<emit>`.
  - Nosso CNPJ: ~248 documentos hoje (NSU 1..248).
- `nfse-node/danfse`: `gerarDanfse(xml: string, opcoes?) -> Promise<Buffer>`. `opcoes = { situacaoEspecial?: "Cancelada"|"Substituida"; resolverMunicipio?; logomarca?: Buffer /* PNG/JPEG */; incluirCanhoto?: boolean /* default true */ }`. Leiaute NT 008/2026 v1.02, fontes livres embutidas. Ja renderizou o fixture 239 -> PDF ~32 KB, 1 pagina.

## Fatos do codigo verificados nesta investigacao

- **`apps/backend/package.json`**: `@types/pdfkit ^0.17.6` **JA e devDependency** (da quick 260828-e3v) - **nao** re-adicionar. `xml-crypto ^6.1.2`, `handlebars`, `puppeteer` ja presentes. Sem `nfse-node` ainda.
- **`nfse-nacional.service.ts`** (`NfseNacionalService`, `@Injectable`, injeta `ConfigService`) tem `private loadPem(pemEnv, pathEnv, label)` (env `_PEM` com `\n` -> real; senao arquivo `_PATH`; senao `null`), `private getCredentials()` -> `{ cert, key }` (usa `NFSE_NACIONAL_CERT_PEM`/`_PATH` e `NFSE_NACIONAL_KEY_PEM`/`_PATH`; lanca `InternalServerErrorException` se faltar), `private getAmbiente()` (`NFSE_NACIONAL_AMBIENTE`, default `"producao"`, so `"homologacao"` desvia), `private getCnpjPrestador()` (`NFSE_NACIONAL_CNPJ_PRESTADOR`, lanca se ausente). **Tudo `private`.** `NfseNacionalService` **NAO tem nenhum teste** (`git grep` confirma - zero `nfse-nacional*.test.ts`).
- **`nfse-xml-parser.util.ts`** exporta `parseNfseXml(xml) -> { numeroNfse, chaveAcesso, dataEmissao, valorServico }`. `numeroNfse` = `<nNFSe>`; `chaveAcesso` = atributo `Id` de `<infNFSe ... Id="...">`. **Nao** extrai CNPJ do emitente.
- **`danfse-xml-parser.util.ts`** mostra o padrao de extrair o bloco emitente: `xml.match(/<emit>([\s\S]*?)<\/emit>/)` e depois `extractTag(emitXml, "CNPJ")`. O fixture 239: `<emit><CNPJ>62391927000157</CNPJ>...`, `<nNFSe>239</nNFSe>`, `<infNFSe Id="NFS35204001262391927000157000000000023926082610841077">`.
- **`nfse.module.ts`**: `imports: [DatabaseModule]`; `providers` e `exports` listam `NfseService, NfseNacionalService, DanfsePdfService, DanfePdfService`. `DatabaseModule` fornece `PrismaService`. -> registrar os 2 servicos novos em `providers` **e** `exports` (mesmo padrao).
- **`CobrancaModule`**: `imports: [EfiModule, AthosModule, NfseModule]`, `providers: [CobrancaService, EmailEnvioService]`. Injeta tudo que `NfseModule` exporta.
- **`CobrancaService`** (`cobranca.service.ts`): construtor injeta `athosService, prisma, config, nfseService, nfseNacionalService, danfsePdfService`. `baixarDanfsePdf(nfseEmitidaId)` (l.469): `findUnique` -> **lanca se `!nfseEmitida.linkNfse`** -> `axios.get(linkNfse, arraybuffer)` -> se `%PDF-` repassa -> senao `this.danfsePdfService.gerarPdfDoXml(raw.toString("utf8"))`. `EmailEnvioService` chama `this.cobrancaService.baixarDanfsePdf(id)` (~l.102) - **nao muda**.
- **Testes do `CobrancaService`**: `cobranca.service.unit.test.ts` (so `montarItensEfiPorVendaItem`) e `cobranca.service.cliente.test.ts` (so `buscarNfseEmitidaCliente`) - ambos `Object.create(CobrancaService.prototype)` + setam so as deps que usam. **Mudar o construtor NAO quebra nada.** Nenhum teste cobre `baixarDanfsePdf` hoje.
- **`cobranca.controller.ts`**: `@Controller("cobranca")` + prefixo global `api`. `type ExpressResponse = any` no topo; imports de `@nestjs/common` incluem `Body, Get, Post, Param, ParseIntPipe, Query, Res`; `Public` de `../security/public.decorator`. Construtor: `cobrancaService`, `emailEnvioService`. Guard global `InternalAuthGuard` (header `x-internal-api-key`, `security.constants.ts` `INTERNAL_API_KEY_HEADER`) protege tudo que nao e `@Public()`. Sem `cobranca.controller.test.ts`.
- **`jest.config.js`**: `rootDir: src`, `testRegex: .*\.test\.ts$`, ts-jest com `module: CommonJS`. Testes `*.test.ts` ao lado do fonte. `.planning/` pode ser arquivado pelo `gsd-cleanup` -> **copiar** o fixture para `src/.../__fixtures__/`.
- **`tsconfig.json`**: `module: Node16`, `moduleResolution: node16`, `strict`, `skipLibCheck: true`. `tsconfig.build.json` exclui `**/*.test.ts`.
- Migration recente (`20260827120000_add_cobranca_email_envio/migration.sql`): usa `CREATE TABLE IF NOT EXISTS`, `SERIAL`/`INTEGER`, `TIMESTAMP(3)`, `CONSTRAINT "Tab_pkey" PRIMARY KEY (...)`, `CREATE UNIQUE INDEX IF NOT EXISTS`. Seguir esse estilo.
- `deploy/stack.env.example` linhas 91-96: `NFSE_NACIONAL_CERT_PEM=`, `NFSE_NACIONAL_KEY_PEM=`, `NFSE_NACIONAL_CNPJ_PRESTADOR=62391927000157`, `NFSE_NACIONAL_CODIGO_MUNICIPIO=3520400`, `NFSE_NACIONAL_AMBIENTE=producao`. **Nada a mudar aqui.**
- Athos: a tabela `nfse` tem so 2 linhas e NAO guarda essas notas - **sem envolvimento do Athos** nesta task.

## Decisoes de design forcadas pelo codigo

1. **Helper de cert como util puro (`nfse-nacional-cert.util.ts`), NAO refatorar `NfseNacionalService`.** Os metodos de cert/ambiente/CNPJ do `NfseNacionalService` sao todos `private` e o servico tem **zero cobertura de teste**. Refatora-lo para um provider compartilhado seria mexer no caminho de emissao em producao sem rede de seguranca, num quick. Em vez disso: `export function carregarCertNfseNacional(config: ConfigService): { certPem, keyPem, ambiente, cnpjPrestador }` - funcao pura, recebe `ConfigService`, replica a leitura de env (`_PEM` -> `\n`; fallback `_PATH`; lanca se faltar). Os 2 servicos novos a usam. `NfseNacionalService` fica **intocado** (mantem a copia privada). Duplicacao consciente e localizada; unificar e trabalho de um refactor futuro com testes.
2. **`chaveAcesso` gravado = `parseNfseXml(xml).chaveAcesso ?? doc.chaveAcesso`.** O resto do codebase (anexar/emitir) grava o atributo `Id` de `<infNFSe>` em `NfseEmitida.chaveAcesso` (comentario do schema: "Id do infNFSe"). Manter a convencao; `doc.chaveAcesso` da Distribuicao e o fallback. Baixo risco: o backfill grava `chaveAcesso` **e** `xmlNacional` juntos, entao o tier-2 (`consultarNfse` por chave) praticamente nunca dispara para linha ja backfillada.
3. **Descompactar via `zlib.gunzipSync` (builtin), nao o export da lib.** DECISIONS admite os dois; `zlib` remove a dependencia da superficie de export do `nfse-node` e e deterministico.
4. **Endpoint chama `CobrancaService.sincronizarNfseDfe()` (passthrough fino), nao injeta o servico de Distribuicao no controller.** Todo handler do `CobrancaController` delega para um metodo de service; manter o padrao e o construtor do controller em 2 deps. `CobrancaService` ja vai injetar `nfseNacionalDistribuicaoService` para o tier-2, entao o passthrough e de graca. (Desvio menor da literalidade do DECISIONS "controller calls the distribuicao service"; mesma resultante.)
5. **`baixarDanfsePdf`: o `throw` de `!linkNfse` desce para o tier 3.** Hoje o metodo lanca logo no inicio se `linkNfse` e nulo. Os tiers 1-2 (xmlNacional / chaveAcesso) nao precisam de `linkNfse` - mover a checagem para dentro do ramo do fallback.
6. **`@types/pdfkit` ja esta instalado** (quick 260828-e3v) - Task 1 nao mexe nele. Se o `tsc` acusar `Cannot find module "nfse-node/danfse"`/`"nfse-node/cliente"` (a lib pode nao publicar `.d.ts` no `exports`), criar `apps/backend/src/types/nfse-node.d.ts` com `declare module` minimo (conteudo na Task 1).

---

## Tarefas (ordem obrigatoria)

### Task 1 - `npm install nfse-node@0.3.2` (+ shim de tipos se necessario)

**Arquivos:**
- `apps/backend/package.json` (via `npm install`)
- `package-lock.json` (raiz - monorepo npm workspaces)
- `apps/backend/src/types/nfse-node.d.ts` (**criar SO SE** o `tsc` nao resolver os tipos - ver passo 3)

**Acao:**

1. `cd apps/backend && npm install nfse-node@0.3.2`. Confirmar que entrou em `dependencies` (nao `devDependencies`).
2. Sanity de resolucao do subpath ESM (sem carregar - so `require.resolve`):
   `cd apps/backend && node -e "require.resolve('nfse-node/danfse'); require.resolve('nfse-node/cliente'); console.log('ok')"`.
3. Rodar `cd apps/backend && npx tsc -p tsconfig.build.json --noEmit` **apos** as Tasks 2-6 terem criado os `await import(...)` - se aparecer `Cannot find module 'nfse-node/danfse'` ou `'nfse-node/cliente'`, criar `apps/backend/src/types/nfse-node.d.ts`:
   ```ts
   declare module "nfse-node/danfse" {
     export function gerarDanfse(
       xml: string,
       opcoes?: {
         situacaoEspecial?: "Cancelada" | "Substituida";
         resolverMunicipio?: (cod: string) => { nome: string; uf: string } | undefined;
         logomarca?: Buffer;
         incluirCanhoto?: boolean;
       },
     ): Promise<Buffer>;
   }
   declare module "nfse-node/cliente" {
     export interface DocumentoDistribuicao {
       nsu: number;
       chaveAcesso: string;
       tipoDocumento: "NFSE" | "EVENTO" | "DPS" | string;
       tipoEvento?: string;
       xml: string;
       dataHoraGeracao: string;
     }
     export interface LoteDistribuicaoNsu {
       statusProcessamento: "DOCUMENTOS_LOCALIZADOS" | "NENHUM_DOCUMENTO_LOCALIZADO" | "REJEICAO" | string;
       documentos: DocumentoDistribuicao[];
       ultimoNsu?: number;
       [k: string]: unknown;
     }
     export interface ClienteSefin {
       baixarDfe(nsu: number, opcoes?: { cnpjConsulta?: string; lote?: number }): Promise<LoteDistribuicaoNsu>;
       consultarNfse(chave: string): Promise<{ status: number; corpo: { nfseXmlGZipB64?: string; [k: string]: unknown } }>;
     }
     export function criarClienteSefin(opcoes: {
       ambiente: "producao" | "homologacao";
       certificado: { chavePrivadaPem: string; certificadoPem: string };
       timeoutMs?: number;
     }): ClienteSefin;
     export function descompactarGZipBase64(b64: string): string;
   }
   ```

**Aceite (da raiz do repo):**
- `node -e "const p=require('./apps/backend/package.json'); process.exit(p.dependencies['nfse-node']==='0.3.2' || /^[\^~]?0\.3\.2$/.test(p.dependencies['nfse-node']||'') ? 0 : 1)"` -> exit 0.
- `cd apps/backend && node -e "require.resolve('nfse-node/danfse'); require.resolve('nfse-node/cliente'); console.log('ok')"` -> imprime `ok`.
- `grep -c '"@types/pdfkit"' apps/backend/package.json` -> `1` (inalterado - nao re-adicionado).
- `git status --porcelain package-lock.json apps/backend/package.json` -> ambos modificados.

---

### Task 2 - Prisma: `NfseEmitida.xmlNacional` + `model NfseDfeSync` + migration a mao

**Arquivos:**
- `apps/backend/prisma/schema.prisma` (editar)
- `apps/backend/prisma/migrations/20260828120000_add_nfse_xml_nacional_and_dfe_sync/migration.sql` (criar)

**Acao:**

1. Em `model NfseEmitida`, logo apos `chaveAcesso String?`, adicionar:
   `xmlNacional    String?             @db.Text   // cache do XML assinado (padrao nacional) p/ render do DANFSe via nfse-node`
2. Adicionar, apos `model NfseEmitidaTitulo`:
   ```prisma
   // Cursor singleton (id fixo = 1) da Distribuicao de DF-e do ADN. ultimoNsu = maior NSU
   // ja processado pelo backfill (NfseNacionalDistribuicaoService.sincronizar). Idempotente.
   model NfseDfeSync {
     id           Int      @id @default(1)
     ultimoNsu    Int      @default(0)
     atualizadoEm DateTime @updatedAt
   }
   ```
3. Criar a migration SQL (estilo da `20260827120000`, `provider = postgresql`):
   ```sql
   -- NFS-e nacional: cache do XML assinado (render do DANFSe via nfse-node) + cursor da Distribuicao DF-e do ADN.
   ALTER TABLE "NfseEmitida" ADD COLUMN "xmlNacional" TEXT;

   CREATE TABLE IF NOT EXISTS "NfseDfeSync" (
       "id" INTEGER NOT NULL DEFAULT 1,
       "ultimoNsu" INTEGER NOT NULL DEFAULT 0,
       "atualizadoEm" TIMESTAMP(3) NOT NULL,

       CONSTRAINT "NfseDfeSync_pkey" PRIMARY KEY ("id")
   );
   ```
4. `cd apps/backend && npx prisma generate` (regenera `@prisma/client` com `xmlNacional` + `nfseDfeSync`).

**Aceite (da raiz do repo):**
- `cd apps/backend && npx prisma validate` -> `The schema ... is valid`.
- `cd apps/backend && npx prisma generate` -> exit 0.
- `grep -c 'xmlNacional' apps/backend/prisma/schema.prisma` -> `>= 1`.
- `grep -c 'model NfseDfeSync' apps/backend/prisma/schema.prisma` -> `1`.
- `test -f apps/backend/prisma/migrations/20260828120000_add_nfse_xml_nacional_and_dfe_sync/migration.sql` -> exit 0.
- `grep -c 'ADD COLUMN "xmlNacional"' apps/backend/prisma/migrations/20260828120000_add_nfse_xml_nacional_and_dfe_sync/migration.sql` -> `1`.
- `grep -c '"NfseDfeSync_pkey"' apps/backend/prisma/migrations/20260828120000_add_nfse_xml_nacional_and_dfe_sync/migration.sql` -> `1`.

---

### Task 3 - `nfse-nacional-cert.util.ts` + `DanfseNacionalPdfService` + registro no `NfseModule` + teste

**Arquivos:**
- `apps/backend/src/modules/integrations/nfse/nfse-nacional-cert.util.ts` (criar)
- `apps/backend/src/modules/integrations/nfse/danfse-nacional-pdf.service.ts` (criar)
- `apps/backend/src/modules/integrations/nfse/danfse-nacional-pdf.service.test.ts` (criar)
- `apps/backend/src/modules/integrations/nfse/nfse.module.ts` (editar)

**Acao:**

1. `nfse-nacional-cert.util.ts` - funcao pura, nao e provider Nest (sem decorators de injecao):
   - `import type { ConfigService } from "@nestjs/config";`
   - `import fs from "node:fs"; import path from "node:path";`
   - `export interface NfseNacionalCert { certPem: string; keyPem: string; ambiente: "producao" | "homologacao"; cnpjPrestador: string; }`
   - `function loadPem(config, pemEnv, pathEnv): string | null` - copia exata da logica de `NfseNacionalService.loadPem` (env `_PEM` com `.trim().length > 0` -> `.replace(/\\n/g, "\n")`; senao `_PATH` -> resolve absoluto/`cwd` -> `fs.existsSync` -> `fs.readFileSync(..., "utf8")`; senao `null`).
   - `export function carregarCertNfseNacional(config: ConfigService): NfseNacionalCert`:
     - `certPem = loadPem(config, "NFSE_NACIONAL_CERT_PEM", "NFSE_NACIONAL_CERT_PATH")`
     - `keyPem = loadPem(config, "NFSE_NACIONAL_KEY_PEM", "NFSE_NACIONAL_KEY_PATH")`
     - se `!certPem || !keyPem` -> `throw new Error("Certificado da NFS-e Nacional nao configurado (NFSE_NACIONAL_CERT_PEM / NFSE_NACIONAL_KEY_PEM).")`
     - `ambiente = config.get<string>("NFSE_NACIONAL_AMBIENTE") === "homologacao" ? "homologacao" : "producao"`
     - `cnpjPrestador = config.get<string>("NFSE_NACIONAL_CNPJ_PRESTADOR")?.trim()`; se vazio -> `throw new Error("NFSE_NACIONAL_CNPJ_PRESTADOR nao configurado.")`
     - `return { certPem, keyPem, ambiente, cnpjPrestador }`
   - Comentario de cabecalho: por que existe (helper compartilhado pelos 2 servicos novos; `NfseNacionalService` mantem a copia privada de proposito - zero cobertura de teste, caminho de emissao em producao).

2. `danfse-nacional-pdf.service.ts` - `@Injectable() DanfseNacionalPdfService`, injeta `ConfigService`:
   - **Sem** `import` de `nfse-node` no topo.
   - `async gerar(xmlNacional: string): Promise<Buffer>`:
     - `const { gerarDanfse } = await import("nfse-node/danfse");`
     - `const logomarca = await this.resolveLogomarca();` (best-effort)
     - `const opcoes: { incluirCanhoto: boolean; logomarca?: Buffer } = { incluirCanhoto: true };` (canhoto e o default da lib; explicitar para deixar claro)
     - `if (logomarca) opcoes.logomarca = logomarca;`
     - `return await gerarDanfse(xmlNacional, opcoes);`
     - **NAO** incluir nas `opcoes` nenhuma flag de cancelamento/substituicao (marca d'agua fora de escopo desta rodada; ficaria pendente para uma rodada futura com leitura de eventos por nota).
   - `private async resolveLogomarca(): Promise<Buffer | undefined>` - molde de `DanfsePdfService.resolveLogoDataUri` mas devolvendo `Buffer`:
     - `const url = this.config.get<string>("EMPRESA_LOGO_URL")?.trim();` vazio/nao-http -> `undefined`.
     - `axios.get<ArrayBuffer>(url, { responseType: "arraybuffer", timeout: 5000, maxContentLength: 5*1024*1024, maxBodyLength: 5*1024*1024 })`; exigir `content-type` `image/*`; cache `Map<url, Buffer>` em campo de instancia; `catch -> this.logger.warn(...) + undefined`.
   - Timeout: `gerarDanfse` e sincrono-ish (pdfkit em memoria); **nao** precisa de watchdog (diferente do `DanfePdfService` que colhe stream). Se quiser simetria, envolver em `Promise.race` com `setTimeout(20_000)` que rejeita `Error("DANFSe nacional render timeout")` - **opcional**, so se trivial.

3. `danfse-nacional-pdf.service.test.ts` - `jest.mock("nfse-node/danfse", () => ({ gerarDanfse: jest.fn() }))` no topo. `Object.create(DanfseNacionalPdfService.prototype)` + `(service as any).config = { get: (k: string) => ({ EMPRESA_LOGO_URL: "" } as any)[k] }` + `(service as any).logger = { warn: jest.fn() }` + `(service as any).logoCache = new Map()`. Casos:
   1. `const { gerarDanfse } = require("nfse-node/danfse"); (gerarDanfse as jest.Mock).mockResolvedValue(Buffer.from("%PDF-1.4 fake"));` -> `await service.gerar("<NFSe/>")` retorna esse Buffer; `gerarDanfse` chamado 1x com `("<NFSe/>", expect.objectContaining({ incluirCanhoto: true }))`.
   2. `EMPRESA_LOGO_URL` vazia -> opcoes passadas a `gerarDanfse` **sem** `logomarca` (`expect(opts.logomarca).toBeUndefined()`) e **sem** `situacaoEspecial` (`expect(opts.situacaoEspecial).toBeUndefined()`).
   3. `gerarDanfse` rejeita (`mockRejectedValue(new Error("boom"))`) -> `service.gerar(...)` **rejeita** com `/boom/`.
   4. (se implementou logomarca) `axios.get` mockado devolvendo `content-type: image/png` -> `opts.logomarca` e `Buffer`; `axios.get` que lanca -> `opts.logomarca` undefined + `logger.warn` chamado.

4. `nfse.module.ts` - adicionar `DanfseNacionalPdfService` a `providers` **e** `exports` (import no topo, mesmo padrao dos demais).

**Aceite (da raiz do repo):**
- `cd apps/backend && npx tsc -p tsconfig.build.json --noEmit` -> sem erros.
- `grep -n 'await import("nfse-node/danfse")' apps/backend/src/modules/integrations/nfse/danfse-nacional-pdf.service.ts` -> presente.
- `grep -c 'import .*"nfse-node' apps/backend/src/modules/integrations/nfse/danfse-nacional-pdf.service.ts` conta so linhas de `import` estatico -> deve ser `0` (so `await import(...)`). (checar tambem: `grep -c '^import' .../danfse-nacional-pdf.service.ts` nao lista `nfse-node`.)
- `grep -c 'DanfseNacionalPdfService' apps/backend/src/modules/integrations/nfse/nfse.module.ts` -> `>= 3`.
- `grep -c 'carregarCertNfseNacional' apps/backend/src/modules/integrations/nfse/nfse-nacional-cert.util.ts` -> `>= 1`.
- `cd apps/backend && npx jest src/modules/integrations/nfse/danfse-nacional-pdf.service.test.ts` -> verde (o caso 2 dessa suite ja cobre, via asserção de teste, que a flag de cancelamento/substituicao nao e enviada - mais forte que um grep de fonte).

<!-- planner-discipline-allow: situacaoEspecial -->
<!-- planner-discipline-allow: @Injectable -->

---

### Task 4 - `NfseNacionalDistribuicaoService` (`sincronizar` + `consultarXmlPorChave`) + registro + teste

**Arquivos:**
- `apps/backend/src/modules/integrations/nfse/nfse-nacional-distribuicao.service.ts` (criar)
- `apps/backend/src/modules/integrations/nfse/nfse-nacional-distribuicao.service.test.ts` (criar)
- `apps/backend/src/modules/integrations/nfse/nfse.module.ts` (editar)

**Acao:**

1. `nfse-nacional-distribuicao.service.ts` - `@Injectable() NfseNacionalDistribuicaoService`, injeta `PrismaService` + `ConfigService`. **Sem** `import` de `nfse-node` no topo. `import zlib from "node:zlib";`. `import { carregarCertNfseNacional } from "./nfse-nacional-cert.util";`. `import { parseNfseXml } from "./nfse-xml-parser.util";`.

   - `export interface SyncDfeResumo { lotesProcessados: number; documentosVistos: number; nfseDocs: number; atualizadas: number; numerosAtualizados: string[]; ignorados: number; ultimoNsu: number; parouPor: "E2220" | "NENHUM_DOCUMENTO_LOCALIZADO" | "LIMITE_LOTES"; }`
   - `private static readonly MAX_LOTES = 100;` (trava dura contra loop infinito se a API se comportar mal).
   - `private async criarCliente()`:
     - `const { criarClienteSefin } = await import("nfse-node/cliente");`
     - `const { certPem, keyPem, ambiente } = carregarCertNfseNacional(this.config);`
     - `return criarClienteSefin({ ambiente, certificado: { chavePrivadaPem: keyPem, certificadoPem: certPem }, timeoutMs: 30_000 });`
   - `private extrairEmitCnpj(xml: string): string | null` - `const m = xml.match(/<emit>([\s\S]*?)<\/emit>/); if (!m) return null; const c = m[1].match(/<CNPJ>([^<]+)<\/CNPJ>/); return c ? c[1].replace(/\D/g, "") : null;`
   - `async sincronizar(): Promise<SyncDfeResumo>`:
     - `const { cnpjPrestador } = carregarCertNfseNacional(this.config);` -> `const alvoCnpj = cnpjPrestador.replace(/\D/g, "");`
     - `const cliente = await this.criarCliente();`
     - `const sync = await this.prisma.nfseDfeSync.findUnique({ where: { id: 1 } });`
     - `let nsu = sync && sync.ultimoNsu > 0 ? sync.ultimoNsu + 1 : 0;`
     - acumuladores: `lotesProcessados=0, documentosVistos=0, nfseDocs=0, atualizadas=0, ignorados=0`, `numerosAtualizados: string[] = []`, `parouPor: SyncDfeResumo["parouPor"]`.
     - `while (lotesProcessados < MAX_LOTES)`:
       - `let lote; try { lote = await cliente.baixarDfe(nsu, { cnpjConsulta: alvoCnpj }); } catch (err) { if ((err as any)?.status === 404 && (err as any)?.erros?.[0]?.codigo === "E2220") { parouPor = "E2220"; break; } throw err; }`
       - `lotesProcessados++;`
       - `const docs = lote?.documentos ?? [];`
       - `if (lote?.statusProcessamento === "NENHUM_DOCUMENTO_LOCALIZADO" || docs.length === 0) { parouPor = "NENHUM_DOCUMENTO_LOCALIZADO"; break; }`
       - `for (const doc of docs)`:
         - `documentosVistos++;`
         - `if (doc.tipoDocumento !== "NFSE") { ignorados++; continue; }`
         - `nfseDocs++;`
         - `const xml = doc.xml ?? "";`
         - `const parsed = parseNfseXml(xml);`
         - `const nNFSe = parsed.numeroNfse;`
         - `const emitCnpj = this.extrairEmitCnpj(xml);`
         - `if (!nNFSe || emitCnpj !== alvoCnpj) { ignorados++; continue; }`
         - `const chave = parsed.chaveAcesso ?? doc.chaveAcesso ?? null;`
         - `const res = await this.prisma.nfseEmitida.updateMany({ where: { numeroNfse: nNFSe, OR: [{ chaveAcesso: null }, { xmlNacional: null }] }, data: { chaveAcesso: chave, xmlNacional: xml } });`
         - `if (res.count > 0) { atualizadas += res.count; numerosAtualizados.push(nNFSe); } else { ignorados++; }`
       - `const maxNsu = Math.max(...docs.map((d) => d.nsu));`
       - `nsu = maxNsu + 1;`
       - `await this.prisma.nfseDfeSync.upsert({ where: { id: 1 }, create: { id: 1, ultimoNsu: maxNsu }, update: { ultimoNsu: maxNsu } });`
     - `if (lotesProcessados >= MAX_LOTES && !parouPor) parouPor = "LIMITE_LOTES";`
     - `const finalNsu = nsu > 0 ? nsu - 1 : 0;`
     - `await this.prisma.nfseDfeSync.upsert({ where: { id: 1 }, create: { id: 1, ultimoNsu: finalNsu }, update: { ultimoNsu: finalNsu } });`
     - `this.logger.log(\`Sincronizacao DF-e: \${lotesProcessados} lote(s), \${nfseDocs} NFSE, \${atualizadas} NfseEmitida atualizada(s), parou por \${parouPor}\`);`
     - `return { lotesProcessados, documentosVistos, nfseDocs, atualizadas, numerosAtualizados, ignorados, ultimoNsu: finalNsu, parouPor };`
   - `async consultarXmlPorChave(chave: string): Promise<string>` (tier-2 do `baixarDanfsePdf`):
     - `const cliente = await this.criarCliente();`
     - `const { corpo } = await cliente.consultarNfse(chave);`
     - `const b64 = corpo?.nfseXmlGZipB64;`
     - `if (!b64) throw new Error(\`consultarNfse(\${chave}) nao retornou nfseXmlGZipB64\`);`
     - `return zlib.gunzipSync(Buffer.from(b64, "base64")).toString("utf8");`

2. `nfse-nacional-distribuicao.service.test.ts` - no topo:
   `jest.mock("nfse-node/cliente", () => ({ criarClienteSefin: jest.fn(), descompactarGZipBase64: jest.fn() }));`
   `Object.create(NfseNacionalDistribuicaoService.prototype)` + fakes:
   - `(service as any).logger = { log: jest.fn(), warn: jest.fn() }`
   - `(service as any).config = { get: (k: string) => ({ NFSE_NACIONAL_CERT_PEM: "CERT", NFSE_NACIONAL_KEY_PEM: "KEY", NFSE_NACIONAL_AMBIENTE: "producao", NFSE_NACIONAL_CNPJ_PRESTADOR: "62391927000157" } as any)[k] }`
   - `prisma` fake: `{ nfseDfeSync: { findUnique: jest.fn(), upsert: jest.fn() }, nfseEmitida: { updateMany: jest.fn() } }`
   - `const { criarClienteSefin } = require("nfse-node/cliente");` -> mockar `criarClienteSefin` retornando um `cliente` fake com `baixarDfe` / `consultarNfse` `jest.fn()`.
   - helper `nfseXml(n, cnpj)` -> `\`<NFSe versao="1.01"><infNFSe Id="NFS\${n}"><nNFSe>\${n}</nNFSe><emit><CNPJ>\${cnpj}</CNPJ></emit></infNFSe></NFSe>\``.
   Casos:
   1. **backfill feliz + stop E2220**: `findUnique -> null`. `baixarDfe` `.mockResolvedValueOnce({ statusProcessamento: "DOCUMENTOS_LOCALIZADOS", documentos: [ { nsu: 1, chaveAcesso: "CHV239", tipoDocumento: "NFSE", xml: nfseXml("239","62391927000157") }, { nsu: 2, chaveAcesso: "CHV_T", tipoDocumento: "NFSE", xml: nfseXml("500","56096886000173") }, { nsu: 3, chaveAcesso: "EV", tipoDocumento: "EVENTO", xml: "<evt/>" } ] })` depois `.mockRejectedValueOnce(Object.assign(new Error("sefin"), { status: 404, erros: [{ codigo: "E2220" }] }))`. `nfseEmitida.updateMany` `.mockResolvedValueOnce({ count: 1 })` (para o 239) e `.mockResolvedValue({ count: 0 })`. Asserts: retorno `{ atualizadas: 1, numerosAtualizados: ["239"], nfseDocs: 2, parouPor: "E2220", lotesProcessados: 1 }`; `updateMany` chamado 1x com `where.numeroNfse === "239"` e `where.OR` contendo `{ chaveAcesso: null }` e `{ xmlNacional: null }` e `data: { chaveAcesso: "NFS239", xmlNacional: <xml do 239> }` (chave = Id do infNFSe, nao `doc.chaveAcesso`); o doc de CNPJ de tomador (`500`) **nao** gera `updateMany`; `nfseDfeSync.upsert` chamado com `ultimoNsu: 3` (maxNsu) e de novo no final.
   2. **stop NENHUM_DOCUMENTO_LOCALIZADO**: `findUnique -> { id:1, ultimoNsu: 10 }`. `baixarDfe.mockResolvedValueOnce({ statusProcessamento: "NENHUM_DOCUMENTO_LOCALIZADO", documentos: [] })`. Asserts: `parouPor === "NENHUM_DOCUMENTO_LOCALIZADO"`, `atualizadas === 0`, `baixarDfe` chamado 1x com `nsu === 11` (`ultimoNsu + 1`).
   3. **idempotente**: doc do 239 mas `updateMany.mockResolvedValue({ count: 0 })` (ja tinha chave+xml) -> `atualizadas === 0`, `numerosAtualizados === []`, `ignorados` incrementado.
   4. **erro nao-E2220 propaga**: `baixarDfe.mockRejectedValueOnce(Object.assign(new Error("500"), { status: 500 }))` -> `expect(service.sincronizar()).rejects.toThrow(/500/)`.
   5. **consultarXmlPorChave**: `cliente.consultarNfse.mockResolvedValue({ status: 200, corpo: { nfseXmlGZipB64: zlib.gzipSync(Buffer.from("<NFSe>x</NFSe>")).toString("base64") } })` -> retorna `"<NFSe>x</NFSe>"`. `corpo` sem `nfseXmlGZipB64` -> rejeita `/nfseXmlGZipB64/`.

3. `nfse.module.ts` - adicionar `NfseNacionalDistribuicaoService` a `providers` **e** `exports`.

**Aceite (da raiz do repo):**
- `cd apps/backend && npx tsc -p tsconfig.build.json --noEmit` -> sem erros.
- `grep -c 'await import("nfse-node/cliente")' apps/backend/src/modules/integrations/nfse/nfse-nacional-distribuicao.service.ts` -> `>= 1`.
- `grep -Ec '^import .*from "nfse-node' apps/backend/src/modules/integrations/nfse/nfse-nacional-distribuicao.service.ts` -> `0` (sem import estatico da lib ESM).
- `grep -c 'E2220' apps/backend/src/modules/integrations/nfse/nfse-nacional-distribuicao.service.ts` -> `>= 1`.
- `grep -c 'NENHUM_DOCUMENTO_LOCALIZADO' apps/backend/src/modules/integrations/nfse/nfse-nacional-distribuicao.service.ts` -> `>= 1`.
- `grep -c 'updateMany' apps/backend/src/modules/integrations/nfse/nfse-nacional-distribuicao.service.ts` -> `>= 1`.
- `grep -c 'NfseNacionalDistribuicaoService' apps/backend/src/modules/integrations/nfse/nfse.module.ts` -> `>= 3`.
- `cd apps/backend && npx jest src/modules/integrations/nfse/nfse-nacional-distribuicao.service.test.ts` -> verde (>= 5 casos).

---

### Task 5 - `CobrancaService`: `baixarDanfsePdf` em 3 tiers + `sincronizarNfseDfe()` + construtor + teste

**Arquivos:**
- `apps/backend/src/modules/cobranca/cobranca.service.ts` (editar)
- `apps/backend/src/modules/cobranca/cobranca.service.danfse.test.ts` (criar)

**Acao (`cobranca.service.ts`):**

1. Imports no topo:
   `import { DanfseNacionalPdfService } from "../integrations/nfse/danfse-nacional-pdf.service";`
   `import { NfseNacionalDistribuicaoService } from "../integrations/nfse/nfse-nacional-distribuicao.service";`
2. Construtor: adicionar, **apos** `danfsePdfService`:
   `private readonly danfseNacionalPdfService: DanfseNacionalPdfService,`
   `private readonly nfseNacionalDistribuicaoService: NfseNacionalDistribuicaoService,`
3. Reescrever `baixarDanfsePdf(nfseEmitidaId)` para a prioridade do DECISIONS Sec.5:
   - `const nfseEmitida = await this.prisma.nfseEmitida.findUnique({ where: { id: nfseEmitidaId } });`
   - `if (!nfseEmitida) throw new BadRequestException(\`NFS-e \${nfseEmitidaId} nao encontrada.\`);`
   - `const nomeArquivo = \`NFSe-\${nfseEmitida.numeroNfse ?? nfseEmitidaId}.pdf\`;`
   - **Tier 1** - `if (nfseEmitida.xmlNacional) { const pdfBuffer = await this.danfseNacionalPdfService.gerar(nfseEmitida.xmlNacional); return { pdfBuffer, nomeArquivo }; }`
   - **Tier 2** - `if (nfseEmitida.chaveAcesso) { try { const xml = await this.nfseNacionalDistribuicaoService.consultarXmlPorChave(nfseEmitida.chaveAcesso); await this.prisma.nfseEmitida.update({ where: { id: nfseEmitidaId }, data: { xmlNacional: xml } }); const pdfBuffer = await this.danfseNacionalPdfService.gerar(xml); return { pdfBuffer, nomeArquivo }; } catch (err) { this.logger.warn(\`consultarNfse falhou p/ NFS-e \${nfseEmitidaId} (chave \${nfseEmitida.chaveAcesso}): \${err instanceof Error ? err.message : String(err)}; caindo no fallback.\`); } }`
   - **Tier 3** (comportamento atual, inalterado exceto o `throw` de `!linkNfse` migrar pra ca):
     - `if (!nfseEmitida.linkNfse) throw new BadRequestException(\`NFS-e \${nfseEmitidaId} nao possui documento armazenado.\`);`
     - `const resp = await axios.get<ArrayBuffer>(nfseEmitida.linkNfse, { responseType: "arraybuffer", timeout: 15_000 });`
     - `const raw = Buffer.from(resp.data);`
     - `if (raw.subarray(0, 5).toString("latin1") === "%PDF-") return { pdfBuffer: raw, nomeArquivo };`
     - `const pdfBuffer = await this.danfsePdfService.gerarPdfDoXml(raw.toString("utf8"));`
     - `return { pdfBuffer, nomeArquivo };`
   - Atualizar o JSDoc do metodo: 3 niveis (xmlNacional -> chaveAcesso+consulta+persist -> linkNfse sniff `%PDF` / `DanfsePdfService`).
4. Novo metodo publico (passthrough fino, logo apos `baixarDanfsePdf`):
   `/** Backfill manual: caminha a Distribuicao DF-e do ADN e preenche chaveAcesso + xmlNacional nas NfseEmitida. Idempotente. */`
   `async sincronizarNfseDfe() { return this.nfseNacionalDistribuicaoService.sincronizar(); }`

**Acao (`cobranca.service.danfse.test.ts`):** `Object.create(CobrancaService.prototype)` + fakes: `logger`, `prisma` (`nfseEmitida: { findUnique, update }`), `danfseNacionalPdfService: { gerar: jest.fn() }`, `nfseNacionalDistribuicaoService: { consultarXmlPorChave: jest.fn(), sincronizar: jest.fn() }`, `danfsePdfService: { gerarPdfDoXml: jest.fn() }`. Mockar `axios` via `jest.mock("axios")`. Casos:
   1. **Tier 1**: `findUnique -> { id: 74, numeroNfse: "239", xmlNacional: "<NFSe/>", chaveAcesso: "x", linkNfse: "http://..." }`. `danfseNacionalPdfService.gerar.mockResolvedValue(Buffer.from("%PDF-nac"))`. -> `{ pdfBuffer: %PDF-nac, nomeArquivo: "NFSe-239.pdf" }`; `gerar` chamado 1x com `"<NFSe/>"`; `axios.get` **nao** chamado; `danfsePdfService.gerarPdfDoXml` **nao** chamado.
   2. **Tier 2**: `findUnique -> { id: 74, numeroNfse: "239", xmlNacional: null, chaveAcesso: "CHV" }`. `consultarXmlPorChave.mockResolvedValue("<NFSe>y</NFSe>")`. `danfseNacionalPdfService.gerar.mockResolvedValue(Buffer.from("%PDF-2"))`. -> retorna `%PDF-2`; `prisma.nfseEmitida.update` chamado com `data: { xmlNacional: "<NFSe>y</NFSe>" }`; `gerar` chamado com `"<NFSe>y</NFSe>"`.
   3. **Tier 2 falha -> Tier 3**: `xmlNacional: null, chaveAcesso: "CHV", linkNfse: "http://x/xml"`. `consultarXmlPorChave.mockRejectedValue(new Error("timeout"))`. `axios.get.mockResolvedValue({ data: Buffer.from("<NFSe>fallback</NFSe>") })`. `danfsePdfService.gerarPdfDoXml.mockResolvedValue(Buffer.from("%PDF-legacy"))`. -> retorna `%PDF-legacy`; `logger.warn` chamado 1x.
   4. **Tier 3 %PDF passthrough**: `xmlNacional: null, chaveAcesso: null, linkNfse: "http://x/pdf"`. `axios.get.mockResolvedValue({ data: Buffer.from("%PDF-1.4 provedor") })`. -> `pdfBuffer` = esses bytes crus; `gerarPdfDoXml` **nao** chamado.
   5. **Tier 3 sem linkNfse**: `xmlNacional: null, chaveAcesso: null, linkNfse: null` -> `rejects` com `/nao possui documento armazenado/`.
   6. **not found**: `findUnique -> null` -> `rejects` com `/nao encontrada/`.
   7. **passthrough**: `(service as any).nfseNacionalDistribuicaoService.sincronizar.mockResolvedValue({ atualizadas: 3 })` -> `await service.sincronizarNfseDfe()` === `{ atualizadas: 3 }`.

**Aceite (da raiz do repo):**
- `cd apps/backend && npx tsc -p tsconfig.build.json --noEmit` -> sem erros.
- `grep -n 'xmlNacional\|consultarXmlPorChave\|danfseNacionalPdfService\|sincronizarNfseDfe' apps/backend/src/modules/cobranca/cobranca.service.ts` -> todos presentes.
- `grep -c 'nao possui documento armazenado' apps/backend/src/modules/cobranca/cobranca.service.ts` -> `1` (o `throw` migrou p/ o tier 3, nao duplicou).
- `cd apps/backend && npx jest src/modules/cobranca/cobranca.service.danfse.test.ts src/modules/cobranca/cobranca.service.unit.test.ts src/modules/cobranca/cobranca.service.cliente.test.ts` -> todos verdes (sem regressao nos 2 antigos).

---

### Task 6 - `cobranca.controller.ts`: `POST /cobranca/nfse/sincronizar-dfe`

**Arquivos:**
- `apps/backend/src/modules/cobranca/cobranca.controller.ts` (editar)

**Acao:** adicionar, logo apos `@Post("nfse/emitir")` (agrupado com os handlers `nfse/*`; **NAO** `@Public()`):
```
/**
 * Backfill manual das NFS-e via Distribuicao de DF-e do ADN: preenche chaveAcesso + xmlNacional.
 * Rodar UMA vez apos o deploy. Idempotente (re-rodar nao duplica nem regride). Sem cron.
 * Requer autenticacao via x-internal-api-key (InternalAuthGuard global).
 */
@Post("nfse/sincronizar-dfe")
async sincronizarNfseDfe() {
  return this.cobrancaService.sincronizarNfseDfe();
}
```
- `Post` ja esta importado. Sem `@Res()` (retorna JSON puro - o resumo `SyncDfeResumo`).
- `nfse/sincronizar-dfe` nao colide com `nfse/:id/pdf` (segmento literal distinto de `:id`, e e `@Post` vs `@Get`).

**Aceite (da raiz do repo):**
- `cd apps/backend && npx tsc -p tsconfig.build.json --noEmit` -> sem erros.
- `grep -c '@Post("nfse/sincronizar-dfe")' apps/backend/src/modules/cobranca/cobranca.controller.ts` -> `1`.
- `grep -c '@Public()' apps/backend/src/modules/cobranca/cobranca.controller.ts` -> `3` (inalterado - o endpoint novo NAO e publico).
- `grep -c 'sincronizarNfseDfe' apps/backend/src/modules/cobranca/cobranca.controller.ts` -> `2` (chamada + nome do handler) ou `>= 1`.

---

### Task 7 - Fixture em `__fixtures__/` + regressao completa

**Arquivos:**
- `apps/backend/src/modules/integrations/nfse/__fixtures__/nfse-nacional-239.xml` (criar - copia byte a byte de `.planning/quick/260828-g45-backfill-das-nfs-e-via-distribuicao-dfe-/fixture-nfse-nacional-239.xml`)

**Acao:**
1. Copiar o fixture: `cp .planning/quick/260828-g45-backfill-das-nfs-e-via-distribuicao-dfe-/fixture-nfse-nacional-239.xml apps/backend/src/modules/integrations/nfse/__fixtures__/nfse-nacional-239.xml` (dir `__fixtures__` ja existe da quick 260828-e3v). O teste/verificacao **nao** pode depender de `.planning/` (arquivavel pelo `gsd-cleanup`).
2. Rodar a suite inteira do backend e o typecheck de build.

**Aceite (da raiz do repo):**
- `test -f apps/backend/src/modules/integrations/nfse/__fixtures__/nfse-nacional-239.xml` -> exit 0.
- `cmp .planning/quick/260828-g45-backfill-das-nfs-e-via-distribuicao-dfe-/fixture-nfse-nacional-239.xml apps/backend/src/modules/integrations/nfse/__fixtures__/nfse-nacional-239.xml` -> exit 0 (identicos).
- `grep -c '<nNFSe>239</nNFSe>' apps/backend/src/modules/integrations/nfse/__fixtures__/nfse-nacional-239.xml` -> `1`.
- `cd apps/backend && npx tsc -p tsconfig.build.json --noEmit` -> exit 0.
- `cd apps/backend && npm test` -> suite completa verde (as +3 suites novas: `danfse-nacional-pdf.service.test.ts`, `nfse-nacional-distribuicao.service.test.ts`, `cobranca.service.danfse.test.ts`; zero regressao). Nota: `npm test` leva ~6-8 min neste ambiente e um worker pode ser "force exited" no fim por handles vazando em testes pre-existentes (Athos/EFI/Chatwoot) - comportamento pre-existente, nao introduzido aqui.
- `git status --porcelain apps/frontend` -> vazio (nenhum arquivo de frontend tocado nesta task).

---

## Verificacao manual (ponta a ponta - DEFERIDA ao usuario; precisa backend :4000 + DB + cert NFS-e Nacional)

Pre: `apps/backend/.env` com `INTERNAL_API_KEY`, `DATABASE_URL`, `NFSE_NACIONAL_CERT_PEM`, `NFSE_NACIONAL_KEY_PEM`, `NFSE_NACIONAL_AMBIENTE=producao`, `NFSE_NACIONAL_CNPJ_PRESTADOR=62391927000157`. `EMPRESA_LOGO_URL` opcional.

1. **Migration:**
   ```
   cd apps/backend && npx prisma migrate deploy
   ```
   Conferir no banco: `\d "NfseEmitida"` mostra a coluna `xmlNacional text`; `\d "NfseDfeSync"` existe com PK `id`.

2. **Backfill (o `user_setup` "rodar uma vez"):**
   ```
   curl -s -X POST "http://localhost:4000/api/cobranca/nfse/sincronizar-dfe" \
     -H "x-internal-api-key: $INTERNAL_API_KEY" | tee /tmp/sync-dfe.json
   ```
   Esperado no JSON: `lotesProcessados` >= 1 (a lib pagina de ~50 em ~50; ~248 docs -> ~5 lotes), `nfseDocs` compativel com nossas notas nacionais, `atualizadas` = N (NfseEmitida que ganharam `chaveAcesso` + `xmlNacional`), `numerosAtualizados` **contem `"239"`**, `parouPor: "E2220"` (fim normal) - NAO `"LIMITE_LOTES"`.
   Conferir no banco: `SELECT count(*) FROM "NfseEmitida" WHERE "xmlNacional" IS NOT NULL;` subiu; `SELECT "ultimoNsu" FROM "NfseDfeSync" WHERE id = 1;` ~248.
   **Idempotencia:** rodar o mesmo `curl` de novo -> `atualizadas: 0`, `parouPor: "E2220"` (cursor ja no fim), nenhuma linha regredida.

3. **Render nacional no fluxo de contas a receber** (achar um `NfseEmitida.id` cujo `numeroNfse = 239`; o exemplo usa `74`):
   ```
   curl -s "http://localhost:4000/api/cobranca/nfse/74/pdf" \
     -H "x-internal-api-key: $INTERNAL_API_KEY" -o /tmp/nfse-239.pdf
   file /tmp/nfse-239.pdf      # => PDF document
   ```
   Abrir `/tmp/nfse-239.pdf`: agora e o **DANFSe nacional NT 008/2026** gerado pelo `nfse-node` (com **canhoto** no topo/rodape), NAO mais o PDF do provedor iiBrasil nem o layout Handlebars/Puppeteer antigo. Conferir: numero **239**, prestador BOM CUSTO PAPELARIA / CNPJ 62.391.927/0001-57, tomador ENOTEC ENGENHARIA, valor R$ 39,00, chave de acesso + QR Code.

4. **E-mail de contas a receber** (mesmo par da quick 260827-ood: cliente **3504** / boleto **139**):
   UI `/contas-receber/3504` -> boleto 139 -> **E-mail** -> seu proprio e-mail -> Enviar. (Ou `POST /api/cobranca/email/enviar` com `{"idclienteAthos":3504,"cobrancaBoletoId":139}` + `x-internal-api-key`.)
   Na caixa de entrada: o anexo **`NFSe-239.pdf`** e o novo DANFSe nacional (canhoto, QR), nao o layout antigo.

5. **Render real da lib + fixture** (prova `nfse-node/danfse` ponta a ponta, sem o nosso codigo; roda de `apps/backend` p/ resolver a lib):
   ```
   cd apps/backend && node --input-type=module -e "import('nfse-node/danfse').then(async ({gerarDanfse}) => { const fs = await import('node:fs'); const xml = fs.readFileSync('src/modules/integrations/nfse/__fixtures__/nfse-nacional-239.xml','utf8'); const buf = await gerarDanfse(xml, { incluirCanhoto: true }); console.log('bytes', buf.length, 'head', buf.subarray(0,5).toString('latin1')); process.exit(buf.subarray(0,4).toString('latin1') === '%PDF' && buf.length > 10240 ? 0 : 1); })"
   ```
   -> imprime `head %PDF-` e `bytes` > 10240, exit 0.

6. **Testes e build (offline):**
   ```
   cd apps/backend && npx jest src/modules/integrations/nfse/nfse-nacional-distribuicao.service.test.ts src/modules/integrations/nfse/danfse-nacional-pdf.service.test.ts src/modules/cobranca/cobranca.service.danfse.test.ts
   cd apps/backend && npm test
   cd apps/backend && npx tsc -p tsconfig.build.json --noEmit
   ```

---

## Riscos / fora de escopo

- **ESM x ts-jest (CommonJS):** o `nfse-node` real nunca carrega no jest (`jest.mock` nos 2 subpaths). O render real so e exercitado na "Verificacao manual" (snippet `--input-type=module`) - nao ha teste jest que carregue a lib de verdade. Se o `tsc` de build nao resolver os tipos dos subpaths, o shim `src/types/nfse-node.d.ts` da Task 1 cobre.
- **Sem marca d'agua de cancelamento/substituicao (v1):** `gerarDanfse` e chamado sem `situacaoEspecial`. Uma NFS-e cancelada renderiza como valida. Fechar isso exigiria `listarEventos(chave)` por nota - rodada futura.
- **Sincronizacao e manual + idempotente:** sem cron, sem botao. Rodada por `POST /cobranca/nfse/sincronizar-dfe`. Re-rodar comeca do `ultimoNsu + 1` e o `updateMany` filtra `chaveAcesso IS NULL OR xmlNacional IS NULL` -> zero duplicacao, zero regressao. Trava dura `MAX_LOTES = 100` contra loop infinito (`parouPor: "LIMITE_LOTES"` sinaliza que bateu o teto - investigar).
- **E2220 e EOF normal:** a lib **lanca** 404/E2220 no fim da fila; o servico trata como "acabou". Qualquer outro erro (500, timeout, rede) **propaga** e aborta a sincronizacao (o cursor ja foi salvo ate o ultimo lote OK, entao re-rodar retoma).
- **DF-e traz notas onde somos tomador:** filtradas pelo `<CNPJ>` do `<emit>` vs `NFSE_NACIONAL_CNPJ_PRESTADOR` (so digitos). So `tipoDocumento === "NFSE"` e considerado; `EVENTO`/`DPS` so avancam o cursor.
- **Cadeia de fallback intacta:** notas antigas (iiBrasil) sem match na Distribuicao ficam sem `chaveAcesso`/`xmlNacional` e continuam pelo Tier 3 (`linkNfse` -> sniff `%PDF` -> `DanfsePdfService`). O fluxo de **orcamento** (`NfseService.baixarDanfsePdf`) e o `DanfePdfService` (DANFE de NF-e) **nao sao tocados**.
- **`chaveAcesso` gravado = `Id` do `<infNFSe>`** (convencao do resto do codebase), com `doc.chaveAcesso` da Distribuicao como fallback. Baixo risco pois o Tier 2 (consulta por chave) quase nunca dispara depois do backfill (grava chave + xml juntos).
- **`nfse-node@0.3.2`** (Apache-2.0) validado na sessao de discussao: instala limpo (58 pacotes), deps 100% JS (`pdfkit`, `@xmldom/xmldom`, `node-forge`, `qrcode`, `xml-crypto`), sem build nativo - imagem Docker intocada. `@types/pdfkit` ja e devDep (quick 260828-e3v).
- **Sem env var nova.** `deploy/stack.env.example` e os composes NAO mudam. Reusa `NFSE_NACIONAL_*`.
- **Branch `fix/orcamento-total-desconto-zerado` apenas.** NAO tocar `main` nem a PR #56. Sem push. Sem worktree/branch nova.
- **Fora de escopo:** cron/agendamento; botao em tela; marca d'agua; reprocessar eventos; NFC-e; mexer no DANFSe do fluxo de orcamento; Athos (a tabela `nfse` do Athos nao guarda essas notas).

## Rollback

`git revert` do(s) commit(s). Depois: `cd apps/backend && npm uninstall nfse-node`; conferir que voltaram - `nfse.module.ts` (sem os 2 servicos novos), `cobranca.service.ts` (`baixarDanfsePdf` de 1 nivel, construtor sem as 2 deps), `cobranca.controller.ts` (sem `@Post("nfse/sincronizar-dfe")`), `schema.prisma` (sem `xmlNacional`/`NfseDfeSync`); apagar `nfse-nacional-cert.util.ts`, `danfse-nacional-pdf.service.ts`, `nfse-nacional-distribuicao.service.ts`, os 3 `*.test.ts` novos, `__fixtures__/nfse-nacional-239.xml`, `src/types/nfse-node.d.ts` (se criado) e a pasta da migration `20260828120000_*`. Banco: `ALTER TABLE "NfseEmitida" DROP COLUMN "xmlNacional"; DROP TABLE "NfseDfeSync";` (dados de cache - sem perda de nota fiscal; os XML originais seguem no MinIO via `linkNfse`).
