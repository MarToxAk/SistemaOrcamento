---
task: "contas a receber — enviar boleto (PDF) + NFS-e (PDF DANFSe) + NF-e de produto (XML cru) num e-mail so ao cliente, com verificacao de leitura (pixel + link de confirmacao)"
quick_id: 260827-ood-no-contas-a-receber-enviar-boleto-e-nota
branch: fix/orcamento-total-desconto-zerado
type: quick
autonomous: false
depends_on: []
files_modified:
  - apps/backend/prisma/schema.prisma
  - apps/backend/prisma/migrations/20260827120000_add_cobranca_email_envio/migration.sql
  - apps/backend/package.json
  - apps/backend/src/modules/integrations/athos/athos.service.ts
  - apps/backend/src/modules/cobranca/email-envio.service.ts
  - apps/backend/src/modules/cobranca/email-envio.service.test.ts
  - apps/backend/src/modules/cobranca/cobranca.module.ts
  - apps/backend/src/modules/cobranca/cobranca.controller.ts
  - apps/backend/src/modules/cobranca/dto/enviar-email-cobranca.dto.ts
  - deploy/stack.env.example
  - deploy/docker-compose.vps.yml
  - deploy/docker-compose.box.vps.yml
  - apps/frontend/src/app/api/cobranca/email/enviar/route.ts
  - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx
user_setup:
  - "Conta Gmail com verificacao em 2 etapas + App Password (senha de app) para preencher SMTP_USER / SMTP_PASS no .env local / deploy/stack.env. Ja feito pelo usuario no .env local."
locked_decisions: .planning/quick/260827-ood-no-contas-a-receber-enviar-boleto-e-nota/DECISIONS.md
---

# Quick task — enviar boleto + NFS-e + NF-e por e-mail (contas a receber) com verificacao de leitura

Adiciona a acao **"E-mail"** no cabecalho de cada grupo de boleto da pagina de detalhe do cliente em **contas a receber**. Num **unico e-mail** o backend anexa:

1. **Boleto (PDF)** — `CobrancaService.downloadBoletoPdf(cobrancaBoletoId)` (ja existe).
2. **NFS-e (PDF DANFSe)** — `CobrancaService.baixarDanfsePdf(nfseEmitidaId)` para cada NFS-e vinculada aos titulos do boleto (ja existe nesta branch).
3. **NF-e de produto (XML cru, arquivo `.xml`)** — coluna `nota.xml` do banco Athos, resolvida pelos titulos do boleto via `venda_nota`. **Sem** DANFE renderizado, **sem** parser, **sem** barcode/Puppeteer.

O envio vai por **nodemailer + Gmail SMTP (App Password)**. Cada envio grava um registro `CobrancaEmailEnvio` com **token opaco**, um **pixel 1x1** que grava `abertoEm` e um **link "Confirmar recebimento"** que grava `confirmadoEm`.

## Restricoes travadas (de DECISIONS.md — nao-negociaveis)

- Permanecer na branch atual `fix/orcamento-total-desconto-zerado`. NAO criar branch, NAO forkar de `main`. NAO tocar `main` nem a PR #56.
- **NF-e de produto e anexada como XML cru** (`.xml`, `application/xml`). Fora de escopo: DANFE renderizado, parser de NF-e para render, `bwip-js`, codigo de barras, Puppeteer para NF-e, e qualquer botao avulso em tela ("Ver DANFE" / "Baixar XML"). O unico botao clicavel e "Confirmar recebimento" dentro do e-mail.
- Transporte: `nodemailer` + Gmail SMTP com App Password. Env vars `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` — placeholders vazios em `deploy/stack.env.example` e passthrough `VAR: ${VAR}` no bloco `environment:` do servico `backend` nos dois composes. `SMTP_FROM` de exemplo: `"Financeiro Bom Custo Papelaria & Gráfica <financeiro@bomcustoilhabela.com.br>"`. `SMTP_USER` deve ser identico ao endereco entre `<...>` do `SMTP_FROM` (Gmail nao deixa enviar em nome de outro).
- Verificacao de leitura = pixel (gif 1x1, grava `abertoEm`) **+** link de confirmacao (`GET .../confirmar`, grava `confirmadoEm`, exibe pagina "Recebimento confirmado"). Token opaco por envio (`randomBytes(24)` = 48 hex). Pagina de confirmacao identica mesmo com token invalido (nao enumerar).
- Model Prisma `CobrancaEmailEnvio` + migration SQL a mao. Colunas de identificadores incluidos: `nfseEmitidaIds Int[]` e `nfeNumeros String[]`. `cobrancaBoletoId Int?` com FK `ON DELETE SET NULL`.
- Corpo do e-mail: saudacao com **nome do cliente buscado sempre do Athos** (mesmo quando o destinatario e digitado). Reusar geracao existente de boleto/NFS-e — nao reimplementar. Segredos nunca commitados.

## Fatos do codigo verificados nesta investigacao

