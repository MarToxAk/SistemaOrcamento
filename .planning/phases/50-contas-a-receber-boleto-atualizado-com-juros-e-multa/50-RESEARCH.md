# Phase 50: Contas a receber — boleto atualizado com juros e multa - Research

**Researched:** 2026-11-17
**Domain:** NestJS + Prisma (cobrança EFI v1 boleto, baixa Athos, e-mail), Next.js 16 (proxy routes + páginas)
**Confidence:** HIGH para o que existe no código; MEDIUM para o comportamento da EFI (docs públicas parcialmente silenciosas)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: O novo vencimento só pode ser **hoje** ou o **próximo dia útil** (ex.: hoje 17/11 terça → máximo 18/11; hoje sexta → máximo segunda). Qualquer data posterior é **bloqueada** (validar no backend E no frontend).
- D-02: "Dia útil" = segunda a sexta (feriados: avaliar no research se há util existente; se não, sáb/dom já basta para v1).
- D-03: Base do cálculo = **vencimento original registrado no sistema** (ex.: venc. 10/11) até o novo vencimento escolhido.
- D-04: **Juros pro rata por dia**: (taxa mensal / 30) × dias de atraso × valor original. Padrão 0,99% ao mês.
- D-05: **Multa** fixa sobre o valor original: padrão 2%.
- D-06: Juros e multa são **editáveis no momento da geração** (pré-preenchidos com o padrão).
- D-07: Tela de configuração das taxas padrão (juros % a.m. e multa %) dentro de `/configuracoes` (página já existente no frontend). Padrões iniciais: 0,99% e 2%. Persistir no banco (Prisma).
- D-08: Ao gerar o boleto atualizado, **cancelar o boleto original na EFI** — o cliente fica com um único boleto válido. Registrar o vínculo original → atualizado.
- D-09: Quando o boleto atualizado for pago, dar **baixa no título original no Athos lançando juros e multa como encargos** (reaproveitar `athos-baixa-encargos.util.ts` / fluxo de baixa existente da cobrança).
- D-10: Enviar pelo **fluxo de e-mail de boleto já existente** (com CC padrão — `email-envio.service.ts`, `CobrancaEmailCcPadrao`).

### Claude's Discretion
- Arredondamento (centavos, 2 casas, half-up), exibição do detalhamento (valor original, dias, juros, multa, total) na tela antes de confirmar.
- Se o boleto já estiver pago/cancelado, bloquear geração.

### Deferred Ideas (OUT OF SCOPE)
- Envio do boleto atualizado via Chatwoot/WhatsApp.
- Calendário de feriados (se não houver util pronto).
</user_constraints>

<phase_requirements>
## Phase Requirements

Sem IDs atribuídos. Derivados das decisões; o planner deve usar estes IDs internos de rastreio.

| ID | Descrição | Research Support |
|----|-----------|------------------|
| BA-01 (D-01/D-02) | Vencimento ∈ {hoje SP, próximo dia útil seg–sex}; validado no backend e no frontend | util puro `vencimentosPermitidos`; `hojeSaoPaulo` já existe; backend devolve `hoje` e as 2 datas permitidas |
| BA-02 (D-03/D-04/D-05) | Cálculo de juros pro rata e multa por título | reutilizar `calcularEncargosTitulo` (carência 0) — fórmula idêntica à do Athos; exemplo dourado abaixo |
| BA-03 (D-06) | Taxas editáveis na geração, pré-preenchidas | endpoint de prévia recalcula com taxas do corpo; modal no frontend |
| BA-04 (D-07) | Tela de taxas padrão + persistência | modelo singleton `CobrancaEncargosConfig`; página nova `/configuracoes/cobranca` (ver Pitfall 8: `/configuracoes` NÃO existe como página) |
| BA-05 (D-08) | Novo boleto na EFI, cancelar o original na EFI, guardar vínculo | `POST /v1/charge/one-step` + `PUT /v1/charge/:id/cancel`; `boletoOrigemId`; NÃO reutilizar `cancelarBoleto` (apaga linhas e engole falha da EFI) |
| BA-06 (D-09) | Baixa Athos do título original com juros/multa como encargos quando o atualizado for pago | snapshot de encargos por título + novo caminho "encargos fixos" em `baixarTitulos` (a decisão atual recalcula e rejeitaria o valor) |
| BA-07 (D-10) | Envio pelo fluxo de e-mail existente | `POST /cobranca/email/enviar` já recebe `cobrancaBoletoId`; zero mudança de backend |
| BA-08 (Discretion) | Bloquear geração se pago/cancelado; detalhamento antes de confirmar | checagem local + `GET /v1/charge/:id` na EFI; resposta de prévia com tabela por título |
</phase_requirements>

## Summary

O sistema já tem todas as peças: emissão EFI v1 "one-step" (`criarBoleto`), cancelamento na EFI (`cancelarBoleto`), webhook + reconciliação que marcam `pago` e disparam a baixa Athos, baixa com encargos (juros/multa/atraso gravados em `conta_recebida`) e o fluxo de e-mail com CC. A fase é principalmente **composição** mais três pontos que NÃO são triviais e que o planner precisa tratar de forma explícita: (1) a baixa Athos atual **recalcula** os encargos com a configuração do Athos (`conf_financeiro`) e compara com o valor pago na EFI — um boleto atualizado com taxas editáveis (0,99% a.m.) vai gerar `VALOR_INCOMPATIVEL`; é preciso guardar um snapshot dos encargos por título e criar um caminho de baixa com "encargos fixos"; (2) `cancelarBoleto` existente **apaga** o boleto e seus títulos do banco e **engole** falhas da EFI — incompatível com "registrar o vínculo original → atualizado" e com "cancelar na EFI"; (3) a EFI documenta que um boleto cancelado **ainda pode ser pago** se o cliente já o imprimiu — risco de pagamento duplo a tratar (log/alerta).

Não há util de dia útil nem de feriados no repo (verificado por grep). Há `hojeSaoPaulo`, `somarDias`, `diasEntre`, `calcularEncargosTitulo` e `decidirValoresBaixa` reaproveitáveis. A tela `/configuracoes` citada no CONTEXT **não existe como página**: só `/configuracoes/templates` (menu "Configurações" aponta para ela). Criar `/configuracoes/cobranca` e transformar o item de menu em grupo com filhos.

