# Phase 30: Emissão de NFS-e a partir de Títulos - Research

**Researched:** 2026-05-23
**Domain:** NFS-e / SOAP iiBrasil · NestJS · Prisma · Next.js
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Verificação de tipoproduto (tabela produto via venda_item)**
- D-01: Antes de abrir o modal de NFS-e, verificar todos os produtos da venda via `venda_item JOIN produto`. Campo: `tipoproduto boolean`. Tabela de itens: `venda_item` (não `item_venda`).
- D-02: todos_servico = `BOOL_AND(NOT p.tipoproduto) = true` → pode emitir normalmente; tem_produto_fisico = `BOOL_OR(p.tipoproduto) = true` → aviso amarelo; sem itens → permitir sem aviso.
- D-03: Aviso NÃO bloqueia a emissão — apenas informativo.
- D-04: Query SQL de verificação (validada no banco):
  ```sql
  SELECT BOOL_OR(p.tipoproduto) as tem_produto_fisico,
         BOOL_AND(NOT COALESCE(p.tipoproduto,false)) as todos_servico
  FROM venda_item vi JOIN produto p ON p.idproduto = vi.idproduto
  WHERE vi.idvenda = $1 AND COALESCE(vi.cancelada,false) = false
  ```
- D-05: Novo método `AthosService.verificarTipoProdutoVenda(idvenda)` → `{ temProdutoFisico: boolean, todosServico: boolean }`.
- D-06: Novo endpoint `GET /athos/venda/:idvenda/tipo-produto` no `AthosController`.

**Prevenção de Duplicidade via idvenda**
- D-07: Adicionar campo `idvenda Int?` na tabela `NfseEmitida` (Prisma migration).
- D-08: Antes de emitir, verificar `prisma.nfseEmitida.findFirst({ where: { idvenda: titulo.idvenda } })` → erro 400 se existente.
- D-09: Verificação por `idvenda`, não por `idcontareceber`.
- D-10: Se `conta_receber.idvenda` for NULL, pular verificação e permitir emissão.

**Salvar NFS-e no Banco**
- D-11: `NfseEmitida` armazena: id, numeroNfse, numeroRps, idclienteAthos, valorServico, dataEmissao, idvenda, idcontareceber[] (via NfseEmitidaTitulo), criadoEm.
- D-12: Salvar em `NfseEmitida` após emissão bem-sucedida com `idvenda` preenchido.
- D-13: `NfseEmitidaTitulo` mantém `idcontareceber` vinculados para rastreabilidade.

**Modal de Emissão**
- D-14: Modal 3 etapas: Confirmação → Loading → Sucesso.
- D-15: Valor = soma dos títulos selecionados, ajustável pelo operador.
- D-16: Dados do tomador via `buscarClientePorId(idclienteAthos)`.

**Vinculação à Página de Orçamento**
- D-17: Fluxo `/orcamento/[id]` deve salvar `idvenda` em `NfseEmitida` quando emitir por lá.
- D-18: Antes de emitir em `/orcamento/[id]`, verificar se `NfseEmitida.idvenda` já tem registro.
- D-19: Não duplicar funcionalidade — apenas adicionar verificação e salvar `idvenda`.

**Módulo Backend**
- D-20: Lógica fica em `CobrancaService` — método `emitirNfse(dto)`.
- D-21: `CobrancaService.emitirNfse()` injeta `NfseService` para reutilizar SOAP iiBrasil.
- D-22: Novo endpoint `POST /cobranca/nfse` — body: `{ idclienteAthos, idcontasReceber, valor, descricaoServico?, aliquotaIss? }`.

**Schema Prisma**
- D-23: Migration adiciona `idvenda Int?` em `NfseEmitida`. Index em `idvenda`.
- D-24: `NfseService.emitir()` atualizado para salvar `idvenda` quando disponível (parâmetro opcional).

### Claude's Discretion
- Badge de status na sub-tabela de títulos para NFS-e emitidas (similar ao boleto) — mostrar "NFS-e #XX".
- `CobrancaModule` já importa `EfiModule + AthosModule` — verificar ciclo de dependência ao importar `NfseModule` e usar `forwardRef` se necessário.

