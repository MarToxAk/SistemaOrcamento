# Phase 6: Aprovação de Orçamento pelo Cliente com Associação Athos — Pesquisa

**Pesquisado:** 2026-05-01
**Domínio:** NestJS (backend), Next.js App Router (frontend), Prisma ORM, Chatwoot, integração Athos (read-only)
**Confiança geral:** HIGH — todos os achados foram verificados diretamente no codebase

---

<user_constraints>
## Restrições do Usuário (de 06-CONTEXT.md)

### Decisões Travadas (LOCKED)
- **D-01:** Trigger no `create()` de `quotes.service.ts` após salvar o orçamento; se `athosMapped.idcliente` disponível, disparar mensagem assincronamente via BullMQ (queue `enviar-cliente`).
- **D-02:** Canal Chatwoot existente (`chatwootService.sendOutgoingMessage`). Se não houver `conversationId`, não enviar (logar warning). Não criar nova conversa.
- **D-03 (bug crítico):** Corrigir link de aprovação de `/api/quotes/{id}/approve?token=...` para `/orcamento/{id}/approve?token=...`.
- **D-04:** Página `/orcamento/[id]/approve` deve exibir: nome do cliente, número do orçamento, total do orçamento e lista de itens (nome, quantidade, preço unitário, subtotal).
- **D-05:** Idempotência: se `approvalToken` válido já existe, reusar. Se `approvalRequestedAt` já existe, não reenviar automaticamente.
- **D-06:** Envio sempre assíncrono. Falha no envio não deve retornar erro 500 na criação do orçamento.

### Decisões a Cargo do Claude
- Estratégia exata de detecção do `idcliente` no fluxo de `create` (usar `athosMapped` do Athos lookup já existente, ou adicionar lookup separado).
- Estrutura exata do payload para enqueue no BullMQ.
- Quais campos do quote mostrar na página de aprovação e ordem de exibição.

### Ideias Adiadas (FORA DE ESCOPO)
- Página de listagem de todos os orçamentos de um `idcliente`.
- Criar conversa Chatwoot automaticamente se não houver `conversationId`.
- Reenvio manual do link de aprovação pelo painel interno.
</user_constraints>

---

## Sumário

A fase 6 entrega três mudanças cirúrgicas em código já existente: (1) disparar automaticamente `enviarParaCliente` ao criar um orçamento com `idcliente` do Athos, (2) corrigir o bug do link de aprovação na linha 1509 de `quotes.service.ts`, e (3) enriquecer a página de aprovação do cliente com itens e total.

**Achado crítico:** O CONTEXT.md referencia "BullMQ queue `enviar-cliente` já existente" — mas BullMQ **não está instalado** no projeto e não existe nenhuma infra de fila. Isso é [ASSUMED] no CONTEXT.md. A implementação real deve usar o padrão fire-and-forget já estabelecido no controller (linha 97 de `quotes.controller.ts`): `void this.quotesService.enviarParaCliente(id).catch(...)`.

**Recomendação primária:** Implementar as três mudanças sem introduzir BullMQ. O padrão fire-and-forget com `void ... .catch(logger.warn)` já existe e é o padrão do projeto para async não-bloqueante. Não instalar BullMQ introduziria Redis como nova dependência de infraestrutura sem nenhum benefício para o escopo desta fase.

---

## Mapa de Responsabilidade Arquitetural

| Capacidade | Tier Primário | Tier Secundário | Racional |
|------------|--------------|-----------------|----------|
| Trigger automático ao criar orçamento | API/Backend (`quotes.service.ts`) | — | Lógica de negócio pós-persistência |
| Geração e persistência do approvalToken | API/Backend (`quotes.service.ts`) | — | Token gerado com `randomBytes`, salvo no banco |
| Correção do link de aprovação | API/Backend (`quotes.service.ts`) | — | Bug na linha 1509, variável `APP_BASE_URL` |
| Envio da mensagem Chatwoot | API/Backend (`chatwootService`) | — | Serviço já injetado no `QuotesService` |
| Exibição de itens/total na página | Frontend Next.js (`approve/page.tsx`) | BFF proxy (`/api/quotes/[id]`) | Dados já retornados pelo endpoint existente |
| Aprovação pelo cliente (botão) | Frontend Next.js (`approve/page.tsx`) | BFF proxy (`approve/route.ts`) | Fluxo já existente, sem alteração |

