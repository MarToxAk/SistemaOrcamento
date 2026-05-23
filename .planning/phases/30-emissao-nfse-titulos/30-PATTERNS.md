# Phase 30: Emissão de NFS-e a partir de Títulos — Pattern Map

**Mapped:** 2026-05-23
**Files analyzed:** 9
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/backend/src/modules/integrations/nfse/nfse.service.ts` | service | request-response (SOAP) | próprio arquivo — adicionar método | exact (extensão) |
| `apps/backend/src/modules/cobranca/cobranca.service.ts` | service | CRUD + request-response | próprio arquivo — `criarBoleto()` | exact (extensão) |
| `apps/backend/src/modules/cobranca/cobranca.controller.ts` | controller | request-response | próprio arquivo — `@Post("boleto")` | exact (extensão) |
| `apps/backend/src/modules/cobranca/dto/emitir-nfse-cobranca.dto.ts` | DTO | — | `criar-boleto.dto.ts` | exact |
| `apps/backend/src/modules/integrations/athos/athos.service.ts` | service | CRUD (Athos PG) | próprio arquivo — `buscarTitulosClienteContasReceber()` | exact (extensão) |
| `apps/backend/src/modules/integrations/athos/athos.controller.ts` | controller | request-response | próprio arquivo — `titulosClienteContasReceber()` | exact (extensão) |
| `apps/backend/prisma/schema.prisma` | migration | — | modelo `CobrancaBoleto` / `NfseEmitida` (existente) | exact |
| `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` | component (Client) | event-driven (modal) | próprio arquivo — `boletoModal*` states | exact (extensão) |
| `apps/frontend/src/app/api/cobranca/nfse/route.ts` | route handler | request-response | `api/cobranca/boleto/route.ts` | exact |
| `apps/frontend/src/app/api/athos/venda/[idvenda]/tipo-produto/route.ts` | route handler | request-response | `api/athos/contas-receber/cliente/[idcliente]/route.ts` | exact |

---

## Pattern Assignments

---

### `apps/backend/src/modules/integrations/nfse/nfse.service.ts` — adicionar `emitirParaContaReceber()`

**Analog:** próprio arquivo `nfse.service.ts` — método `emitir()` (linhas 520–753)

**Imports já presentes** (linhas 1–9):
```typescript
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { createHash } from "crypto";
import * as soap from "soap";

import { PrismaService } from "../../database/prisma.service";
import { AthosService } from "../athos/athos.service";
import { ChatwootService } from "../chatwoot/chatwoot.service";
```

**Interface de entrada existente** (linhas 11–33):
```typescript
export interface EmitirNfseInput {
  clienteAthosId?: number;   // ← Caminho A — resolve tomador via AthosService
  servicoCodigo?: string;    // ex: "24.01", "13.05", "14.08"
  // ... outros campos de tomador manual (usados pelo fluxo de orçamentos)
}
```

**Constantes relevantes** (linhas 56–68):
```typescript
private readonly SERIE_RPS = "RPS";
private get WSDL_URL()  { return (this.config.get<string>("NFSE_SOAP_URL")?.trim() || this.DEFAULT_ENDPOINT) + "?wsdl"; }
private get AUX_URL()   { return this.config.get<string>("NFSE_AUX_URL")?.trim()  || this.DEFAULT_AUX_URL; }
```

**Padrão do getInfoNfse() — resolução de RPS** (linha 238):
```typescript
private async getInfoNfse(): Promise<{ proximoRps: number; serieRps: string } | null>
```
Retorna `null` se API Auxiliar iiBrasil indisponível. O novo método deve lançar `BadRequestException` nesse caso (não usar fallback de RPS local).

**Padrão Caminho A — resolução de tomador via clienteAthosId** (linhas 599–616):
```typescript
if (input?.clienteAthosId != null && Number.isFinite(input.clienteAthosId) && input.clienteAthosId > 0) {
  const info = await this.athosService.buscarClientePorId(input.clienteAthosId);
  if (!info) throw new BadRequestException(`Cliente Athos não encontrado. (${input.clienteAthosId})`);
  tomadorNome = info.name ?? null;
  tomadorEndereco = info.endereco ?? null;
  if (info.type === "juridico" && info.documento?.replace(/\D/g, "").length === 14) {
    tomadorCnpj = info.documento.replace(/\D/g, "");
  } else if (info.type === "fisico" && info.documento?.replace(/\D/g, "").length === 11) {
    tomadorCpf = info.documento.replace(/\D/g, "");
  }
}
```

**Padrão final do emitir() — O QUE NÃO copiar** (linhas 704–751):
```typescript
// ATENÇÃO: NÃO incluir estas linhas em emitirParaContaReceber():
await (this.prisma as any).quote.update({ ... });  // linha 704 — não há quote
// também NÃO incluir:
await this.chatwootService.sendOutgoingMessage(...); // linha 726 — sem conversationId
await this.chatwootService.sendAttachment(...);      // linha 745 — sem conversationId
```

**Retorno correto** (linha 753):
```typescript
// emitir() retorna:
return { jaEmitida: false, numero: numeroNfse, codigoVerificacao, link: linkNfse, emitidaEm: new Date().toISOString() };
// emitirParaContaReceber() deve retornar apenas:
return { numero: string; numeroRps: number; codigoVerificacao: string | null; link: string | null };
```

---

### `apps/backend/src/modules/cobranca/cobranca.service.ts` — adicionar `emitirNfse()`

**Analog:** próprio arquivo — método `criarBoleto()` (linhas 34–244)

**Imports já presentes** (linhas 1–12):
```typescript
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AthosService } from "../integrations/athos/athos.service";
import { PrismaService } from "../database/prisma.service";
import { CriarBoletoDto } from "./dto/criar-boleto.dto";
```
Adicionar ao constructor e imports: `NfseService` do módulo NfseModule.

**Padrão do constructor** (linhas 24–32):
```typescript
@Injectable()
export class CobrancaService {
  private readonly logger = new Logger(CobrancaService.name);

