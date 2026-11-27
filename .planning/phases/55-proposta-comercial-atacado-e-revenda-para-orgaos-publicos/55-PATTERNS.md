# Phase 55: Proposta comercial atacado e revenda para orgaos publicos - Pattern Map

**Mapped:** 2026-11-27
**Files analyzed:** 19 (novos ou modificados)
**Analogs found:** 16 / 19

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/backend/src/modules/propostas/propostas.module.ts` | module | request-response | `apps/backend/src/modules/cobranca/cobranca.module.ts` | role-match |
| `apps/backend/src/modules/propostas/propostas.controller.ts` | controller | request-response | `apps/backend/src/modules/cobranca/cobranca.controller.ts` (`@AdminOnly()` L6, L224) | exact |
| `apps/backend/src/modules/propostas/propostas.service.ts` | service | CRUD + external write | `apps/backend/src/modules/integrations/athos/athos-orcamento.service.ts` (transacao) | role-match |
| `apps/backend/src/modules/propostas/propostas-calc.util.ts` | utility | transform | `apps/backend/src/modules/integrations/athos/athos-orcamento-calc.util.ts` | exact |
| `apps/backend/src/modules/propostas/propostas-pdf.service.ts` | service | file-I/O | `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts` | role-match |
| `apps/backend/src/modules/integrations/athos/athos-orcamento.service.ts` (+`criarOrcamentoProposta`, +`buscarProdutosProposta`) | service | batch write / read | si mesmo (`criarOrcamento` L428) | exact |
| `apps/backend/src/modules/integrations/athos/athos-orcamento-idempotencia.service.ts` (uso de `refDoOrcamento`) | utility | transform | si mesmo (L44-49) | exact |
| `apps/backend/src/modules/integrations/athos/athos.service.ts` (+`buscarClienteParaProposta`, campo `razaoSocial` aditivo) | service | CRUD (read) | `athos.service.ts` `buscarClientes` (~L1369) | exact |
| `apps/backend/prisma/schema.prisma` (modelos `Proposta`, `PropostaItem`, config/assinantes) | model | CRUD | `PdfTemplate` (L404-415) | role-match |
| `apps/backend/src/modules/pdf-templates/pdf-templates.service.ts` (`activate` com familia) | service | CRUD | si mesmo (L106-119) | exact |
| `apps/backend/src/modules/pdf-templates/pdf-templates.repository.ts` (`getActiveSource(familia)`) | service | CRUD | si mesmo (L20-27) | exact |
| `apps/backend/scripts/seed-pdf-templates.ts` (`isActive` so no create para PROPOSTA) | config | batch | si mesmo (upsert L67-70) | exact |
| `apps/backend/templates/proposta-institucional.hbs` | config (template) | transform | `apps/backend/templates/` presets existentes (`colorful`/`minimal`/`classic`) | role-match |
| `apps/frontend/src/app/propostas/page.tsx` | component (page) | CRUD | `apps/frontend/src/app/contas-receber/` paginas | role-match |
| `apps/frontend/src/app/propostas/[id]/page.tsx` | component (page) | CRUD | `apps/frontend/src/app/contas-receber/` paginas | role-match |
| `apps/frontend/src/app/contas-receber/admin-shell.tsx` (+item "Propostas" em `PA_NAV_ITEMS` L13) | component (layout) | request-response | si mesmo (L13-21) | exact |
| `apps/frontend/src/app/api/propostas/**/route.ts` | route handler (proxy) | request-response | `apps/frontend/src/app/api/athos/clientes/route.ts` | exact |
| `apps/frontend/src/app/api/athos/clientes/[idcliente]/notas-fiscais/route.ts` (referencia de `params` Promise) | route handler | request-response | si mesmo (L7) | exact |
| `apps/backend/src/modules/propostas/*.test.ts` | test | — | `apps/backend/src/modules/integrations/athos/athos-orcamento-calc.util.test.ts` (Jest 30) | role-match |

## Pattern Assignments

### `apps/backend/src/modules/propostas/propostas-calc.util.ts` (utility, transform)

**Analog:** `apps/backend/src/modules/integrations/athos/athos-orcamento-calc.util.ts`

**Reusar (exportados, nao reescrever)** (L65-145):
- `paraMilli(v)`, `paraCentavos(v)`: conversao com recusa de mais de 3/2 casas.
- `linhaCentavos(qMilli, vMilli)`: linha em centavos half-up.
- `centavosParaTexto`, `milliParaTexto`: formatacao.
- `LIMITE_LINHA_CENTAVOS` (L28): teto `numeric(9,3)`.

**Erro tipado** (L11-22): copiar o padrao `CalcOrcamentoError(codigo, message, indice?)`, com codigos proprios (ex.: `PRECO_INVALIDO`).

**Funcao nova obrigatoria (D-02, D-23, D-03):** `ajustarPrecoCentavos` com BigInt, sem `Math.ceil` em float. Esboco validado na pesquisa:
```typescript
export function ajustarPrecoCentavos(precoMilli: bigint, pctMilli: bigint): bigint {
  const num = precoMilli * (100_000n + pctMilli);
  const den = 1_000_000n;
  return (num + den - 1n) / den; // ceil, valido para num positivo
}
```
Conferido: 3,50 +10% -> 385; 2,90 +15% -> 334; 3,456 sem ajuste -> 346 (D-23).

**Nao usar** `calcularOrcamento` (L182) nem a regra D-04 (`valoritem = max(vu, precoMilli)`, L205, L216-217). `calcularLinhasProposta` retorna `valorItem = precoFinal`, `desconto = 0`, sem rateio (`ratear`, L108) e sem `permitedescontode`.

**Custo com COALESCE por termo (D-24):** a formula de `SQL_LER_PRODUTOS` (`athos-orcamento.service.ts` L192-197) zera o custo quando qualquer imposto e NULL. Usar a versao com `COALESCE(p.imposto,0)+...` (ver bloco SQL em Code Examples do RESEARCH). Nao corrigir a Fase 44 (debito registrado).

**Margem (D-27):** `margem = (preco - custo) / preco`, calculada em centavos.

**Testes:** seguir `athos-orcamento-calc.util.test.ts` (Jest 30). Comando: `cd /root/SistemaOrcamento/apps/backend && npx jest --no-coverage propostas-calc`.

---

### `apps/backend/src/modules/integrations/athos/athos-orcamento.service.ts` (+`criarOrcamentoProposta`) (service, batch write)

**Analog:** o proprio `criarOrcamento` (L428-~660). Metodo novo, `criarOrcamento` fica intocado.

**Gate de escrita proprio (D-30)** — copiar o padrao de L430-437, trocando a env:
```typescript
// Padrao de criarOrcamento L431-437; para propostas usar PROPOSTA_ESCRITA_ATIVA
if (process.env.PROPOSTA_ESCRITA_ATIVA !== "true") {
  throw new OrcamentoAthosError(
    "ESCRITA_DESABILITADA",
    "A escrita de propostas no Athos esta desabilitada (PROPOSTA_ESCRITA_ATIVA diferente de true). Nada foi gravado.",
    503,
  );
}
const cfg = resolverConfigOrcamentoAthos(process.env); // reaproveitar (D-29: forma de pagamento da Fase 44)
```

**Conexao e transacao** (L447-458, L643, L648): `this.assertHostPermitido()`, `pool.connect()`, `BEGIN`, `SQL_STATEMENT_TIMEOUT`, `COMMIT`, `ROLLBACK` no catch. Mesmo esqueleto.

**Validacao de config antes de escrever** (L474-495): `funcionario_ok`, `vendedor_ok`, `terminal_ok`, `pix_ok`, `cliente_ok` via `SQL_LER_CONFIG`. Reusar; incluir `cliente_ok` (D-14/D-15).

**Insert do cabecalho** (SQL_INSERIR_ORCAMENTO, L199-203) — usar `RETURNING idorcamento, senhabalcao`, com `descontors = 0`, `desconto = 0`, `obs = '[PROPOSTA] ref:<12 hex>'` (sem observacao de usuario, D-21):
```typescript
const cab = await client.query<{ idorcamento: number; senhabalcao: number }>(SQL_INSERIR_ORCAMENTO, [
  /* ...parametros como L612 */
]);
```
Para a data do PDF, ler `to_char(dataorcamento,'YYYY-MM-DD')` e `to_char(hora,'HH24:MI:SS')` no mesmo fluxo (Pitfall 13).

**Insert de itens** (SQL_INSERIR_ITEM, L205-208): `valoritem = preco final`, `valordesconto = 0`, `orcamentodesconto = 0`, `orcamentovalorfinalitem = linhaCentavos(q, preco)` (D-03). Nao usar `observacao` com texto do usuario.

**Pagamento** (SQL_LIMPAR_PAGAMENTO L210; SQL_INSERIR_PAGAMENTO L212-213; uso L639-640): `DELETE` + `INSERT` com `idformapagamento = cfg.idFormaPagamento`.

**Regra de transacao (Pitfall 11):** so INSERTs dentro do `BEGIN`; sem PDF, sem MinIO, sem HTTP. Sem INSERT em CTE (regras DO ALSO em `orcamento`).

**Erros:** `mapearErroPg(err)` (L396) e `OrcamentoAthosError` (L40 tipos).

---

### `apps/backend/src/modules/integrations/athos/athos-orcamento.service.ts` (+`buscarProdutosProposta`) (service, read)

**Analog:** `buscarProdutos(q, limit)` (L720) e `lerSomenteLeitura` (L688-707: BEGIN, leitura, ROLLBACK).

Retornar custo unitario (D-12) em rota **propria** — o endpoint da IA (`athos-orcamento.controller.ts:40`) nao pode expor custo. Preco base = `precovendaproduto(idproduto)` (D-01).

---

### `apps/backend/src/modules/integrations/athos/athos-orcamento-idempotencia.service.ts` (utility)

**Reusar** `refDoOrcamento(base)` (L49): sha256 truncado em 12 hex. Usar `base = idPropostaUUID`. Marcador: `[PROPOSTA] ref:<ref>`. Recuperacao por `obs LIKE '[PROPOSTA] ref:' || $ref || '%'` (hex, sem escape).

---

### `apps/backend/src/modules/integrations/athos/athos.service.ts` (+`buscarClienteParaProposta`) (service, read)

**Analog:** `buscarClientes` (~L1369): `nome` = `nomefantasia` antes de `razaosocial` (Pitfall 8).

**Regra:** adicionar campo **aditivo** `razaoSocial` (nao renomear `nome`, usado por NFS-e e `TomadorAthosSearch`). Sem fallbacks inventados (`Centro`, `S/N`, `SP`, `3520400`): ausente vira `null` e o PDF mostra "nao informado" (D-25).

Contato: `emailcliente` e `c.dddtelefoneempresa || c.telefoneempresa` (~L1167-1168, `buscarDadosClienteContasReceber`).

---

### `apps/backend/src/modules/pdf-templates/pdf-templates.service.ts` (service, CRUD) — familia PROPOSTA

**Analog:** si mesmo, `activate` (L106-119).

**Problema atual (Pitfall 5):** L113 desativa todos os templates sem filtro:
```typescript
// ATUAL (L112-115)
const [, updated] = await this.prisma.$transaction([
  this.prisma.pdfTemplate.updateMany({ data: { isActive: false } }),
  this.prisma.pdfTemplate.update({ where: { id }, data: { isActive: true } }),
]);
```
**Alvo:** `updateMany({ where: { familia: template.familia }, data: { isActive: false } })`. Repetir o filtro em `list` e na galeria.

---

### `apps/backend/src/modules/pdf-templates/pdf-templates.repository.ts` (service, CRUD)

**Analog:** si mesmo, `getActiveSource` (L20-27):
```typescript
// ATUAL (L21-24): sem familia
const active = await this.prisma.pdfTemplate.findFirst({
  where: { isActive: true },
  select: { source: true },
});
```
**Alvo:** `getActiveSource(familia: PdfTemplateFamilia = "ORCAMENTO")` com `where: { isActive: true, familia }`. `resolveTemplateSource` de `quotes-pdf-storage.service.ts` (~L268) passa `ORCAMENTO` explicitamente.

---

### `apps/backend/prisma/schema.prisma` (model) — familia e modelos novos

**Analog:** `model PdfTemplate` (L404-415):
```prisma
model PdfTemplate {
  id        String          @id @default(cuid())
  name      String
  slug      String          @unique
  source    String          @db.Text
  kind      PdfTemplateKind
  isActive  Boolean         @default(false)
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  @@index([isActive])
}
```
**Alvo:** adicionar `familia` (enum `ORCAMENTO | PROPOSTA`, `@default(ORCAMENTO)`, backfill das linhas existentes) e `@@index([familia, isActive])`. Modelos `Proposta` e `PropostaItem` seguem o padrao `cuid` + `createdAt/updatedAt`; `idclienteAthos Int` sem FK (padrao de `CobrancaBoleto`). Migracao aditiva SQL, validada em Postgres descartavel.

---

### `apps/backend/scripts/seed-pdf-templates.ts` (config, batch)

**Analog:** si mesmo, upsert (L67-70):
```typescript
// ATUAL: update sobrescreve isActive a cada boot
update: { name, source, isActive: preset.isActive },
```
**Alvo para PROPOSTA:** gravar `isActive` apenas no `create` (nao no `update`). Para ORCAMENTO, manter e registrar a divida (Pitfall 6).

---

### `apps/backend/src/modules/propostas/propostas.controller.ts` (controller, request-response)

**Analog:** `apps/backend/src/modules/cobranca/cobranca.controller.ts`
- Import L6: `import { AdminOnly } from "../security/admin.decorator";`
- Uso L220-224:
```typescript
  @AdminOnly()
  @Post(...)