### Deferred Ideas (OUT OF SCOPE)
- Histórico de NFS-e visível na página do cliente → Phase 31.
- Emissão de NF-e de produto (DANFE) → fora do escopo deste sistema.
- Cancelamento de NFS-e emitida → fora do escopo desta fase.
- Interface de listagem global de NFS-e emitidas → futuro.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NFR-01 | Modal de NFS-e abre pré-preenchido com valor dos títulos e dados do cliente via buscarClientePorId | Confirmado: NfseService.emitir() aceita clienteAthosId; buscarClientePorId() retorna { id, name, type, documento, endereco } completo |
| NFR-02 | Campo de valor editável; valor enviado ao NfseService é o valor editado, não o calculado | Confirmado: NfseService.emitir() aceita valorServicos explícito; o planner deve criar DTO com campo `valor` independente da soma dos títulos |
| NFR-03 | NfseService.emitirNfse() chamado com tomador resolvido via clienteAthosId; RPS sem conflito com orçamentos | Confirmado: NfseService.emitir() já resolve tomador via clienteAthosId (Caminho A); RPS vem de getInfoNfse() (API Auxiliar iiBrasil) — não conflita |
| NFR-04 | Registro criado em nfse_emitida com numeroNfse, numeroRps, idclienteAthos, valorServico e idcontareceber[] | Confirmado: NfseEmitida + NfseEmitidaTitulo já existem no schema; precisam da migration para adicionar idvenda |
</phase_requirements>

---

## Summary

A Fase 30 integra o fluxo de emissão de NFS-e ao módulo de Contas a Receber. O core técnico (SOAP iiBrasil, resolução de tomador, validação de RPS) está completamente implementado no `NfseService.emitir()` existente — **não há reescrita necessária**. A fase consiste em: (1) criar um novo método `CobrancaService.emitirNfse()` que delega ao `NfseService`, (2) adicionar campo `idvenda Int?` ao schema Prisma com migration, (3) implementar a verificação de tipo de produto via nova query no `AthosService`, e (4) conectar o botão "Emitir NFS-e" na página `/contas-receber/[idcliente]` a um modal com 3 estados.

O padrão de implementação está totalmente estabelecido pelo módulo de boleto (Fase 29): o modal do frontend replica a estrutura `boleto-modal-*` com variáveis de estado analysis, o backend segue o padrão `CobrancaService.criarBoleto()` com delegate para serviço externo, e o Route Handler Next.js segue `backendFetch` com validação de body.

O único risco técnico relevante é o ciclo de dependência ao importar `NfseModule` dentro de `CobrancaModule` — `NfseModule` já exporta `NfseService`, mas `NfseModule` importa `AthosModule` e `ChatwootModule`, enquanto `CobrancaModule` já importa `AthosModule`. Isso não cria ciclo circular entre módulos (NestJS suporta importação múltipla do mesmo módulo), portanto `forwardRef` provavelmente não será necessário.

**Recomendação primária:** Importar `NfseModule` em `CobrancaModule`, injetar `NfseService` no construtor de `CobrancaService`, e seguir estritamente o padrão do boleto para todas as camadas. Não reimplementar nada do SOAP.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Emissão SOAP iiBrasil | API / Backend (NfseService) | — | SOAP é server-side; cliente nunca acessa diretamente |
| Resolução de tomador | API / Backend (NfseService via AthosService) | — | Athos está em rede interna; resolução no backend |
| Verificação tipo produto | API / Backend (AthosService) | — | Query direta no PostgreSQL Athos; server-side |
| Persistência NfseEmitida | Database / Storage (Prisma) | API (CobrancaService) | Prisma gerencia o banco próprio |
| Modal de emissão (UI) | Browser / Client (Next.js Client Component) | — | Estado do modal é totalmente client-side |
| Route Handler proxy | Frontend Server (Next.js API Route) | — | Injeta x-internal-api-key server-side |
| Prevenção de duplicidade | API / Backend (CobrancaService) | — | Verificação antes de chamar SOAP |
| Verificação produto físico | API / Backend (AthosService) | Frontend (aviso UI) | Resultado exibido como aviso informativo |

---

## Standard Stack

### Core (já presente no projeto — nenhuma instalação necessária)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| NestJS | 10.x | Backend framework | Stack padrão do projeto [ASSUMED] |
| Prisma | 5.x | ORM / migrations | Stack padrão do projeto [ASSUMED] |
| Next.js | 15.x | Frontend + API Routes | Stack padrão do projeto [ASSUMED] |
| `soap` (npm) | já instalado | SOAP client iiBrasil | Usado por NfseService existente [VERIFIED: codebase] |
| `class-validator` | já instalado | DTO validation | Usado em CriarBoletoDto existente [VERIFIED: codebase] |

### Nenhum pacote novo necessário

Esta fase **não requer instalação de novos pacotes**. Toda a funcionalidade nova é implementada com o que já está no projeto.

---

## Package Legitimacy Audit