---

## Stack Padrão do Projeto

### Core (já instalado — nenhuma instalação necessária)

| Biblioteca | Versão atual | Propósito relevante |
|-----------|-------------|---------------------|
| `@nestjs/common` | ^11.1.19 | Controller, Service, Injectable |
| `@nestjs/config` | ^4.0.4 | `ConfigService` para `APP_BASE_URL`, `APP_APPROVAL_EXPIRES_HOURS` |
| `@prisma/client` | ^5.22.0 | ORM — modelo `Quote` com campos de aprovação |
| `crypto` (nativo Node.js) | built-in | `randomBytes(12).toString("hex")` para gerar token |
| Next.js App Router | 14.2.35 | Páginas do cliente (`/orcamento/[id]/approve`) |

### O que NÃO instalar

| Pacote | Por quê não |
|--------|-------------|
| `bullmq` / `@nestjs/bullmq` | Requer Redis. O projeto não tem Redis. O padrão fire-and-forget com `void ... .catch()` já satisfaz D-06 (não bloquear). |
| `redis` | Sem Redis na infra atual (verificado em `.env.example` e `package.json`). |

---

## Arquitetura de Padrões

### Diagrama de Fluxo — Disparo Automático ao Criar Orçamento

```
POST /quotes (n8n / Athos webhook)
    │
    ▼
quotes.controller.ts → create()
    │
    ▼
quotes.service.ts → create(payload)
    │  1. Resolve customer
    │  2. Salva Quote no banco (prisma.$transaction)
    │  3. Gera PDF e salva no MinIO
    │  4. [NOVO] Se payload.idorcamento presente:
    │        └─ buscarOrcamentoPorNumero() → athosMapped.idcliente?
    │              ├─ Sim + conversationId presente:
    │              │    └─ void enviarParaCliente(quote.id).catch(logger.warn)
    │              └─ Não → skip (logar info)
    │
    ▼
retorna response ao chamador (PDF + quote body)
    ← sem bloqueio (envio é fire-and-forget)
```

### Fluxo já existente: enviarParaCliente()

O método `enviarParaCliente` (linha 1372) já implementa:
1. Lookup no Athos via `buscarOrcamentoPorNumero` → obtém `idcliente`
2. Se `idcliente`: gera ou reutiliza `approvalToken` (idempotência já implementada na linha 1490)
3. Monta link de aprovação (bug na linha 1509 a corrigir)
4. Envia mensagem Chatwoot com `sendOutgoingMessage`
5. Tenta anexar PDF ao Chatwoot

**O fluxo completo já está implementado.** A fase 6 só precisa:
- Hookear o disparo no `create()` (novo código)
- Corrigir o URL do link (1 linha)
- Enriquecer a página de aprovação (frontend)

### Padrão de Hook no create() — Onde Inserir

O método `create()` termina na linha 627 retornando o objeto com PDF. O hook deve ser inserido **após** `const mappedQuote = this.mapQuoteBody(quote)` (linha 585) e **antes** do bloco `try { generateAndStore... }`.

**Por que antes do PDF?** O Athos lookup já ocorre dentro de `enviarParaCliente`. Não precisamos fazer um segundo lookup no `create()`. A detecção de `idcliente` é delegada ao próprio `enviarParaCliente`. O trigger no `create()` só precisa verificar se `payload.idorcamento` está presente (indica origem Athos) e se o orçamento **não foi enviado antes** (campo `approvalRequestedAt`).

```typescript
// Inserir após linha 584 (após obter quote do banco), antes do try{generateAndStore}:
if (payload.idorcamento && !quote.approvalRequestedAt) {
  // Fire-and-forget — não bloquear resposta ao chamador
  void this.enviarParaCliente(quote.id).catch((err: unknown) => {
    this.logger.warn(
      `[create] Falha no envio automatico ao cliente para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`
    );
  });
}
```

**Alternativa (se precisar verificar idcliente antes de disparar):** Fazer o lookup Athos no `create()` e só disparar se `athosMapped.idcliente` existir. Isso adiciona latência ao `create()` mas garante que só dispara para orçamentos com idcliente. A decisão está marcada como "a cargo do Claude" no CONTEXT.md — a opção simples (verificar apenas `payload.idorcamento`) é preferível por não adicionar latência.