- Backend NestJS: `app.setGlobalPrefix("api")`; guard global `InternalAuthGuard` exige `x-internal-api-key`, **exceto** handlers `@Public()` (`src/modules/security/public.decorator.ts`). `ConfigModule` global; `PrismaService` global. `ValidationPipe` global com `forbidNonWhitelisted: true` (DTO precisa declarar todo campo).
- `EMPRESA_NOME` esta em `REQUIRED_ENV_VARS` (`apps/backend/src/modules/app.module.ts` l.31) e e validada no boot — sempre presente. `EMPRESA_TELEFONES` / `EMPRESA_EMAIL` sao opcionais. Nao existe `EMPRESA_NOME` em `deploy/stack.env.example` (lacuna pre-existente, fora de escopo), mas ja passa nos dois composes (`EMPRESA_NOME: ${EMPRESA_NOME}`).
- `deploy/nginx.conf`: `location /api/ -> backend`. `APP_BASE_URL` ja e usada por `CobrancaService` para montar a `notification_url` do webhook EFI `@Public() POST /api/cobranca/boleto/notificacao` — **nao ha rota proxy Next para esse webhook**. Os endpoints de pixel/confirmacao seguem esse mesmo padrao: `@Public()` no backend, sem rota Next.
- `CobrancaModule` (`imports: [EfiModule, AthosModule, NfseModule]`, `providers: [CobrancaService]`). `CobrancaService` injeta `athosService, prisma, config, nfseService, nfseNacionalService, danfsePdfService`. Helper `getRequiredConfig(key)` lanca `InternalServerErrorException` se faltar.
- `CobrancaService.downloadBoletoPdf(cobrancaId)` -> `{ pdfBuffer: Buffer, nomeArquivo: string }` (GET direto no `linkBoleto`).
- `CobrancaService.baixarDanfsePdf(nfseEmitidaId)` -> `{ pdfBuffer: Buffer, nomeArquivo: string }` (baixa XML de `linkNfse`, renderiza PDF). Lanca `BadRequestException` se a NFS-e nao tiver `linkNfse`.
- `CobrancaService.criarBoleto` / `anexarNfse` / `montarItensEfiPorVendaItem` resolvem `idcontareceber` -> Athos e ja usam `AthosService.buscarTodasNfesParaTitulos(idcontasReceber: number[])`, que faz `conta_receber cr JOIN venda_nota vn ON vn.idvenda = cr.idvenda JOIN nota n` **sem** filtro de status de titulo, `COALESCE(n.cancelada,false)=false AND n.nfechaveacesso IS NOT NULL`, warn+`return []` no catch. E o molde exato para a nova consulta de XML.
- `AthosService.buscarTitulosClienteContasReceber(idcliente)` filtra `TRIM(cr.statusconta) IN ('AVC','VEN')` (aberto/vencido). **Titulo de boleto ja pago pode ter saido desse filtro** -> nao usar essa rota para resolver as NF-e; usar `CobrancaBoletoTitulo.idcontareceber` (nosso banco, sem filtro).
- `AthosService.buscarDadosClienteContasReceber(idcliente)` -> `{ nome_cliente, emailcliente, emailcobrancacliente, ... } | null`; ja faz warn+`return null` no catch. Fonte oficial de destinatario e nome neste fluxo.
- `AthosService` usa pool read-only interno: `private getPool()` -> `pool.connect()` -> `client.query(...)` -> `client.release()` no `finally`. Placeholders `$1`, `= ANY($1)` para arrays. Postgres do Athos e 9.0.5 (antigo).
- Prisma: `CobrancaBoleto` (id `Int` autoincrement, `status String` puro, `titulos CobrancaBoletoTitulo[]`; **cancelar boleto faz `prisma.cobrancaBoleto.delete`** — hard delete). `CobrancaBoletoTitulo` (`cobrancaBoletoId`, `idcontareceber`). `NfseEmitida` (id `Int`, `numeroNfse String?`, `linkNfse String?`).
- Migrations = SQL a mao em `apps/backend/prisma/migrations/<timestamp>_<nome>/migration.sql`. Ultima: `20260820090000_chatwoot_mensagem_enviada`. Padrao: `CREATE TABLE IF NOT EXISTS`, `"id" SERIAL NOT NULL`, `CONSTRAINT "Tab_pkey" PRIMARY KEY`, `CREATE UNIQUE INDEX IF NOT EXISTS "Tab_col_key"`, `CREATE INDEX IF NOT EXISTS "Tab_col_idx"`, `ALTER TABLE ... ADD CONSTRAINT "Tab_col_fkey" FOREIGN KEY ... ON DELETE ... ON UPDATE CASCADE`. `atualizadoEm TIMESTAMP(3) NOT NULL` sem default (Prisma `@updatedAt` preenche no write).
- Jest: `apps/backend/jest.config.js` `rootDir: src`, `testRegex: .*\.test\.ts$`, testes `*.test.ts` ao lado do fonte. Estilo (`cobranca.service.unit.test.ts`): `Object.create(Service.prototype)` + `(service as any).dep = { ... jest.fn() ... }`.
- `nodemailer` NAO esta em `apps/backend/package.json` nem em lockfile. Precisa `npm install nodemailer` + `npm install -D @types/nodemailer` **no workspace do backend**.
- Controller `cobranca.controller.ts`: `type ExpressResponse = any` no topo, `@Res()`, `Public`, `ParseIntPipe` ja importados. Rotas `nfse/emitir` sao declaradas **antes** de `nfse/:id/pdf` — mesmo cuidado vale para `email/enviar` antes de `email/:token/...`.
- Frontend `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` (client component):
  - `dadosCliente` (com `emailcliente` / `emailcobrancacliente` / `nome_cliente`) carregado em `useEffect` de `/api/athos/contas-receber/cliente/${idcliente}`.
  - `boletoGrupos` = `Map<cobrancaId, { boleto, titulos: tsBoleto }>`. Header do grupo (~l.788-824) tem os botoes **PDF / Verificar / Cancelar** dentro de `<div className="ms-auto d-flex gap-2">`.
  - `tsBoleto` sao `TituloReceber[]`; cada um carrega `idvenda: number | null`, `tipoNf?: string | null`, `numeroNf?: string | null`, `nfseAtivo?: { nfseEmitidaId: number; numeroNfse: string | null } | null`.
  - Ha secao "notas fiscais Athos" (`notasFiscaisAthos`, ~l.1171-1185) — **NAO adicionar nada la**.
  - Modais existentes usam classes `.boleto-modal-backdrop` / `.boleto-modal-card` / `.boleto-modal-header` / `.boleto-modal-body` / `.boleto-modal-footer` (ja no `<style jsx>` da pagina). Padrao de fechar: `onClick={state !== "loading" ? fechar : undefined}` no backdrop + `e.stopPropagation()` no card + `btn-close` no header.
  - Rotas proxy em `apps/frontend/src/app/api/cobranca/*` usam `backendFetch` de `@/lib/backend-client`. Molde POST: `apps/frontend/src/app/api/cobranca/boleto/route.ts`. NAO existe `api/cobranca/email/`. Frontend so tem `next build` (sem typecheck isolado).

## Decisao de design forcada pelo codigo

**A resolucao das NF-e ancora em `CobrancaBoletoTitulo.idcontareceber` (nosso banco), nao no `idvenda` que o frontend tem nos titulos.** Motivo: `AthosService.buscarTitulosClienteContasReceber` (fonte do `idvenda` no frontend) filtra `statusconta IN ('AVC','VEN')`; um boleto ja pago pode ter titulos fora desse filtro, e a NF-e sumiria do e-mail. Ancorando em `idcontareceber` (que sempre existe em `CobrancaBoletoTitulo`) e fazendo `JOIN conta_receber cr ... vn.idvenda = cr.idvenda` — molde identico ao `buscarTodasNfesParaTitulos` ja existente — o backend resolve tudo a partir do `cobrancaBoletoId` que o frontend ja envia. **Consequencia:** o DTO NAO ganha `idvenda`/`numeros`; a assinatura fica `{ idclienteAthos, cobrancaBoletoId?, nfseEmitidaIds?, destinatario? }`, igual ao passe anterior.