> Nenhum pacote externo novo a ser instalado nesta fase. Seção não aplicável.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Frontend (Browser)
  └── onClick "Emitir NFS-e"
        │
        ├── [pré-modal] GET /api/athos/venda/:idvenda/tipo-produto
        │     └── Route Handler → backendFetch → GET /athos/venda/:idvenda/tipo-produto
        │           └── AthosService.verificarTipoProdutoVenda() → Athos PG (venda_item JOIN produto)
        │
        └── Modal confirm → POST /api/cobranca/nfse
              └── Route Handler → backendFetch → POST /cobranca/nfse
                    └── CobrancaService.emitirNfse(dto)
                          ├── [1] AthosService.buscarClientePorId() → tomador
                          ├── [2] prisma.nfseEmitida.findFirst({ where: { idvenda } }) → duplicidade
                          ├── [3] NfseService.emitir(quoteId=null, input) → SOAP iiBrasil
                          │         └── getInfoNfse() → API Auxiliar (proximoRps)
                          │         └── enviarSoap() → iibr.com.br
                          └── [4] prisma.nfseEmitida.create() → banco próprio
```

### Recommended Project Structure

```
apps/backend/src/modules/cobranca/
├── cobranca.controller.ts        # adicionar POST nfse
├── cobranca.service.ts           # adicionar emitirNfse()
├── cobranca.module.ts            # adicionar NfseModule nos imports
└── dto/
    ├── criar-boleto.dto.ts       # existente
    └── emitir-nfse-cobranca.dto.ts  # NOVO

apps/backend/src/modules/integrations/athos/
├── athos.service.ts              # adicionar verificarTipoProdutoVenda()
└── athos.controller.ts           # adicionar GET venda/:idvenda/tipo-produto

apps/backend/prisma/
└── schema.prisma                 # adicionar idvenda Int? em NfseEmitida
    migrations/
    └── YYYYMMDD_add_idvenda_nfse_emitida/  # NOVA migration

apps/frontend/src/app/
├── contas-receber/[idcliente]/
│   └── page.tsx                  # conectar onClick + adicionar modal NFS-e
└── api/
    ├── cobranca/nfse/
    │   └── route.ts              # NOVO Route Handler
    └── athos/venda/[idvenda]/tipo-produto/
        └── route.ts              # NOVO Route Handler
```

### Pattern 1: CobrancaService.emitirNfse() — Padrão idêntico ao criarBoleto()

**O que é:** Método no CobrancaService que valida, chama serviço externo, persiste no banco.
**Quando usar:** Toda operação de cobrança/fiscal que precisa de delegação a serviço externo.

```typescript
// Source: apps/backend/src/modules/cobranca/cobranca.service.ts (padrão criarBoleto)
async emitirNfse(dto: EmitirNfseCobrancaDto): Promise<EmitirNfseCobrancaResponseDto> {
  // 1. Verificar duplicidade por idvenda (se idvenda não for null)
  const titulo = await this.athosService.buscarTitulosClienteContasReceber(dto.idclienteAthos)
    .then(ts => ts.filter(t => dto.idcontasReceber.includes(t.idcontareceber)));
  
  const idvenda = titulo[0]?.idvenda ?? null; // idvenda do primeiro título (deve ser o mesmo para todos)
  
  if (idvenda !== null) {
    const existente = await this.prisma.nfseEmitida.findFirst({ where: { idvenda } });
    if (existente) {
      throw new BadRequestException(
        `NFS-e já emitida para esta venda (Nº ${existente.numeroNfse})`,
      );
    }
  }

  // 2. Verificar tipo produto (informativo, não bloqueia)
  // — feito no frontend via endpoint separado antes de abrir o modal

  // 3. Emitir via NfseService (já existente)
  const resultado = await this.nfseService.emitir("_from_cobranca_", {
    clienteAthosId: dto.idclienteAthos,
    // valor: dto.valor é passado como override no input
  });

  // 4. Salvar NfseEmitida com vinculação de títulos
  const nfseEmitida = await this.prisma.nfseEmitida.create({
    data: {
      numeroNfse: resultado.numero,
      numeroRps: Number(resultado.rpsNumero),
      idclienteAthos: dto.idclienteAthos,
      valorServico: dto.valor,
      idvenda: idvenda,
      titulos: {
        createMany: {
          data: titulo.map(t => ({ idcontareceber: t.idcontareceber, valor: t.valor })),
        },
      },
    },
  });

  return { nfseEmitidaId: nfseEmitida.id, numeroNfse: resultado.numero, ... };
}
```

**Nota importante:** `NfseService.emitir()` recebe `quoteId` como primeiro parâmetro e usa para buscar o orçamento no banco próprio. Para o fluxo de contas a receber, não há `quoteId` — o valor e o tomador vêm diretamente via `input.clienteAthosId`. Precisamos adaptar: passar um `quoteId` fictício/stub que não será usado (já que `clienteAthosId` é fornecido, o método segue o Caminho A e não usa `quoteId` para buscar o orçamento), **exceto** para a chamada `this.prisma.quote.update()` no final que salva no model `Quote`. Para o fluxo de contas a receber, essa atualização do Quote não deve acontecer — a persistência é em `NfseEmitida`.

**Solução arquitetural:** Criar um método novo `NfseService.emitirNfseInput()` que aceita só o `EmitirNfseInput` sem `quoteId` e retorna `{ numero, rpsNumero, codigoVerificacao, link }` **sem** chamar `prisma.quote.update()`. Alternativa: reutilizar a lógica interna de emissão SOAP extraindo o método privado. Verificar o código atual — o método `emitir()` obrigatoriamente atualiza o Quote no banco. [VERIFIED: codebase]

### Pattern 2: Novo método emitirComInput() no NfseService

**O que é:** Variante de `emitir()` que não requer `quoteId` nem atualiza o model `Quote`.
**Quando usar:** Fluxo de emissão iniciado fora do contexto de orçamento.

A análise do código de `NfseService.emitir()` revela que as linhas 704-713 sempre executam:
```typescript
await (this.prisma as any).quote.update({
  where: { id: quote.id },
  data: { nfseNumero, nfseCodigoVerificacao, nfseLink, nfseEmitidaEm },
});
```
Isso **não pode ser chamado** para o fluxo de contas a receber (não há `quote`). A solução mais limpa é adicionar um método `emitirParaContaReceber()` no `NfseService` que:
1. Resolve o tomador diretamente via `clienteAthosId` (sem buscar quote)
2. Gera o XML, envia SOAP, parseia resposta
3. Retorna `{ numero, numeroRps, codigoVerificacao, link }` **sem** atualizar o banco de quotes
4. NÃO envia Chatwoot (fluxo de contas a receber não tem conversationId)

### Pattern 3: Modal NFS-e — Replicar estrutura do modal boleto

**O que é:** Modal React com 3 estados (confirm/loading/success) dentro do mesmo arquivo de página.
**Quando usar:** Qualquer modal de ação na página do cliente.

```tsx
// Source: apps/frontend/src/app/contas-receber/[idcliente]/page.tsx (padrão boletoModal)
const [nfseModalState, setNfseModalState] = useState<"idle" | "confirm" | "loading" | "success" | "error">("idle");
const [nfseValor, setNfseValor] = useState("");
const [nfseResult, setNfseResult] = useState<{ numeroNfse: string; numeroRps: number; valor: number } | null>(null);
const [nfseErro, setNfseErro] = useState("");
const [avisoFisico, setAvisoFisico] = useState(false); // aviso de produto físico