### Correção do Bug D-03 — Uma Linha

Arquivo: `apps/backend/src/modules/quotes/quotes.service.ts`, linha 1509.

```typescript
// ANTES (errado):
approvalLink = `${base.replace(/\/$/, "")}/api/quotes/${quote.id}/approve?token=${approvalToken}`;

// DEPOIS (correto):
approvalLink = `${base.replace(/\/$/, "")}/orcamento/${quote.id}/approve?token=${approvalToken}`;
```

### Estrutura da Página de Aprovação — Dados Disponíveis

O endpoint `GET /api/quotes/{id}` (BFF proxy → backend `getById`) retorna um objeto com esta estrutura verificada no código real:

```
response = {
  id: string,                    // UUID interno
  internalNumber: number,
  statusKey: QuoteStatus,
  statusLabel: string,
  approved: boolean,
  approvedAt: string | null,
  body: {
    idorcamento_interno: number, // → quoteNumber (já usado na página)
    idorcamento: number,         // número Athos (se vier do Athos)
    cliente: {
      nome: string,              // → clientName (já usado na página)
      telefone: string | null,
      email: string | null,
    },
    itens: Array<{               // [NOVO] — disponível, não exibido ainda
      quantidadeitem: number,    // quantidade
      valoritem: number,         // preço unitário
      valordesconto: number,     // desconto por item
      orcamentovalorfinalitem: number,  // subtotal do item
      produto: {
        descricaoproduto: string,   // nome completo do produto
        descricaocurta: string,     // nome curto
        referencia: string | null,
      },
      filhos: Array<...>,       // itens filhos (componentes)
    }>,
    totais: {
      desconto: number,
      valoracrescimo: number,
      valor: number,            // [NOVO] — total a exibir
    },
  }
}
```

**Os dados de itens e total já estão no response.** A página de aprovação só precisa:
1. Adicionar estados `quoteTotal` e `quoteItems` ao `useState`
2. Popular no `load()` lendo `data?.body?.totais?.valor` e `data?.body?.itens`
3. Renderizar a tabela de itens acima do botão "Aprovar"

### Padrão de Estado na Página de Aprovação

A página atual (`approve/page.tsx`) usa:
- `useState<ApproveState>` para controle de fluxo (loading-quote | idle | submitting | success | error | no-token)
- Fetch de `/api/quotes/{id}` no `useEffect` inicial
- Campos de estado: `quoteNumber`, `clientName`, `errorMessage`

Padrão a seguir para adicionar itens e total:

```typescript
// Adicionar estados:
const [quoteTotal, setQuoteTotal] = useState<number | null>(null);
const [quoteItems, setQuoteItems] = useState<Array<{
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  subtotal: number;
}>>([]);

// No load(), após setClientName:
setQuoteTotal(data?.body?.totais?.valor ?? null);
setQuoteItems(
  (data?.body?.itens ?? []).map((item: any) => ({
    descricao: item.produto?.descricaocurta ?? item.produto?.descricaoproduto ?? "",
    quantidade: item.quantidadeitem ?? 0,
    valorUnitario: item.valoritem ?? 0,
    subtotal: item.orcamentovalorfinalitem ?? 0,
  }))
);
```

### Anti-Padrões a Evitar

- **Não instalar BullMQ/Redis:** Adicionar dependência de fila/cache sem necessidade de escala é over-engineering para o escopo desta fase.
- **Não fazer Athos lookup no create() separadamente:** `enviarParaCliente` já faz o lookup. Duplicar a chamada adiciona latência e carga no banco Athos.
- **Não usar `await` no disparo dentro do create():** Viola D-06 (não bloquear). Sempre `void ... .catch(logger.warn)`.
- **Não criar conversa Chatwoot:** D-02 é explícito — se não houver `conversationId`, logar warning e pular.
- **Não alterar o banco Athos:** Integração é read-only (sem `INSERT`/`UPDATE`/`DELETE` no pool Athos).

---

## Não Reinventar a Roda

