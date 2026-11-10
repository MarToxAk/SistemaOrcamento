# Phase 45: Aviso de boletos a vencer e atrasados - Research

**Researched:** 2026-11-10
**Domain:** NestJS (`@nestjs/schedule`) + Prisma/PostgreSQL + nodemailer + Next.js (painel Contas a Receber) - modulo `cobranca`
**Confidence:** HIGH (pesquisa 100% no codigo; nenhum pacote novo)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Alerta interno na tela **e** e-mail automatico (os dois).
- **D-02 (antes do vencimento):** 2 avisos - **3 dias antes** e **1 dia antes** de `expireAt`.
- **D-03 (atraso):** 3 avisos - **2, 7 e 14 dias depois** de `expireAt`. Maximo 3 avisos de atraso; depois disso so o alerta interno continua.
- Tipos de aviso (chave de idempotencia): `D-3`, `D-1`, `A+2`, `A+7`, `A+14`.
- Dia do vencimento nao gera e-mail (nao pedido).
- **D-04:** Cliente **e** CC. Destinatario principal = `emailcobrancacliente || emailcliente` do Athos (mesma regra de `EmailEnvioService.enviarBoletoENotas`). CC = `CobrancaEmailCcPadrao.emails` do cliente (Fase 42), normalizado por `normalizarListaCc`. Cliente sem e-mail valido: nao envia, registra log/alerta interno ("sem e-mail"), sem repetir erro a cada ciclo. Reutilizar `EmailEnvioService` (transporte nodemailer, template, CC, registro em `CobrancaEmailEnvio`). Novo metodo de aviso no mesmo servico; nao duplicar logica SMTP.
- **D-05:** Nova tabela Prisma `CobrancaAvisoVencimento` (`cobrancaBoletoId`, `tipo`, `enviadoEm`, `status`/erro, `destinatario`), com `@@unique([cobrancaBoletoId, tipo])`. Reservar a linha antes de enviar; falha de SMTP marca erro e permite nova tentativa no ciclo seguinte (mesma janela), sem duplicar aviso ja enviado. Catch-up: se o job ficar parado, enviar apenas o aviso mais recente aplicavel por boleto (nunca varios de uma vez), e pular tipos cuja janela ja passou.
- **D-06:** Somente `CobrancaBoleto.status = "pendente"` com `expireAt` valido. Boleto pago, cancelado ou com baixa (`athosBaixaStatus` baixado/ja_baixado) nao gera aviso. Datas em America/Sao_Paulo (YYYY-MM-DD, sem fuso do servidor).
- **D-07:** Job `@nestjs/schedule` diario (ex.: 08:00 America/Sao_Paulo), no padrao de `cobranca-reconciliation.job.ts` (guarda `running`, teto por ciclo, logs). **Kill switch** `COBRANCA_AVISO_ATIVO` (padrao **desligado**: so envia com `=true`), mais modo "dry-run" opcional que apenas loga.
- **D-08:** `buscarBoletosDashboard()` ja devolve `diasParaVencer`. Adicionar destaque no dashboard e em Contas a Receber: "Vence em Nd" (<=3), "Vence hoje", "Atrasado ha Nd"; contadores de a vencer / atrasados; indicar ultimo aviso enviado por boleto. Seguir design system Bom Custo (skill `bom-custo-design`).

### Claude's Discretion
Texto/assunto do e-mail (portugues, tom cordial, sem emojis), anexar PDF do boleto ou so o link, nomes de arquivos/DTOs, layout exato dos badges.

### Deferred Ideas (OUT OF SCOPE)
- Aviso por WhatsApp/Chatwoot; aviso no dia do vencimento; configuracao do calendario pela interface.
</user_constraints>

## Project Constraints (from CLAUDE.md)

- Responder/escrever prosa em **portugues brasileiro**; identificadores de codigo ficam como estao.
- **Nao usar AskUserQuestion**; perguntas em lista numerada em texto.
- **Nao alterar codigo** sem pedido explicito (esta etapa e so pesquisa; o planner/executor e que implementam).
- Athos PostgreSQL 9.0.5: usar `pg_catalog`, sem `pg_sequence_last_value`. O usuario `usuario_leitura` **nao e read-only de fato** e o host e PRODUCAO: **nunca rodar escrita de teste**. Esta fase nao escreve no Athos (so le cadastro do cliente via `buscarDadosClienteContasReceber`) [VERIFIED: memory/athos_postgres_9_0_5.md].
- Migrations devem ser aditivas e idempotentes (regra da Fase 09) - padrao `CREATE TABLE IF NOT EXISTS` [VERIFIED: prisma/migrations/20261109120000_add_athos_orcamento_ia/migration.sql:1].

<phase_requirements>
## Phase Requirements