---

## Tarefas (ordem obrigatoria)

### Task 1 — Model Prisma + migration do log de envio (`CobrancaEmailEnvio`)

**Arquivos:**
- `apps/backend/prisma/schema.prisma` (editar)
- `apps/backend/prisma/migrations/20260827120000_add_cobranca_email_envio/migration.sql` (criar)

**Acao:**

1. Em `schema.prisma`, adicionar o model (estilo dos `Cobranca*` — id `Int @default(autoincrement())`, timestamps, `status String`):

```prisma
model CobrancaEmailEnvio {
  id               Int             @id @default(autoincrement())
  token            String          @unique
  idclienteAthos   Int
  destinatario     String
  assunto          String?
  status           String          @default("enviado") // enviado | aberto | confirmado
  cobrancaBoletoId Int?
  nfseEmitidaIds   Int[]
  nfeNumeros       String[]        // Athos nota.numero (texto curto) das NF-e anexadas como XML
  enviadoEm        DateTime        @default(now())
  abertoEm         DateTime?
  confirmadoEm     DateTime?
  criadoEm         DateTime        @default(now())
  atualizadoEm     DateTime        @updatedAt
  cobrancaBoleto   CobrancaBoleto? @relation(fields: [cobrancaBoletoId], references: [id], onDelete: SetNull)

  @@index([idclienteAthos])
  @@index([cobrancaBoletoId])
}
```

2. No model `CobrancaBoleto`, adicionar a back-relation: `emailEnvios CobrancaEmailEnvio[]`.

3. Criar `migration.sql` (SQL a mao, molde de `20260820090000` e `20260522155308`). FK `ON DELETE SET NULL` — cancelar boleto faz `delete` do `CobrancaBoleto`, o log deve sobreviver como historico:

```sql
-- Log de envio de e-mail ao cliente (boleto + NFS-e + NF-e XML) com verificacao de leitura.
-- status: enviado | aberto | confirmado. Token opaco por envio (pixel 1x1 + link de confirmacao).
CREATE TABLE IF NOT EXISTS "CobrancaEmailEnvio" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "idclienteAthos" INTEGER NOT NULL,
    "destinatario" TEXT NOT NULL,
    "assunto" TEXT,
    "status" TEXT NOT NULL DEFAULT 'enviado',
    "cobrancaBoletoId" INTEGER,
    "nfseEmitidaIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "nfeNumeros" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "abertoEm" TIMESTAMP(3),
    "confirmadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CobrancaEmailEnvio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CobrancaEmailEnvio_token_key" ON "CobrancaEmailEnvio"("token");
CREATE INDEX IF NOT EXISTS "CobrancaEmailEnvio_idclienteAthos_idx" ON "CobrancaEmailEnvio"("idclienteAthos");
CREATE INDEX IF NOT EXISTS "CobrancaEmailEnvio_cobrancaBoletoId_idx" ON "CobrancaEmailEnvio"("cobrancaBoletoId");

ALTER TABLE "CobrancaEmailEnvio" ADD CONSTRAINT "CobrancaEmailEnvio_cobrancaBoletoId_fkey"
    FOREIGN KEY ("cobrancaBoletoId") REFERENCES "CobrancaBoleto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

4. Aplicar a migration a mao e regenerar o client (as migrations do repo sao escritas a mao — usar `deploy`, nao `dev`):
```
cd apps/backend && npx prisma migrate deploy && npx prisma generate
```

**Aceite (da raiz do repo):**
- `cd apps/backend && npx prisma validate` -> `The schema at prisma/schema.prisma is valid`.
- `cd apps/backend && npx prisma migrate status` lista `20260827120000_add_cobranca_email_envio` como aplicada.
- `node -e "new (require('@prisma/client').PrismaClient)().cobrancaEmailEnvio.findMany({take:0}).then(()=>{console.log('ok');process.exit(0)}).catch(e=>{console.error(e);process.exit(1)})"` -> imprime `ok` (client regenerado, tabela existe).
- `git status --porcelain` mostra `apps/backend/prisma/schema.prisma` modificado e a pasta `20260827120000_add_cobranca_email_envio/` nova.

---

### Task 2 — Env vars SMTP: exemplo + passthrough nos dois composes

**Arquivos:**
- `deploy/stack.env.example` (editar)
- `deploy/docker-compose.vps.yml` (editar)
- `deploy/docker-compose.box.vps.yml` (editar)

**Acao:**

1. Em `deploy/stack.env.example`, logo apos o bloco `# EFI Bank` (depois de `EFI_WEBHOOK_SECRET=`, antes de `# NFS-e (iiBrasil ...)`), adicionar — **valores em branco, sem segredo real**:

```
# E-mail (SMTP - nodemailer). Gmail exige App Password: ativar verificacao em 2 etapas na
# conta Google e criar uma "Senha de app" em https://myaccount.google.com/apppasswords.
# SMTP_USER deve ser IDENTICO ao endereco entre <...> do SMTP_FROM (Gmail nao deixa
# "enviar em nome de" outro endereco). NAO commitar credenciais reais.
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Financeiro Bom Custo Papelaria & Gráfica <financeiro@bomcustoilhabela.com.br>"
```

2. Em **`deploy/docker-compose.vps.yml`** e **`deploy/docker-compose.box.vps.yml`**, no bloco `environment:` do servico `backend` (junto das linhas `EFI_* : ${EFI_*}` / `NFSE_NACIONAL_* : ${...}`), adicionar as 5 linhas no mesmo padrao `VAR: ${VAR}`:

```
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      SMTP_FROM: ${SMTP_FROM}
```

Nao alterar o servico `frontend` nem outros servicos.

**Aceite (da raiz do repo):**
- `grep -c '^SMTP_' deploy/stack.env.example` -> `5`.
- `grep -E '^SMTP_(USER|PASS)=$' deploy/stack.env.example | wc -l` -> `2` (ficam vazios no exemplo).
- `grep -c 'SMTP_PASS: ${SMTP_PASS}' deploy/docker-compose.vps.yml` -> `1`; idem para `deploy/docker-compose.box.vps.yml`.
- `git diff --stat` desta task toca **exatamente** esses 3 arquivos; nenhum valor de senha real adicionado (`grep -rIn 'SMTP_PASS=.\+' deploy/stack.env.example` -> sem match).