| Problema | Não construir | Usar em vez disso | Por quê |
|----------|--------------|-------------------|---------|
| Geração de token seguro | Token customizado | `randomBytes(12).toString("hex")` (já em uso na linha 1493) | Já implementado, testado, suficiente |
| Envio de mensagem Chatwoot | Novo cliente HTTP | `this.chatwootService.sendOutgoingMessage()` (já injetado) | Serviço existente com tratamento de erro |
| Exibição de moeda no frontend | Formatação manual | `toLocaleString("pt-BR", { style: "currency", currency: "BRL" })` (padrão do projeto) | Padrão já usado em `buildPaymentMessage` |
| Fire-and-forget assíncrono | BullMQ/Redis | `void promise.catch(logger.warn)` (padrão do controller linha 97) | Suficiente para o volume atual |

---

## Armadilhas Comuns

### Armadilha 1: BullMQ referenciado no CONTEXT.md não existe

**O que dá errado:** O CONTEXT.md (D-01) menciona "BullMQ queue `enviar-cliente` já existente". O planner pode assumir que a infra de fila já existe e escrever tarefas para "enfileirar no BullMQ".

**Por que acontece:** O CONTEXT.md foi redigido com conhecimento de uma intenção futura, não do estado atual do código.

**Como evitar:** Verificado no `package.json` e no codebase — não há `bullmq`, `@nestjs/bullmq`, `ioredis` ou qualquer módulo de fila instalado. O padrão fire-and-forget com `void ... .catch()` (já presente no controller) satisfaz completamente D-06 sem nova infra.

**Sinal de alerta:** Qualquer tarefa que diga "instalar bullmq" ou "criar worker" deve ser questionada.

### Armadilha 2: Duplo disparo — create() para orçamento existente (update path)

**O que dá errado:** O método `create()` tem dois caminhos: (a) cria novo orçamento e (b) atualiza orçamento existente (`externalQuoteId` já encontrado, linhas 369-479). O hook de disparo automático pode disparar tanto na criação quanto na atualização.

**Por que acontece:** O método é chamado de forma idempotente — se o orçamento já existe no banco, ele é atualizado (não criado).

**Como evitar:** A guarda D-05 já resolve: `!quote.approvalRequestedAt` impede reenvio se já foi enviado antes. Mas também é necessário capturar o `quote` retornado em ambos os caminhos (o objeto `quote` retornado pelo `$transaction` pode vir de update ou create). A implementação do hook deve ser colocada **depois** do `$transaction` onde `quote` já está resolvido.

**Verificação no código:** A linha 583 (`return fullQuote;` do path de update e a linha 582 do path de create) ambas retornam `fullQuote` que inclui `approvalRequestedAt` — a guarda funciona para ambos.

### Armadilha 3: `approvalRequestedAt` vs idempotência correta

**O que dá errado:** A guarda `!quote.approvalRequestedAt` no hook do create() usa o valor do objeto `quote` retornado pelo banco **antes** do envio. Se `enviarParaCliente` for chamado concorrentemente (dois imports simultâneos do mesmo orçamento), podem acontecer dois disparos.

**Por que acontece:** Condição de corrida em cenário de carga baixa, mas possível.

**Como evitar:** Para o volume atual (pequena gráfica), a probabilidade é desprezível. O BullMQ não resolveria isso sem idempotência explícita de job. Logar o warning e aceitar a limitação é adequado para esta fase.

### Armadilha 4: Campos de itens na página de aprovação — nomes diferentes

**O que dá errado:** O response do backend usa nomenclatura Athos (`quantidadeitem`, `valoritem`, `orcamentovalorfinalitem`, `descricaoproduto`) não camelCase padrão React. Acessar `item.quantity` no frontend retorna undefined.

**Por que acontece:** O `mapQuoteBody` preserva a nomenclatura do legado Athos nos campos de itens para compatibilidade.

**Como evitar:** Mapear explicitamente no `load()` do `useEffect` como mostrado no padrão de código acima. Nunca acessar diretamente `data.body.itens[n].quantity`.

### Armadilha 5: `conversationId` ausente — silêncio vs erro

**O que dá errado:** Se o orçamento não tem `conversationId`, o método `enviarParaCliente` (linha 1552) faz `if (convId) { ... }` e pula o envio silenciosamente. O log de warning não existe explicitamente para esse cenário.

**Por que acontece:** O código atual não loga quando `conversationId` está ausente.