**Primary recommendation:** Criar (a) util puro `cobranca-boleto-atualizado.util.ts` (dia útil + cálculo reutilizando `calcularEncargosTitulo` com carência 0), (b) singleton `CobrancaEncargosConfig`, (c) `CobrancaService.gerarBoletoAtualizado` (cria novo boleto EFI com itens + linhas "Juros" e "Multa", persiste com `boletoOrigemId` e snapshot por título, só então cancela o original na EFI de forma estrita e marca `cancelado` SEM apagar), (d) extensão aditiva de `baixarTitulos` para encargos fixos vindos do snapshot, (e) modal "Atualizar boleto" em `aba-boletos.tsx` que reaproveita o modal de e-mail existente com o id do novo boleto.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Regra de data (hoje SP / próximo dia útil) | API / Backend | Browser (só exibe/valida UX) | "hoje" depende do fuso SP no servidor; backend devolve `hoje` e datas permitidas, o browser não calcula datas |
| Cálculo juros/multa | API / Backend | Browser (exibe prévia vinda do backend) | Fonte única da fórmula; valor cobrado nunca vem do cliente |
| Emissão/cancelamento na EFI | API / Backend | — | Credenciais EFI só no servidor |
| Persistência de vínculo e snapshot | Database / Storage (Prisma) | API | `CobrancaBoleto`/`CobrancaBoletoTitulo` |
| Taxas padrão | Database / Storage | API (AdminOnly) / Frontend Server (proxy admin) | Singleton; escrita exige `x-admin-api-key` via `adminBackendFetch` |
| Baixa Athos com encargos | API / Backend (CobrancaBaixaAthosService → AthosContaReceberBaixaService) | Database Athos (escrita já existente, transacional) | Reaproveita fluxo da Fase 43 |
| E-mail | API / Backend (`EmailEnvioService`) | Browser (modal existente) | Sem mudança de backend |
| Telas | Frontend (Next.js client) | Frontend Server (route handlers proxy) | Padrão `backendFetch` / `adminBackendFetch` |

## Standard Stack