---

### Task 3 — Athos: metodo `buscarNotasFiscaisXmlPorTitulos` (XML cru das NF-e por titulo)

**Arquivos:**
- `apps/backend/src/modules/integrations/athos/athos.service.ts` (editar — novo metodo publico)

**Acao:**

Adicionar, ao lado de `buscarTodasNfesParaTitulos` / `buscarNotasFiscaisCliente`, um metodo publico:

```ts
async buscarNotasFiscaisXmlPorTitulos(
  idcontasReceber: number[],
): Promise<Array<{ numero: string; xml: string }>>
```

- Se `idcontasReceber.length === 0` -> `return []` sem abrir conexao.
- Pool read-only: `const pool = this.getPool(); const client = await pool.connect();` ... `finally { client.release(); }` (mesmo shape de `buscarTodasNfesParaTitulos`).
- Query (ancorada em `conta_receber` para nao depender de status de titulo; `= ANY($1)` para o array):

```sql
SELECT DISTINCT n.numero, n.xml
FROM conta_receber cr
JOIN venda_nota vn ON vn.idvenda = cr.idvenda
JOIN nota n ON n.idnota = vn.idnota
WHERE cr.idcontareceber = ANY($1)
  AND n.xml IS NOT NULL
  AND n.nfechaveacesso IS NOT NULL
  AND COALESCE(n.cancelada, false) = false
ORDER BY n.numero
```

- Mapear as linhas para `{ numero: String(row.numero ?? "").trim(), xml: String(row.xml ?? "") }`.
- Deduplicar por `numero` no JS (uma `nota` pode ligar a mais de uma `venda` via `venda_nota`) — manter a 1a ocorrencia com `xml` nao-vazio.
- Filtrar fora entradas com `numero` vazio ou `xml` vazio.
- `catch (err)` -> `this.logger.warn('buscarNotasFiscaisXmlPorTitulos: ...')` + `return []` (nunca quebra o envio).

**Aceite (da raiz do repo):**
- `cd apps/backend && npx tsc -p tsconfig.build.json --noEmit` -> sem erros.
- `grep -n 'buscarNotasFiscaisXmlPorTitulos' apps/backend/src/modules/integrations/athos/athos.service.ts` -> assinatura presente.
- No corpo do metodo (checagem manual/grep): usa `client.release()` no `finally`, tem `catch` com `logger.warn` + `return []`, e a query contem `n.xml IS NOT NULL` e `n.nfechaveacesso IS NOT NULL`.
- `grep -c 'COALESCE(n.cancelada, false) = false' apps/backend/src/modules/integrations/athos/athos.service.ts` aumenta em 1 vs. antes desta task.

---

### Task 4 — Backend: `nodemailer` + `EmailEnvioService` + wiring no `CobrancaModule`

**Arquivos:**
- `apps/backend/package.json` (editar — via `npm install`)
- `apps/backend/src/modules/cobranca/email-envio.service.ts` (criar)
- `apps/backend/src/modules/cobranca/cobranca.module.ts` (editar)

**Acao:**

1. `cd apps/backend && npm install nodemailer && npm install -D @types/nodemailer`.

2. Criar `EmailEnvioService` (`@Injectable()`), injetando `ConfigService`, `PrismaService`, `CobrancaService`, `AthosService`.

   - `private buildTransport()`: le `SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS` via `config.get`; se algum faltar -> `InternalServerErrorException("Variavel de ambiente SMTP_* nao configurada.")` (espelha `getRequiredConfig`). `nodemailer.createTransport({ host, port: Number(port), secure: Number(port) === 465, auth: { user, pass } })`.

   - `async enviarBoletoENotas(input: { idclienteAthos: number; cobrancaBoletoId?: number; nfseEmitidaIds?: number[]; destinatario?: string }): Promise<{ id: number; token: string; destinatario: string; status: string; anexos: string[] }>`:
     1. Validar que ha ao menos um documento: `cobrancaBoletoId` **ou** `nfseEmitidaIds?.length`. Senao `BadRequestException("Selecione ao menos um documento (boleto ou NFS-e).")`.
     2. **Sempre** `const cliente = await this.athosService.buscarDadosClienteContasReceber(input.idclienteAthos)` (para o nome na saudacao, mesmo com destinatario digitado). `const nomeCliente = cliente?.nome_cliente ?? "Cliente"`.
     3. Resolver destinatario: `input.destinatario?.trim()` se informado; senao `cliente?.emailcobrancacliente || cliente?.emailcliente`. Se nada resolver ou nao casar regex simples de e-mail -> `BadRequestException("Cliente sem e-mail cadastrado; informe o destinatario.")`.
     4. Anexos PDF: se `cobrancaBoletoId` -> `downloadBoletoPdf(id)` -> `{ filename: nomeArquivo, content: pdfBuffer }`. Para cada `id` unico de `nfseEmitidaIds` -> `baixarDanfsePdf(id)` -> anexo `{ filename, content }`.
     5. Anexos XML NF-e: se `cobrancaBoletoId`, `const boleto = await this.prisma.cobrancaBoleto.findUnique({ where: { id: cobrancaBoletoId }, include: { titulos: { select: { idcontareceber: true } } } })`; `const idcontas = boleto?.titulos.map(t => t.idcontareceber) ?? []`; `const notasXml = idcontas.length ? await this.athosService.buscarNotasFiscaisXmlPorTitulos(idcontas) : []`. Para cada `{ numero, xml }` -> anexo `{ filename: \`NF-e-${numero}.xml\`, content: xml, contentType: "application/xml" }`. `const nfeNumeros = notasXml.map(n => n.numero)`.
     6. `anexos: string[]` = todos os `filename` na ordem (boleto, NFS-e..., NF-e...).
     7. `token = randomBytes(24).toString("hex")` (`node:crypto`).
     8. URLs a partir de `this.config.get("APP_BASE_URL")` (obrigatoria — helper tipo `getRequiredConfig`), removendo barra final: `pixelUrl = ${base}/api/cobranca/email/${token}/pixel.gif`; `confirmUrl = ${base}/api/cobranca/email/${token}/confirmar`.
     9. `assunto = \`Boleto e nota fiscal — ${this.config.get("EMPRESA_NOME") ?? "Bom Custo"}\``.
     10. Corpo:
         - `html` (1 coluna): saudacao `Ola, ${nomeCliente},`; frase "Serao anexados: boleto (PDF) + N NFS-e (PDF) + M NF-e (XML)" com `N = nfseEmitidaIds unicos anexados`, `M = nfeNumeros.length`; botao/link verde "Confirmar recebimento" -> `confirmUrl`; fallback em texto com a URL; rodape com `EMPRESA_NOME` / `EMPRESA_TELEFONES` / `EMPRESA_EMAIL` (linha some se a env var vier vazia); `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none">` no fim.
         - `text`: versao texto puro equivalente, incluindo `confirmUrl` cru.
     11. `const transport = this.buildTransport(); await transport.sendMail({ from: this.config.get("SMTP_FROM"), to: destinatario, subject: assunto, html, text, attachments })`.
     12. **Apos** o envio OK: `const row = await this.prisma.cobrancaEmailEnvio.create({ data: { token, idclienteAthos: input.idclienteAthos, destinatario, assunto, status: "enviado", cobrancaBoletoId: input.cobrancaBoletoId ?? null, nfseEmitidaIds: [...nfseIdsUnicos], nfeNumeros } })`.
     13. Se `sendMail` rejeitar -> `InternalServerErrorException("Falha ao enviar o e-mail.")` (nao cria row).
     14. Retornar `{ id: row.id, token, destinatario, status: row.status, anexos }`.

   - `async registrarAbertura(token: string): Promise<Buffer>`:
     - `findUnique({ where: { token } })`. Se `row` e `row.abertoEm == null`: `update` setando `abertoEm: new Date()` e, se `row.status === "enviado"`, `status: "aberto"`.
     - **Sempre** retornar o gif 1x1: `Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")` (43 bytes; nao vazar existencia do token).

   - `async registrarConfirmacao(token: string): Promise<{ found: boolean }>`:
     - `findUnique` por token. Se achou: `update` com `confirmadoEm: row.confirmadoEm ?? new Date()`, `status: "confirmado"`, `abertoEm: row.abertoEm ?? new Date()`; `return { found: true }`. Senao `{ found: false }` (sem throw, sem update).