**Como evitar:** No hook do `create()`, adicionar um log explícito se o orçamento não tiver `conversationId` após chamar `enviarParaCliente`, para facilitar debugging.

---

## Exemplos de Código

### Hook no create() — Ponto Exato de Inserção

Arquivo: `apps/backend/src/modules/quotes/quotes.service.ts`

Inserir após linha 584 (`const mappedQuote = this.mapQuoteBody(quote);`):

```typescript
// [PHASE-06] Disparo automático ao importar do Athos com idcliente
// payload.idorcamento indica origem Athos; approvalRequestedAt garante idempotência (D-05)
if (payload.idorcamento && !quote.approvalRequestedAt) {
  void this.enviarParaCliente(quote.id).catch((err: unknown) => {
    this.logger.warn(
      `[create] Falha no disparo automatico enviarParaCliente para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`
    );
  });
}
```

### Correção do Link — Uma Linha

Arquivo: `apps/backend/src/modules/quotes/quotes.service.ts`, linha 1509:

```typescript
// ANTES:
approvalLink = `${base.replace(/\/$/, "")}/api/quotes/${quote.id}/approve?token=${approvalToken}`;

// DEPOIS:
approvalLink = `${base.replace(/\/$/, "")}/orcamento/${quote.id}/approve?token=${approvalToken}`;
```

### Adição de Itens/Total na Página de Aprovação

Arquivo: `apps/frontend/src/app/orcamento/[id]/approve/page.tsx`

```typescript
// 1. Novos estados após linha 16:
const [quoteTotal, setQuoteTotal] = useState<number | null>(null);
const [quoteItems, setQuoteItems] = useState<Array<{
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  subtotal: number;
}>>([]);

// 2. No load() após setClientName(...) — linha 31:
setQuoteTotal(data?.body?.totais?.valor ?? null);
setQuoteItems(
  (data?.body?.itens ?? []).map((item: any) => ({
    descricao: item.produto?.descricaocurta ?? item.produto?.descricaoproduto ?? "",
    quantidade: Number(item.quantidadeitem ?? 0),
    valorUnitario: Number(item.valoritem ?? 0),
    subtotal: Number(item.orcamentovalorfinalitem ?? 0),
  }))
);

// 3. Renderização — inserir no bloco idle ACIMA do <button>, após clientName:
{quoteItems.length > 0 && (
  <div className="mb-4 text-start">
    <table className="table table-sm table-borderless mb-1">
      <thead>
        <tr className="small text-muted border-bottom">
          <th>Item</th>
          <th className="text-end">Qtd</th>
          <th className="text-end">Unit.</th>
          <th className="text-end">Total</th>
        </tr>
      </thead>
      <tbody>
        {quoteItems.map((item, idx) => (
          <tr key={idx} className="small">
            <td>{item.descricao}</td>
            <td className="text-end">{item.quantidade}</td>
            <td className="text-end">
              {item.valorUnitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </td>
            <td className="text-end">
              {item.subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    {quoteTotal !== null && (
      <div className="text-end fw-semibold small border-top pt-1">
        Total: {quoteTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
      </div>
    )}
  </div>
)}
```

---

## Inventário de Estado em Runtime

> Fase não é rename/refactor — esta seção é preenchida para verificar impactos do bug D-03.

| Categoria | Itens encontrados | Ação necessária |
|-----------|-----------------|-----------------|
| Dados armazenados | `approvalToken` existentes no banco apontam para link com URL errada | Nenhuma migração de dados — tokens existentes continuam válidos; o link correto é construído dinamicamente no envio. Tokens não armazenam o URL, só o token em si. |
| Config de serviço ao vivo | Nenhum registro externo com URL hardcoded identificado | Nenhuma |
| Estado de OS | Nenhum | Nenhum |
| Secrets/env vars | `APP_BASE_URL` — controla o prefixo do link; não muda de nome | Nenhuma |
| Artefatos de build | Nenhum afetado pela correção do link | Nenhum |

**Conclusão:** A correção do bug D-03 é segura — tokens existentes no banco permanecem válidos. Orçamentos enviados antes da correção com o link errado continuarão com o link errado (não há retroatividade), mas novos envios usarão o link correto.

---

## Disponibilidade de Ambiente

