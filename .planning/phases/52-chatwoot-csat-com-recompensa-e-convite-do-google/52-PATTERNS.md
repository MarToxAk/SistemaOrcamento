# Phase 52: Chatwoot CSAT com recompensa e convite do Google - Pattern Map

**Mapped:** 2026-11-22
**Files analyzed:** 22 (novos e modificados)
**Analogs found:** 19 / 22

Fontes: `52-CONTEXT.md` (decisoes travadas e "Decisoes pos-research"), `52-RESEARCH.md` (estrutura de modulo proposta, modelos Prisma PROPOSTA) e `52-UI-SPEC.md` (rotas e superficies). Todos os analogs citados abaixo sao arquivos rastreados pelo git (`git ls-files` verificado).

Legenda de qualidade: **exact** = mesmo papel e mesmo fluxo; **role-match** = mesmo papel, fluxo diferente; **partial** = so parte do padrao serve.

---

## File Classification

| Novo/Modificado | Role | Data Flow | Analog mais proximo | Qualidade |
|---|---|---|---|---|
| `apps/backend/src/modules/pesquisa/pesquisa-regras.ts` | utility (puro) | transform | `apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.ts` | role-match |
| `apps/backend/src/modules/pesquisa/pesquisa-regras.test.ts` | test | transform | `apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.test.ts` | exact |
| `apps/backend/src/modules/pesquisa/pesquisa-config.service.ts` | service (singleton config) | CRUD | `apps/backend/src/modules/cobranca/cobranca-encargos-config.service.ts` | exact |
| `apps/backend/src/modules/pesquisa/pesquisa.service.ts` | service | CRUD + event-driven | `apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.service.ts` | role-match |
| `apps/backend/src/modules/pesquisa/pesquisa-public.controller.ts` | controller (publico) | request-response | `apps/backend/src/modules/cobranca/cobranca.controller.ts` (`@Public`, linhas 73, 85, 292) e `apps/backend/src/modules/security/public.decorator.ts` | role-match |
| `apps/backend/src/modules/pesquisa/pesquisa-admin.controller.ts` | controller (admin) | CRUD | `apps/backend/src/modules/cobranca/cobranca-encargos-config.controller.ts` | exact |
| `apps/backend/src/modules/pesquisa/pesquisa-webhook.controller.ts` | controller (webhook HMAC) | event-driven | `apps/backend/src/modules/security/efi-webhook.guard.ts` (HMAC) + `chatwoot-automation.controller.ts` (timingSafeEqual) | partial |
| `apps/backend/src/modules/pesquisa/pesquisa-retry.job.ts` | job (cron) | batch | `apps/backend/src/modules/cobranca/cobranca-aviso-vencimento.job.ts` | exact |
| `apps/backend/src/modules/pesquisa/pesquisa-retencao.job.ts` | job (cron) | batch | `apps/backend/src/modules/cobranca/cobranca-aviso-vencimento.job.ts` | role-match |
| `apps/backend/src/modules/pesquisa/pesquisa.module.ts` | config (module) | - | `apps/backend/src/modules/cobranca/` (modulo de cobranca) | role-match |
| `apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts` (modificar) | service (cliente HTTP) | request-response | ele mesmo: `sendOutgoingMessage` (l.60), `addConversationLabels` (l.95), `getConversationLabels` (l.113) | exact |
| `apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.service.ts` (modificar) | service | event-driven | ele mesmo: `enviarMensagemFechamento` (l.241-303) | exact |
| `apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.ts` (modificar) | utility (fila/mescla) | event-driven | ele mesmo: `mesclarEtiquetas` (l.54-61), `enfileirarPorConversa` (l.197-217) | exact |
| `apps/backend/src/modules/email-envio/` ou `cobranca/email-envio.service.ts` (token, referencia) | service | transform | `apps/backend/src/modules/cobranca/email-envio.service.ts` (l.238-245) | exact |
| `apps/backend/prisma/schema.prisma` (modificar: PesquisaConfig, PesquisaSatisfacao, CupomRecompensa, PesquisaSupressao, enum CupomStatus) | model | CRUD | `ChatwootAutomationConfig` (l.441-447), `CobrancaEncargosConfig` (l.450-455) | role-match |
| `apps/backend/prisma/migrations/<timestamp>_add_pesquisa_recompensa/migration.sql` | migration | batch | `20261117120000_add_cobranca_boleto_atualizado` (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`) | role-match |
| `apps/backend/src/main.ts` (referencia, sem alteracao esperada) | config | - | `rawBody: true` (l.11) | exact |
| `apps/frontend/src/app/pesquisa/[token]/route.ts` ou `page.tsx` | route (publica, proxy) | request-response | `apps/frontend/src/app/cobranca/confirmar/[token]/route.ts` | exact |
| `apps/frontend/src/app/pesquisa/[token]/pesquisa-form.tsx` (Client Component) | component | request-response | sem analog exato de formulario publico; ver UI-SPEC secao 1 | no-analog (parcial) |
| `apps/frontend/src/app/api/admin/pesquisa-config/route.ts` | route (proxy admin) | CRUD | `apps/frontend/src/app/api/admin/cobranca-encargos/route.ts` | exact |
| `apps/frontend/src/app/api/admin/pesquisa/...` (painel e cupons) | route (proxy admin) | CRUD | `apps/frontend/src/app/api/admin/cobranca-encargos/route.ts` | exact |
| `apps/frontend/src/app/configuracoes/pesquisa/page.tsx` | component (pagina admin) | CRUD | `apps/frontend/src/app/configuracoes/cobranca/page.tsx` (UI-SPEC l.451-471) | exact |
| `apps/frontend/src/app/cupons/page.tsx` | component (pagina admin) | CRUD | `apps/frontend/src/app/configuracoes/cobranca/page.tsx` + `AdminShell` | role-match |
| `apps/frontend/src/app/contas-receber/admin-shell.tsx` (modificar: `PA_NAV_ITEMS`, l.26-34) | component (nav) | - | ele mesmo | exact |
| `deploy/docker-compose.vps.yml`, `deploy/docker-compose.box.vps.yml`, `deploy/stack.env.example` (modificar: envs novas) | config | - | envs `CHATWOOT_AUTOMATION_*` da fase 51 | exact |

---

## Pattern Assignments

### `apps/backend/src/modules/pesquisa/pesquisa-config.service.ts` (service, CRUD)

**Analog:** `apps/backend/src/modules/cobranca/cobranca-encargos-config.service.ts`

**Imports e singleton** (linhas 1-24):
```typescript
import { BadRequestException, Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { validarTaxas } from "./cobranca-boleto-atualizado.util";

@Injectable()
export class CobrancaEncargosConfigService {
  private readonly logger = new Logger(CobrancaEncargosConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  async obter(): Promise<EncargosConfig> {
    const existente = await this.prisma.cobrancaEncargosConfig.findUnique({ where: { id: "default" } });
    const linha = existente ?? (await this.prisma.cobrancaEncargosConfig.create({ data: { id: "default" } }));
    return { /* mapeia Decimal com Number(String(...)) */ };
  }
```

**Validacao no servico, nao so no DTO** (linhas 33-36): `validarTaxas` roda dentro de `atualizar`, e erro vira `BadRequestException`. Aplicar aqui os tetos de `PesquisaConfig` (desconto 1-50, validade do link 1-14, validade do cupom 1-180). Chamar `await this.obter()` antes do `update` para garantir a linha singleton.

**Aplicacao:** `PesquisaConfig` com `id: "default"`. Defaults por instancia (Box 10% / R$2 / R$6; Bom Custo 10% / R$5 / R$30) podem vir de env (`PESQUISA_*_PADRAO`) no `create`. Ver CONTEXT "Configuracoes e painel".

---

### `apps/backend/src/modules/pesquisa/pesquisa-admin.controller.ts` (controller, CRUD admin)

**Analog:** `apps/backend/src/modules/cobranca/cobranca-encargos-config.controller.ts`

**Padrao** (linhas 32-43, citadas por grep):
```typescript
@Controller("cobranca")
// ...
  @AdminOnly()
  @Get("encargos-config")
  // ...
  @AdminOnly()
  @Put("encargos-config")
```

**Aplicacao:** `@Controller("pesquisa")` com `@AdminOnly() @Get("config")`, `@AdminOnly() @Put("config")`, e rotas de painel e cupons (`GET /pesquisa/resultados`, `GET /pesquisa/cupons`, `POST /pesquisa/cupons/:codigo/resgate`). Todas com `@AdminOnly()`; nunca `@Public()`.

---

### `apps/backend/src/modules/pesquisa/pesquisa-public.controller.ts` (controller publico, request-response)

**Analogs:** `apps/backend/src/modules/cobranca/cobranca.controller.ts` (rotas `@Public()` em linhas 73, 85, 292) e `apps/backend/src/modules/security/internal-auth.guard.ts` (l.21-23, `if (isPublic) return true;`).

**Padrao de rota publica por token no path** (cobranca, rota `GET /cobranca/email/:token/confirmar`, referenciada no proxy abaixo):
```typescript
// @Public() pula o InternalAuthGuard global (internal-auth.guard.ts:21-23)
// Token aleatorio no path, validado no servico (token invalido/expirado -> resposta generica)
```

**Requisitos novos desta fase (CONTEXT, RESEARCH P8):**
- `@Public()` + `@SkipThrottle()` (de `@nestjs/throttler`, ja instalado) porque todos os clientes chegam pelo mesmo IP do proxy Next (`backend-client.ts` l.8-12). Nao usar `@Throttle` nesta rota.
- Limite por token no banco (contador ou `updateMany` atomico), nao por IP.
- Resposta generica para token invalido, expirado ou desativado (mesma mensagem nos tres casos, UI-SPEC).

---

### `apps/frontend/src/app/pesquisa/[token]/route.ts` (route publica, proxy server-side)

**Analog:** `apps/frontend/src/app/cobranca/confirmar/[token]/route.ts` (arquivo inteiro, 26 linhas)

**Imports e padrao de proxy** (linhas 1-17):
```typescript
import { NextRequest, NextResponse } from "next/server";

import { backendFetch } from "@/lib/backend-client";

// Proxy do link "Confirmar recebimento" enviado no e-mail de cobranca: o
// cliente final nunca deve ver ou acessar o dominio/porta do backend
// diretamente, so o dominio publico do frontend (APP_BASE_URL).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  try {
    const res = await backendFetch(`/cobranca/email/${encodeURIComponent(token)}/confirmar`);
    const html = await res.text();
    return new NextResponse(html, {
      status: res.status,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch {
    return new NextResponse(/* HTML de erro */, { status: 502, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}
```

**Aplicacao:** a pesquisa precisa de pagina React (UI-SPEC secao 1: estado inicial resolvido no servidor, formulario como Client Component). Usar `backendFetch` no servidor (`page.tsx` async) e passar o estado ao `pesquisa-form.tsx`. Manter `encodeURIComponent(token)` e `Cache-Control: no-store`. Para o POST da nota, o form chama um route handler proxy (`route.ts` com `POST`) que repassa a `POST /pesquisa/:token/resposta`.

**Dominio:** o link `/pesquisa/<token>` usa `APP_BASE_URL` (mesmo padrao de `email-envio.service.ts` l.244-245, ver abaixo).

---

### `apps/frontend/src/app/api/admin/pesquisa-config/route.ts` (proxy admin)

**Analog:** `apps/frontend/src/app/api/admin/cobranca-encargos/route.ts` (arquivo inteiro, 55 linhas)

**Padrao completo** (linhas 1-21 e 23-35):
```typescript
import { NextRequest, NextResponse } from "next/server";

import { adminBackendFetch } from "@/lib/admin-backend-client";
import { requireAdminSession } from "@/lib/admin-session";

const CAMINHO_BACKEND = "/cobranca/encargos-config";

function unauthorized() {
  return NextResponse.json({ error: "Sessao expirada ou nao autenticada." }, { status: 401 });
}

export async function GET(req: NextRequest) {
  if (!requireAdminSession(req)) return unauthorized();
  try {
    const res = await adminBackendFetch(CAMINHO_BACKEND);
    const data = await res.json().catch(() => ({ error: "Resposta invalida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!requireAdminSession(req)) return unauthorized();
  // le o body, valida tipos basicos e repassa SOMENTE as chaves conhecidas
  const res = await adminBackendFetch(CAMINHO_BACKEND, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ /* chaves conhecidas */ }),
  });
  // ...
}
```

**Aplicacao:** o proxy repassa somente as chaves conhecidas de `PesquisaConfig` (lista explicita, nunca `...body`). Para `/cupons` e o resgate, o mesmo padrao com `CAMINHO_BACKEND` diferente (`/pesquisa/cupons`, `/pesquisa/cupons/${codigo}/resgate`) e `encodeURIComponent(codigo)`.

---

### `apps/frontend/src/app/configuracoes/pesquisa/page.tsx` (pagina admin)

**Analog:** `apps/frontend/src/app/configuracoes/cobranca/page.tsx` (230 linhas; nao lido nesta sessao, referencia pelo UI-SPEC)

**Reutilizar** (UI-SPEC "Reuso de padroes existentes"):
- `PasswordGate` (title, description) e `AdminShell` com `activeHref`.
- Campos Bootstrap `form-control`, `form-label`, `form-switch`, `invalid-feedback`, `is-invalid`.
- `lerNumero` (aceita virgula e ponto) e `formatarDataHora` (`America/Sao_Paulo`).
- `MSG_SESSAO` para 401, ref `emEnvio` contra duplo envio.
- Barra de salvar `pa-actionbar` com `pa-btn-accent`.

**Diferenca desta fase:** "Salvar" so grava com botao (sem auto-save); `beforeunload` ao haver alteracoes pendentes (UI-SPEC l.479-480, padrao novo, nao existe em `cobranca/page.tsx`).

---

### `apps/frontend/src/app/contas-receber/admin-shell.tsx` (menu)

**Analog:** ele mesmo, `PA_NAV_ITEMS` (linhas 26-34, citadas em RESEARCH "Menu").

**Aplicacao (UI-SPEC "Navegacao"):**
- Novo item de nivel 1 `{ href: "/cupons", icone: "ticket-perforated" }` entre "Producao" e "Configuracoes".
- Novo filho de "Configuracoes" `{ href: "/configuracoes/pesquisa", icone: "star-half" }` depois de "Juros e multa".
- `navItemAtivo` ja cobre `/cupons`. Nao alterar a ordem dos filhos existentes.

---

### `apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.service.ts` (service, event-driven) - MODIFICAR

**Analog (ele mesmo):** `enviarMensagemFechamento` (linhas 241-303). Ponto de integracao: entre o `sendOutgoingMessage` (l.295) e o `create` do log (l.296-298), e tambem na montagem do texto (l.283-293).

**Trecho atual a estender** (linhas 285-298):
```typescript
      let mensagem: string;
      try {
        const resposta = await this.chamarIA(prompt);
        mensagem = extrairMensagemIA(resposta) ?? this.mensagemFallback(saudacao);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Falha ao gerar mensagem de fechamento via IA (usando fallback): ${msg}`);
        mensagem = this.mensagemFallback(saudacao);
      }

      await this.chatwoot.sendOutgoingMessage(conversationId, mensagem);
      await this.prisma.chatwootMensagemEnviada.create({
        data: { conversationId, tipoEvento: "close", mensagemEnviada: mensagem },
      });
```

**Regras para a extensao (CONTEXT, RESEARCH):**
- Bloco fixo da pesquisa (link `/pesquisa/<token>`, frase de recompensa, "Responda SAIR para nao receber") anexado DEPOIS da IA, pelo mesmo `sendOutgoingMessage`. Um link por mensagem.
- Texto alternativo (sem recompensa) quando teto mensal atingido.
- Criar a mensagem privada `input_csat` SOMENTE depois do `sendOutgoingMessage` ok (anti-padrao RESEARCH: criar antes deixa pesquisa sem link). Best-effort: catch e log, nunca lanca.
- Gravar `conversationUuid` (vem de `GET conversation`, nao do webhook; Achado 6).
- Re-check: trocar `avaliarRespostaDoCliente(conversa.messages, ...)` (l.265) por `GET .../messages?after=<id>` (Achado 5, decisao pos-research).
- Logs: so `conversationId` e motivo (nunca texto de mensagem), padrao das linhas 251 e 301.
- Erro em `catch` externo: `this.logger.warn(...)`, sem relancar (padrao l.299-302).

**Padrao de tratamento best-effort** (linhas 249-253):
```typescript
      try {
        conversa = await this.chatwoot.getConversation(conversationId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Mensagem de fechamento nao enviada conversationId=${conversationId} motivo=falha_recheck: ${msg}`);
        return;
      }
```

**Textos com placeholders** (linha 79): `Handlebars.compile(template, { noEscape: true })({ saudacao })`. Usar o mesmo para `{link}`, `{percentual}`, `{teto}`, `{compra_minima}`, `{validade}`, `{codigo}`, `{link_google}`, `{nome_empresa}`.

---

### `apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts` (cliente HTTP Chatwoot) - MODIFICAR

**Analog (ele mesmo):** `sendOutgoingMessage` (l.60-80), `addConversationLabels` (l.95-107), `getConversationLabels` (l.110-130), `getConversation` (l.132).

**Padrao de chamada** (de `addConversationLabels`, l.95-107, trecho confirmado por grep):
```typescript
    const url = `${baseUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`;
    const response = await axios.post(url, { labels }, { headers: { api_access_token: token }, timeout: 10000 });
```

**Novos metodos (PROPOSTA, RESEARCH "Code Examples"):**
- `createPrivateCsatMessage(conversationId, content)`: `POST .../messages` com `{ content, message_type: "outgoing", private: true, content_type: "input_csat" }`. Retornar `{ enabled: false }` se faltar env (padrao l.359 do RESEARCH).
- `submitCsatResponse(conversationUuid, rating, feedback)`: `PUT ${baseUrl}/public/api/v1/csat_survey/${uuid}` (sem `api_access_token`). Nao usar o retorno como confirmacao.
- `listMessagesAfter(conversationId, afterId)`: `GET .../messages` com `params: { after, filter_internal_messages: true }`. Retornar `null` quando indeterminado.
- `updateContactCustomAttributes(contactId, attrs)`: `PUT .../contacts/:id` com `{ custom_attributes }` (merge no Chatwoot, sem leitura previa).
- `createAccountLabel(title)`: body ANINHADO `{ label: { title, show_on_sidebar: true } }` com token de administrador (Achado 10).

**Regra do projeto:** toda chamada e best-effort. Mesmo erro de `sendOutgoingMessage` (l.76) so gera `warn`.

---

### `apps/backend/src/modules/integrations/chatwoot/chatwoot-etiquetas.ts` (fila e mescla) - MODIFICAR

**Analog (ele mesmo):**
- `mesclarEtiquetas` (l.54-61): merge de listas sem duplicar.
- `aplicarEtiquetasGerenciadas` (l.90-103): GET + mescla + POST.
- `enfileirarPorConversa` (l.197-217): fila serial por `conversationId`.

**Aplicacao:** labels `avaliou` (toda resposta) e `csat-baixo` (nota 1 ou 2) passam pela MESMA fila (`enfileirarPorConversa`). Ajustar o ciclo de vida do fechamento (fase 51 D-06) para preservar `avaliou` e `csat-baixo` (ajuste so dessas duas, CONTEXT "Ciclo de vida"). Teste: estender `chatwoot-etiquetas.test.ts` (exact analog).

---

### `apps/backend/src/modules/pesquisa/pesquisa-webhook.controller.ts` (webhook HMAC para SAIR)

**Analogs:**
- HMAC + rawBody: `apps/backend/src/modules/security/efi-webhook.guard.ts` linhas 31-32:
```typescript
    const raw = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}), "utf8");
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
```
- Comparacao em tempo constante: `apps/backend/src/modules/integrations/chatwoot/chatwoot-automation.controller.ts` linhas 28-31:
```typescript
    const providedBuf = Buffer.from(token ?? "", "utf8");
    const expectedBuf = Buffer.from(expected, "utf8");
    const isValid = providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);
```
- Rota publica com `@Public()` e `@HttpCode(200)` (chatwoot-automation.controller.ts l.41-44), mas com `THROTTLE_WEBHOOK` NAO reaproveitado: esta fase exige limite maior (RESEARCH P9; `throttle.config.ts` l.11-14 tem 30/min).

**Aplicacao (RESEARCH "Webhook message_created"):**
- Header `X-Chatwoot-Signature` = `sha256=` + HMAC(secret, `<ts>.<body>`). Verificar com `rawBody` (ja ligado em `main.ts` l.11), janela de timestamp de 5 min.
- Filtrar `message_type === "incoming"` e `private === false` antes de `ehOptOut`.
- Demais eventos: `200` sem efeito (Chatwoot faz retry em erro).

---

### `apps/backend/src/modules/pesquisa/pesquisa-retry.job.ts` e `pesquisa-retencao.job.ts` (cron)

**Analog:** `apps/backend/src/modules/cobranca/cobranca-aviso-vencimento.job.ts`

**Kill-switch e guarda de sobreposicao** (linhas 16-51):
```typescript
 * DESLIGADO POR PADRAO: envia e-mail real a clientes, entao so liga com COBRANCA_AVISO_ATIVO exatamente
 * `running` e guarda em memoria de processo: previne ciclos sobrepostos so na MESMA instancia.

  private running = false;

  @Cron("0 8,14 * * *", { name: "cobranca-aviso-vencimento", timeZone: "America/Sao_Paulo" })
  // ...
    if (this.config.get<string>("COBRANCA_AVISO_ATIVO") !== "true") {
      // log e return (ciclo ignorado)
    }
    if (this.running) { /* ignora ciclo sobreposto */ }
    this.running = true;
    // ...
      this.running = false;
```

**Aplicacao:**
- `pesquisa-retry.job.ts`: reenvio de `envioCupomStatus = FALHA` / `envioConviteStatus = FALHA` / `chatwootCsat = FALHA`. Kill-switch `PESQUISA_ATIVA` (RESEARCH: flag `PESQUISA_ATIVA=false` no tracer).
- `pesquisa-retencao.job.ts`: anonimizacao apos 12 meses, mesmo `@Cron` + kill-switch proprio (env de retencao separada). Antes de ligar: parecer juridico (CONTEXT, pendente).

---

### `apps/backend/src/modules/pesquisa/pesquisa.service.ts` (emissao, resgate e teto)

**Analogs parciais:**
- Token: `apps/backend/src/modules/cobranca/email-envio.service.ts` linha 238 `const token = randomBytes(24).toString("hex");` (import de `node:crypto`, linha 1). Link: linhas 239-245, `APP_BASE_URL` e o dominio do FRONTEND, com `.replace(/\/+$/, "")` (linha 244).
- Logica de resgate: sem analog. Usar `updateMany({ where: { id, status: "EMITIDO" } })` e checar `count === 1` (atomico; RESEARCH anti-padrao: validacao so no cliente).
- Calculo de desconto: `calcularDescontoCentavos` (PROPOSTA em `pesquisa-regras.ts`). Nao usar `number` com float.

**Configuracao via env** (padrao do projeto): `this.getRequiredConfig("APP_BASE_URL")` (email-envio.service.ts l.244).

---

### `apps/backend/prisma/schema.prisma` e migracao (model)

**Analogs:**
- `ChatwootAutomationConfig` (schema.prisma l.441-447) e `CobrancaEncargosConfig` (l.450-455): singleton `id String @id @default("default")`.
- Migracao idempotente: `20261117120000_add_cobranca_boleto_atualizado` (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, RESEARCH l.223).

**Aplicacao:** modelos `PesquisaConfig`, `PesquisaSatisfacao`, `CupomRecompensa`, `PesquisaSupressao` e `enum CupomStatus` (RESEARCH "Modelo de dados"). `@@unique` em `conversationId` (uma pesquisa por conversa) e `pesquisaId` (um cupom por pesquisa). Indices `[telefone, criadoEm]` e `[status, usadoEm]`. Dinheiro em `Decimal(12,2)`.

---

### `apps/backend/src/main.ts` (referencia)

**Analog:** `rawBody: true` (linha 11). Ja habilitado, nao alterar. Requisito para o HMAC do webhook SAIR.

---

### Deploy e envs (`deploy/docker-compose.vps.yml`, `deploy/docker-compose.box.vps.yml`, `deploy/stack.env.example`)

**Analog:** envs `CHATWOOT_AUTOMATION_*` da fase 51 (PR #75, ainda NAO mesclado em `main`, RESEARCH Achado 18: pre-condicao de deploy).

**Regra do projeto:** toda env nova entra nos tres arquivos. Envs previstas: `PESQUISA_ATIVA`, `PESQUISA_WEBHOOK_SECRET` (HMAC SAIR, por instancia), `PESQUISA_*_PADRAO` (defaults por empresa, se escolhido env), `CHATWOOT_ADMIN_API_TOKEN` (labels), e `EMPRESA_*` ja existentes para a pagina publica.

---

## Shared Patterns

### Autenticacao de admin (backend)
**Source:** `apps/backend/src/modules/security/admin.decorator.ts` (`@AdminOnly()`), usado em `cobranca-encargos-config.controller.ts` l.36, 42.
**Apply to:** todos os controllers `pesquisa-admin.controller.ts`.
```typescript
  @AdminOnly()
  @Get("...")
```

### Rota publica (backend)
**Source:** `apps/backend/src/modules/security/public.decorator.ts` (`@Public()`); guard global `internal-auth.guard.ts` l.21-23 pula rotas publicas.
**Apply to:** `pesquisa-public.controller.ts` e `pesquisa-webhook.controller.ts`. Adicionar `@SkipThrottle()` (`@nestjs/throttler` 6.5.0) no publico.

### Autenticacao de admin (frontend)
**Source:** `apps/frontend/src/app/api/admin/cobranca-encargos/route.ts` l.8-13 (`requireAdminSession(req)` + `unauthorized()` 401).
**Apply to:** todas as rotas `apps/frontend/src/app/api/admin/pesquisa*`.

### Proxy server-side ao backend
**Source publica:** `backendFetch` (`apps/frontend/src/lib/backend-client.ts`), usado em `cobranca/confirmar/[token]/route.ts` l.12.
**Source admin:** `adminBackendFetch` (`apps/frontend/src/lib/admin-backend-client.ts`), usado em `api/admin/cobranca-encargos/route.ts` l.15, 45.
**Apply to:** rota publica `/pesquisa/[token]` (backendFetch) e todas as admin (adminBackendFetch).

### Best-effort no Chatwoot
**Source:** `chatwoot.service.ts` l.76 (`sendOutgoingMessage` loga warn e nao lanca) e `chatwoot-automation.service.ts` l.299-302 (catch externo que so loga).
**Apply to:** `createPrivateCsatMessage`, `submitCsatResponse`, labels, atributos do contato e envio do cupom/convite. Falha vira `FALHA` + retentativa no cron, nunca erro ao cliente.

### Fila por conversa e mescla de etiquetas
**Source:** `chatwoot-etiquetas.ts` l.54-61 (`mesclarEtiquetas`), l.90-103 (`aplicarEtiquetasGerenciadas`), l.197-217 (`enfileirarPorConversa`).
**Apply to:** `avaliou`, `csat-baixo` e mensagens de fechamento. POST de labels substitui a lista inteira.

### Token aleatorio e link publico
**Source:** `apps/backend/src/modules/cobranca/email-envio.service.ts` l.1, 238, 244-245.
**Apply to:** `PesquisaSatisfacao.token` (48 hex) e `CupomRecompensa.codigo` (usar `crypto.randomInt` sobre alfabeto sem 0/O/1/I/L, ver `pesquisa-regras.ts` PROPOSTA).

### Comparacao de segredo
**Source:** `chatwoot-automation.controller.ts` l.28-31 (`timingSafeEqual` com buffers do mesmo tamanho).
**Apply to:** token/HMAC do webhook SAIR.

### Textos editaveis com placeholders
**Source:** `chatwoot-automation.service.ts` l.78-80 (`Handlebars.compile(template, { noEscape: true })`).
**Apply to:** todos os `texto*` de `PesquisaConfig`. Validar placeholders desconhecidos e emoji no servico (UI-SPEC l.301-310).

### Cron com kill-switch
**Source:** `cobranca-aviso-vencimento.job.ts` l.35-51.
**Apply to:** `pesquisa-retry.job.ts` e `pesquisa-retencao.job.ts`.

### Singleton de configuracao
**Source:** `cobranca-encargos-config.service.ts` l.22-30.
**Apply to:** `PesquisaConfig` (`id: "default"`), uma linha por instancia (Box e Bom Custo sao deploys separados).

---

## No Analog Found

| Arquivo | Role | Data Flow | Motivo | Usar em vez disso |
|---|---|---|---|---|
| `apps/frontend/src/app/pesquisa/[token]/pesquisa-form.tsx` | component | request-response | Nao existe formulario publico com radio de nota (`<fieldset>`, 5 opcoes 56 px) no frontend | UI-SPEC secao "1. Pesquisa publica" e "Variantes A/B da nota" (l.395-417) |
| Fluxo de resgate atomico de cupom (`resgatar`) | service | CRUD | Nao existe resgate de cupom | RESEARCH "Anti-padroes" (l.326): `updateMany` com `where: { status: "EMITIDO" }` e checagem de `count` |
| Teto mensal derivado (`somaDescontoMes`) | service | aggregate | Nao existe agregacao de teto | RESEARCH "Teto mensal": soma de `descontoAplicado` com `status = USADO` no mes, `America/Sao_Paulo` |
| Painel de resultados (`GET /pesquisa/resultados`) | service + component | aggregate | Nao existe painel de CSAT | UI-SPEC secao "3. Resultados" (l.485-511); relatorio nativo do Chatwoot continua em `/app/accounts/:id/reports/csat` |
| Validacao de link Google (allowlist https) | utility | transform | Nao existe | CONTEXT "Link do Google": aceitar so https em `g.page`, `search.google.com`, `maps.google.com`, `business.google.com` |
| `normalizarTelefone` / `ehOptOut` | utility | transform | Nao existe util de telefone (RESEARCH Achado 15) | RESEARCH "Regras puras" (l.481-492) |

---

## Pendencias de mapeamento

- `apps/frontend/src/app/configuracoes/cobranca/page.tsx` e `contas-receber/admin-shell.tsx` foram referenciados pelo RESEARCH e UI-SPEC com numeros de linha, mas NAO foram lidos nesta sessao. O planner deve pedir ao executor a leitura desses dois arquivos antes de copiar os padroes de campo e de menu.
- `apps/backend/src/modules/quotes/quotes.controller.ts` (`@Public` em approve) e `apps/backend/src/modules/cobranca/cobranca.controller.ts` linhas 73, 85, 292 foram citados por grep, sem leitura completa.
- `chatwoot-etiquetas.test.ts` (33 testes, RESEARCH) e a suite `apps/backend/src/modules/integrations/chatwoot` (116 testes verdes) sao o padrao de teste; nao foram lidos neste mapeamento.

---

## Metadata

**Analog search scope:** `apps/backend/src/modules/{integrations/chatwoot,cobranca,security}`, `apps/backend/prisma/schema.prisma`, `apps/frontend/src/app/{cobranca/confirmar,api/admin,configuracoes,contas-receber}`, `deploy/`.
**Files read diretamente:** 8 (chatwoot-automation.service.ts l.236-305, chatwoot-automation.controller.ts, cobranca/confirmar route.ts, cobranca-encargos-config.service.ts, api/admin/cobranca-encargos/route.ts, e os tres CONTEXT/RESEARCH/UI-SPEC).
**Files citados por grep ou pelo RESEARCH (sem leitura integral):** 12.
**Rastreamento git:** os analogs lidos ou citados em detalhe (chatwoot-automation, chatwoot-etiquetas, chatwoot.service, cobranca-encargos, email-envio, efi-webhook.guard, cobranca-aviso-vencimento.job, confirmar route, api/admin/cobranca-encargos, configuracoes/cobranca/page.tsx) foram verificados com `git ls-files`. Os demais caminhos citados (cobranca.controller.ts, public/admin decorators, internal-auth.guard.ts, backend-client.ts, admin-backend-client.ts, schema.prisma, migracao 20261117120000, admin-shell.tsx, deploy/*) ainda NAO foram verificados e devem passar por `git ls-files` antes de virar acao no plano. Nenhum caminho de mirror de plugin foi usado.
**Pattern extraction date:** 2026-11-22