```
Rotas estaticas (`nova`, `duplicar`) antes de `:id`. DTOs com `class-validator` (whitelist global).

---

### `apps/backend/src/modules/propostas/propostas.service.ts` — lancar com compare-and-set (Pattern 2)

Antes de qualquer chamada ao Athos:
```typescript
const reservado = await this.prisma.proposta.updateMany({
  where: { id, status: "RASCUNHO" },
  data: { status: "LANCANDO", lancandoEm: new Date() },
});
if (reservado.count !== 1) {
  throw new ConflictException("Proposta ja esta sendo lancada ou ja foi enviada.");
}
```
Depois do COMMIT no Athos: `idorcamentoAthos` + `ENVIADA`. Falha local apos COMMIT: fica `LANCANDO` e a recuperacao consulta o marcador `ref`. Falha no PDF nao relanca no Athos.

---

### `apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts` — PDF multipagina (propostas-pdf.service.ts)

**Analog:** `renderPdfBuffer` (L336-352). Forca uma pagina:
```typescript
// L341-349 (NAO reusar para proposta)
const contentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
const scale = contentHeight > A4_HEIGHT_PX ? A4_HEIGHT_PX / contentHeight : 1;
return Buffer.from(await page.pdf({
  format: "A4",
  printBackground: true,
  scale: Math.max(0.1, Math.min(scale, 1)),
  margin: { top: "0", right: "0", bottom: "0", left: "0" },
}));
```
**Variante para proposta:** sem `scale`, com `displayHeaderFooter` e margens reais. Manter `shouldAllowRequest` (rede bloqueada) e o Handlebars restrito (`knownHelpersOnly`). **Nao** adicionar helpers Handlebars: formatar valores em TypeScript antes do `template(...)`.

Armazenamento: `QuotesPdfStorageService` (MinIO), prefixo `propostas/`.

**Textos:** nao usar `sanitizarTextoAthos` (`athos-conta-receber-baixa.service.ts:166-174`) no PDF; ele remove acentos. Usar apenas no `obs` do Athos.

---

### `apps/backend/templates/proposta-institucional.hbs` (template)

**Analog:** presets existentes em `apps/backend/templates/` (`colorful`, `minimal`, `classic`; enum `PdfTemplateKind`). Preset novo da familia PROPOSTA, perfil institucional (D-22), sem URL externa, sem `<script>`, sem marca. Dados bancarios vem de configuracao (D-18), nao hardcoded. Sem custo, margem, valor por extenso.

---

### `apps/frontend/src/app/contas-receber/admin-shell.tsx` (layout) — item de menu

**Analog:** `PA_NAV_ITEMS` (L13-21):
```typescript
export const PA_NAV_ITEMS: PaNavItem[] = [
  {
    href: "/contas-receber",
    label: "Contas a Receber",
    icon: "cash-coin",
    filhos: [
      { href: "/contas-receber", label: "Resumo e Clientes", icon: "people" },
      { href: "/contas-receber/boletos", label: "Boletos", icon: "upc-scan" },
```
Adicionar item `{ href: "/propostas", label: "Propostas", icon: "<bootstrap-icon>" }`. Renderizacao em L72-80 nao muda.

---

### `apps/frontend/src/app/api/propostas/**/route.ts` (route handler, proxy)

**Analog:** `apps/frontend/src/app/api/athos/clientes/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend-client";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  try {
    const res = await backendFetch(`/athos/clientes${qs ? `?${qs}` : ""}`, { method: "GET" });
    const data = await res.json().catch(() => ({ error: "Resposta inválida do backend." }));
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
```
**Rotas dinamicas (Next 16):** `params` e Promise. Referencia: `app/api/athos/clientes/[idcliente]/notas-fiscais/route.ts:7`:
```typescript
export async function GET(req: NextRequest, { params }: { params: Promise<{ idcliente: string }> }) {
  const { idcliente } = await params;
  // ...
}
```

---

### `apps/frontend/src/app/propostas/page.tsx` e `[id]/page.tsx` (page)

**Analog:** paginas de `apps/frontend/src/app/contas-receber/` (usar `AdminShell` e `PasswordGate` de `components/password-gate.tsx`, cookie `orcamento_admin_session`).
- Cliente: reusar `ClienteAutocomplete` (`app/contas-receber/cliente-autocomplete.tsx:28`); hoje recebe `clientes` como prop.
- Confirmacao do botao "Gerar proposta e lancar no Athos" (D-07): dialogo de confirmacao antes da chamada.
- Linha abaixo do custo (D-13): destaque vermelho, sem bloquear.

---

### Testes (Jest 30)

**Analog:** `athos-orcamento-calc.util.test.ts` (260 linhas) e `pdf-templates.service.test.ts`.
- Calculo: casos de ceil (3,50 +10% -> 3,85; 1,10 +10% -> 1,21), 3,456 sem ajuste -> 3,46, NULL de imposto -> custo nao zerado.
- Templates: ativar PROPOSTA nao muda o ativo de ORCAMENTO; segundo seed nao altera `isActive` de PROPOSTA.
- Nota: `pdf-templates.presets.test.ts` (L212 em diante) replica a lista de presets e nao pega regressao no seed real.
- `athos-orcamento.service.test.ts` fica INTOCADO (regressao da Fase 44, 95 testes).

## Shared Patterns

### Escrita no Athos (flag, pool, transacao)
**Source:** `apps/backend/src/modules/integrations/athos/athos-orcamento.service.ts` L428-460, L643-648
**Apply to:** `criarOrcamentoProposta`
- Flag antes de qualquer conexao; `assertHostPermitido()`; `BEGIN` + `SQL_STATEMENT_TIMEOUT`; `COMMIT`; `ROLLBACK` no catch; `mapearErroPg`.
- Testes de escrita so no clone `athos-teste` (`memory/athos_postgres_9_0_5.md`). Athos de producao e PostgreSQL 9.0.5: sem `ON CONFLICT`, `FILTER`, `LATERAL`, `jsonb`.

### Aritmetica monetaria
**Source:** `apps/backend/src/modules/integrations/athos/athos-orcamento-calc.util.ts` L28, L65-145
**Apply to:** `propostas-calc.util.ts`, snapshot, PDF
- BigInt em milesimos e centavos. Nunca `Math.ceil` em float.

### Templates de PDF por familia
**Source:** `apps/backend/src/modules/pdf-templates/pdf-templates.service.ts` L106-119; `pdf-templates.repository.ts` L20-27
**Apply to:** `activate`, `getActiveSource`, galeria, seed
- Sempre filtrar por `familia`.

### Acesso administrativo
**Source:** `apps/backend/src/modules/cobranca/cobranca.controller.ts` L6, L224 (`@AdminOnly()`); `apps/frontend/src/components/password-gate.tsx`
**Apply to:** controller de propostas, paginas `/propostas`

### Proxy de frontend
**Source:** `apps/frontend/src/app/api/athos/clientes/route.ts`
**Apply to:** todas as rotas `app/api/propostas/**`

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Renderizacao PDF multipagina (`propostas-pdf.service.ts` render) | service | file-I/O | `renderPdfBuffer` forca uma pagina; usar a variante descrita acima (RESEARCH Pattern 4) |
| Recuperacao de orfao depois do COMMIT (`recuperarLancamento`) | service | batch | Padrao de idempotencia da Fase 44 existe (`refDoOrcamento`), mas nao ha metodo de consulta por marcador pronto; usar RESEARCH Pattern 2 |

## Metadata

**Analog search scope:** `apps/backend/src/modules/integrations/athos/`, `apps/backend/src/modules/pdf-templates/`, `apps/backend/src/modules/quotes/`, `apps/backend/src/modules/cobranca/`, `apps/backend/prisma/schema.prisma`, `apps/backend/scripts/`, `apps/frontend/src/app/api/athos/`, `apps/frontend/src/app/contas-receber/`
**Files scanned:** 14 lidos com trechos; todos os caminhos citados sao rastreados pelo git (`git ls-files` confirmado)
**Pattern extraction date:** 2026-11-27
**Ressalva:** numeros de linha vem da pesquisa (55-RESEARCH.md) e foram conferidos nos trechos lidos; trechos marcados como "~" nao foram relidos nesta sessao.