3. Em `cobranca.module.ts`, adicionar `EmailEnvioService` ao array `providers` (sem novo import de modulo — `AthosModule`/`NfseModule` ja importados; `CobrancaService` ja e provider do mesmo modulo).

**Aceite (da raiz do repo):**
- `cd apps/backend && npx tsc -p tsconfig.build.json --noEmit` -> sem erros.
- `node -e "const p=require('./apps/backend/package.json'); process.exit(p.dependencies.nodemailer && p.devDependencies['@types/nodemailer'] ? 0 : 1)"` -> exit 0.
- `grep -c EmailEnvioService apps/backend/src/modules/cobranca/cobranca.module.ts` -> `>= 2` (import + provider).
- `grep -n 'buscarNotasFiscaisXmlPorTitulos\|contentType: "application/xml"\|NF-e-' apps/backend/src/modules/cobranca/email-envio.service.ts` -> os 3 aparecem (NF-e anexada como XML cru).

---

### Task 5 — Backend: endpoints no controller (envio autenticado + pixel publico + confirmacao publica) + DTO

**Arquivos:**
- `apps/backend/src/modules/cobranca/dto/enviar-email-cobranca.dto.ts` (criar)
- `apps/backend/src/modules/cobranca/cobranca.controller.ts` (editar)

**Acao:**

1. DTO `EnviarEmailCobrancaDto` (class-validator, estilo de `criar-boleto.dto.ts`; `forbidNonWhitelisted` -> declarar todo campo):

```ts
import { ArrayMinSize, IsArray, IsEmail, IsInt, IsOptional, IsPositive } from "class-validator";

export class EnviarEmailCobrancaDto {
  @IsInt() @IsPositive()
  idclienteAthos!: number;

  @IsOptional() @IsInt() @IsPositive()
  cobrancaBoletoId?: number;

  @IsOptional() @IsArray() @ArrayMinSize(1) @IsInt({ each: true }) @IsPositive({ each: true })
  nfseEmitidaIds?: number[];

  @IsOptional() @IsEmail()
  destinatario?: string;
}
```

2. No `CobrancaController`: injetar `private readonly emailEnvioService: EmailEnvioService` no construtor. Handlers (declarar `email/enviar` **antes** dos que tem `:token`):

   - `@Post("email/enviar")` -> `enviarEmail(@Body() dto: EnviarEmailCobrancaDto)` -> `return this.emailEnvioService.enviarBoletoENotas(dto);` (autenticado pelo guard global).

   - `@Public() @Get("email/:token/pixel.gif")` -> `async pixel(@Param("token") token: string, @Res() res: ExpressResponse)`:
     ```
     const gif = await this.emailEnvioService.registrarAbertura(token);
     res.setHeader("Content-Type", "image/gif");
     res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
     res.setHeader("Pragma", "no-cache");
     res.setHeader("Content-Length", gif.length);
     res.end(gif);
     ```

   - `@Public() @Get("email/:token/confirmar")` -> `async confirmar(@Param("token") token: string, @Res() res: ExpressResponse)`:
     ```
     await this.emailEnvioService.registrarConfirmacao(token);
     res.setHeader("Content-Type", "text/html; charset=utf-8");
     res.setHeader("Cache-Control", "no-store");
     res.send("<!doctype html><meta charset=utf-8><title>Recebimento confirmado</title>" +
       "<div style='font-family:system-ui;max-width:32rem;margin:4rem auto;text-align:center'>" +
       "<h1 style='color:#198754'>Recebimento confirmado</h1>" +
       "<p>Obrigado! Registramos que voce recebeu o boleto e a(s) nota(s) fiscal(is).</p></div>");
     ```
     Pagina identica mesmo com token inexistente (nao enumerar).

   - `Public`, `ExpressResponse` (alias `any`), `@Res()`, `@Param` ja estao importados no arquivo.