Requirement IDs estao como `TBD` no ROADMAP (ver Open Questions #1). O planner deve criar IDs (sugestao: `AVISO-01..AVISO-08`) mapeados as decisoes abaixo.

| ID sugerido | Descricao | Research Support |
|-------------|-----------|------------------|
| AVISO-01 (D-05) | Tabela `CobrancaAvisoVencimento` + migration idempotente | Secao "Tabela e migration" |
| AVISO-02 (D-02/D-03/D-05/D-06) | Calculo de tipo aplicavel + janelas + catch-up | Secao "Janelas e catch-up" |
| AVISO-03 (D-04) | Metodo de aviso em `EmailEnvioService` (SMTP/CC/log) | Secao "E-mail" |
| AVISO-04 (D-07) | Job diario + kill switch + dry-run + guarda `running` | Secao "Job" |
| AVISO-05 (D-08) | Backend expoe situacao + ultimo aviso no dashboard | Secao "Dashboard (backend)" |
| AVISO-06 (D-08) | Badges e contadores no painel Contas a Receber | Secao "Frontend" |
| AVISO-07 (D-04) | Cliente sem e-mail valido: log unico, sem repeticao | Secao "Destinatarios" |
| AVISO-08 (D-07) | Env vars no `.env.example` e nos 2 compose de deploy | Secao "Configuracao" |
</phase_requirements>

## Summary

Tudo o que a fase precisa ja existe no modulo `cobranca`: `EmailEnvioService` (transporte nodemailer, CC, log em `CobrancaEmailEnvio`), o padrao de job (`@Cron` + guarda `running` + teto por ciclo + kill switch por env) e o helper `hojeSaoPaulo()` (data YYYY-MM-DD no calendario de America/Sao_Paulo). A fase e aditiva: 1 tabela nova, 1 service + 1 job novos, 2 metodos novos em `EmailEnvioService`, 1 campo novo no retorno do dashboard e badges no painel `BoletosConsolidadosPanel`.

Os pontos de maior risco sao comportamentais, nao tecnologicos: (1) **explosao de e-mails na primeira ativacao** (boletos antigos pendentes) - resolvido com janelas finitas por tipo; (2) **idempotencia sob falha** (reserva -> envio -> marca) sem duplicar; (3) **fuso**: o dashboard atual calcula `diasParaVencer` com `new Date().toISOString()` (UTC) - entre 21:00 e 23:59 BRT o "hoje" ja e amanha, divergindo do job; (4) **Prisma `notIn` em coluna nula** pode excluir boletos com `athosBaixaStatus = null` (todos os pendentes!) - usar `OR` explicito.

Recomendacao de janelas (decisao de design dentro da discricao de D-05; confirmar com o usuario, ver A1): cada tipo tem uma janela de dias-para-vencer **disjunta**, de modo que exista no maximo 1 aviso aplicavel por boleto por dia - isso satisfaz "so o mais recente, nunca varios" sem logica extra.

**Primary recommendation:** criar `CobrancaAvisoVencimentoService` (orquestracao: candidatos -> tipo aplicavel -> reserva atomica via `create` + P2002 -> `EmailEnvioService.enviarAvisoVencimento` -> marca `enviado`/`erro`) e um job fino `cobranca-aviso-vencimento.job.ts` com `@Cron("0 8,14 * * *", { timeZone: "America/Sao_Paulo" })`, desligado por padrao (`COBRANCA_AVISO_ATIVO === "true"`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Agendamento diario dos avisos | API / Backend (job NestJS) | - | `@nestjs/schedule` ja roda no backend (`ScheduleModule.forRoot()` em app.module.ts:79) |
| Calculo de tipo/janela do aviso | API / Backend (util puro) | - | Fonte unica usada pelo job e pelo dashboard; testavel em jest |
| Idempotencia/estado do aviso | Database (Prisma, banco do Sistema) | API | `@@unique([cobrancaBoletoId, tipo])` e a garantia real; nunca no Athos |
| Resolucao de destinatario | API / Backend | Athos (leitura) | `buscarDadosClienteContasReceber` (SELECT) + `CobrancaEmailCcPadrao` |
| Envio SMTP | API / Backend (`EmailEnvioService`) | - | Unico ponto com transporte/template/CC |
| Alerta interno (badges/contadores) | Browser / Client (React) | API (campo `situacaoVencimento`, `ultimoAviso`) | Frontend so mapeia rotulo/cor; classificacao vem do backend |
| Proxy do dashboard | Frontend Server (route handler) | - | `app/api/cobranca/boleto/dashboard/route.ts` repassa JSON sem mudanca |

## Standard Stack

Nenhuma dependencia nova. Tudo ja instalado [VERIFIED: apps/backend/package.json].

### Core
| Library | Versao (package.json) | Purpose | Why Standard |
|---------|-----------------------|---------|--------------|
| `@nestjs/schedule` | ^6.1.3 | `@Cron` com `timeZone` | Ja usado pelos 2 jobs; `CronOptions.timeZone?: string` existe no d.ts [VERIFIED: node_modules/@nestjs/schedule/dist/decorators/cron.decorator.d.ts:49] |
| `nodemailer` | ^9.0.6 | SMTP | Transporte ja montado em `EmailEnvioService.buildTransport()` |
| `prisma` / `@prisma/client` | ^5.19.1 | Tabela nova + migration SQL | Convencao do repo: migration SQL manual idempotente |
| `jest` + `ts-jest` | ^30.3.0 / ^29.4.9 | Testes backend | Config em `apps/backend/jest.config.js`, `testRegex: '.*\\.test\\.ts$'`, `rootDir: 'src'` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@Cron` com `timeZone` | `CronExpression` em UTC (11:00 UTC) | Quebraria se o BR voltar ao horario de verao; `timeZone` e explicito e ja usado no repo |
| Reserva via `create` + P2002 | `pg_try_advisory_lock` | Advisory lock so evita corrida entre replicas; a unique constraint ja cobre idempotencia. Deploy e de instancia unica (risco residual aceito nos jobs existentes) |

**Installation:** nenhuma (`npm install` nao necessario).

## Package Legitimacy Audit

Esta fase nao instala pacotes externos. Nada a auditar. **Packages removed (SLOP):** none. **Flagged (SUS):** none.

## Architecture Patterns

### Diagrama de fluxo

```
@Cron 08:00 e 14:00 (America/Sao_Paulo)
   |
   v
CobrancaAvisoVencimentoJob.executar()
   |-- COBRANCA_AVISO_ATIVO !== "true" ? --> log "desligado" + return
   |-- running ? --> warn + return
   v
CobrancaAvisoVencimentoService.processarCiclo({ dryRun })
   |-- hoje = hojeSaoPaulo()                         (YYYY-MM-DD)
   |-- prisma.cobrancaBoleto.findMany                (status pendente, expireAt na faixa, sem baixa Athos, take TETO)
   |-- para cada boleto:
   |     dias = calcularDiasParaVencer(expireAt, hoje)
   |     tipo = tipoAvisoAplicavel(dias)             (janelas disjuntas; null = nada a fazer)
   |     tipo == null ? --> skip
   |     dryRun ? --> log "[dry-run] boleto X tipo Y" ; continue    (nao reserva, nao envia)
   |     destinatarios = cache por idcliente -> EmailEnvioService.resolverDestinatariosAviso(idcliente)
   |         lookup falhou (Athos fora)  --> warn, NAO reserva (tenta no proximo ciclo)
   |         sem e-mail valido           --> reserva status "sem_email" (terminal) + 1 log
   |     reservar: cobrancaAvisoVencimento.create(status "enviando")
   |         P2002 -> le linha: "erro" (tentativas<3) => updateMany(status:"erro"->"enviando") ; senao skip
   |     EmailEnvioService.enviarAvisoVencimento(...)  --> SMTP + CobrancaEmailEnvio.create
   |         ok  --> update status "enviado", enviadoEm, destinatario, cc
   |         err --> update status "erro", erro (<=300 chars), tentativas+1
   v
retorno { candidatos, enviados, semEmail, jaEnviados, erros, dryRun }

Dashboard: GET /cobranca/boleto/dashboard -> buscarBoletosDashboard()
   + situacaoVencimento (util) + ultimoAviso (include avisos take 1)
   -> Next route handler (inalterado) -> BoletosConsolidadosPanel (badges + contadores)
```

### Estrutura recomendada
```
apps/backend/src/modules/cobranca/
├── cobranca-aviso-vencimento.util.ts        # TIPOS, calcularDiasParaVencer, tipoAvisoAplicavel, classificarVencimento (puro)
├── cobranca-aviso-vencimento.util.test.ts
├── cobranca-aviso-vencimento.service.ts     # orquestracao do ciclo
├── cobranca-aviso-vencimento.service.test.ts
├── cobranca-aviso-vencimento.job.ts         # @Cron + kill switch + running
├── cobranca-aviso-vencimento.job.test.ts
├── email-envio.service.ts                   # + resolverDestinatariosAviso + enviarAvisoVencimento (+ corpo html/texto do aviso)
├── email-envio.service.test.ts              # + casos do aviso (arquivo existente)
├── cobranca.service.ts                      # buscarBoletosDashboard: situacaoVencimento + ultimoAviso + hoje em SP
├── cobranca.module.ts                       # + 2 providers
apps/backend/prisma/schema.prisma            # + model CobrancaAvisoVencimento (+ relacao em CobrancaBoleto)
apps/backend/prisma/migrations/2026111xxxxxxx_add_cobranca_aviso_vencimento/migration.sql
apps/frontend/src/app/contas-receber/page.tsx   # badges/contadores no BoletosConsolidadosPanel
deploy/docker-compose.vps.yml, deploy/docker-compose.box.vps.yml, .env.example   # novas env vars
```

### Tabela e migration (D-05)

Convencao: migrations em `apps/backend/prisma/migrations/<AAAAMMDDHHMMSS>_<nome>/migration.sql`, SQL manual, idempotente; ultima existente e `20261109120000_add_athos_orcamento_ia` [VERIFIED: ls prisma/migrations]. Usar timestamp > `20261109120000` (sugestao `20261110120000_add_cobranca_aviso_vencimento`). O container aplica `prisma migrate deploy` no boot [VERIFIED: apps/backend/scripts/bootstrap-runtime.sh: `npm --workspace @orcamento/backend run prisma:deploy`].

Modelo Prisma sugerido (convencao do repo: model PascalCase, `criadoEm`/`atualizadoEm`):

```prisma
/// Registro idempotente de avisos de vencimento/atraso enviados por boleto - Fase 45 (D-05).
model CobrancaAvisoVencimento {
  id               Int            @id @default(autoincrement())
  cobrancaBoletoId Int
  idclienteAthos   Int
  tipo             String         // D-3 | D-1 | A+2 | A+7 | A+14
  status           String         @default("enviando") // enviando | enviado | erro | sem_email
  destinatario     String?
  cc               String[]       @default([])
  erro             String?        // ate 300 caracteres, sem dados de cliente (convencao da Fase 43)
  tentativas       Int            @default(0)
  enviadoEm        DateTime?
  criadoEm         DateTime       @default(now())
  atualizadoEm     DateTime       @updatedAt
  cobrancaBoleto   CobrancaBoleto @relation(fields: [cobrancaBoletoId], references: [id], onDelete: Cascade)

  @@unique([cobrancaBoletoId, tipo])
  @@index([idclienteAthos])
}
```
E em `CobrancaBoleto`: `avisos CobrancaAvisoVencimento[]`.

**FK com `ON DELETE CASCADE` e obrigatoria** (ou omitir FK, como `CobrancaBaixaAthosLog` [VERIFIED: schema.prisma:258-259 "Sem FK"]): `cancelarBoleto` e `removerBoletoBanco` fazem `cobrancaBoleto.delete` apos `deleteMany` dos titulos [VERIFIED: cobranca.service.ts:796-797, 845-846]; uma FK sem cascade quebraria esses fluxos assim que existir aviso. Padrao de FK existente na migration de `CobrancaEmailEnvio` usa `ADD CONSTRAINT` sem guarda (nao idempotente) [VERIFIED: migration 20260827120000:23-24]; para esta fase usar bloco `DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '...') THEN ALTER TABLE ... ADD CONSTRAINT ...; END IF; END $$;`.

```sql
-- Fase 45 (D-05): idempotencia dos avisos de vencimento/atraso. Aditiva e idempotente (regra da Fase 09). Banco do Sistema apenas.
CREATE TABLE IF NOT EXISTS "CobrancaAvisoVencimento" (
  "id" SERIAL NOT NULL,
  "cobrancaBoletoId" INTEGER NOT NULL,
  "idclienteAthos" INTEGER NOT NULL,
  "tipo" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'enviando',
  "destinatario" TEXT,
  "cc" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "erro" TEXT,
  "tentativas" INTEGER NOT NULL DEFAULT 0,
  "enviadoEm" TIMESTAMP(3),
  "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizadoEm" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CobrancaAvisoVencimento_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CobrancaAvisoVencimento_cobrancaBoletoId_tipo_key" ON "CobrancaAvisoVencimento"("cobrancaBoletoId", "tipo");
CREATE INDEX IF NOT EXISTS "CobrancaAvisoVencimento_idclienteAthos_idx" ON "CobrancaAvisoVencimento"("idclienteAthos");
-- + DO $$ guard para a FK (ON DELETE CASCADE ON UPDATE CASCADE) para "CobrancaBoleto"("id")
```
O nome do indice unico gerado pelo Prisma para `@@unique([cobrancaBoletoId, tipo])` e `<Model>_<campos>_key` (mesmo padrao de `CobrancaEmailEnvio_token_key` [VERIFIED: migration 20260827120000:21]) - manter assim para `prisma migrate diff`/`migrate dev` nao detectar drift.

Apos editar o schema: `npm --workspace @orcamento/backend run prisma:generate` (o bootstrap tambem roda).

### Janelas e catch-up (D-02, D-03, D-05, D-06)

Definicao: `dias = (expireAt - hoje)` em dias inteiros, com `expireAt` e `hoje` ambos `YYYY-MM-DD` interpretados como UTC-meia-noite (a mesma conta do dashboard, `Math.round((expireMs - hojeMs)/86400000)` [VERIFIED: cobranca.service.ts:915-921]) - so que com `hoje = hojeSaoPaulo()` e nao UTC.

`hojeSaoPaulo` ja existe e e exportada: `export function hojeSaoPaulo(agora: Date = new Date()): string` usando `Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", ... })` [VERIFIED: apps/backend/src/modules/integrations/athos/athos-conta-receber-baixa.service.ts:142-151; importada em cobranca-baixa-athos.service.ts:17]. **Reutilizar; nao recriar.**

Janelas recomendadas (disjuntas; `dias` positivo = faltam N dias):

| Tipo | Gatilho "ideal" | Janela (dias para vencer) | Nota |
|------|-----------------|---------------------------|------|
| `D-3` | dias = 3 | 3 .. 2 | 1 dia de tolerancia (job parado/SMTP caiu) |
| `D-1` | dias = 1 | 1 .. 1 | sem tolerancia: dias = 0 e o dia do vencimento (sem e-mail por D-02) |
| (vencimento) | dias = 0 | 0 | nenhum e-mail |
| `A+2` | dias = -2 | -2 .. -6 | ate o dia anterior ao `A+7` |
| `A+7` | dias = -7 | -7 .. -13 | ate o dia anterior ao `A+14` |
| `A+14` | dias = -14 | -14 .. -20 | **limite superior obrigatorio** (ver Pitfall 1) |

`tipoAvisoAplicavel(dias): TipoAviso | null` = a unica janela que contem `dias`. Como as janelas sao disjuntas, "so o mais recente aplicavel, nunca varios" e "pular tipos cuja janela ja passou" sao propriedades automaticas. Boleto com `dias < -20` ou `dias > 3` nao recebe e-mail (so o alerta interno, que e o que D-03 pede: "depois disso so o alerta interno continua").

Consulta de candidatos (limita ao que pode ter janela; strings YYYY-MM-DD comparam lexicograficamente):
```ts
where: {
  status: "pendente",
  expireAt: { gte: somarDias(hoje, -20), lte: somarDias(hoje, 3) },
  OR: [{ athosBaixaStatus: null }, { athosBaixaStatus: { notIn: ["baixado", "ja_baixado"] } }],
},
orderBy: { expireAt: "asc" }, take: AVISO_MAX_POR_CICLO,
```
Status validos observados do boleto: `"pendente"`, `"pago"`, `"cancelado"` [VERIFIED: cobranca.service.ts:819 `efiStatus === "paid" ? "pago" : efiStatus === "canceled" ? "cancelado" : cobranca.status`; schema `status String @default("pendente")` l.236]. `athosBaixaStatus`: `null | pendente | baixado | ja_baixado | falha | estornado` [VERIFIED: schema.prisma:247]; as constantes de ja-baixado usadas no codigo sao `"baixado"` e `"ja_baixado"` [VERIFIED: cobranca-baixa-athos.service.ts:294].

Defesa dupla: no loop, reavaliar `status === "pendente"` e a janela (o tipo vem do util, nao da query) antes de reservar.

### E-mail (D-04): novo metodo em `EmailEnvioService`

Fatos do servico atual [VERIFIED: email-envio.service.ts]:
- `buildTransport()` le `SMTP_HOST/PORT/USER/PASS` (l.92-106); `from` = `SMTP_FROM` (l.251); branding via `EMPRESA_NOME`, `EMPRESA_TELEFONES`, `EMPRESA_EMAIL`, `EMPRESA_LOGO_URL`, `EMPRESA_COR_PRIMARIA` (l.221-225); links via `APP_BASE_URL` (l.216).
- Regra de destinatario: `input.destinatario?.trim() || cliente?.emailcobrancacliente || cliente?.emailcliente || ""` validado por `EMAIL_RE` (l.125-129).
- CC: `normalizarListaCc(lista, destinatarioPrincipal)` - **lanca `BadRequestException`** em item invalido ou acima de `EMAIL_CC_MAX` (=10 [VERIFIED: dto/enviar-email-cobranca.dto.ts:13]) e remove duplicados/principal (l.34-56).
- CC padrao: `buscarCcPadrao(idclienteAthos)` -> `{ idclienteAthos, emails }`, valida `idclienteAthos` Int32 (l.284-290, 310-315).
- Log: `prisma.cobrancaEmailEnvio.create({ data: { token, idclienteAthos, destinatario, cc, assunto, status: "enviado", cobrancaBoletoId, nfseEmitidaIds, nfeNumeros } })` (l.266-278).
- Falha SMTP: `sendMail` dentro de try/catch que loga e lanca `InternalServerErrorException("Falha ao enviar o e-mail.")` (l.249-264).
- Cliente: `athosService.buscarDadosClienteContasReceber(id)` retorna `null` **tanto para cliente inexistente quanto para erro de consulta** (catch -> warn -> `return null`) [VERIFIED: athos.service.ts:1157-1160] - e so SELECT.

Metodos novos (sem mexer em `enviarBoletoENotas`, para nao tocar nos testes existentes):

1. `resolverDestinatariosAviso(idclienteAthos): Promise<{ lookup: "ok" | "falha"; nomeCliente: string; destinatario: string | null; motivoSemEmail?: "vazio" | "invalido"; cc: string[] }>`
   - `cliente === null` -> `lookup: "falha"` (nao reservar linha; ver Pitfall 3).
   - principal = primeiro valido entre `[emailcobrancacliente, emailcliente]` testados com `EMAIL_RE` (mais robusto que o `||` da regra original: se o campo de cobranca estiver preenchido com lixo, cai para `emailcliente`). Mantem a semantica D-04 no caso normal.
   - CC = `normalizarListaCc((await buscarCcPadrao(id)).emails, principal)` dentro de try/catch -> em erro, `cc = []` + warn (lista ja foi normalizada ao salvar, entao e so defesa).
   - Cache por ciclo (Map por `idclienteAthos`) fica no service orquestrador (N boletos do mesmo cliente = 1 consulta ao Athos de producao).
2. `enviarAvisoVencimento(input: { cobrancaBoletoId, idclienteAthos, nomeCliente, destinatario, cc, tipo, diasParaVencer, valor, expireAt, linkBoleto }): Promise<{ id: number; token: string }>`
   - assunto por tipo (sem emoji): `D-3` "Lembrete: seu boleto vence em 3 dias"; `D-1` "Lembrete: seu boleto vence amanha"; `A+N` "Aviso: boleto vencido ha N dias". Prefixar com `Financeiro ${empresaNome} - ` (padrao do assunto atual l.226). Usar o `dias` **real** no texto (com tolerancia da janela, `D-3` pode sair com "2 dias").
   - corpo HTML/texto: **novos** `montarCorpoAvisoHtml/Texto` seguindo a mesma casca em tabelas (white-label, `escapeHtml` em todo dado externo [VERIFIED: l.499-507]); campos: nome, valor (Intl pt-BR BRL), vencimento DD/MM/AAAA, link do boleto, rodape `EMPRESA_*`. Para atraso, texto cordial e hedge ("se ja efetuou o pagamento, desconsidere; para segunda via fale conosco") - nao prometer que o boleto ainda e pagavel.
   - **PDF**: recomendacao = **link no corpo + anexar o PDF do boleto como best-effort** via `cobrancaService.downloadBoletoPdf(id)` (so o boleto; nunca NF-e/NFS-e, que sao pesadas e nao pertencem a um lembrete). Se o download falhar (axios timeout 30s [VERIFIED: cobranca.service.ts:745]) ou `linkBoleto` for nulo, envia so com link/sem anexo e registra warn - **falha de anexo nunca bloqueia o aviso**. O link e a URL EFI salva em `linkBoleto` (ex.: `download.sejaefi.com.br`); se ela expira nao foi verificado (A2), o que reforca anexar o PDF.
   - sem botao "Confirmar recebimento" (nao faz sentido em lembrete); manter o pixel 1x1 (abertura) usando `/cobranca/pixel/${token}` - o proxy frontend ja existe [VERIFIED: comentario l.211-215].
   - registra `cobrancaEmailEnvio.create({ token, idclienteAthos, destinatario, cc, assunto, status: "enviado", cobrancaBoletoId, nfseEmitidaIds: [], nfeNumeros: [] })` (D-04).
   - **Consequencia a saber**: `buscarTitulosComBoletoAtivo` usa o envio mais recente (`emailEnvios orderBy enviadoEm desc take 1`) como "ultimoEmail" na tela do cliente [VERIFIED: cobranca.service.ts:699-706]. Aviso passa a ser o "ultimo e-mail" ali (status enviado/aberto). Aceitavel e ate util; o assunto diferencia. Nao alterar essa query nesta fase.

Teste existente mostra o padrao de mock: `jest.mock("nodemailer")`, `Object.create(EmailEnvioService.prototype)` e atribuicao de `config/prisma/cobrancaService/athosService/danfePdfService` [VERIFIED: email-envio.service.test.ts:1-77].

### Job (D-07)

Copiar o esqueleto de `cobranca-baixa-athos-retry.job.ts` (guarda `running`, teto, logs, `try/finally`) [VERIFIED: leitura integral]. Diferencas:
- Kill switch **invertido**: os jobs existentes desligam so com `"false"` (`config.get("EFI_RECONCILIACAO_ATIVA") === "false"`); o aviso **liga so com `"true"`** (`config.get<string>("COBRANCA_AVISO_ATIVO") === "true"`), padrao desligado (D-07).
- Dry-run: `COBRANCA_AVISO_DRY_RUN === "true"` -> processa candidatos, loga `boleto/tipo/destinatario mascarado` e **nao reserva nem envia**. Com `COBRANCA_AVISO_ATIVO` desligado e `DRY_RUN=true`, o job deve rodar em modo log (decisao: dry-run so tem efeito quando ATIVO=true, para um unico interruptor mestre; documentar). 
- Cron com fuso: `@Cron("0 8,14 * * *", { name: "cobranca-aviso-vencimento", timeZone: "America/Sao_Paulo" })`. `timeZone` ja e usado no repo em outro servico (`chatwoot-automation.service.ts`, via Intl; o decorator com `timeZone` esta tipado em `CronOptions` [VERIFIED: cron.decorator.d.ts:49]). **Duas execucoes (08:00 e 14:00) sao recomendadas**: D-05 pede nova tentativa "no ciclo seguinte (mesma janela)" e a janela de `D-1` e de **um dia so**; com 1 execucao/dia, um erro SMTP em `D-1` nunca seria reenviado. A segunda execucao tambem cobre o processo fora do ar as 08:00 (`@nestjs/schedule` nao recupera execucoes perdidas [ASSUMED]). E idempotente, entao o custo e nulo. (D-07 diz "diario, ex.: 08:00": 2 disparos diarios continuam "diario"; sinalizar ao usuario - A3.)
- Teto `AVISO_MAX_POR_CICLO = 100` e atraso curto entre envios (ex.: 250 ms) para nao estourar limite do SMTP do provedor [ASSUMED: os testes usam `smtp.gmail.com`, cujo limite diario nao foi verificado].
- Retorno tipado `{ candidatos, enviados, semEmail, jaEnviados, erros }` (como os jobs existentes, que retornam contagens e sao testados por isso).
- Registrar em `cobranca.module.ts`: `providers: [..., CobrancaAvisoVencimentoService, CobrancaAvisoVencimentoJob]` [VERIFIED: cobranca.module.ts:16]. Sem novos imports de modulo (Athos, Efi, Nfse ja importados; `PrismaService` e `ConfigService` ja sao injetados pelos jobs atuais).

### Idempotencia sob falha (D-05)

Reserva atomica = `create` com a unique `(cobrancaBoletoId, tipo)`. Padrao P2002 ja existe no repo (`athos-orcamento-idempotencia.service.ts:67`: `(err as { code?: string } | null)?.code === "P2002"`) [VERIFIED].

```ts
// Source: padrao do repo (athos-orcamento-idempotencia.service.ts) adaptado
async function reservar(prisma, boletoId, idcliente, tipo): Promise<{ id: number } | null> {
  try {
    const row = await prisma.cobrancaAvisoVencimento.create({
      data: { cobrancaBoletoId: boletoId, idclienteAthos: idcliente, tipo, status: "enviando", tentativas: 1 },
    });
    return { id: row.id };
  } catch (err) {
    if ((err as { code?: string } | null)?.code !== "P2002") throw err;
    const atual = await prisma.cobrancaAvisoVencimento.findUnique({
      where: { cobrancaBoletoId_tipo: { cobrancaBoletoId: boletoId, tipo } },
    });
    if (!atual || atual.status !== "erro" || atual.tentativas >= AVISO_MAX_TENTATIVAS) return null;
    // retomar so se ninguem mais retomou (CAS)
    const r = await prisma.cobrancaAvisoVencimento.updateMany({
      where: { id: atual.id, status: "erro" },
      data: { status: "enviando", tentativas: { increment: 1 }, erro: null },
    });
    return r.count === 1 ? { id: atual.id } : null;
  }
}
```
(O nome do input composto `cobrancaBoletoId_tipo` e o gerado pelo Prisma para `@@unique([cobrancaBoletoId, tipo])` [CITED: prisma docs - compound unique where input]; confirmar com `prisma generate` no executor.)

Estados e regras:
- `enviando` -> `enviado` (com `enviadoEm`, `destinatario`, `cc`) ou `erro` (com `erro` truncado a 300 chars, sem e-mail/dados de cliente, so `err.name`/mensagem curta).
- `sem_email`: **terminal** (nao repete a cada ciclo - D-04). So grava quando o cadastro foi lido com sucesso e nao tem e-mail valido.
- `enviando` "preso" (processo caiu entre reservar e marcar): **nao retomar automaticamente** (prioriza no-duplicate sobre no-loss; o crash pode ter ocorrido apos o `sendMail`). Logar warn com id. Opcional: contar `enviando` com `atualizadoEm` antigo no resumo do ciclo para ficar visivel.
- `tentativas` max 3 por tipo (evita martelar SMTP quebrado).

### Dashboard (backend) (D-08)

`buscarBoletosDashboard()` [VERIFIED: cobranca.service.ts:871-947] tem tipo de retorno explicito, `findMany` com `include: { titulos: ... }` e calcula `hojeISO = new Date().toISOString().slice(0, 10)` (UTC). Mudancas:
1. `hoje` -> `hojeSaoPaulo()` (D-06 exige SP; hoje, entre 21:00-23:59 BRT, `diasParaVencer` fica 1 dia menor que o do job).
2. `include: { titulos: {...}, avisos: { orderBy: { criadoEm: "desc" }, take: 1, select: { tipo: true, status: true, enviadoEm: true } } }` - **include aninhado em vez de segunda query**: os testes existentes mockam so `prisma.cobrancaBoleto.findMany` e `prisma.nfseEmitidaTitulo.findMany` [VERIFIED: cobranca.service.dashboard.test.ts:9-12]; uma chamada nova a `prisma.cobrancaAvisoVencimento.findMany` quebraria todos (TypeError). Ler como `b.avisos?.[0] ?? null` (o mock nao devolve `avisos`).
3. Novos campos no item: `situacaoVencimento: "atrasado" | "vence_hoje" | "a_vencer" | null` (somente `status === "pendente"`; `a_vencer` = `1 <= dias <= 3`; `atrasado` = `dias < 0`; resto `null`) e `ultimoAviso: { tipo: string; status: string; enviadoEm: Date | null } | null`. `classificarVencimento(dias, status)` vive no util (mesma fonte dos limites usados pelo job).
4. Manter o retorno como **array** (frontend e testes esperam array).
5. Atencao: o dashboard hoje lista `status: { not: "cancelado" }` (inclui `pago`); badges so para `pendente`.

Atencao ao teste existente `calcula diasParaVencer negativo...` [VERIFIED: l.79-95]: usa datas fixas relativas ao "agora" real; trocar para `hojeSaoPaulo()` nao o quebra (so `toBeLessThan(0)`), mas o executor deve rodar a suite.

### Frontend (D-08)

Onde encaixa [VERIFIED: leitura de apps/frontend/src/app/contas-receber/page.tsx]:
- O "painel de boletos do dashboard" e o componente `BoletosConsolidadosPanel` (l.199), renderizado uma unica vez em `<BoletosConsolidadosPanel />` (l.610) dentro de `contas-receber/page.tsx`. Nao ha outro consumidor de `/api/cobranca/boleto/dashboard` (grep) nem `diasParaVencer` fora desse arquivo. Logo "dashboard" e "Contas a Receber" sao o mesmo ponto de insercao.
- Interface `BoletoDashboardItem` (l.30-45) ja tem `expireAt` e `diasParaVencer`; **adicionar** `situacaoVencimento` e `ultimoAviso` (datas chegam como string ISO).
- Helper existente `getVencimentoSuffix(dias)` ("vence hoje" / "Nd" / "Nd em atraso", l.138-143) e a celula "Vencimento" (l.362-365). Substituir o suffix por um pill: `a_vencer` -> `pa-pill pa-pill-warning` "Vence em Nd"; `vence_hoje` -> warning "Vence hoje"; `atrasado` -> `pa-pill pa-pill-danger` "Atrasado ha Nd". `pa-pill-danger` **existe** (`.pa-pill-danger { background: rgba(229, 72, 77, 0.14); color: var(--pa-danger); }` [VERIFIED: contas-receber/admin-shell.tsx:364]) e `pa-pill-secondary` tambem; **mas `paPillVariant()` (l.193-197) so devolve success/warning/secondary** - nao o reutilizar para o danger; montar a classe direto.
- Contadores: no `pa-card-header` (l.289-292, hoje `({boletos.length})`) acrescentar dois pills calculados do array filtrado por `status === "pendente"`: "A vencer: X" (`situacaoVencimento` em `a_vencer`/`vence_hoje`) e "Atrasados: Y". Sem nova chamada de API.
- "Ultimo aviso": nova coluna ou segunda linha pequena (`<small className="text-muted">`) na celula Vencimento: "Aviso D-1 enviado em 12/11" / "Aviso A+7 com erro" / "Sem e-mail cadastrado" (`status === "sem_email"` e o "alerta interno de sem e-mail" de D-04). Mapa tipo->rotulo no frontend: `D-3`->"3 dias antes", `D-1`->"1 dia antes", `A+2`/`A+7`/`A+14`->"2/7/14 dias apos".
- Route handler `app/api/cobranca/boleto/dashboard/route.ts` repassa o JSON sem transformar [VERIFIED: leitura integral] - **nenhuma mudanca necessaria**.
- Design: usar tokens `--pa-*` ja existentes; invocar a skill `bom-custo-design` e (se o orchestrator pedir) `/gsd-ui-phase` antes do plano de UI.
- **Frontend nao tem framework de teste** (`package.json` so tem `dev/build/start` [VERIFIED: apps/frontend/package.json]). Validacao do frontend = `tsc --noEmit` + `next build`; por isso a classificacao fica no backend (testavel em jest).

### Configuracao / env (AVISO-08)

- Os compose de deploy **listam env vars explicitamente**; variavel nao listada nao chega ao container [VERIFIED: deploy/docker-compose.vps.yml:58-76 e docker-compose.box.vps.yml ~l.58-68, ex. `ATHOS_BAIXA_AUTO: ${ATHOS_BAIXA_AUTO:-true}`]. Adicionar nos **dois** arquivos: `COBRANCA_AVISO_ATIVO: ${COBRANCA_AVISO_ATIVO:-false}` e `COBRANCA_AVISO_DRY_RUN: ${COBRANCA_AVISO_DRY_RUN:-false}` (padrao desligado = mesmo espirito de D-07). Observacao: `EFI_RECONCILIACAO_ATIVA` nao aparece em `docker-compose.vps.yml` (grep vazio), entao o kill switch dos jobs atuais nao e controlavel em prod por compose - nao replicar esse erro.
- Documentar em `.env.example` (bloco proprio, como o da reconciliacao, l.79-82 e da baixa Athos). Nota: `SMTP_*` e `SMTP_FROM` **nao constam** do `.env.example` (grep vazio) mas constam nos compose (`SMTP_HOST ... SMTP_FROM`) - nao e escopo desta fase, mas vale um comentario.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| "Hoje" em Sao Paulo | `new Date().toISOString()` ou offset fixo -3h | `hojeSaoPaulo()` (athos-conta-receber-baixa.service.ts:142) | UTC erra apos 21:00 BRT; ja testada/usada na baixa |
| Cron com fuso | Conversao manual de hora para UTC | `@Cron(expr, { timeZone: "America/Sao_Paulo" })` | Tipado em `CronOptions` |
| Validar e-mail / injecao de cabecalho | Novo regex | `EMAIL_RE` + `normalizarListaCc` (email-envio.service.ts) | Ja bloqueia espacos, `<>,;"` e controle (CRLF) |
| Transporte SMTP | Novo `createTransport` fora do servico | `EmailEnvioService.buildTransport()` | D-04: nao duplicar logica SMTP |
| Idempotencia | Flag em memoria / "verifica antes e envia" | `@@unique` + `create` + P2002 | Check-then-act corre risco de duplicata; so a constraint e atomica |
| Download do boleto | Novo axios para a URL EFI | `CobrancaService.downloadBoletoPdf(id)` | Ja resolve `nomeArquivo` e erros |
| Escape HTML | Interpolar nome/valor direto | `escapeHtml` | Nome de cliente vem do Athos (dado externo) |

**Key insight:** a constraint unica do banco e o unico mecanismo de idempotencia confiavel; toda a logica de "ja enviei?" deve derivar dela, nao de leitura previa.

## Runtime State Inventory

Nao e fase de rename/refactor/migracao de dados - **omitida** (greenfield aditivo). Unico estado novo: tabela `CobrancaAvisoVencimento` (banco do Sistema). Nenhum estado do Athos e alterado.

## Common Pitfalls

### Pitfall 1: Rajada de e-mails ao ligar o kill switch pela primeira vez
**What goes wrong:** na ativacao, todos os boletos pendentes antigos (ex.: vencidos ha 90 dias) receberiam o "A+14" (se a janela fosse aberta `dias <= -14`) - e-mail real a clientes.
**Why:** catch-up sem limite inferior de janela.
**How to avoid:** janelas finitas (tabela acima; `A+14` so ate 20 dias de atraso); `COBRANCA_AVISO_DRY_RUN=true` na primeira subida para listar quem receberia; teto `AVISO_MAX_POR_CICLO`. Documentar no runbook: ligar primeiro em dry-run, conferir log, so entao `ATIVO=true`.
**Warning signs:** log do dry-run listando dezenas de boletos.

### Pitfall 2: Prisma `notIn` e colunas nulas
**What goes wrong:** `athosBaixaStatus: { notIn: ["baixado","ja_baixado"] }` pode excluir linhas com `athosBaixaStatus = null` (quase todos os pendentes) -> job nunca acha candidato [ASSUMED: comportamento SQL `NOT IN` com NULL; confirmar em teste de integracao ou ler o SQL gerado].
**How to avoid:** `OR: [{ athosBaixaStatus: null }, { athosBaixaStatus: { notIn: [...] } }]` e teste de unidade que afirma a forma do `where` (padrao J2 do job de retentativa, que ja testa a forma do filtro [VERIFIED: cobranca-baixa-athos-retry.job.test.ts:33-49]).

### Pitfall 3: Falha transitoria do Athos virando "sem e-mail" definitivo
**What goes wrong:** `buscarDadosClienteContasReceber` devolve `null` em erro de conexao; tratar `null` como "sem e-mail" grava `sem_email` terminal e o cliente nunca recebe aquele aviso.
**How to avoid:** `null` -> `lookup: "falha"`: warn, **nao reservar**, tentar no proximo disparo. `sem_email` so quando o cliente foi lido e nenhum dos 2 campos tem e-mail valido. (Limitacao: `null` tambem cobre "cliente inexistente"; nesse caso repete warn ate a janela fechar - aceitavel, limitar o log a 1 por cliente/ciclo.)

### Pitfall 4: `diasParaVencer` do dashboard em UTC
Ver "Dashboard (backend)". Divergencia painel x job entre 21:00 e 23:59 BRT. Corrigir com `hojeSaoPaulo()` e teste com `jest.useFakeTimers().setSystemTime(...)` as 23:30 BRT (02:30Z do dia seguinte).

### Pitfall 5: Quebrar testes existentes do dashboard
Segunda query Prisma no dashboard quebra os mocks atuais (ver acima). Usar include aninhado e `?.`.

### Pitfall 6: FK sem cascade bloqueia cancelar/remover boleto
Ver "Tabela e migration". Teste de schema: `onDelete: Cascade`.

### Pitfall 7: Falha do anexo derrubando o aviso
`downloadBoletoPdf` faz HTTP externo (30 s). Envolver em try/catch -> enviar sem anexo (corpo ja traz o link).

### Pitfall 8: Boleto pago por fora do sistema continua `pendente`
D-06 so exclui por status do boleto/baixa no sistema. Um boleto pago em dinheiro/transferencia e baixado manualmente no Athos mas nao no EFI continua `pendente` e receberia lembrete. Mitigacao fora do escopo travado: checar leitura no Athos se os titulos ainda estao em aberto (ver Open Question 3). Ao menos, copiar o texto "se ja efetuou o pagamento, desconsidere".

### Pitfall 9: Aviso logo apos o envio original do boleto
Boleto emitido com vencimento em 2-3 dias dispara `D-3` quase junto com o e-mail original. Aceitavel (janela de `D-3` inclui dias=2..3), mas o texto deve usar o `dias` real.

## Code Examples

### Util puro (fonte unica de janelas)
```ts
// cobranca-aviso-vencimento.util.ts
export const TIPOS_AVISO = ["D-3", "D-1", "A+2", "A+7", "A+14"] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number];

/** Janela em "dias para vencer" (positivo = faltam N dias). Disjuntas por construcao. */
export const JANELAS_AVISO: Record<TipoAviso, { min: number; max: number }> = {
  "D-3": { min: 2, max: 3 },
  "D-1": { min: 1, max: 1 },
  "A+2": { min: -6, max: -2 },
  "A+7": { min: -13, max: -7 },
  "A+14": { min: -20, max: -14 },
};

export function calcularDiasParaVencer(expireAt: string | null, hoje: string): number | null {
  if (!expireAt || !/^\d{4}-\d{2}-\d{2}$/.test(expireAt)) return null;
  const e = Date.parse(`${expireAt}T00:00:00Z`);
  const h = Date.parse(`${hoje}T00:00:00Z`);
  if (Number.isNaN(e) || Number.isNaN(h)) return null;
  return Math.round((e - h) / 86_400_000);
}

export function tipoAvisoAplicavel(dias: number | null): TipoAviso | null {
  if (dias === null) return null;
  return TIPOS_AVISO.find((t) => dias >= JANELAS_AVISO[t].min && dias <= JANELAS_AVISO[t].max) ?? null;
}
```

### Job (esqueleto)
```ts
// Padrao: cobranca-baixa-athos-retry.job.ts
@Injectable()
export class CobrancaAvisoVencimentoJob {
  private readonly logger = new Logger(CobrancaAvisoVencimentoJob.name);
  private running = false;
  constructor(private readonly avisos: CobrancaAvisoVencimentoService, private readonly config: ConfigService) {}

  @Cron("0 8,14 * * *", { name: "cobranca-aviso-vencimento", timeZone: "America/Sao_Paulo" })
  async executar() {
    if (this.config.get<string>("COBRANCA_AVISO_ATIVO") !== "true") {
      this.logger.log("Aviso de vencimento desligado (COBRANCA_AVISO_ATIVO != true) - ciclo ignorado.");
      return null;
    }
    if (this.running) { this.logger.warn("Aviso de vencimento: ciclo anterior em andamento - pulando."); return null; }
    this.running = true;
    try {
      return await this.avisos.processarCiclo({ dryRun: this.config.get<string>("COBRANCA_AVISO_DRY_RUN") === "true" });
    } finally { this.running = false; }
  }
}
```

## State of the Art

| Old | Current | Impacto |
|-----|---------|---------|
| Jobs ligados por padrao, desligados com `"false"` | Aviso desligado por padrao, ligado com `"true"` | Envia e-mail real a clientes (D-07) |
| `diasParaVencer` com "hoje" UTC | "hoje" em America/Sao_Paulo (`hojeSaoPaulo`) | Alinha painel e job (D-06) |

**Deprecated/outdated:** nada novo.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Janelas finitas (D-3: 3..2, D-1: 1, A+2: -2..-6, A+7: -7..-13, A+14: -14..-20) sao a interpretacao desejada de "pular tipos cuja janela ja passou" | Janelas e catch-up | Usuario pode querer outra tolerancia (ex.: so o dia exato, ou A+14 sem teto) - confirmar antes de travar |
| A2 | A URL `linkBoleto` (EFI) pode expirar/ficar invalida; por isso anexar o PDF | E-mail | Se nunca expira, o anexo e opcional e so aumenta o tamanho do e-mail |
| A3 | 2 disparos/dia (08:00 e 14:00) sao aceitaveis como "diario" | Job | Usuario pode preferir exatamente 1 disparo; entao erro SMTP em `D-1` nao tem retentativa |
| A4 | `@nestjs/schedule` nao recupera execucao perdida de cron (processo fora do ar) | Job | Se recuperasse, o 2o disparo seria redundante (inofensivo) |
| A5 | `NOT IN` com NULL exclui linhas no Prisma/PostgreSQL | Pitfall 2 | Se nao excluisse, o `OR` seria so redundante (inofensivo) |
| A6 | Limite diario do SMTP (Gmail) justifica teto/atraso entre envios | Job | Se SMTP for transacional sem limite, teto pode ser maior |
| A7 | `emailcobrancacliente` no Athos tem 1 endereco por campo (nao varios separados por `;`/`,`) | Destinatarios | Se tiver varios, `EMAIL_RE` os rejeita e o cliente cai em `sem_email`; exigiria split. Verificavel com SELECT somente-leitura em producao (nao feito) |
| A8 | Nome do input composto Prisma e `cobrancaBoletoId_tipo` | Idempotencia | Erro de compilacao trivial, corrigido no `prisma generate` |

## Open Questions

1. **Requirement IDs**
   - Sabemos: ROADMAP diz `Requirements: TBD`.
   - Falta: IDs oficiais. Recomendacao: planner criar `AVISO-01..08` em REQUIREMENTS.md (ver mapa acima).
2. **Janelas/tolerancia e numero de disparos (A1, A3)** - confirmar com o usuario em texto numerado (sem AskUserQuestion, conforme CLAUDE.md): (a) tolerancia de 1 dia no `D-3` e 6 dias no `A+2/A+7/A+14`? (b) 08:00 + 14:00 ou apenas 08:00?
3. **Checar Athos antes de avisar (Pitfall 8)**: ler no Athos se os titulos do boleto ainda estao em aberto (somente SELECT; `buscarTitulosClienteContasReceber` ja existe em `AthosService`) evitaria lembrete a quem pagou fora do EFI. Fora do escopo travado por D-06; propor como melhoria ou aceitar o risco com texto "se ja pagou, desconsidere".
4. **Aviso aparece como "ultimo e-mail" na tela do cliente** (consequencia de registrar em `CobrancaEmailEnvio`, D-04) - aceitar ou marcar com campo distinto (nao recomendado agora).
5. **Ativacao em producao** e decisao do usuario (D-07): roteiro sugerido = deploy com `ATIVO=false` -> `ATIVO=true` + `DRY_RUN=true` -> conferir log -> `DRY_RUN=false`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node + npm | build/testes | OK | (suite jest rodou) | - |
| jest (backend) | validacao | OK | 30.x | - |
| PostgreSQL do Sistema (`prisma migrate`) | migration real | nao testado nesta sessao | - | Validar SQL em Postgres local/`athos-teste` NAO se aplica (banco do Sistema e outro); usar o Postgres do `docker-compose.yml` (porta 5435) |
| SMTP real | envio | nao necessario nos testes (mock nodemailer) | - | `COBRANCA_AVISO_DRY_RUN=true` |
| Athos (SELECT) | destinatarios | so em producao | PG 9.0.5 | testes mockam `athosService` |

Baseline: `npx jest src/modules/cobranca` em apps/backend -> **11 suites, 140 testes passando** (executado nesta sessao, ~19 s) [VERIFIED].

## Validation Architecture

`.planning/config.json` nao define `workflow.nyquist_validation` -> tratado como habilitado.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jest ^30.3.0 + ts-jest (backend); frontend sem framework de teste |
| Config file | `apps/backend/jest.config.js` (`rootDir: 'src'`, `testRegex: '.*\\.test\\.ts$'`) |
| Quick run command | `cd apps/backend && npx jest src/modules/cobranca/cobranca-aviso-vencimento` |
| Full suite command | `cd apps/backend && npx jest src/modules/cobranca` (modulo) / `npm --workspace @orcamento/backend test` (tudo) |
| Frontend | `cd apps/frontend && npx tsc --noEmit` e `npm --workspace @orcamento/frontend run build` |
| Prisma | `npm --workspace @orcamento/backend run prisma:generate` (valida o schema) |

Estilo de teste do repo: instancia via `Object.create(Classe.prototype)` + atribuicao de `logger/prisma/config/...` como objetos `jest.fn()` (sem TestingModule, sem banco, sem Athos) [VERIFIED: cobranca-baixa-athos-retry.job.test.ts:1-20; cobranca-reconciliation.job.unit.test.ts:1-14; email-envio.service.test.ts:26-77]. Seguir exatamente.

### Phase Requirements -> Test Map
| Req (sugerido) | Behavior | Test Type | Automated Command | File Exists? |
|----------------|----------|-----------|-------------------|-------------|
| AVISO-02 | `tipoAvisoAplicavel` por dia (3,2,1,0,-1,-2,-6,-7,-13,-14,-20,-21,null); janelas disjuntas | unit | `npx jest src/modules/cobranca/cobranca-aviso-vencimento.util` | Wave 0 |
| AVISO-02 | `calcularDiasParaVencer` (data invalida/null, virada de mes/ano) | unit | idem | Wave 0 |
| AVISO-02/D-06 | Fuso: as 23:30 BRT (`jest.useFakeTimers().setSystemTime(new Date("2026-11-11T02:30:00Z"))`) "hoje" ainda e 2026-11-10 | unit | `npx jest ...aviso-vencimento.service` | Wave 0 |
| AVISO-01 | Idempotencia: 2a execucao no mesmo dia nao chama `sendMail` de novo (create lanca P2002, linha `enviado` -> skip) | unit | `npx jest ...aviso-vencimento.service` | Wave 0 |
| AVISO-01 | Erro SMTP -> linha `erro`; proximo ciclo retoma (CAS `updateMany` count 1) e envia uma vez; `tentativas >= 3` nao retoma | unit | idem | Wave 0 |
| AVISO-01 | Retomada concorrente: `updateMany` count 0 -> nao envia | unit | idem | Wave 0 |
| AVISO-02 | Catch-up: boleto com `dias=-9` -> so `A+7` (1 envio); `dias=-30` -> nenhum | unit | idem | Wave 0 |
| AVISO-02/D-06 | Forma do `where` (status pendente; `OR` com `athosBaixaStatus: null` e `notIn [baixado, ja_baixado]`; faixa `expireAt`; `take` = teto) | unit | idem | Wave 0 |
| AVISO-07 | Cliente lido sem e-mail valido -> grava `sem_email` uma vez, sem `sendMail`; 2o ciclo nao regrava | unit | idem | Wave 0 |
| AVISO-07 | `buscarDadosClienteContasReceber` -> `null` -> NAO reserva linha, warn | unit | idem | Wave 0 |
| AVISO-03 | `enviarAvisoVencimento`: `to`, `cc` normalizado, `from=SMTP_FROM`, assunto por tipo, sem emoji, nome escapado, anexo do boleto best-effort (download falha -> envia sem anexo), cria `cobrancaEmailEnvio` | unit | `npx jest src/modules/cobranca/email-envio.service` | Arquivo existe (adicionar casos) |
| AVISO-03 | `resolverDestinatariosAviso`: `emailcobrancacliente` invalido cai para `emailcliente`; CC padrao aplicado e dedup do principal | unit | idem | arquivo existe |
| AVISO-04 | Job: `COBRANCA_AVISO_ATIVO` ausente/`""`/`"false"`/`"1"`/`"TRUE"` -> nao chama service; so `"true"` chama (inverso de J3) | unit | `npx jest ...aviso-vencimento.job` | Wave 0 |
| AVISO-04 | Job: `running` impede sobreposicao; `finally` libera; `DRY_RUN=true` repassa `dryRun` e nao envia nem reserva | unit | idem | Wave 0 |
| AVISO-04 | Decorator `@Cron` com `timeZone: "America/Sao_Paulo"` (`Reflect.getMetadata` do schedule ou inspecao simples) | unit | idem | Wave 0 |
| AVISO-05 | Dashboard: `situacaoVencimento` (atrasado/vence_hoje/a_vencer/null; pago -> null), `ultimoAviso` via include (e `null` quando mock nao traz `avisos`), "hoje" em SP | unit | `npx jest src/modules/cobranca/cobranca.service.dashboard` | arquivo existe (adicionar casos; os 4+ testes atuais devem seguir verdes) |
| AVISO-01 | Schema/migration: `prisma generate` ok; SQL tem `IF NOT EXISTS` e FK `ON DELETE CASCADE` (teste de texto sobre o .sql) | unit/smoke | `npx jest ...aviso-vencimento.migration` ou `npm --workspace @orcamento/backend run prisma:generate` | Wave 0 |
| AVISO-06 | Badges/contadores renderizam e compilam | typecheck/build + UAT manual | `cd apps/frontend && npx tsc --noEmit` | manual (sem framework de teste) |
| AVISO-08 | Env vars nos 2 compose e `.env.example` (grep) | smoke | `grep -n COBRANCA_AVISO deploy/*.yml .env.example` | Wave 0 |

Manual-only (justificado): inspecao visual dos badges (sem harness de UI) e a ativacao real em producao (envia e-mail a clientes; decisao do usuario). Nunca testar escrita no Athos - esta fase nao escreve nele.

### Sampling Rate
- **Por commit de task:** `cd apps/backend && npx jest src/modules/cobranca/<arquivo tocado>` (<30 s)
- **Por merge de wave:** `cd apps/backend && npx jest src/modules/cobranca` (baseline 140 testes verdes + novos)
- **Phase gate:** `npm --workspace @orcamento/backend test` + `npx tsc --noEmit` (backend e frontend) + `next build` verdes antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `cobranca-aviso-vencimento.util.test.ts` - AVISO-02
- [ ] `cobranca-aviso-vencimento.service.test.ts` - AVISO-01/02/07
- [ ] `cobranca-aviso-vencimento.job.test.ts` - AVISO-04
- [ ] casos novos em `email-envio.service.test.ts` e `cobranca.service.dashboard.test.ts`
- [ ] Framework: nenhum a instalar (jest ja presente)

## Security Domain

`security_enforcement` nao definido em config -> habilitado.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Job interno, sem entrada de usuario |
| V3 Session Management | no | - |
| V4 Access Control | parcial | Dashboard continua atras do guard global (`boletosDashboard` "AUTHED via guard global" [VERIFIED: cobranca.controller.ts:197]); nao criar endpoint publico para disparar aviso. Se houver endpoint manual de disparo/dry-run, `@AdminOnly()` (padrao da Fase 43) |
| V5 Input Validation | yes | `EMAIL_RE`/`normalizarListaCc` para destinatarios e CC; `escapeHtml` para nome do cliente/empresa no HTML; `tipo` restrito ao uniao `TipoAviso` |
| V6 Cryptography | no | Token do pixel ja usa `randomBytes(24)`; reutilizar |
| V7 Logging / V8 Data Protection | yes | Nao logar e-mails completos em massa nem corpo; erro gravado em `erro` truncado a 300 chars sem dados de cliente (convencao da Fase 43) |

### Known Threat Patterns
| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Injecao de cabecalho SMTP via e-mail do Athos/CC | Tampering | `EMAIL_RE` rejeita CR/LF, `<>,;"`; `normalizarListaCc` |
| HTML injection no corpo (nome de cliente) | Tampering | `escapeHtml` em todo dado externo |
| Envio em massa acidental / spam aos clientes | Denial/Repudiation | Kill switch padrao desligado, dry-run, janelas finitas, teto por ciclo, unique constraint |
| Duplicidade por corrida (2 replicas / 2 disparos) | Tampering | `@@unique` + P2002; `running` em memoria cobre so 1 instancia (risco residual aceito nos jobs atuais; deploy e instancia unica) |
| Vazamento de dados de cliente em log | Info disclosure | logar so ids (`boletoId`, `tipo`), nao e-mail completo |
| Escrita acidental no Athos de producao | Tampering | Fase so le (`buscarDadosClienteContasReceber`); nenhum teste/script de escrita no Athos |

## Sources

### Primary (HIGH confidence) - leitura direta do codigo nesta sessao
- `apps/backend/src/modules/cobranca/email-envio.service.ts` (integral), `cobranca-reconciliation.job.ts`, `cobranca-baixa-athos-retry.job.ts`, `cobranca.module.ts`, `cobranca.service.ts` (l.660-730, 734-752, 794-847, 871-947), `cobranca.controller.ts` (l.195-225)
- `apps/backend/prisma/schema.prisma` (l.231-314), migrations `20260827120000`, `20261105130000`, `20261106120000`, `20261109120000`
- `apps/backend/src/modules/integrations/athos/athos-conta-receber-baixa.service.ts` (l.140-151), `athos.service.ts` (l.1123-1163), `athos-orcamento-idempotencia.service.ts` (l.14, 67)
- Testes: `cobranca-baixa-athos-retry.job.test.ts`, `cobranca-reconciliation.job.unit.test.ts`, `email-envio.service.test.ts`, `cobranca.service.dashboard.test.ts`; `jest.config.js`; `package.json` (backend e frontend)
- `apps/frontend/src/app/contas-receber/page.tsx` (l.25-50, 121-200, 285-420), `admin-shell.tsx` (l.363-364), `app/api/cobranca/boleto/dashboard/route.ts`
- `deploy/docker-compose.vps.yml`, `deploy/docker-compose.box.vps.yml`, `.env.example`, `apps/backend/scripts/bootstrap-runtime.sh`
- `node_modules/@nestjs/schedule/dist/decorators/cron.decorator.d.ts` (opcao `timeZone`)
- Execucao: `npx jest src/modules/cobranca` -> 11 suites / 140 testes verdes

### Secondary / Tertiary
- Nenhuma fonte web usada (nao necessaria). Itens `[ASSUMED]` listados no Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - tudo ja no repo, nenhum pacote novo
- Architecture: HIGH - espelha jobs/servicos existentes; janelas sao decisao de design a confirmar (A1)
- Pitfalls: HIGH para os verificados no codigo (1, 4, 5, 6, 7); MEDIO para Prisma `notIn` + NULL (A5) e comportamento do cron perdido (A4)

**Research date:** 2026-11-10
**Valid until:** 2026-12-10 (codigo estavel; reabrir se `email-envio.service.ts` ou o dashboard mudarem antes da execucao)