// Ao clicar "Emitir NFS-e":
async function abreNfseModal() {
  // 1. Calcular valor padrão = soma dos títulos selecionados
  setNfseValor(totalSelecionado.toFixed(2));
  // 2. Se títulos têm idvenda, verificar tipoproduto
  const idvenda = titulosSelecionados[0]?.idvenda;
  if (idvenda) {
    const res = await fetch(`/api/athos/venda/${idvenda}/tipo-produto`);
    const data = await res.json();
    setAvisoFisico(data.temProdutoFisico ?? false);
  }
  setNfseModalState("confirm");
}
```

### Pattern 4: Route Handler para NFS-e — Padrão backendFetch

```typescript
// Source: apps/frontend/src/app/api/cobranca/boleto/route.ts (padrão)
// apps/frontend/src/app/api/cobranca/nfse/route.ts (NOVO)
import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend-client";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  
  const { idclienteAthos, idcontasReceber, valor } = body as Record<string, unknown>;
  // validações...
  
  const res = await backendFetch("/cobranca/nfse", {
    method: "POST",
    body: JSON.stringify({ idclienteAthos, idcontasReceber, valor }),
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({ error: "Resposta inválida." }));
  return NextResponse.json(data, { status: res.status });
}
```

### Anti-Patterns to Avoid

- **Reimplementar SOAP no CobrancaService:** Toda a lógica SOAP (buildRpsXml, enviarSoap, integridade, parsing) fica exclusivamente no `NfseService`. CobrancaService delega.
- **Chamar `NfseService.emitir()` com quoteId fictício:** O método sempre tenta `prisma.quote.findFirst` e `prisma.quote.update` — criaria erro. Criar método separado `emitirParaContaReceber()`.
- **Bloquear emissão por produto físico:** D-03 explicita que é apenas aviso. Não adicionar guard que impeça a emissão.
- **Verificar duplicidade por `idcontareceber`:** D-09 especifica que a verificação é por `idvenda`. Múltiplos títulos da mesma venda colapsam em uma única NFS-e.
- **Usar `forwardRef` desnecessariamente:** NestJS suporta importação de um módulo em múltiplos módulos sem circular dependency, desde que não haja dependência mútua real entre CobrancaModule e NfseModule.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SOAP para iiBrasil | Implementar nova chamada SOAP | `NfseService.emitirParaContaReceber()` | Hash de integridade SHA-512, decodificação de HTML entities, encoding específico — edge cases resolvidos |
| Resolução de tomador (PF/PJ/endereço) | Reimplementar lookup Athos | `AthosService.buscarClientePorId()` | Lida com cliente_fisico/cliente_juridico/cliente_endereco — já testado em produção |
| Numeração sequencial RPS | Gerenciar numeração local | `NfseService.getInfoNfse()` via API Auxiliar iiBrasil | API Auxiliar retorna o próximo RPS válido — numeração local causaria conflitos |
| Proxy Next.js para backend | Rewrites next.config.mjs | Route Handler com `backendFetch` | Padrão estabelecido — injeta `x-internal-api-key` server-side automaticamente |

**Key insight:** O NfseService é o resultado de múltiplas fases de correção (Phases 14-22). Qualquer reimplementação parcial vai repetir os mesmos bugs de encoding, integridade e resolução de tomador que foram corrigidos iterativamente.

---

## Common Pitfalls

### Pitfall 1: Chamar NfseService.emitir() com quoteId null/fictício

**What goes wrong:** `NfseService.emitir()` executa `this.findQuote(quoteId)` na linha 521, que retorna `null` para string vazia/fictícia, causando `throw new BadRequestException("Orçamento não encontrado")`. Mesmo que superado com um quoteId real, o método faz `prisma.quote.update()` no final, que salvaria o número de NFS-e no model errado.

**Why it happens:** O método foi projetado para o fluxo de orçamentos, não para o fluxo genérico.

**How to avoid:** Criar método separado `NfseService.emitirParaContaReceber(input: EmitirNfseInput): Promise<{numero, numeroRps, ...}>` que reutiliza os métodos privados mas não acessa o model `Quote`.

**Warning signs:** Erro `"Orçamento não encontrado"` nos logs ao chamar endpoint `/cobranca/nfse`.

### Pitfall 2: Ciclo de dependência ao importar NfseModule em CobrancaModule

**What goes wrong:** NfseModule importa AthosModule. CobrancaModule também importa AthosModule. Isso **não é um ciclo** — NestJS resolve corretamente. O ciclo ocorreria se NfseModule importasse CobrancaModule (que importa NfseModule).

**Why it happens:** Confusão entre "módulo importado em múltiplos lugares" (válido) e "módulo A importa B que importa A" (ciclo real).

**How to avoid:** Simplesmente adicionar `NfseModule` aos `imports` de `CobrancaModule`. `NfseModule` já tem `exports: [NfseService]`. Não usar `forwardRef` — não é necessário.

**Warning signs:** Erro `"Nest cannot create the CobrancaModule instance"` ao iniciar o backend. Nesse caso, investigar a cadeia de dependência real.

### Pitfall 3: idvenda NULL em conta_receber para títulos antigos

**What goes wrong:** D-10 especifica que se `conta_receber.idvenda` for NULL, pular verificação de duplicidade. Mas se o operador emitir NFS-e para títulos sem idvenda, não haverá proteção contra emissão dupla.

**Why it happens:** Títulos mais antigos podem não ter `idvenda` preenchido no Athos.

**How to avoid:** Aceitar esse comportamento conforme D-10. A verificação de duplicidade é best-effort. Salvar `idvenda: null` em `NfseEmitida` — a coluna é `Int?`.

**Warning signs:** Múltiplas `NfseEmitida` com `idvenda = null` para o mesmo cliente — inofensivo mas auditável.

### Pitfall 4: Verificação de tipo produto bloqueando título sem venda_item

**What goes wrong:** A query `SELECT BOOL_OR(p.tipoproduto)...` retorna NULL quando não há rows (título sem venda_item). Interpretar NULL como `temProdutoFisico = true` resultaria em falso positivo.

**Why it happens:** Aggregate functions retornam NULL para conjunto vazio.

**How to avoid:** Tratar resultado NULL como `{ temProdutoFisico: false, todosServico: true }` — conforme D-02: "Título sem itens em venda_item → permitir sem aviso".

**Warning signs:** Modal exibindo aviso de produto físico para títulos manuais (sem venda associada).

### Pitfall 5: NfseService.emitir() salva numeroNfse no Quote após emissão

**What goes wrong:** Se `emitirParaContaReceber()` for baseado em `emitir()` via copy-paste, o desenvolvedor pode esquecer de remover a linha que atualiza `prisma.quote`. Isso causaria erro runtime pois `quote` seria `undefined`.

**Why it happens:** `emitir()` tem 280 linhas — é fácil perder o bloco de persistência no final.

**How to avoid:** O novo método no `NfseService` deve terminar logo após `parseNumeroNfse/parseCodigoVerificacao/parseLinkNfse` e retornar os dados, **sem** chamar `prisma.quote.update()` e **sem** chamar `chatwootService`.

**Warning signs:** Erro `"Cannot read properties of undefined (reading 'id')"` nos logs ao emitir pelo fluxo de contas a receber.

---

## Code Examples

### Prisma Migration — Adicionar idvenda em NfseEmitida

```prisma
// Source: apps/backend/prisma/schema.prisma (estado atual)
model NfseEmitida {
  id             Int                 @id @default(autoincrement())
  numeroNfse     String?
  numeroRps      Int
  idclienteAthos Int
  valorServico   Decimal             @db.Decimal(12, 2)
  dataEmissao    DateTime            @default(now())
  criadoEm       DateTime            @default(now())
  // ADICIONAR:
  idvenda        Int?
  titulos        NfseEmitidaTitulo[]

  @@index([idvenda])  // ADICIONAR para busca de duplicidade eficiente
}
```

### AthosService.verificarTipoProdutoVenda()

```typescript
// Source: apps/backend/src/modules/integrations/athos/athos.service.ts (NOVO método)
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
    // NULL = sem itens → permitir sem aviso (D-02)
    return {
      temProdutoFisico: row?.tem_produto_fisico ?? false,
      todosServico: row?.todos_servico ?? true,
    };
  } finally {
    client.release();
  }
}
```

### EmitirNfseCobrancaDto

```typescript
// Source: Padrão de CriarBoletoDto (apps/backend/src/modules/cobranca/dto/criar-boleto.dto.ts)
// apps/backend/src/modules/cobranca/dto/emitir-nfse-cobranca.dto.ts (NOVO)
import { ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from "class-validator";

export class EmitirNfseCobrancaDto {
  @IsInt()
  @IsPositive()
  idclienteAthos!: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @IsPositive({ each: true })
  idcontasReceber!: number[];

  @IsNumber()
  @Min(0.01)
  valor!: number;  // valor editado pelo operador — NFR-02

  @IsOptional()
  @IsString()
  descricaoServico?: string;

  @IsOptional()
  @IsString()
  servicoCodigo?: string;  // ex: "24.01", "13.05", "14.08" — passa para NfseService
}
```

### NfseService.emitirParaContaReceber()

```typescript
// Source: apps/backend/src/modules/integrations/nfse/nfse.service.ts (NOVO método)
// Reutiliza lógica interna de emitir() sem acesso ao model Quote
async emitirParaContaReceber(input: {
  clienteAthosId: number;
  valor: number;
  servicoCodigo?: string;
  discriminacao?: string;
}): Promise<{
  numero: string;
  numeroRps: number;
  codigoVerificacao: string | null;
  link: string | null;
}> {
  // 1. Resolver tomador via clienteAthosId (mesmo código do Caminho A em emitir())
  const info = await this.athosService.buscarClientePorId(input.clienteAthosId);
  if (!info) throw new BadRequestException(`Cliente Athos ${input.clienteAthosId} não encontrado`);
  
  // 2. Resolver RPS via API Auxiliar
  let rpsNumero: number;
  let rpsSerie = this.SERIE_RPS;
  const infoNfse = await this.getInfoNfse();
  if (infoNfse) {
    rpsNumero = infoNfse.proximoRps;
    rpsSerie = infoNfse.serieRps || this.SERIE_RPS;
  } else {
    throw new BadRequestException("API Auxiliar iiBrasil indisponível. Não é possível obter número RPS seguro.");
  }

  // 3. Montar XML e enviar SOAP (reutiliza buildRpsXml, enviarSoap, computeIntegridade)
  // ... (copiar lógica de buildRpsXml call de emitir(), sem quote.update no final)
  
  // 4. Retornar { numero, numeroRps, codigoVerificacao, link }
  // SEM chamar prisma.quote.update() e SEM enviar Chatwoot
}
```

### AthosController — Novo endpoint tipo produto

```typescript
// Source: apps/backend/src/modules/integrations/athos/athos.controller.ts (NOVO endpoint)
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

### Frontend — Route Handler tipo produto

```typescript
// apps/frontend/src/app/api/athos/venda/[idvenda]/tipo-produto/route.ts (NOVO)
import { NextRequest, NextResponse } from "next/server";
import { backendFetch } from "@/lib/backend-client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ idvenda: string }> },
) {
  const { idvenda } = await params;
  const id = Number(idvenda);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "idvenda inválido." }, { status: 400 });
  }
  const athosToken = process.env.INTERNAL_API_KEY ?? "";
  const extraHeaders: Record<string, string> = athosToken ? { "x-api-token": athosToken } : {};
  try {
    const res = await backendFetch(`/athos/venda/${id}/tipo-produto`, {
      method: "GET",
      headers: extraHeaders,
    });
    const data = await res.json().catch(() => ({ error: "Resposta inválida." }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: "Falha ao conectar no backend." }, { status: 500 });
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| NFS-e emitida apenas via orçamento | NFS-e emitida também via contas a receber | Phase 30 | Operador pode emitir NFS-e sem criar orçamento |
| NfseEmitida sem campo idvenda | NfseEmitida com idvenda para prevenção de duplicidade | Phase 30 migration | Evita NFS-e dupla entre fluxos de orçamento e contas a receber |
| Verificação de tipo produto inexistente | Aviso informativo de produto físico no modal | Phase 30 | Operador informado sobre necessidade de NF-e de produto separada |

**Deprecated / outdated:**
- `NfseService.emitir(quoteId)`: não deprecated, mas não adequado para fluxo sem quoteId. Adicionar `emitirParaContaReceber()` como complemento.

---

## Runtime State Inventory

> Fase de nova feature (não é rename/refactor). Apenas migration Prisma relevante.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `NfseEmitida` (tabela já existe, ~0 registros em produção — fase 28 recente) | Migration adiciona `idvenda Int?` — non-breaking, nullable |
| Live service config | Nenhum | — |
| OS-registered state | Nenhum | — |
| Secrets/env vars | `NFSE_TOKEN`, `NFSE_CNPJ_PRESTADOR`, `NFSE_INSCRICAO_MUNICIPAL`, `NFSE_SOAP_URL`, `NFSE_AUX_URL` — já configurados e em uso pela Phase 14+ | Nenhum — reutilizar |
| Build artifacts | Nenhum | — |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL (banco próprio) | Prisma / NfseEmitida | Confirmado — projeto em produção | — | — |
| PostgreSQL (Athos) | AthosService queries | Confirmado — usado pelas Fases 27-29 | — | — |
| iiBrasil SOAP endpoint | NfseService | Confirmado — usado desde Phase 14 | — | — |
| iiBrasil API Auxiliar | NfseService.getInfoNfse() | Confirmado — usado desde Phase 18 | — | — |
| NFSE_* env vars | NfseService | Confirmado — configurados desde Phase 14 | — | — |

**Missing dependencies with no fallback:** nenhum.

---

## Validation Architecture

> `workflow.nyquist_validation` não está definido em config.json — tratado como habilitado.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (NestJS default) |
| Config file | apps/backend/jest.config.ts (inferido dos testes existentes como `nfse.service.test.ts`) |
| Quick run command | `cd apps/backend && npx jest nfse --testPathPattern nfse` |
| Full suite command | `cd apps/backend && npx jest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NFR-01 | Modal abre pré-preenchido com dados do cliente | manual (UI) | — | N/A |
| NFR-02 | Valor editado é o enviado ao backend | unit | `npx jest cobranca.service` | ❌ Wave 0 |
| NFR-03 | NfseService.emitirParaContaReceber() chama SOAP corretamente | unit (mock SOAP) | `npx jest nfse.service` | Parcial — nfse.service.test.ts existe |
| NFR-04 | NfseEmitida criada com campos corretos após emissão | unit | `npx jest cobranca.service` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd apps/backend && npx jest --testPathPattern "(nfse|cobranca)" --passWithNoTests`
- **Per wave merge:** `cd apps/backend && npx jest`
- **Phase gate:** Full suite green antes do `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `apps/backend/src/modules/cobranca/cobranca.service.nfse.spec.ts` — cobre NFR-02 e NFR-04
- [ ] Atualizar `apps/backend/src/modules/integrations/nfse/nfse.service.test.ts` — adicionar test para `emitirParaContaReceber()`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | sim — endpoint `/cobranca/nfse` requer auth | `InternalAuthGuard` via `x-internal-api-key` (padrão global do projeto) |
| V3 Session Management | não | — |
| V4 Access Control | sim — validação de token Athos em novos endpoints | `validateAthosToken()` existente em AthosController |
| V5 Input Validation | sim | `class-validator` no `EmitirNfseCobrancaDto`; validações no Route Handler |
| V6 Cryptography | indireta — iiBrasil usa SHA-512 para integridade | `NfseService.computeIntegridade()` já implementado |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Emissão de NFS-e sem autenticação | Elevation of Privilege | InternalAuthGuard bloqueia todos os endpoints POST sem x-internal-api-key |
| SSRF via endpoint tipo-produto | Tampering | id validado como inteiro positivo no Route Handler antes de chamar backend |
| Duplicidade de NFS-e por race condition | Tampering | `prisma.nfseEmitida.findFirst` antes de emitir — risco baixo (operação humana) |
| Valor negativo ou zero na NFS-e | Tampering | `@Min(0.01)` no DTO + validação no NfseService (`valorServicos` deve ser > 0) |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `NfseEmitida` tem ~0 registros em produção — migration non-breaking | Runtime State Inventory | Se houver registros, a migration `ALTER TABLE ADD COLUMN idvenda INT` é idempotente (nullable) — sem risco |
| A2 | `CobrancaModule` importando `NfseModule` não cria circular dependency | Architecture Patterns / Pitfall 2 | Se criar ciclo (improvável), usar `forwardRef(() => NfseModule)` |
| A3 | RPS via API Auxiliar iiBrasil é o único mecanismo seguro de numeração | Don't Hand-Roll | Se API Auxiliar estiver indisponível, lançar erro — não gerar RPS local |
| A4 | NestJS 10.x versão exata | Standard Stack | Stack nota do projeto — versão exata não verificada |
| A5 | Prisma 5.x versão exata | Standard Stack | Stack nota do projeto — versão exata não verificada |

**Assumptions A4 e A5 são de baixo risco** — as versões exatas não afetam o plano.

---

## Open Questions

1. **Integração do `emitirParaContaReceber()` com discriminação**
   - O que sabemos: `NfseService.emitir()` usa descrição dos itens do orçamento como discriminação.
   - O que não está claro: Para emissão por contas a receber, qual deve ser o texto de discriminação? Título(s) do contas a receber? Número do pedido (numeroordem)?
   - Recomendação: Usar `dto.descricaoServico` se fornecido; caso contrário, gerar discriminação baseada nos títulos: `"Serviços - Títulos ${idcontasReceber.join(', ')}"`. Deixar como discretion do planner/desenvolvedor.

2. **Atualização do fluxo de orçamentos para salvar idvenda (D-17, D-24)**
   - O que sabemos: D-24 pede que `NfseService.emitir()` salve `idvenda` quando disponível.
   - O que não está claro: Como obter `idvenda` no contexto de emissão via orçamento? O quote tem `saleExternalId` (BigInt) que provavelmente é o `idvenda` do Athos.
   - Recomendação: No método `emitir()`, após a emissão, tentar buscar `idvenda` via `AthosService.buscarRelacaoOrcamentoVenda(quote.externalQuoteId)` e salvar em `NfseEmitida`. Se não encontrar, salvar `idvenda: null`.

---

## Sources

### Primary (HIGH confidence)
- `apps/backend/src/modules/integrations/nfse/nfse.service.ts` — interface completa do `NfseService.emitir()` e `EmitirNfseInput`
- `apps/backend/src/modules/cobranca/cobranca.service.ts` — padrão arquitetural `criarBoleto()`
- `apps/backend/src/modules/integrations/athos/athos.service.ts` — interface de `buscarClientePorId()`, `buscarTitulosClienteContasReceber()`, padrão de queries Athos
- `apps/backend/prisma/schema.prisma` — estado atual do schema: `NfseEmitida` sem `idvenda`, `NfseEmitidaTitulo` com `idcontareceber`
- `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` — estado atual do botão com `/* TODO: Phase 30 */`, padrão de modal boleto
- `apps/frontend/src/app/api/cobranca/boleto/route.ts` — padrão Route Handler com `backendFetch`
- `apps/frontend/src/lib/backend-client.ts` — `backendFetch` + `internalHeaders()`
- `apps/backend/src/modules/cobranca/cobranca.module.ts` — imports atuais: `[EfiModule, AthosModule]`
- `apps/backend/src/modules/integrations/nfse/nfse.module.ts` — `exports: [NfseService]`
- `.planning/phases/30-emissao-nfse-titulos/30-CONTEXT.md` — decisões arquiteturais D-01..D-24

### Secondary (MEDIUM confidence)
- `.planning/REQUIREMENTS.md` — NFR-01..NFR-04 detalhados
- `.planning/STATE.md` — histórico de decisões das Fases 14-29

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — totalmente verificado no codebase
- Architecture: HIGH — padrões extraídos diretamente do código existente (Fase 29)
- Pitfalls: HIGH — identificados por análise direta do código `NfseService.emitir()` e `CobrancaService.criarBoleto()`
- Prisma migration: HIGH — schema lido diretamente, campo ausente confirmado

**Research date:** 2026-05-23
**Valid until:** 2026-06-23 (30 dias — stack estável)