  constructor(
    private readonly athosService: AthosService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    // ADICIONAR:
    private readonly nfseService: NfseService,
  ) {}
```

**Padrão buscar + filtrar títulos** (linhas 36–48):
```typescript
const todosTitulos = await this.athosService.buscarTitulosClienteContasReceber(dto.idclienteAthos);
const titulosFiltrados = todosTitulos.filter((t) =>
  dto.idcontasReceber.includes(t.idcontareceber),
);
for (const id of dto.idcontasReceber) {
  if (!titulosFiltrados.find((t) => t.idcontareceber === id)) {
    throw new BadRequestException(`Título ${id} não encontrado para este cliente.`);
  }
}
```

**Padrão verificação de duplicidade** (linhas 52–65 adaptado para NFS-e):
```typescript
// Verificação de duplicidade por idvenda (D-08, D-09, D-10)
const idvenda = titulosFiltrados[0]?.idvenda ?? null;
if (idvenda !== null) {
  const existente = await this.prisma.nfseEmitida.findFirst({ where: { idvenda } });
  if (existente) {
    throw new BadRequestException(
      `NFS-e já emitida para esta venda (Nº ${existente.numeroNfse})`,
    );
  }
}
```

**Padrão salvar no Prisma com nested write** (linhas 213–232 — modelo para NfseEmitida):
```typescript
// CobrancaBoleto usa createMany para titulos — NfseEmitida usa NfseEmitidaTitulo
const nfseEmitida = await this.prisma.nfseEmitida.create({
  data: {
    numeroNfse: resultado.numero,
    numeroRps: resultado.numeroRps,
    idclienteAthos: dto.idclienteAthos,
    valorServico: dto.valor,
    idvenda: idvenda,       // null se conta_receber.idvenda for null
    titulos: {
      createMany: {
        data: titulosFiltrados.map((t) => ({
          idcontareceber: t.idcontareceber,
          valor: t.valor,
        })),
      },
    },
  },
});
```

**Padrão de tratamento de erro de serviço externo** (linhas 199–207):
```typescript
} catch (e: unknown) {
  const status = (e as { response?: { status?: number } })?.response?.status;
  const detail = (e as { response?: { data?: unknown }; message?: string })?.response?.data ??
    (e as { message?: string })?.message;
  this.logger.error(
    `Falha ao emitir NFS-e. status=${status} detalhe=${JSON.stringify(detail)}`,
  );
  throw new InternalServerErrorException("Não foi possível emitir a NFS-e.");
}
```

---

### `apps/backend/src/modules/cobranca/cobranca.controller.ts` — adicionar `POST /cobranca/nfse`

**Analog:** próprio arquivo — `@Post("boleto")` (linhas 19–22)

**Imports já presentes** (linha 1):
```typescript
import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Logger, Param, ParseIntPipe, Post, Query, Res } from "@nestjs/common";
```
Adicionar import do novo DTO: `import { EmitirNfseCobrancaDto } from "./dto/emitir-nfse-cobranca.dto";`

**Padrão de endpoint POST simples** (linhas 16–22):
```typescript
/**
 * Emite NFS-e para os títulos selecionados via iiBrasil.
 * Requer autenticação via x-internal-api-key (InternalAuthGuard global).
 */