| Dependência | Requerida por | Disponível | Versão | Fallback |
|------------|--------------|-----------|--------|---------|
| PostgreSQL (banco principal) | Prisma ORM | Assumido sim (prod/dev) | — | — |
| PostgreSQL Athos (read-only) | `buscarOrcamentoPorNumero` | Assumido sim | — | Catch silencioso já implementado |
| Chatwoot | `sendOutgoingMessage` | Assumido sim | — | Catch com logger.warn já implementado |
| Redis / BullMQ | Não necessário | N/A | — | Padrão fire-and-forget (sem Redis) |
| MinIO | PDF storage | Assumido sim | — | Catch já implementado em create() |

**Sem dependências bloqueantes para esta fase.**

---

## Arquitetura de Validação

> `workflow.nyquist_validation` ausente no config.json — tratar como habilitado.

### Framework de Testes

| Propriedade | Valor |
|-------------|-------|
| Framework | Jest 30.3.0 com ts-jest 29.4.9 |
| Config | `apps/backend/jest.config.js` |
| Comando rápido | `cd apps/backend && npx jest --testPathPattern quotes.service` |
| Suite completa | `cd apps/backend && npx jest` |

### Mapa de Requisitos → Testes

| Req ID | Comportamento | Tipo de Teste | Comando | Arquivo existe? |
|--------|--------------|--------------|---------|----------------|
| D-01 | Hook dispara enviarParaCliente quando payload.idorcamento presente e approvalRequestedAt null | Unit | `npx jest quotes.service.test -t "disparo automatico"` | Nao — Wave 0 |
| D-01 | Hook NAO dispara quando approvalRequestedAt ja existe | Unit | `npx jest quotes.service.test -t "idempotencia disparo"` | Nao — Wave 0 |
| D-03 | Link gerado usa /orcamento/ nao /api/quotes/ | Unit | `npx jest quotes.service.test -t "approvalLink"` | Nao — Wave 0 |
| D-04 | Pagina de aprovacao exibe itens e total | Manual (UI) | Inspecao visual no browser | N/A |
| D-05 | approvalToken existente e nao expirado e reutilizado | Unit | `npx jest quotes.service.test -t "reutilizar token"` | Nao — Wave 0 |
| D-06 | Falha no envio nao retorna erro 500 no create() | Unit | `npx jest quotes.service.test -t "fire and forget"` | Nao — Wave 0 |

### Lacunas Wave 0

- `apps/backend/src/modules/quotes/quotes.service.test.ts` — cobre D-01, D-03, D-05, D-06
- `apps/backend/src/modules/quotes/__mocks__/` — mocks para AthosService, ChatwootService, PrismaService

*(Nota: `jest.config.js` já existe — framework configurado, apenas os arquivos de teste estão faltando.)*

---

## Domínio de Segurança

### Categorias ASVS Aplicáveis

| Categoria ASVS | Aplica | Controle |
|---------------|--------|----------|
| V2 Autenticação | Parcial | Token de aprovação via `randomBytes(12)` — 96 bits de entropia, adequado para uso único |
| V3 Gestão de Sessão | Nao | — |
| V4 Controle de Acesso | Sim | Endpoint `/approve` já é `@Public()` (correto — acesso público com token) |
| V5 Validação de Input | Sim | `token` recebido no query param é comparado via igualdade estrita (linha 1626) |
| V6 Criptografia | Nao | Token não é criptografado, é hash aleatório para uso único |

### Padrões de Ameaça Conhecidos

| Padrão | STRIDE | Mitigação padrão |
|--------|--------|-----------------|
| Reutilização de token após aprovação | Elevação de privilégio | Token invalidado imediatamente após uso (linha 1632: `approvalToken: null`) — já implementado |
| Token expirado aceito | Elevação de privilégio | Verificação de `approvalExpiresAt` na linha 1627 — já implementado |
| Brute force do token | Tampering | Token de 24 chars hex (96 bits) — probabilidade negligível de colisão |
| Link de aprovação em URL de API exposto | Information Disclosure | D-03 corrige o link para página pública Next.js (sem exposição de API key) |

---

## Estado da Arte