Nenhuma dependência nova. Tudo já instalado. [VERIFIED: apps/backend/package.json — jest ^30.3.0, ts-jest ^29.4.9, @nestjs/* ^11.1.19, @prisma/client ^5.22.0; apps/frontend/package.json — next ^16.2.5, react 18.3.1]

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `axios` (já usado em `cobranca.service.ts`) | instalado | chamadas EFI Cobranças v1 | padrão do módulo (`axios.create({ baseURL, timeout: 15_000 })`) |
| `@prisma/client` | ^5.22.0 | modelos novos + migration SQL manual | padrão do projeto |
| `class-validator` / `class-transformer` | instalado | DTOs (ValidationPipe global `whitelist + forbidNonWhitelisted`) | padrão do projeto |
| jest + ts-jest | 30 / 29 | testes backend | `jest.config.js`: `testRegex: '.*\\.test\\.ts$'`, `rootDir: 'src'` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Novo charge na EFI | `PUT /v1/charge/:id/billet` (altera vencimento do boleto existente) | Só altera data, não valor [CITED: dev.efipay.com.br/docs/api-cobrancas/boleto]; o boleto atualizado precisa de valor maior → descartado |
| Fórmula pura `taxa/30 × dias × valor` | `calcularEncargosTitulo` do util Athos (taxa diária arredondada a 3 casas) | Idênticos com o padrão 0,99% (0,99/30 = 0,033 exato). Para taxas "quebradas" (ex.: 1,00% → 0,0333… vira 0,033) o util difere em centavos da fórmula pura. **Recomendado reusar o util** (mesma conta que o Athos usa na baixa, validada em 2 casos reais) |
| EFI `configurations.fine/interest` no boleto | valor fixo já com juros+multa | Ver Pitfall 3; recomendado valor fixo, sem `configurations` |
| Lib de feriados | só seg–sex | D-02 permite v1 sem feriados; feriado fica Deferred |

**Installation:** nenhuma. **Após editar `schema.prisma`:** `npm --workspace @orcamento/backend run prisma:generate` (ts-jest tipa contra o client gerado).

## Package Legitimacy Audit

Nenhum pacote externo novo será instalado nesta fase. Auditoria não aplicável.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Operador (aba "Boletos" do cliente)
   │  clica "Atualizar boleto" (boleto pendente, com título vencido)
   ▼
Frontend modal ──POST /api/cobranca/boleto/:id/atualizacao/previa {novoVencimento?, taxaJurosMes?, multaPercentual?}
   │                       │ (route handler → backendFetch → backend)
   │                       ▼
   │        CobrancaService.previaBoletoAtualizado  (somente leitura)
   │          ├─ hojeSaoPaulo() ──► vencimentosPermitidos(hoje) = [hoje, proximoDiaUtil(hoje)]
   │          ├─ prisma: CobrancaBoleto(+titulos) ; CobrancaEncargosConfig (defaults)
   │          ├─ Athos (leitura): buscarTitulosClienteContasReceber → datavencimento por título
   │          └─ calcularEncargosTitulo por título ─► {dias, juros, multa, total}
   ▼
modal mostra detalhamento (original, dias, juros, multa, total) e vencimentos permitidos (2 opções)
   │  confirma
   ▼
POST /api/cobranca/boleto/:id/atualizar {novoVencimento, taxaJurosMes, multaPercentual}
   ▼
CobrancaService.gerarBoletoAtualizado
   1. valida: original pendente, não baixado, tem txidEfi; novoVencimento ∈ permitidos; títulos ainda abertos no Athos
   2. EFI GET /v1/charge/:txid  ── paid? → sincroniza (pago + dispararBaixaAthos) e recusa; canceled → recusa
   3. recalcula encargos NO SERVIDOR (nunca confia no total do cliente)
   4. EFI POST /v1/charge/one-step (itens por NF + "Juros de mora" + "Multa", Σ itens = total)
   5. prisma: cria CobrancaBoleto novo (pendente, boletoOrigemId, snapshot) + CobrancaBoletoTitulo(valor=principal, juros, multa, diasAtraso)
   6. EFI PUT /v1/charge/:txidOriginal/cancel (ESTRITO: code 200) ; ok → original.status="cancelado" (linha e títulos preservados)
   7. resposta { cobrancaId(novo), cancelamentoOriginal: "ok"|"falhou", ... }
   ▼
Frontend: "Enviar por e-mail" → modal de e-mail existente com cobrancaId do NOVO boleto
   ▼
POST /cobranca/email/enviar (existente) → PDF do boleto + NFs dos mesmos títulos

Pagamento do atualizado:
EFI webhook/reconciliação ─► status "pago" ─► CobrancaBaixaAthosService.executarAposPagamento
   └► titulosParaBaixa inclui encargosFixos (do snapshot) ─► AthosContaReceberBaixaService.baixarTitulos
        └► caminho "encargos fixos": sem ler conf_financeiro; valorPago = principal+juros+multa;
           compara com payment.paid_value da EFI (tolerância 0,10); INSERT conta_recebida(valorpago, juros, atraso, multa)
```

### Recommended Project Structure
```
apps/backend/src/modules/cobranca/
├── cobranca-boleto-atualizado.util.ts        # puro: proximoDiaUtil, vencimentosPermitidos, calcularBoletoAtualizado
├── cobranca-boleto-atualizado.util.test.ts
├── cobranca-encargos-config.service.ts       # getConfig (cria default) / updateConfig, validação de faixa
├── cobranca-encargos-config.service.test.ts
├── cobranca.service.boleto-atualizado.test.ts # gerar/prévia com prisma+athos+axios mockados
├── dto/gerar-boleto-atualizado.dto.ts         # novoVencimento, taxaJurosMes, multaPercentual (todos opcionais exceto novoVencimento)
├── dto/atualizar-encargos-config.dto.ts
apps/backend/prisma/migrations/2026111712xxxx_add_cobranca_boleto_atualizado/migration.sql
apps/frontend/src/app/
├── api/cobranca/boleto/[id]/atualizacao/previa/route.ts
├── api/cobranca/boleto/[id]/atualizar/route.ts
├── api/admin/cobranca-encargos/route.ts        # GET/PUT, requireAdminSession + adminBackendFetch
├── configuracoes/cobranca/page.tsx             # PasswordGate + AdminShell + RecursosBootstrap
└── contas-receber/[idcliente]/_abas/modal-boleto-atualizado.tsx
```

### Dados existentes relevantes (verbatim)

Modelos atuais [VERIFIED: apps/backend/prisma/schema.prisma:231-258, 326-335]:
```prisma
model CobrancaBoleto {
  id             Int                    @id @default(autoincrement())
  txidEfi        String?
  idclienteAthos Int
  valor          Decimal                @db.Decimal(12, 2)
  status         String                 @default("pendente")
  ...
  expireAt       String?
  ...
  athosBaixaStatus        String?   // null = nunca processado ...; pendente | baixado | ja_baixado | falha | estornado
model CobrancaBoletoTitulo {
  id               Int            @id @default(autoincrement())
  cobrancaBoletoId Int
  idcontareceber   Int
  valor            Decimal        @db.Decimal(12, 2)
```
Status usados no código: `"pendente"`, `"pago"`, `"cancelado"` [VERIFIED: cobranca.service.ts:133 `cobrancaBoleto: { status: { in: ["pendente", "pago"] } }`; :858 `efiStatus === "paid" ? "pago" : efiStatus === "canceled" ? "cancelado"`; :1015 `status: { not: "cancelado" }`]. `CobrancaBoletoTitulo.valor` é lido pela baixa como `valorEsperado` e comparado com o valor real do título no Athos (`VALOR_DIVERGENTE` se diferir > 1 centavo) [VERIFIED: athos-conta-receber-baixa.service.ts:464-466]. **Logo `CobrancaBoletoTitulo.valor` DEVE continuar sendo o principal** do título; o total do boleto atualizado vai em `CobrancaBoleto.valor`.

Singleton de config (molde) [VERIFIED: schema.prisma:421-428]:
```prisma
model ChatwootAutomationConfig {
  id                     String   @id @default("default")
  ...
  updatedAt              DateTime @updatedAt
  updatedBy              String?
}
```
`getConfig()` faz `findUnique({ where: { id: "default" } })` e cria o default se ausente [VERIFIED: chatwoot-automation.service.ts:104-114].

### Pattern 1: Schema aditivo (sugestão — nomes finais a critério do planner)
```prisma
model CobrancaEncargosConfig {
  id                 String   @id @default("default")
  jurosMesPercentual Decimal  @default(0.99) @db.Decimal(7, 4)
  multaPercentual    Decimal  @default(2)    @db.Decimal(7, 4)
  updatedAt          DateTime @updatedAt
}
// CobrancaBoleto: + boletoOrigemId Int? (self-relation, onDelete: SetNull), valorPrincipal/valorJuros/valorMulta Decimal(12,2)?,
//                   taxaJurosMesAplicada / multaPercentualAplicada Decimal(7,4)?, vencimentoBase?  (auditoria)
// CobrancaBoletoTitulo: + juros Decimal(12,2)?, multa Decimal(12,2)?, diasAtraso Int?   (null = boleto normal)
```
Migration SQL manual, aditiva e idempotente (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, constraint via `DO $$ ... pg_constraint`), no estilo de `20261110120000_add_cobranca_aviso_vencimento` [VERIFIED: leitura do arquivo]. Última migration atual: `20261110120000_add_cobranca_aviso_vencimento`; nova deve ser posterior (ex.: `20261117120000_...`).

### Pattern 2: Util puro (exemplo + caso dourado)
```typescript
// cobranca-boleto-atualizado.util.ts — sem Nest/Prisma
import { calcularEncargosTitulo } from "../integrations/athos/athos-baixa-encargos.util";
import { somarDias } from "./cobranca-aviso-vencimento.util";

export function proximoDiaUtil(dataISO: string): string {
  let d = somarDias(dataISO, 1);
  for (;;) {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay(); // 0=dom, 6=sab
    if (dow !== 0 && dow !== 6) return d;
    d = somarDias(d, 1);
  }
}
export const vencimentosPermitidos = (hoje: string): [string, string] => [hoje, proximoDiaUtil(hoje)];

// por título: calcularEncargosTitulo({ principal, vencimento: <datavencimento Athos>, dataPagamento: novoVencimento,
//                                       conf: { taxaJurosMes, carenciaDias: 0, percentualMulta } })
```
Caso dourado (conferido à mão com a aritmética do util): principal 1000,00; venc. 10/11; novo 18/11 → 8 dias; taxa diária = round(0,99×1000/30)=33 milésimos de % ⇒ juros = floor((100000·33·8+50000)/100000) = **264 centavos = R$ 2,64**; multa 2% = **R$ 20,00**; total **R$ 1.022,64**. Datas: 17/11/2026 = terça (hoje→18/11 quarta); sexta→segunda; sáb/dom→segunda. [VERIFIED: athos-baixa-encargos.util.ts:95-117 `const taxaDiariaMilesimos = Math.round((conf.taxaJurosMes * 1000) / 30);` e `const multaBp = Math.round(conf.percentualMulta * 100);`]

### Pattern 3: Baixa Athos com encargos fixos (mudança aditiva)
Hoje: `titulosParaBaixa` devolve só `{ idcontareceber, valorEsperado }` [VERIFIED: cobranca-baixa-athos.service.ts:603-608] e `baixarTitulos` chama `decidirValoresBaixa` com `conf_financeiro` lido do Athos [VERIFIED: athos-conta-receber-baixa.service.ts:476-514]. Consequência: se o atualizado (0,99% sem carência) for pago, a decisão compara `payment.paid_value` com principal+encargos **do Athos** (taxa/carência do `conf_financeiro`, multa por `ATHOS_BAIXA_MULTA_PERCENTUAL`); divergindo > R$ 0,10 → `VALOR_INCOMPATIVEL` (ou, se pagou só o principal, modo nominal com juros/multa zerados — errado para este caso). Mudança recomendada:
- `BaixarTitulosInput.titulos[]` ganha `encargosFixos?: { juros: number; multa: number; atraso: number }`.
- No passo "fase 2b", se **todos os pendentes** têm `encargosFixos`: não ler `conf_financeiro`; montar a decisão diretamente (`valorPago = principal + juros + multa` em centavos); se `valorPagoEfi` não é nulo e `|efi − soma| > tolerância (0,10)` → `VALOR_INCOMPATIVEL`. Reusar `modo: "com_encargos"` (evita ampliar a union `ModoValorBaixa`). Preferir uma função pura nova em `athos-baixa-encargos.util.ts` (`decidirValoresBaixaFixos`) para testar sem `pg`.
- `CobrancaBaixaAthosService.titulosParaBaixa` inclui `encargosFixos` quando `juros`/`multa` do `CobrancaBoletoTitulo` não são nulos (`Number(String(x))`, mesmo padrão do arquivo); `BoletoComTitulos.titulos` é ampliado. O caminho de baixa manual/retentativa herda automaticamente.
- O INSERT já grava `juros`, `atraso`, `multa` separados [VERIFIED: athos-conta-receber-baixa.service.ts:231-235 `INSERT INTO conta_recebida (idcontareceber, valorpago, valortroco, datapagamento, horapagamento, juros, desconto, atraso, idfuncionariousuario, idformapagamento, multa, idcondicaopagamento)`] → nenhum SQL novo.
- `CobrancaBaixaAthosLog.titulos` já registra `juros/multa/atraso` por título → auditoria pronta; estorno já funciona pelos pares gravados.

### Pattern 4: Geração do boleto na EFI (reuso do corpo existente)
Corpo atual [VERIFIED: cobranca.service.ts:259-274, 283-287]: `items` (name, value em centavos, amount), `payment.banking_billet { expire_at, customer, message }`, `metadata { custom_id, notification_url }`, `POST "/v1/charge/one-step"`. **Não envia `configurations`.** Para o atualizado: mesmos itens por NF (via `montarItensEfiPorVendaItem` sobre os principais — método privado da mesma classe) + item `"Juros de mora"` e item `"Multa por atraso"` (centavos, `amount: 1`, omitir se 0). Σ itens = total (o método já ajusta o delta no último item para o total que se passa; passar o total dos PRINCIPAIS e acrescentar as duas linhas depois). `message` (≤255) pode dizer "Boleto atualizado: juros X% a.m., multa Y% — substitui boleto de DD/MM" (sem caracteres especiais é prudente). Refatorar o trecho comum (auth EFI + montar customer + POST) em método privado para não triplicar o bloco duplicado hoje em `criarBoleto`/`cancelarBoleto`/`verificarPagamentoBoleto`/`buscarDetalheBoleto` — mas sem alterar o comportamento de `criarBoleto` (suite existente cobre).

### Anti-Patterns to Avoid
- **Reusar `cobrancaService.cancelarBoleto` para o original:** ele faz `deleteMany` dos títulos e `delete` do boleto [VERIFIED: cobranca.service.ts:835-836 `await this.prisma.cobrancaBoletoTitulo.deleteMany({ where: { cobrancaBoletoId: cobrancaId } }); await this.prisma.cobrancaBoleto.delete({ where: { id: cobrancaId } });`] e prossegue mesmo se a EFI falhar (`// Não bloqueia: mesmo se EFI falhar, remove do banco`). Perde o vínculo e pode deixar boleto válido na EFI. Criar caminho novo estrito que só marca `cancelado`.
- **Calcular "hoje" com `new Date().toISOString().slice(0,10)`**: é o que `criarBoleto` faz (linha 180) e vira "amanhã" a partir das 21h em SP (UTC). Usar `hojeSaoPaulo()` [VERIFIED: athos-conta-receber-baixa.service.ts:140-149, `timeZone: "America/Sao_Paulo"`].
- **Aceitar total/juros/multa vindos do cliente.** O backend recalcula sempre; o cliente só envia vencimento e taxas.
- **Deixar o frontend calcular a data limite.** Receber `hoje` e `vencimentosPermitidos` do backend.
- **Gravar o total no `CobrancaBoletoTitulo.valor`** (quebra `VALOR_DIVERGENTE`).

## Don't Hand-Roll

| Problema | Não construir | Usar | Por quê |
|----------|---------------|------|---------|
| Juros/multa em centavos | aritmética de float | `calcularEncargosTitulo` (centavos inteiros, half-up) | Já validado contra 2 casos reais do Athos |
| Dias entre datas / somar dias | `Date` local | `diasEntre` (encargos util), `somarDias` (aviso util), `hojeSaoPaulo` | Sem drift de fuso; já testados |
| Auth/cancelamento EFI | novo client | mesmo padrão `axios.create` + `/v1/authorize` + `PUT /v1/charge/:id/cancel` | Código e env (`EFI_COBRANCA_BASE_URL`, `EFI_CLIENT_ID/SECRET`) já existem |
| Baixa no Athos | SQL novo | `AthosContaReceberBaixaService.baixarTitulos` + log/estorno da Fase 43 | Transação, idempotência (`REC` → `ja_baixado`), trilha, estorno |
| E-mail | novo mailer | `EmailEnvioService.enviarBoletoENotas` (já aceita `cobrancaBoletoId`) | CC, token de leitura, anexos de NF |
| Singleton de config | tela de CRUD | padrão `ChatwootAutomationConfig` (`id @default("default")`, get-or-create) | Convenção do repo |
| Gate de senha | novo login | `PasswordGate` + `requireAdminSession` + `adminBackendFetch` | Mesmo cookie/fluxo das Configurações |

**Key insight:** o risco desta fase não está em calcular, e sim no **ciclo de vida** (dois boletos para os mesmos títulos, cancelamento estrito, baixa com valor que não bate com a regra do Athos).

## Runtime State Inventory

Não é fase de rename/refactor: seção omitida. (Observação: a Fase muda a semântica de "cancelar" para o caso do atualizado — linhas canceladas passam a PERMANECER no banco; ver Pitfall 5.)

## Common Pitfalls

### Pitfall 1: Baixa com valor incompatível (CRÍTICO)
**O que dá errado:** boleto atualizado pago a R$ 1.022,64; baixa recalcula com `conf_financeiro` do Athos (taxa/carência próprias) → `VALOR_INCOMPATIVEL` e baixa fica em `falha`/retentativas esgotadas. **Por quê:** `decidirValoresBaixa` só aceita EFI ≈ principal+encargos-do-Athos ou EFI ≈ principal. **Evitar:** snapshot por título + caminho de encargos fixos (Pattern 3). **Sinal:** `athosBaixaStatus = "falha"` com `athosBaixaErroCodigo = "VALOR_INCOMPATIVEL"` em boleto com `boletoOrigemId`.

### Pitfall 2: Boleto cancelado ainda pode ser pago
**O que dá errado:** [CITED: dev.efipay.com.br/docs/api-cobrancas/boleto] "se o cliente imprimiu o boleto antes do cancelamento ele ainda pode pagá-lo, e o status muda de canceled para paid". O webhook localiza por `txidEfi` (`findFirst`) e, se o status local ≠ `pago`, marca `pago` e dispara baixa [VERIFIED: cobranca.service.ts:662-696] — com o original mantido como `cancelado` (linha preservada) isso passa a ser detectado, mas a reconciliação só consulta boletos `pendente` [VERIFIED: cobranca-reconciliation.job.ts:45-46 `where: { status: "pendente" }`], então só o webhook cobre. **Evitar:** manter a linha do original (não apagar); ao receber `paid` de boleto que tem sucessor ativo, logar WARN com os dois ids (pagamento duplicado possível) e seguir a baixa normal do que foi pago (dinheiro entrou). Tentar cancelar o sucessor é opcional/Open Question.

### Pitfall 3: Juros em dobro via EFI `configurations`
A EFI permite `configurations.fine` (200 = 2%) e `interest` no boleto [CITED: dev.efipay.com.br/docs/api-cobrancas/boleto]. O código atual não envia `configurations` [VERIFIED: cobranca.service.ts:259-274]. Como o total já embute juros e multa até o novo vencimento, **não enviar** fine/interest no atualizado (senão cobraria encargos duas vezes após o vencimento). Efeito colateral aceito: pagamento após o novo vencimento não acrescenta nada — o boleto vence (janela `days_to_write_off` da conta EFI é desconhecida → [ASSUMED]).

### Pitfall 4: Vencimento "hoje" na EFI
Docs EFI só dizem, para alteração de data, que deve ser "maior que a data atual"; sobre criação nada afirmam [CITED: mesma página]. O código atual aceita `expireAt == hoje(UTC)`. Se a EFI recusar vencimento = hoje, D-01 ("hoje") quebra. [ASSUMED] que aceita. **Validar em homologação** (`EFI_COBRANCA_BASE_URL` padrão é `https://cobrancas-h.api.efipay.com.br`, o host de homologação) antes de liberar; NÃO chamar escrita de produção durante a pesquisa/desenvolvimento.

### Pitfall 5: Linhas `cancelado` agora persistem
Hoje o cancelamento apaga a linha, então várias consultas nunca viram `cancelado`. Mapeadas: `buscarBoletosDashboard` (`not: "cancelado"`), `cobranca-notas.service` (`not: "cancelado"`), `criarBoleto`/`buscarTitulosComBoletoAtivo` (`in: ["pendente","pago"]`), aviso (`status: "pendente"`), reconciliação (`pendente`) — todas excluem `cancelado`. **Sem filtro:** `buscarBoletosCliente` (`where: { idclienteAthos }`) [VERIFIED: cobranca.service.ts:975-978]. Verificar se o frontend usa essa rota (`api/cobranca/boleto/cliente/...` não consta no `git ls-files` do frontend → provavelmente sem uso) e, se necessário, filtrar.

### Pitfall 6: Estado transitório com dois boletos `pendente` para os mesmos títulos
Entre o passo 5 e o 6, ou se o cancelamento do original falhar, existem 2 boletos pendentes. `titulos-em-uso` devolve uma linha por (título, boleto) e o frontend monta `Map` por título (a última vence) [VERIFIED: use-dados-cliente.ts — `boletoMap = new Map(boletoData.map(...))`]. **Evitar:** resposta `cancelamentoOriginal: "falhou"` com aviso claro e log ERROR; o original continua visível/cancelável manualmente; considerar ordenar `titulos-em-uso` para preferir o mais novo.

### Pitfall 7: Duplo clique / concorrência
Duas gerações para o mesmo original criam 2 charges. Mitigações baratas: checar sucessor ativo (`CobrancaBoleto.boletoOrigemId = original.id AND status != "cancelado"`) antes de criar; mutex em memória por id; botão desabilitado. A própria EFI bloqueia payload idêntico (cliente+valor+vencimento) com código `4600210` — já tratado em `criarBoleto` com mensagem amigável [VERIFIED: cobranca.service.ts:307-313]; replicar a tradução.

### Pitfall 8: `/configuracoes` não existe
[VERIFIED: `ls apps/frontend/src/app/configuracoes` → só `templates/`; `admin-shell.tsx` PA_NAV_ITEMS: `{ href: "/configuracoes/templates", label: "Configurações", icon: "gear" }`.] O CONTEXT assume página existente. Criar `src/app/configuracoes/cobranca/page.tsx` e dar `filhos` ao item de menu ("Templates de PDF", "Cobrança: juros e multa"). Nota: `navItemAtivo` marca ativo por prefixo `href + "/"`, então o pai deve apontar para um href que seja prefixo, ou o grupo usar `/configuracoes` como pai (precisa de uma página ou redirect `/configuracoes` → `/configuracoes/templates`).

### Pitfall 9: Total exibido no frontend
`aba-boletos.tsx` soma `t.valor` dos títulos para o total do boleto (`tsBoleto.reduce((s, t) => s + t.valor, 0)`) [VERIFIED: aba-boletos.tsx:264] → mostraria só o principal. Expor `valorTotal`/`juros`/`multa`/`boletoOrigemId` em `buscarTitulosComBoletoAtivo` e copiar os campos no mapeamento manual de `use-dados-cliente.ts` (que lista campo a campo). `BoletoDetalhe` (`DetalheBoleto.titulos`) também deve mostrar juros/multa por título.

### Pitfall 10: Feriado como "próximo dia útil"
Sem calendário (D-02/Deferred). Boleto vencendo em feriado nacional é pagável no dia útil seguinte; o cálculo só cobre até o vencimento escolhido (diferença de centavos). Aceitar em v1 e documentar na UI/ nota de rodapé. [ASSUMED: 20/11/2026 (sexta) é feriado nacional — Consciência Negra.]

### Pitfall 11: Retentativa/idempotência já existentes
`executarAposPagamento` ignora boleto com `athosBaixaStatus` `baixado`/`ja_baixado`; título já `REC` no Athos vira `ja_baixado`. Pagamento do original (cancelado, impresso) + do atualizado: o segundo cai em `ja_baixado` (sem duplicar escrita), mas o cliente pagou duas vezes — fora do escopo de automação, só alerta.

## Code Examples

### Cancelamento estrito na EFI (derivado do padrão existente)
```typescript
// Source: padrão de cobranca.service.ts:808-826 (cancelarBoleto), mas SEM engolir erro
const cancelResp = await cli.put(`/v1/charge/${original.txidEfi}/cancel`, {},
  { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
if (cancelResp.data?.code !== 200) throw new Error("EFI nao confirmou o cancelamento");
// ok → prisma.cobrancaBoleto.update({ where: { id }, data: { status: "cancelado" } })  // NÃO deletar
```

### Status na EFI antes de gerar
```typescript
// Source: cobranca.service.ts:856-858 (verificarPagamentoBoleto)
const resp = await cli.get(`/v1/charge/${txid}`, { headers: { Authorization: `Bearer ${token}` } });
const efiStatus: string = resp.data?.data?.status ?? resp.data?.data?.[0]?.status ?? "desconhecido";
// "paid" → marcar pago + this.dispararBaixaAthos(id, "reconciliacao", payload) e recusar a geração
// "canceled" → recusar; demais (new|waiting|unpaid|link) → cancelável [CITED: docs EFI]
```

### Singleton de config (molde)
```typescript
// Source: chatwoot-automation.service.ts:104-126
async getConfig() {
  const existing = await this.prisma.cobrancaEncargosConfig.findUnique({ where: { id: "default" } });
  return existing ?? this.prisma.cobrancaEncargosConfig.create({ data: { id: "default" } });
}
```
Controller: `@AdminOnly() @Get("encargos-config")` / `@AdminOnly() @Put("encargos-config")`; DTO com `@IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(...)`. ValidationPipe global é `{ whitelist: true, transform: true, forbidNonWhitelisted: true }` [VERIFIED: cobranca-baixa-athos.controller.test.ts:23-25 "Mesma configuracao do ValidationPipe global de apps/backend/src/main.ts"] — todo campo do corpo precisa estar no DTO. Atenção à ordem de rotas em `CobrancaController`: declarar `encargos-config` e `boleto/:id/atualizacao/previa` sem colidir com `boleto/dashboard|preview` e `@Delete("boleto/:id")`.

### Proxy frontend (padrões)
- Operador: `backendFetch` (chave interna) como `api/cobranca/boleto/[id]/cancelar/route.ts`; Next 16: `{ params }: { params: Promise<{ id: string }> }` + `await params`; validar `^\d+$`.
- Config: `requireAdminSession(req)` + `adminBackendFetch` como `api/cobranca/boleto/[id]/baixar-athos/route.ts` (repassar só chaves permitidas).

## State of the Art

| Antes | Agora (fase) | Impacto |
|-------|--------------|---------|
| Cancelar = apagar linha | Atualizar = marcar `cancelado` + vínculo | consultas sem filtro precisam revisão (Pitfall 5) |
| Baixa sempre recalcula encargos do Athos | Baixa com encargos fixos do snapshot (apenas para boletos atualizados) | boletos antigos seguem o caminho atual (regressão a cobrir) |

**Deprecated/outdated:** nada a remover.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "Vencimento original registrado no sistema" = `datavencimento` de cada título no Athos (não `CobrancaBoleto.expireAt`). Recomendado por consistência com a baixa (que usa `conta_receber.datavencimento` por título) e porque um boleto pode ter vários títulos com vencimentos distintos | Summary / Pattern 2 | Dias/juros calculados sobre data diferente da que o usuário espera (ex.: boleto emitido com vencimento negociado maior que o do título). **Confirmar com o usuário** |
| A2 | Faixas de validação das taxas (ex.: juros 0–20 % a.m., multa 0–20 %) | Config DTO | Bloquear valor legítimo ou aceitar absurdo; usuário deve confirmar teto |
| A3 | EFI aceita `expire_at` = hoje na criação one-step | Pitfall 4 | D-01 "hoje" falha; validar em homologação |
| A4 | Sem `configurations`, pagamento após o novo vencimento não é aceito/ não acrescenta nada (janela `days_to_write_off` da conta desconhecida) | Pitfall 3 | Cliente paga atrasado o valor sem novos juros; decisão de negócio |
| A5 | Athos aceita qualquer `juros`/`multa`/`atraso` gravado em `conta_recebida` (sem CHECK contra `conf_financeiro`) | Pattern 3 | Falha de INSERT; validar no clone `athos-teste` (Docker 127.0.0.1:5440, db `athos`), NUNCA no Athos de produção |
| A5b | Itens EFI com nomes "Juros de mora"/"Multa por atraso" são aceitos (nome livre; hoje usa "NFS-e #N", "Produtos", "Cobrança") | Pattern 4 | Recusa da EFI; fallback: um único item "Cobrança" |
| A6 | 20/11/2026 é feriado nacional | Pitfall 10 | Só nota de UI |
| A7 | Deploy com instância única (mutex em memória basta) | Pitfall 7 | Dupla geração em multi-instância; EFI 4600210 mitiga |

## Open Questions

1. **Base do atraso (A1)** — título (Athos) vs boleto (`expireAt`)? Recomendação: título, por título. Pedir confirmação no plan-phase (texto numerado, sem AskUserQuestion).
2. **Ordem criar→cancelar** — recomendado criar o novo primeiro e cancelar o original depois (cliente nunca fica sem boleto válido; falha de cancelamento vira aviso + retry). Alternativa literal D-08 "cancelar primeiro" é mais simples mas pode deixar o cliente sem boleto se a criação falhar. Planner decide; recomendado: criar → persistir → cancelar.
3. **Retry do cancelamento do original** — endpoint dedicado `POST boleto/:id/cancelar-original-atualizado`? Ou reutilizar a geração idempotente (sucessor ativo existente → só tenta cancelar). Recomendado: tornar a própria rota idempotente.
4. **Pagamento do original após cancelado (Pitfall 2)** — apenas alertar (log WARN) ou também cancelar o sucessor automaticamente? Recomendado v1: alertar.
5. **Entrada na UI** — recomendado só `aba-boletos.tsx` (única tela com modal de e-mail e cancelar por boleto); lista consolidada (`/contas-receber/boletos`) pode ganhar link para a aba do cliente (fora do mínimo).
6. **Elegibilidade** — exigir que ao menos um título tenha atraso > 0 no novo vencimento (senão 422 "nenhum título vencido"). Boleto ainda a vencer não deve ser "atualizado".
7. **Taxas editáveis**: editar as *taxas* (% a.m., % multa) com recálculo ao vivo; valores em R$ derivados. (D-06 diz "juros e multa editáveis"; interpretado como taxas.)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | build/testes | ✓ | v22.22.1 | — |
| jest (backend) | testes | ✓ | rodou `athos-baixa-encargos` + `cobranca-aviso-vencimento.util`: 42 passed | — |
| Postgres local (psql) | migration real | ✗ (sem cluster) | — | testes mockam Prisma/`pg`; migration validada por revisão de SQL + `prisma generate`/`tsc` |
| EFI homologação | validar A3/A5b | não testado (sem escrita EFI nesta pesquisa) | — | checkpoint humano antes de liberar em produção |
| Clone Athos de teste (`athos-teste`) | validar A5 | não verificado | — | só via checkpoint humano; jamais o Athos real |

**Missing dependencies with no fallback:** nenhuma que bloqueie o desenvolvimento.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jest 30 + ts-jest 29 (backend). **Frontend não tem framework de teste** (nenhum `*.test.*` em `apps/frontend/src`; fases anteriores validam com `tsc` + `next build`) |
| Config file | `apps/backend/jest.config.js` (`rootDir: 'src'`, `testRegex: '.*\\.test\\.ts$'`, `testEnvironment: 'node'`) |
| Quick run command | `npm --prefix apps/backend run test -- cobranca-boleto-atualizado --no-coverage` |
| Full suite command | `npm --prefix apps/backend run test -- --no-coverage` |
| Typecheck | `npx tsc --noEmit -p apps/backend/tsconfig.json` e `npx tsc --noEmit -p apps/frontend/tsconfig.json`; build: `npm --prefix apps/frontend run build` [VERIFIED: usado em 45-04/45-05-PLAN.md] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BA-01 | `proximoDiaUtil`: seg→ter, sex→seg, sáb→seg, dom→seg; `vencimentosPermitidos`; virada de mês/ano; "hoje" SP às 23:30 BRT (UTC já no dia seguinte) | unit (puro) | `... -- cobranca-boleto-atualizado.util` | ❌ Wave 0 |
| BA-01 | serviço recusa `novoVencimento` > máximo e < hoje | unit (mocks) | `... -- cobranca.service.boleto-atualizado` | ❌ Wave 0 |
| BA-02 | caso dourado 1000,00/8 dias/0,99%/2% = 2,64 + 20,00 = 1.022,64; dias 0 ou negativo → 0; half-up (0,005); multa só com atraso > 0; por título e soma | unit (puro) | `... -- cobranca-boleto-atualizado.util` | ❌ Wave 0 |
| BA-03 | prévia com taxas do corpo sobrepõe default; taxa negativa/acima do teto → 400 (ValidationPipe com `whitelist + forbidNonWhitelisted`) | unit (DTO) | `... -- cobranca-boleto-atualizado` | ❌ Wave 0 |
| BA-04 | `getConfig` cria default 0,99/2; `updateConfig` valida faixa; `PUT`/`GET` `@AdminOnly` (checar `__guards__` metadata como em `cobranca-baixa-athos.controller.test.ts`) | unit | `... -- cobranca-encargos-config` | ❌ Wave 0 |
| BA-05 | ordem: GET status EFI → POST one-step → create prisma → PUT cancel → update `cancelado`; itens Σ = total em centavos; original NÃO é deletado; falha do cancel → `cancelamentoOriginal:"falhou"`, original segue `pendente`, novo mantido; EFI `paid` → sincroniza e recusa; `4600210` → mensagem amigável; sucessor ativo → recusa duplicata | unit (axios/prisma/athos mockados) | `... -- cobranca.service.boleto-atualizado` | ❌ Wave 0 |
| BA-06 | `baixarTitulos` com `encargosFixos`: não lê `conf_financeiro`; INSERT com `valorpago = principal+juros+multa`, `juros`, `atraso`, `multa` do snapshot; `valorPagoEfi` divergente > 0,10 → `VALOR_INCOMPATIVEL` sem escrita; `valorPagoEfi` nulo → ok; título já `REC` → `ja_baixado`; REGRESSÃO: sem `encargosFixos` o comportamento atual intacto (suíte existente de 68 testes) | unit (mock `pg`, padrão do `athos-conta-receber-baixa.service.test.ts`) | `... -- athos-conta-receber-baixa athos-baixa-encargos` | parcial (arquivos existem; casos novos ❌) |
| BA-06 | `CobrancaBaixaAthosService.titulosParaBaixa` repassa encargos do snapshot; boleto normal não | unit | `... -- cobranca-baixa-athos.service` | parcial |
| BA-07 | e-mail aceita `cobrancaBoletoId` do boleto atualizado (suíte existente `email-envio.service.test.ts` segue verde; nenhuma mudança de backend) | regressão | `... -- email-envio` | ✅ |
| BA-08 | boleto `pago`/`cancelado`/baixado → 4xx; nenhum título vencido → 422; título não mais aberto no Athos → 4xx | unit | `... -- cobranca.service.boleto-atualizado` | ❌ Wave 0 |
| UI | modal, proxies, página de config compilam; fluxo manual de homologação | tsc + build + checkpoint humano | `npx tsc --noEmit -p apps/frontend/tsconfig.json && npm --prefix apps/frontend run build` | — |

### Sampling Rate
- **Per task commit:** teste do arquivo tocado (`-- <padrão> --no-coverage`) + `npx tsc --noEmit -p apps/backend/tsconfig.json`
- **Per wave merge:** `npm --prefix apps/backend run test -- --no-coverage` + tsc frontend
- **Phase gate:** suíte backend completa verde, `tsc` backend+frontend com 0 erros, `next build` sem falha, antes de `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `cobranca-boleto-atualizado.util.test.ts` — BA-01/BA-02 (tracer sugerido: caso dourado ponta a ponta no util)
- [ ] `cobranca.service.boleto-atualizado.test.ts` — BA-05/BA-08 (mocks: `Object.create(CobrancaService.prototype)` + `prisma`/`athosService`/`config` falsos e `jest.mock("axios")`, como em `cobranca.service.unit.test.ts`)
- [ ] `cobranca-encargos-config.service.test.ts` + teste de guarda `@AdminOnly` no controller — BA-04
- [ ] novos casos em `athos-conta-receber-baixa.service.test.ts` e `athos-baixa-encargos.util.test.ts` — BA-06
- [ ] `npm --workspace @orcamento/backend run prisma:generate` após editar o schema (senão ts-jest falha de tipo)
- Nenhum framework a instalar. Testes NUNCA tocam EFI nem Athos reais (mock `axios` e `pg`; `assertHostPermitido` recusa host real em `NODE_ENV=test`).

## Security Domain

`security_enforcement` não está desabilitado em `.planning/config.json` → incluída.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (config) | `AdminOnly` (`x-admin-api-key`) + `requireAdminSession`; guard global de chave interna nos demais |
| V3 Session Management | yes | cookie httpOnly HMAC existente (`admin-session.ts`) — não alterar |
| V4 Access Control | yes | PUT config só admin; gerar boleto = operador autenticado (como `criarBoleto`/`cancelar`) |
| V5 Input Validation | yes | class-validator com whitelist; `novoVencimento` regex `YYYY-MM-DD` + checagem contra permitidos; taxas com `@Min/@Max`, `maxDecimalPlaces`; ids `ParseIntPipe`; frontend repassa só chaves permitidas |
| V6 Cryptography | no | sem cripto nova |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Adulterar valor/total pelo cliente | Tampering | backend recalcula; corpo só tem vencimento+taxas |
| Taxas abusivas (multa 100 %) via requisição direta | Tampering | tetos no DTO e no serviço de config (A2) |
| Dupla geração / replay | Tampering / DoS | checagem de sucessor ativo + mutex + `4600210` da EFI |
| IDOR em `:id` de boleto | Elevation | ids inteiros validados; sistema é interno com chave única (mesmo modelo dos endpoints atuais) |
| Vazamento de PII em log | Info disclosure | seguir padrão: logar ids/valores, nunca nome/e-mail/linha digitável (o log atual de itens já é só valores) |
| Escrita acidental no Athos real em teste | Tampering | testes só com `pg` mockado; validação real só no clone `athos-teste` (memória do projeto: `usuario_leitura` tem INSERT no Athos de produção) |

## Project Constraints (from CLAUDE.md)
- Responder sempre em português brasileiro; perguntas ao usuário em **texto numerado**, nunca `AskUserQuestion`.
- **Não alterar código sem pedido explícito** (esta pesquisa não alterou nada); o planner/executor só implementa dentro da fase.
- Backend VPS preferencial `orcamentoapi.bomcustoilhabela.com.br`, fallback `localhost:4000`.
- Athos = PostgreSQL **9.0.5**: sem `pg_sequence_last_value`; `RETURNING` ok; introspecção via `pg_catalog`; o usuário `usuario_leitura` **tem INSERT no Athos de produção** — nunca escrita de teste nele; testes de escrita só no clone local `athos-teste` (127.0.0.1:5440).
- Regras do `~/.claude/CLAUDE.md` global são do fluxo financeiro manual (API Athos HTTP) — não se aplicam ao código desta fase.
- Convenção do repo: migrations aditivas e idempotentes; texto de logs/mensagens sem emoji; branch atual `feat/fase-42-43-cc-email-baixa-athos` (commits de fase seguem o padrão `feat(50-0N): ...`).

## Sources

### Primary (HIGH confidence)
- Código lido nesta sessão: `cobranca.service.ts` (112-352, 604-702, 773-877, 885-967, 995-1086, 1164-1385), `cobranca-baixa-athos.service.ts` (1-420, 603-776), `athos-conta-receber-baixa.service.ts` (20-210, 212-247, 377-621), `athos-baixa-encargos.util.ts` (completo), `cobranca-aviso-vencimento.util.ts`, `cobranca.controller.ts`, `email-envio.service.ts` (132-305), DTOs, `schema.prisma` (215-345, 410-445), migrations 43/45, `chatwoot-automation.*`, `admin.decorator.ts`, `admin-auth.guard.ts`, frontend: `admin-shell.tsx`, `password-gate.tsx`, `admin-session.ts`, `admin-backend-client.ts`, `backend-client.ts`, `aba-boletos.tsx`, `use-dados-cliente.ts`, `compartilhado.tsx`, routes proxy.
- Execução: `npm --prefix apps/backend run test -- athos-baixa-encargos cobranca-aviso-vencimento.util --no-coverage` → 2 suites, 42 tests passed.

### Secondary (MEDIUM confidence)
- [CITED: https://dev.efipay.com.br/docs/api-cobrancas/boleto] — `PUT /v1/charge/:id/cancel`; cancelável só em `new|waiting|unpaid|link`; boleto impresso cancelado ainda pode ser pago; `configurations.fine` (200 = 2 %) e `interest`; `days_to_write_off` 0–120; `PUT /v1/charge/:id/billet` altera só vencimento (precisa ser maior que a data atual). Página silenciosa sobre unidade de `paid_value`, regra 4600210 e vencimento = hoje na criação.

### Tertiary (LOW confidence)
- Feriado 20/11 e demais [ASSUMED] — ver Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — sem dependências novas; tudo verificado no código.
- Architecture: HIGH para fluxo interno (baixa/e-mail/frontend); MEDIUM para a ordem criar→cancelar e comportamento EFI (A3/A4).
- Pitfalls: HIGH (1, 5, 8, 9 derivados do código); MEDIUM (2, 3, 4 dependem de docs EFI).

**Research date:** 2026-11-17
**Valid until:** 2026-12-17 (código local estável; revalidar docs EFI se o contrato mudar)