@Post("nfse")
async emitirNfse(@Body() dto: EmitirNfseCobrancaDto) {
  return this.cobrancaService.emitirNfse(dto);
}
```

---

### `apps/backend/src/modules/cobranca/dto/emitir-nfse-cobranca.dto.ts` — novo arquivo

**Analog:** `apps/backend/src/modules/cobranca/dto/criar-boleto.dto.ts` (linhas 1–16)

**Padrão completo a copiar e adaptar:**
```typescript
// criar-boleto.dto.ts (linhas 1–16) — template exato
import { ArrayMinSize, IsArray, IsDateString, IsInt, IsPositive } from "class-validator";

export class CriarBoletoDto {
  @IsInt()
  @IsPositive()
  idclienteAthos!: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  idcontasReceber!: number[];

  @IsDateString()
  expireAt!: string;
}
```

**Adaptação necessária** — trocar `@IsDateString() expireAt` por:
```typescript
import { ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from "class-validator";

// Campos adicionados (sem expireAt):
@IsNumber()
@Min(0.01)
valor!: number;         // NFR-02: valor editado pelo operador

@IsOptional()
@IsString()
descricaoServico?: string;

@IsOptional()
@IsString()
servicoCodigo?: string; // ex: "24.01", "13.05", "14.08"
```

---

### `apps/backend/src/modules/integrations/athos/athos.service.ts` — adicionar `verificarTipoProdutoVenda()`

**Analog:** próprio arquivo — `buscarTitulosClienteContasReceber()` (linhas 1748–1810) e `verificarNFTitulos()` (linhas 1816–1863)

**Padrão de método com query Athos** (linhas 1761–1809):
```typescript
// Estrutura padrão de método com Athos PG pool:
async verificarTipoProdutoVenda(idvenda: number): Promise<{
  temProdutoFisico: boolean;
  todosServico: boolean;
}> {
  const pool = this.getPool();
  const client: PoolClient = await pool.connect();
  try {
    const result = await client.query(
      `SELECT
         BOOL_OR(p.tipoproduto) as tem_produto_fisico,
         BOOL_AND(NOT COALESCE(p.tipoproduto, false)) as todos_servico
       FROM venda_item vi
       JOIN produto p ON p.idproduto = vi.idproduto
       WHERE vi.idvenda = $1 AND COALESCE(vi.cancelada, false) = false`,
      [idvenda],
    );
    const row = result.rows[0];
    // NULL = sem itens em venda_item → permitir sem aviso (D-02, Pitfall 4)
    return {
      temProdutoFisico: row?.tem_produto_fisico ?? false,
      todosServico: row?.todos_servico ?? true,
    };
  } finally {
    client.release();  // ← SEMPRE em finally (padrão do projeto)
  }
}
```

**Padrão de tipagem de row** (linhas 1778–1806 como referência):
```typescript
// O projeto usa cast explícito: result.rows as Row[] ou result.rows[0] as Row
// Row é definido internamente (não importado)
const row = result.rows[0]; // sem cast — tipagem implícita usada nos métodos simples
```

---

### `apps/backend/src/modules/integrations/athos/athos.controller.ts` — adicionar `GET /athos/venda/:idvenda/tipo-produto`

**Analog:** próprio arquivo — `titulosClienteContasReceber()` (linhas 252–271) e `nfStatusTitulos()` (linhas 273–292)

**Padrão de endpoint GET com param de id** (linhas 252–271):
```typescript
@ApiOperation({
  summary: "Títulos individuais de um cliente (contas a receber)",
  description: "...",
})
@ApiParam({ name: "idcliente", example: "123", description: "ID do cliente no Athos" })
@ApiOkResponse({ description: "Array de títulos em aberto do cliente" })
@ApiUnauthorizedResponse({ description: "Token ausente ou inválido" })
@Get("contas-receber/cliente/:idcliente/titulos")
async titulosClienteContasReceber(
  @Param("idcliente") idcliente: string,
  @Headers("authorization") authorization?: string,
  @Headers("x-api-token") xApiToken?: string,
) {
  this.validateAthosToken(authorization, xApiToken);
  const id = Number(idcliente);
  if (!Number.isFinite(id) || id <= 0) {
    throw new BadRequestException("idcliente inválido");
  }
  return this.athosService.buscarTitulosClienteContasReceber(id);
}
```

**Adaptação para o novo endpoint:**
```typescript
@ApiOperation({ summary: "Verificar tipo de produto de uma venda (serviço vs físico)" })
@ApiParam({ name: "idvenda", example: "12345" })
@Get("venda/:idvenda/tipo-produto")
async verificarTipoProdutoVenda(
  @Param("idvenda") idvenda: string,
  @Headers("authorization") authorization?: string,
  @Headers("x-api-token") xApiToken?: string,
) {
  this.validateAthosToken(authorization, xApiToken);
  const id = Number(idvenda);
  if (!Number.isFinite(id) || id <= 0) throw new BadRequestException("idvenda inválido");
  return this.athosService.verificarTipoProdutoVenda(id);
}
```

---

### `apps/backend/prisma/schema.prisma` — adicionar `idvenda Int?` em `NfseEmitida`

**Analog:** modelo `CobrancaBoleto` e `CobrancaBoletoTitulo` (linhas 230–254); estado atual `NfseEmitida` (linhas 256–265)

**Estado atual de NfseEmitida** (linhas 256–265):
```prisma
model NfseEmitida {
  id             Int                 @id @default(autoincrement())
  numeroNfse     String?
  numeroRps      Int
  idclienteAthos Int
  valorServico   Decimal             @db.Decimal(12, 2)
  dataEmissao    DateTime            @default(now())
  criadoEm       DateTime            @default(now())
  titulos        NfseEmitidaTitulo[]
}
```

**Padrão de index em CobrancaBoletoTitulo** (linhas 252–253):
```prisma
@@index([cobrancaBoletoId])
@@index([idcontareceber])
```

**Alteração necessária** — adicionar após `criadoEm`:
```prisma
  idvenda        Int?               // D-07: venda Athos que originou a NFS-e
  @@index([idvenda])                // D-23: busca eficiente de duplicidade
```

---

### `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` — conectar modal NFS-e

**Analog:** próprio arquivo — estados do modal boleto (linhas 53–71) e funções `abreBoletoModal()` / `confirmarGerarBoleto()` (linhas 195–253)

**Padrão de states do modal boleto** (linhas 53–71):
```typescript
// Modal boleto states — copiar estrutura para modal NFS-e
const [boletoModalState, setBoletoModalState] = useState<
  "idle" | "confirm" | "loading" | "success" | "error"
>("idle");
const [expireAt, setExpireAt] = useState("");
const [boletoResult, setBoletoResult] = useState<{ ... } | null>(null);
const [boletoErro, setBoletoErro] = useState("");
```

**Padrão de abreBoletoModal()** (linhas 195–210) — template para `abreNfseModal()`:
```typescript
function abreBoletoModal() {
  // 1. Calcular/pré-preencher campos
  // 2. Setar modalState = "confirm"
  setBoletoModalState("confirm");
}
```

**Padrão de confirmarGerarBoleto()** (linhas 212–251) — template para `confirmarEmitirNfse()`:
```typescript
async function confirmarGerarBoleto() {
  setBoletoModalState("loading");                              // ← setar loading PRIMEIRO
  const titulosSelecionados = titulos.filter((t) => selectedIds.has(t.idcontareceber));
  try {
    const res = await fetch("/api/cobranca/boleto", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idclienteAthos: Number(idcliente), idcontasReceber: ..., expireAt }),
    });
    const data = await res.json().catch(() => ({ error: "Resposta inválida." }));
    if (!res.ok) {
      setBoletoErro(data?.message ?? data?.error ?? "Erro desconhecido.");
      setBoletoModalState("error");
    } else {
      setBoletoResult(data);
      setBoletoModalState("success");
    }
  } catch (err) {
    setBoletoErro("Falha na conexão.");
    setBoletoModalState("error");
  }
}
```

**Padrão de fecharBoletoModal()** (localizado por grep — referenciado nas linhas 575, 591, 762, etc.):
```typescript
function fecharBoletoModal() {
  setBoletoModalState("idle");
  // limpar states derivados
}
```

**Padrão de JSX do modal** (linhas 572–840):
```tsx
{boletoModalState !== "idle" && (
  <div className="boleto-modal-backdrop" onClick={boletoModalState !== "loading" ? fecharBoletoModal : undefined}>
    <div className="boleto-modal-card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
      {/* HEADER */}
      <div className="boleto-modal-header">...</div>
      {/* ESTADO 1 — CONFIRMAÇÃO */}
      {boletoModalState === "confirm" && (<> <div className="boleto-modal-body">...</div> <div className="boleto-modal-footer">...</div> </>)}
      {/* ESTADO 2 — LOADING */}
      {boletoModalState === "loading" && (<div className="boleto-modal-body">spinner</div>)}
      {/* ESTADO 3 — SUCESSO */}
      {boletoModalState === "success" && boletoResult && (<> <div className="boleto-modal-body">...</div> <div className="boleto-modal-footer">...</div> </>)}
      {/* ESTADO 4 — ERRO */}
      {boletoModalState === "error" && (<> <div className="boleto-modal-body">mensagem de erro</div> <div className="boleto-modal-footer">botão fechar</div> </>)}
    </div>
  </div>
)}
```

**Ponto de conexão do botão** (linhas 558–566):
```tsx
<button
  type="button"
  className="btn btn-primary"
  onClick={() => {
    /* TODO: Phase 30 — Emitir NFS-e */   ← SUBSTITUIR por onClick={abreNfseModal}
  }}