| Abordagem Antiga | Abordagem Atual | Impacto |
|-----------------|----------------|---------|
| Disparo manual via endpoint `/enviar` | Disparo automático no `create()` quando `idcliente` presente | Cliente recebe link sem ação manual do operador |
| Link aponta para `/api/quotes/{id}/approve` | Link aponta para `/orcamento/{id}/approve` | Cliente vê página visual, não JSON bruto |
| Página exibe apenas número e nome | Página exibe itens, total, número e nome | Cliente pode verificar o que está aprovando |

---

## Log de Premissas

| # | Premissa | Seção | Risco se Incorreta |
|---|---------|-------|---------------------|
| A1 | `payload.idorcamento` presente indica com certeza origem Athos (não PDV) | Padrões de Arquitetura — Hook no create() | Se PDV também usar `idorcamento`, o disparo pode ocorrer para orçamentos PDV sem idcliente (baixo risco — `enviarParaCliente` só envia se `conversationId` presente) |
| A2 | O ambiente de produção tem acesso ao banco Athos disponível durante o create() | Disponibilidade de Ambiente | Se Athos estiver offline, `enviarParaCliente` falhará silenciosamente (já capturado pelo catch) |
| A3 | `approvalRequestedAt` sendo null é indicador suficiente de "nunca enviado" | Padrões de Arquitetura — Idempotência | Se o campo foi setado por outro meio (ex: envio manual antes desta fase), o disparo automático não ocorrerá — comportamento correto per D-05 |

**Se a tabela acima estiver vazia não se aplica — há 3 premissas documentadas acima que precisam de confirmação implícita.**

---

## Perguntas Abertas

1. **Comportamento para orçamentos criados via PDV vs Athos**
   - O que sabemos: `payload.idorcamento` é o discriminador que usamos para detectar origem Athos.
   - O que não está claro: O PDV também envia `idorcamento` no payload? Se sim, o hook dispararia para orçamentos PDV também.
   - Recomendação: Verificar o payload enviado pelo n8n vs PDV. Alternativa mais segura: usar `payload.source === "CHATWOOT"` ou verificar `athosMapped.idcliente` diretamente (requer lookup extra no create).

2. **Orçamentos Athos sem conversationId — fluxo de notificação**
   - O que sabemos: D-02 diz para não criar conversa Chatwoot se não houver `conversationId`.
   - O que não está claro: Qual porcentagem dos orçamentos Athos tem `conversationId`? Se for baixa, o disparo automático terá taxa de sucesso baixa.
   - Recomendação: Aceitar como limitação documentada para esta fase. Fase futura pode incluir criação de conversa Chatwoot.

---

## Fontes

### Primárias (confiança HIGH — verificadas no codebase)
- `apps/backend/src/modules/quotes/quotes.service.ts` — fluxo completo de `create()`, `enviarParaCliente()`, `approveByToken()`, `mapQuoteBody()`
- `apps/backend/prisma/schema.prisma` — modelo Quote com todos os campos de aprovação
- `apps/backend/src/modules/quotes/quotes.controller.ts` — padrão fire-and-forget (linha 97)
- `apps/backend/src/modules/quotes/quotes.module.ts` — dependências injetadas (sem BullMQ)
- `apps/backend/src/modules/app.module.ts` — módulos registrados (sem BullMQ, sem Redis)
- `apps/backend/package.json` — dependências instaladas (sem bullmq)
- `apps/frontend/src/app/orcamento/[id]/approve/page.tsx` — página atual de aprovação
- `apps/frontend/src/app/api/quotes/[id]/route.ts` — BFF proxy retorna dados do backend
- `.env.example` — variáveis de ambiente (sem REDIS_URL)

### Secundárias (confiança MEDIUM)
- `apps/backend/src/modules/integrations/athos/athos.service.ts` — confirmação de `buscarOrcamentoPorNumero` retornando `idcliente`
- `.planning/phases/06-aprovacao-cliente-athos/06-CONTEXT.md` — decisões do usuário

---

## Metadados

**Breakdown de confiança:**
- Stack padrão: HIGH — verificado no package.json e código-fonte
- Arquitetura: HIGH — lido do código real, não de documentação
- Armadilhas: HIGH — identificadas a partir de análise direta do fluxo
- Achado crítico (sem BullMQ): HIGH — ausência confirmada em package.json, app.module.ts e codebase

**Data da pesquisa:** 2026-05-01
**Válido até:** 2026-06-01 (codebase estável, sem mudanças de dependências previstas)