**Aceite (da raiz do repo):**
- `cd apps/backend && npx tsc -p tsconfig.build.json --noEmit` -> sem erros.
- `grep -c '@Public()' apps/backend/src/modules/cobranca/cobranca.controller.ts` aumenta em 2 vs. antes desta task.
- Com backend rodando (`INTERNAL_API_KEY=$KEY`, SMTP configurado, um cliente com boleto):
  - `curl -s -o /dev/null -w "%{http_code}" -X POST localhost:4000/api/cobranca/email/enviar -H "x-internal-api-key: $KEY" -H "content-type: application/json" -d '{"idclienteAthos":<id>,"cobrancaBoletoId":<id>}'` -> `200` + 1 registro novo em `CobrancaEmailEnvio`.
  - `curl -s -o /dev/null -w "%{http_code} %{content_type} %{size_download}" localhost:4000/api/cobranca/email/<token>/pixel.gif` -> `200 image/gif 43` (sem header de auth).
  - `curl -s -o /dev/null -w "%{http_code} %{content_type}" localhost:4000/api/cobranca/email/<token>/confirmar` -> `200 text/html; charset=utf-8` (sem auth).
  - SQL: `status` transiciona `enviado` -> `aberto` (apos pixel) -> `confirmado` (apos confirmar); `abertoEm`/`confirmadoEm` preenchidos; `nfeNumeros` = numeros das NF-e anexadas.

---

### Task 6 — Backend: teste unitario do `EmailEnvioService` (mock nodemailer + deps)

**Arquivos:**
- `apps/backend/src/modules/cobranca/email-envio.service.test.ts` (criar)

**Acao:**

Estilo de `cobranca.service.unit.test.ts`: `jest.mock("nodemailer")` no topo; `const sendMail = jest.fn().mockResolvedValue({ messageId: "x" })`; `(nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail })`. Instanciar `Object.create(EmailEnvioService.prototype)` e atribuir:
- `config`: `{ get: (k) => ({ SMTP_HOST:"smtp.gmail.com", SMTP_PORT:"465", SMTP_USER:"u@g.com", SMTP_PASS:"p", SMTP_FROM:"F <u@g.com>", APP_BASE_URL:"https://app.exemplo.com", EMPRESA_NOME:"Bom Custo", EMPRESA_TELEFONES:"", EMPRESA_EMAIL:"" }[k]) }`
- `prisma`: `{ cobrancaBoleto: { findUnique: jest.fn().mockResolvedValue({ id: 10, titulos: [{ idcontareceber: 501 }, { idcontareceber: 502 }] }) }, cobrancaEmailEnvio: { create: jest.fn(async ({ data }) => ({ id: 1, ...data })), findUnique: jest.fn(), update: jest.fn(async (a) => a) } }`
- `cobrancaService`: `{ downloadBoletoPdf: jest.fn().mockResolvedValue({ pdfBuffer: Buffer.from("b"), nomeArquivo: "boleto.pdf" }), baixarDanfsePdf: jest.fn().mockResolvedValue({ pdfBuffer: Buffer.from("n"), nomeArquivo: "nfse.pdf" }) }`
- `athosService`: `{ buscarDadosClienteContasReceber: jest.fn().mockResolvedValue({ nome_cliente: "ACME LTDA", emailcobrancacliente: "cob@x.com", emailcliente: "c@x.com" }), buscarNotasFiscaisXmlPorTitulos: jest.fn().mockResolvedValue([{ numero: "440", xml: "<NFe/>" }, { numero: "441", xml: "<NFe/>" }]) }`

Casos:
1. `enviarBoletoENotas({ idclienteAthos:1, cobrancaBoletoId:10, nfseEmitidaIds:[20,21], destinatario:"cli@x.com" })` -> `sendMail` 1x; `to === "cli@x.com"`; `from === "F <u@g.com>"`; `attachments.length === 5` (1 boleto + 2 NFS-e + 2 NF-e XML); os 2 anexos de NF-e tem `filename` `NF-e-440.xml` / `NF-e-441.xml` e `contentType === "application/xml"` com `content === "<NFe/>"`; `html` contem `https://app.exemplo.com/api/cobranca/email/` + o token, uma tag `<img`, e a saudacao com `ACME LTDA` (nome do Athos, mesmo com destinatario digitado); `prisma.cobrancaEmailEnvio.create` chamado com `status:"enviado"`, `token` de 48 hex, `nfeNumeros:["440","441"]`, `nfseEmitidaIds:[20,21]`.
2. Sem `destinatario` -> `to === "cob@x.com"` (fallback `emailcobrancacliente`).
3. `athosService.buscarDadosClienteContasReceber` -> `null` e sem `destinatario` -> `rejects` `BadRequestException`; `sendMail` nao chamado.
4. `enviarBoletoENotas({ idclienteAthos:1 })` (sem boleto e sem NFS-e) -> `rejects` `BadRequestException`; `sendMail` nao chamado.
5. `buscarNotasFiscaisXmlPorTitulos` -> `[]` -> `attachments` so com boleto + NFS-e; `create` chamado com `nfeNumeros: []`.
6. `registrarAbertura("tok")` com `findUnique` -> `{ id:1, token:"tok", status:"enviado", abertoEm:null }`: retorna Buffer de 43 bytes; `update` com `abertoEm` + `status:"aberto"`. 2a chamada com `abertoEm` ja setado -> `update` NAO chamado; ainda retorna o gif de 43 bytes.
7. `registrarConfirmacao("tok")` com row existente -> `update` com `status:"confirmado"` + `confirmadoEm`; `{ found:true }`. Token desconhecido (`findUnique` -> `null`) -> `{ found:false }`, sem `update`, sem throw.

**Aceite (da raiz do repo):**
- `cd apps/backend && npx jest src/modules/cobranca/email-envio.service.test.ts` -> todos verdes.
- `cd apps/backend && npm test` -> suite completa sem regressao.

---

### Task 7 — Frontend: rota proxy + acao "E-mail" e modal na pagina de contas a receber

**Arquivos:**
- `apps/frontend/src/app/api/cobranca/email/enviar/route.ts` (criar)
- `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` (editar)

**Acao:**

1. Rota proxy (espelhar `api/cobranca/boleto/route.ts`; payload explicito para nao vazar campos extras):