>
  <i className="bi bi-file-earmark-text me-1" />Emitir NFS-e
</button>
```

**Padrão de CSS inline do modal** (linhas 842–882 da `<style>` tag):
```css
.boleto-modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 1050; display: flex; align-items: center; justify-content: center; }
.boleto-modal-card { background: #fff; border-radius: 12px; width: 100%; max-width: 540px; max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,.18); }
```
Usar os mesmos prefixos CSS com `nfse-modal-*` em vez de `boleto-modal-*`, ou reutilizar as mesmas classes de estilo.

---

### `apps/frontend/src/app/api/cobranca/nfse/route.ts` — novo Route Handler POST

**Analog:** `apps/frontend/src/app/api/cobranca/boleto/route.ts` (linhas 1–48)

**Padrão completo a copiar e adaptar** (linhas 1–48):
```typescript
import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend-client";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body) {
    return NextResponse.json({ error: "Body inválido ou ausente." }, { status: 400 });
  }

  const { idclienteAthos, idcontasReceber, expireAt } = body as Record<string, unknown>;

  if (typeof idclienteAthos !== "number" || !Number.isFinite(idclienteAthos) || idclienteAthos <= 0) {
    return NextResponse.json({ error: "idclienteAthos inválido ou ausente." }, { status: 400 });
  }

  if (!Array.isArray(idcontasReceber) || idcontasReceber.length === 0 ||
      !idcontasReceber.every((id) => typeof id === "number" && Number.isFinite(id))) {
    return NextResponse.json({ error: "idcontasReceber deve ser um array não vazio de números." }, { status: 400 });
  }

  try {
    const res = await backendFetch("/cobranca/boleto", {   // ← trocar por "/cobranca/nfse"
      method: "POST",
      body: JSON.stringify({ idclienteAthos, idcontasReceber, expireAt }),
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => ({ error: "Resposta inválida do backend." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
```

**Adaptação:** trocar `expireAt` por `valor` (number) na desestruturação e validação:
```typescript
const { idclienteAthos, idcontasReceber, valor, descricaoServico, servicoCodigo } = body as Record<string, unknown>;
// validação de valor:
if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) {
  return NextResponse.json({ error: "valor deve ser um número positivo." }, { status: 400 });
}
```

---

### `apps/frontend/src/app/api/athos/venda/[idvenda]/tipo-produto/route.ts` — novo Route Handler GET

**Analog:** `apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/route.ts` (linhas 1–31)

**Padrão completo a copiar e adaptar** (linhas 1–31):
```typescript
import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend-client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ idcliente: string }> },  // ← trocar por { idvenda: string }
) {
  const { idcliente } = await params;  // ← trocar por idvenda
  const id = Number(idcliente);         // ← trocar por Number(idvenda)
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "idcliente inválido." }, { status: 400 });
  }

  const athosToken = process.env.INTERNAL_API_KEY ?? "";
  const extraHeaders: Record<string, string> = athosToken ? { "x-api-token": athosToken } : {};

  try {
    const res = await backendFetch(`/athos/contas-receber/cliente/${id}/dados`, {
      // ← trocar por: `/athos/venda/${id}/tipo-produto`
      method: "GET",
      headers: extraHeaders,
    });
    const data = await res.json().catch(() => ({ error: "Resposta inválida do backend." }));
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
```

---

## Shared Patterns

### Autenticação x-internal-api-key (backend)
**Fonte:** `apps/backend/src/modules/cobranca/cobranca.controller.ts` linha 9 — `@Controller("cobranca")`
**Aplicar a:** `POST /cobranca/nfse` e `GET /athos/venda/:idvenda/tipo-produto`

O guard `InternalAuthGuard` é **global** — todos os endpoints sem `@Public()` exigem `x-internal-api-key` automaticamente. Nenhuma decoração adicional necessária nos novos endpoints.

### Autenticação x-api-token (endpoints Athos)
**Fonte:** `apps/backend/src/modules/integrations/athos/athos.controller.ts` linhas 47–65
```typescript
private validateAthosToken(authorization?: string, xApiToken?: string): void {
  const requiredToken = process.env.ATHOS_API_TOKEN;
  if (!requiredToken) throw new InternalServerErrorException("ATHOS_API_TOKEN nao configurado");
  const provided = xApiToken || (authorization?.startsWith("Bearer ") ? authorization.slice(7) : authorization) || undefined;
  if (!provided) throw new UnauthorizedException("Token invalido ou ausente");
  // ... timingSafeEqual
}
```
**Aplicar a:** `GET /athos/venda/:idvenda/tipo-produto` — chamar `this.validateAthosToken(authorization, xApiToken)` no início do método.

### Injeção de x-api-token no Route Handler frontend (Athos)
**Fonte:** `apps/frontend/src/app/api/athos/contas-receber/cliente/[idcliente]/route.ts` linhas 15–18
```typescript
const athosToken = process.env.INTERNAL_API_KEY ?? "";
const extraHeaders: Record<string, string> = athosToken ? { "x-api-token": athosToken } : {};
```
**Aplicar a:** `apps/frontend/src/app/api/athos/venda/[idvenda]/tipo-produto/route.ts`

### backendFetch — proxy server-side
**Fonte:** `apps/frontend/src/lib/backend-client.ts` (arquivo completo)
```typescript
export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${BACKEND_URL()}${path}`;
  const headers = internalHeaders(init?.headers as Record<string, string> | undefined);
  return fetch(url, { ...init, headers, cache: "no-store" });
}
```
**Aplicar a:** todos os novos Route Handlers (`/api/cobranca/nfse/route.ts`, `/api/athos/venda/[idvenda]/tipo-produto/route.ts`)

### Padrão Pool/PoolClient + finally release (Athos queries)
**Fonte:** `apps/backend/src/modules/integrations/athos/athos.service.ts` linhas 1761–1809
```typescript
const pool = this.getPool();
const client: PoolClient = await pool.connect();
try {
  const result = await client.query(SQL, [params]);
  return result.rows;
} finally {
  client.release();  // ← SEMPRE em finally — nunca falhar silenciosamente
}
```
**Aplicar a:** `verificarTipoProdutoVenda()` em `athos.service.ts`

### NfseModule em CobrancaModule — sem forwardRef
**Fonte:** `apps/backend/src/modules/cobranca/cobranca.module.ts` (linhas 1–13) + `apps/backend/src/modules/integrations/nfse/nfse.module.ts` (linhas 1–15)

Estado atual de `CobrancaModule`:
```typescript
@Module({
  imports: [EfiModule, AthosModule],
  controllers: [CobrancaController],
  providers: [CobrancaService],
})
```
Adicionar `NfseModule` nos imports (sem `forwardRef` — não há ciclo):
```typescript
imports: [EfiModule, AthosModule, NfseModule],
```
`NfseModule` já declara `exports: [NfseService]` — disponível após import.

---

## No Analog Found

Nenhum arquivo desta fase ficou sem analog. Todos os 9 arquivos têm padrão direto no codebase.

---

## Metadata

**Analog search scope:** `apps/backend/src/modules/cobranca/`, `apps/backend/src/modules/integrations/athos/`, `apps/backend/src/modules/integrations/nfse/`, `apps/backend/prisma/`, `apps/frontend/src/app/contas-receber/`, `apps/frontend/src/app/api/cobranca/`, `apps/frontend/src/app/api/athos/`, `apps/frontend/src/lib/`
**Files scanned:** 18
**Pattern extraction date:** 2026-05-23