```ts
import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend-client";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Body inválido ou ausente." }, { status: 400 });
  }
  const { idclienteAthos, cobrancaBoletoId, nfseEmitidaIds, destinatario } = body as Record<string, unknown>;
  if (typeof idclienteAthos !== "number" || !Number.isFinite(idclienteAthos) || idclienteAthos <= 0) {
    return NextResponse.json({ error: "idclienteAthos inválido ou ausente." }, { status: 400 });
  }
  const payload: Record<string, unknown> = { idclienteAthos };
  if (typeof cobrancaBoletoId === "number") payload.cobrancaBoletoId = cobrancaBoletoId;
  if (Array.isArray(nfseEmitidaIds) && nfseEmitidaIds.length > 0 && nfseEmitidaIds.every((n) => typeof n === "number")) {
    payload.nfseEmitidaIds = nfseEmitidaIds;
  }
  if (typeof destinatario === "string" && destinatario.trim()) payload.destinatario = destinatario.trim();
  try {
    const res = await backendFetch("/cobranca/email/enviar", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => ({ error: "Resposta inválida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
```

2. Na pagina `contas-receber/[idcliente]/page.tsx`:
   - Novos estados: `emailModalState` (`"idle"|"confirm"|"loading"|"success"|"error"`), `emailCtx` (`{ cobrancaId: number; nfseEmitidaIds: number[]; nfeCount: number } | null`), `emailDestinatario` (string), `emailResult` (`{ destinatario: string; status: string; anexos?: string[] } | null`), `emailErro` (string).
   - `function abreEmailModal(boleto, tsBoleto)`:
     - `const nfseIds = [...new Set(tsBoleto.map((t) => t.nfseAtivo?.nfseEmitidaId).filter((v): v is number => !!v))];`
     - `const nfeCount = new Set(tsBoleto.filter((t) => t.tipoNf?.includes("NF-e")).map((t) => t.numeroNf).filter(Boolean)).size;` (estimativa pre-envio para o texto do modal; a contagem real volta em `anexos`)
     - `setEmailCtx({ cobrancaId: boleto.cobrancaId, nfseEmitidaIds: nfseIds, nfeCount });`
     - `setEmailDestinatario(dadosCliente?.emailcobrancacliente ?? dadosCliente?.emailcliente ?? "");`
     - `setEmailErro(""); setEmailResult(null); setEmailModalState("confirm");`
   - `async function confirmarEnviarEmail()`: `setEmailModalState("loading")`; `POST /api/cobranca/email/enviar` com `{ idclienteAthos: Number(idcliente), cobrancaBoletoId: emailCtx.cobrancaId, nfseEmitidaIds: emailCtx.nfseEmitidaIds, destinatario: emailDestinatario.trim() || undefined }`; `res.ok` -> `setEmailResult(data); setEmailModalState("success")`; senao `setEmailErro(data.message ?? data.error ?? "Falha ao enviar."); setEmailModalState("error")`; `catch` -> `error`.
   - No header de cada grupo de boleto (dentro do `<div className="ms-auto d-flex gap-2">`, junto de PDF / Verificar / Cancelar), adicionar:
     ```
     <button type="button" className="btn btn-sm btn-outline-success"
       title="Enviar boleto e notas por e-mail"
       onClick={() => abreEmailModal(boleto, tsBoleto)}>
       <i className="bi bi-envelope me-1" />E-mail
     </button>
     ```
   - Adicionar o modal junto dos outros modais (fim do JSX), reutilizando `boleto-modal-backdrop` / `-card` / `-header` / `-body` / `-footer` e o padrao `onClick={emailModalState !== "loading" ? () => setEmailModalState("idle") : undefined}` no backdrop + `e.stopPropagation()` no card + `btn-close` no header:
     - `confirm`: campo de e-mail editavel (`value={emailDestinatario}` / `onChange`), texto `Serão anexados: boleto (PDF) + {emailCtx.nfseEmitidaIds.length} NFS-e (PDF) + {emailCtx.nfeCount} NF-e (XML)`, botoes "Cancelar" / "Enviar e-mail" (desabilitado se `!emailDestinatario.trim()`).
     - `loading`: spinner "Enviando e-mail…".
     - `success`: "E-mail enviado para {emailResult.destinatario}" + lista de `emailResult.anexos` (nomes dos arquivos anexados) + aviso curto: "A confirmação de leitura depende do cliente abrir a imagem ou clicar no link de confirmação — o pixel pode não registrar em alguns provedores."
     - `error`: alerta com `emailErro` + botao "Tentar novamente" (volta para `confirm`).
   - ESC: opcional; se os outros modais tratam, seguir o mesmo padrao — senao, fechar so no backdrop/`btn-close`.
   - **NAO** mexer na secao `notasFiscaisAthos` (~l.1171-1185).

**Aceite (da raiz do repo):**
- `cd apps/frontend && npm run build` -> compila sem erro de tipo/lint no arquivo alterado e na nova rota.
- `git grep -n "cobranca/email/enviar" apps/frontend/src` -> aparece na pagina e em `api/cobranca/email/enviar/route.ts`.
- `git grep -n "bi-envelope" "apps/frontend/src/app/contas-receber/[idcliente]/page.tsx"` -> 1 match (botao "E-mail" no header do grupo de boleto).
- Rodando `npm run dev` (raiz): `/contas-receber/<idcliente>` de um cliente com boleto emitido -> header do grupo mostra o botao "E-mail"; clicar abre o modal com o e-mail pre-preenchido e o texto "boleto (PDF) + N NFS-e (PDF) + M NF-e (XML)"; "Enviar e-mail" chama `POST /api/cobranca/email/enviar` e mostra o estado de sucesso com a lista de anexos.

---

## Verificacao manual (ponta a ponta, local)

### 1. Gmail App Password (pre-requisito humano — o usuario ja fez no `.env` local)
1. Na conta Google que envia: ativar verificacao em 2 etapas — https://myaccount.google.com/security.
2. Criar senha de app — https://myaccount.google.com/apppasswords -> copiar os 16 caracteres (usar **sem espacos**).
3. `SMTP_USER` = **o mesmo endereco** que aparece entre `<...>` no `SMTP_FROM` (Gmail nao envia "em nome de" outro endereco).

### 2. Backend local — `apps/backend/.env` (nao commitar; ja preenchido pelo usuario)
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=financeiro@bomcustoilhabela.com.br
SMTP_PASS=<app password de 16 chars, sem espacos>
SMTP_FROM="Financeiro Bom Custo Papelaria & Gráfica <financeiro@bomcustoilhabela.com.br>"
APP_BASE_URL=http://localhost:4000
```
> **`APP_BASE_URL=http://localhost:4000`** no dev: sem nginx local, os links de pixel/confirmacao precisam apontar direto para a origem do backend. Em producao o nginx roteia `/api/` -> backend, entao `APP_BASE_URL=https://<dominio>` e o correto (mesma variavel ja usada pelo webhook EFI).

### 3. Migrar e subir
```
cd apps/backend && npx prisma migrate deploy && npx prisma generate
cd ../../ && npm run dev        # backend :4000, frontend :3000
```

### 4. Enviar
1. `http://localhost:3000/contas-receber` -> escolher um cliente que tenha um **boleto emitido** cujos titulos tenham **ao mesmo tempo** uma **NFS-e anexada** (`nfseAtivo`) **e** pelo menos uma **NF-e Athos** por tras das vendas (titulo com badge `NF-e #...`).
2. No bloco "Titulos com boleto emitido", no header do grupo, clicar **E-mail**.
3. Conferir/ajustar o destinatario (vem de `emailcobrancacliente`/`emailcliente` do Athos — no teste usar **o seu proprio e-mail**) -> **Enviar e-mail**.
4. Esperado: sucesso "E-mail enviado para <seu e-mail>" + lista de anexos. Na caixa de entrada: **1 e-mail** com **3 tipos de anexo**:
   - `... .pdf` do **boleto**;
   - `NFSe-<numero>.pdf` (um por **NFS-e** vinculada);
   - `NF-e-<numero>.xml` (um por **NF-e** de produto; abrir e conferir que e o XML cru autorizado, nao um PDF).
   - Corpo com saudacao pelo **nome do cliente** (Athos), botao verde **"Confirmar recebimento"** e um pixel invisivel.

### 5. Verificacao de leitura
- **Pixel:** abrir o e-mail com imagens habilitadas. Depois:
  `psql $DATABASE_URL -c 'SELECT id,status,"abertoEm","confirmadoEm","nfeNumeros" FROM "CobrancaEmailEnvio" ORDER BY id DESC LIMIT 1;'`
  -> `status = aberto`, `abertoEm` preenchido, `nfeNumeros` com os numeros anexados.
- **Confirmacao:** clicar em "Confirmar recebimento" -> pagina "Recebimento confirmado". Repetir a consulta -> `status = confirmado`, `confirmadoEm` preenchido.
- **Alternativa por curl (sem cliente de e-mail):**
  ```
  curl -i http://localhost:4000/api/cobranca/email/<token>/pixel.gif      # 200, image/gif, 43 bytes
  curl -i http://localhost:4000/api/cobranca/email/<token>/confirmar      # 200, text/html
  ```

### 6. Testes e build
```
cd apps/backend && npx jest src/modules/cobranca/email-envio.service.test.ts && npm test
cd apps/backend && npx tsc -p tsconfig.build.json --noEmit
cd apps/frontend && npm run build
```

---

## Riscos / fora de escopo

- **NF-e anexada como XML cru — por design.** DECISIONS 2026-08-28: a NF-e de produto vai como `.xml` (`application/xml`), sem DANFE renderizado. O destinatario abre/renderiza o proprio DANFE a partir do XML autorizado. Nada de parser de NF-e, `bwip-js`, codigo de barras ou Puppeteer para NF-e neste escopo. Nenhum botao avulso "Ver DANFE"/"Baixar XML" em tela — o unico botao clicavel e "Confirmar recebimento" dentro do e-mail.
- **Confiabilidade do pixel:** Gmail serve imagens via proxy (`googleusercontent.com`) e faz cache; muitos clientes bloqueiam imagem remota por padrao. `abertoEm` pode nao registrar ou registrar atrasado mesmo com o e-mail lido. O **link de confirmacao e o sinal forte**; `abertoEm` e so indicio (a UI de sucesso ja avisa).
- **Gmail SMTP:** limite ~500 destinatarios/dia e reputacao de remetente menores que um provedor transacional. Suficiente para o volume atual; nao e canal de envio em massa. DECISIONS proibe trocar por servico transacional agora.
- **Segredos:** `SMTP_PASS` (App Password) e `SMTP_FROM` so entram em `deploy/stack.env` (ja no `.gitignore`) e no `.env` local. `stack.env.example` leva apenas placeholders vazios / endereco de exemplo. Nunca commitar App Password real.
- **Branch:** todo o trabalho fica em `fix/orcamento-total-desconto-zerado`. NAO tocar `main` (revertida ao estado do PR #53, sem a infra de NFS-e/PDF DANFSe) nem a PR #56.
- **Sem reimplementar geracao:** o servico so reusa `downloadBoletoPdf`, `baixarDanfsePdf` e a coluna `nota.xml` do Athos. Se a NFS-e nao tiver `linkNfse`, `baixarDanfsePdf` ja lanca e o erro sobe para a UI. Se o Athos falhar na consulta de XML, `buscarNotasFiscaisXmlPorTitulos` retorna `[]` (e-mail sai sem a NF-e, sem quebrar).
- **Resolucao das NF-e por `idcontareceber`, nao por `idvenda` do frontend:** `buscarTitulosClienteContasReceber` filtra `statusconta IN ('AVC','VEN')` e um boleto pago pode perder titulos desse filtro; ancorar em `CobrancaBoletoTitulo` garante que a NF-e continua sendo anexada mesmo apos o pagamento.
- **Dev sem nginx:** pixel/confirmacao so resolvem se `APP_BASE_URL` apontar direto para o backend (`:4000`) no ambiente local. Mesma limitacao ja aceita para o webhook `boleto/notificacao`.
- **Sem rota proxy Next para pixel/confirmar:** de proposito — sao `@Public()` no backend e chegam via nginx `/api/`, igual ao `boleto/notificacao`.
- **Fora de escopo:** fila/retry de envios falhos; webhooks de entrega/bounce; unsubscribe; selecao manual de quais documentos anexar (envia todas as NFS-e/NF-e vinculadas aos titulos do boleto); i18n do corpo; NFC-e modelo 65; envio a partir da lista de "Titulos disponiveis" sem boleto (a acao vive no grupo de boleto).

## Rollback

`git revert` do(s) commit(s) da task; `DROP TABLE "CobrancaEmailEnvio";` + remover a pasta `20260827120000_add_cobranca_email_envio/` e a back-relation `emailEnvios` em `CobrancaBoleto`; `npx prisma generate`. As env vars SMTP em branco sao inertes. `npm uninstall nodemailer @types/nodemailer` no `apps/backend` se quiser reverter a dependencia.
