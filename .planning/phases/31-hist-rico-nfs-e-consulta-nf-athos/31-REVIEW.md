---
phase: 31-hist-rico-nfs-e-consulta-nf-athos
reviewed: 2026-05-27T12:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - apps/backend/src/modules/cobranca/cobranca.controller.ts
  - apps/backend/src/modules/cobranca/cobranca.service.cliente.test.ts
  - apps/backend/src/modules/cobranca/cobranca.service.ts
  - apps/backend/src/modules/integrations/athos/athos-notas-fiscais.test.ts
  - apps/backend/src/modules/integrations/athos/athos.controller.ts
  - apps/backend/src/modules/integrations/athos/athos.service.ts
  - apps/frontend/src/app/api/athos/clientes/[idcliente]/notas-fiscais/route.ts
  - apps/frontend/src/app/api/cobranca/nfse/cliente/[idcliente]/route.ts
  - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx
findings:
  critical: 4
  warning: 7
  info: 4
  total: 15
status: issues_found
---

# Fase 31: Relatório de Revisão de Código

**Revisado:** 2026-05-27T12:00:00Z
**Profundidade:** standard
**Arquivos Revisados:** 9
**Status:** issues_found

## Resumo

Esta fase implementa: (1) seção de histórico de NFS-e emitidas no painel de cliente, com carregamento lazy por IntersectionObserver; (2) consulta de notas fiscais (NF-e) diretamente no banco Athos, com busca por número. A revisão encontrou 4 problemas críticos — dois de segurança e dois de lógica — além de 7 avisos de robustez/corretude.

---

## Problemas Críticos

### CR-01: Injeção de SQL — coluna `statusconta` sem aspas na query de contas a pagar

**Arquivo:** `apps/backend/src/modules/integrations/athos/athos.service.ts:719`
**Problema:** A cláusula `WHERE` na query de `listarContasPagar` usa interpolação direta da coluna `dateColumn` e de `statusconta` sem aspas duplas de identificador para o campo statusconta. Pior: a variável `dateColumn` (resolvida dinamicamente) é inserida diretamente na query via concatenação de string — mesmo tendo validação `isSafeIdentifier`, o campo `statusconta` é inserido diretamente na cláusula WHERE sem aspas de identificador:

```ts
conditions.push(`statusconta = $${params.length}`);
```

Se a tabela usar nome diferente (ex. `status_conta`), a query falha silenciosamente. Mais relevante: a variável `dateColumn` é inserida diretamente:

```ts
`SELECT * FROM ${table.tableName} WHERE ... CAST(${dateColumn} AS timestamp) ...`
```

A tabela `table.tableName` também é inserida sem aspas duplas:
```ts
`SELECT * FROM ${table.tableName} WHERE ...`
```

Embora `isSafeIdentifier` impeça injeção de identificadores arbitrários, os dois campos interpolados diretamente no SQL sem as aspas duplas de delimitação (`"tableName"`) violam a convenção defensiva usada em todo o restante do serviço, que aplica `"${tableName}"` com aspas em todas as outras queries. Uma tabela cujo nome seja palavra reservada do PostgreSQL causaria falha silenciosa.

**Correção:**
```ts
// Linha ~719 — aplicar aspas duplas ao tableName e dateColumn
const query = `SELECT * FROM "${table.tableName}" WHERE ${conditions.join(" AND ")} ORDER BY CAST("${dateColumn}" AS timestamp) DESC`;
```

---

### CR-02: XSS — `linkNfse` é renderizado diretamente como atributo `href` sem validação de protocolo

**Arquivo:** `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx:767`, `837`, `953`
**Problema:** O valor `linkNfse` — recebido da API do backend e originado de um campo de texto livre no banco — é usado diretamente como `href` em âncoras `<a>`. Não há validação do protocolo. Se um valor `javascript:alert(1)` ou `data:text/html,...` fosse persistido no banco (mesmo que por engano), ele seria executado no browser do usuário ao clicar no link.

```tsx
// linha 767 / 837 / 953 — sem validação
<a href={titulo.nfseAtivo.linkNfse} target="_blank" rel="noopener noreferrer">
<a href={nfse.linkNfse} target="_blank" rel="noopener noreferrer">
```

**Correção:**
```ts
// Utilitário — adicionar em lib/safe-url.ts
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}
```

Usar `safeHttpUrl(titulo.nfseAtivo.linkNfse) ?? undefined` no `href`.

---

### CR-03: Race condition — `cancelarNfseEmitida` pode apagar registros de OUTRA NFS-e com o mesmo `numeroNfse` sem garantia transacional

**Arquivo:** `apps/backend/src/modules/cobranca/cobranca.service.ts:655-661`
**Problema:** O método faz primeiro um `findMany({ where: { numeroNfse } })` e depois deleta cada registro em um loop `for...of` com duas queries por iteração, tudo fora de uma transação. Entre o `findMany` e as deleções, outra requisição pode criar um novo `NfseEmitida` com o mesmo número, que será excluído sem intenção. Além disso, se o processo falhar no meio do loop, registros ficam parcialmente apagados.

```ts
// linhas 655-661 — sem transação
const registros = numeroNfse
  ? await this.prisma.nfseEmitida.findMany(...)
  : [{ id: nfseEmitidaId }];

for (const r of registros) {
  await this.prisma.nfseEmitidaTitulo.deleteMany(...); // pode falhar aqui
  await this.prisma.nfseEmitida.delete(...);           // estado inconsistente se anterior falhou
}
```

**Correção:** Envolver em transação Prisma:
```ts
await this.prisma.$transaction(async (tx) => {
  for (const r of registros) {
    await tx.nfseEmitidaTitulo.deleteMany({ where: { nfseEmitidaId: r.id } });
    await tx.nfseEmitida.delete({ where: { id: r.id } });
  }
});
```

---

### CR-04: Raw SQL para persistir `linkNfse` pode silenciosamente não persistir sem verificação de linhas afetadas

**Arquivo:** `apps/backend/src/modules/cobranca/cobranca.service.ts:336`
**Problema:** O código usa `$executeRaw` para salvar `linkNfse` e **não verifica** o número de linhas afetadas. Se a migração que adicionou a coluna `linkNfse` não foi executada em algum ambiente, o `UPDATE` não vai falhar — vai retornar 0 linhas afetadas silenciosamente, e o link da NFS-e nunca será persistido. O comentário do código reconhece que isso é um workaround por Prisma desatualizado, mas não há fallback nem log de aviso quando a coluna não existir.

```ts
// linha 336 — sem verificação
if (resultado.link) {
  await this.prisma.$executeRaw`UPDATE "NfseEmitida" SET "linkNfse" = ${resultado.link} WHERE id = ${nfseEmitida.id}`;
  // zero rows affected = silent failure
}
```

**Correção:**
```ts
if (resultado.link) {
  const updated = await this.prisma.$executeRaw`UPDATE "NfseEmitida" SET "linkNfse" = ${resultado.link} WHERE id = ${nfseEmitida.id}`;
  if (updated === 0) {
    this.logger.warn(`linkNfse não persistido para NfseEmitida ${nfseEmitida.id} — coluna inexistente ou migração pendente.`);
  }
}
```

---

## Avisos

### WR-01: `verificarPagamentoBoleto` não trata falha de autenticação EFI — lança exceção não capturada

**Arquivo:** `apps/backend/src/modules/cobranca/cobranca.service.ts:527-532`
**Problema:** O método `verificarPagamentoBoleto` chama `cli.post("/v1/authorize")` e `cli.get(...)` sem bloco `try/catch`. Qualquer falha de rede ou resposta inesperada da EFI propaga como `InternalServerErrorException` não tratada, sem nenhuma mensagem de contexto para diagnóstico. Contrasta com os outros métodos que já possuem tratamento explícito.

**Correção:** Envolver as chamadas EFI em `try/catch` com log contextualizado, igual ao padrão de `criarBoleto` e `cancelarBoleto`.

---

### WR-02: Duplicação massiva de lógica de autenticação EFI — três cópias idênticas

**Arquivo:** `apps/backend/src/modules/cobranca/cobranca.service.ts:138-162`, `359-377`, `486-495`
**Problema:** A sequência de obter `EFI_CLIENT_ID`/`EFI_CLIENT_SECRET`, criar `cobrancaClient`, chamar `/v1/authorize` e extrair o token aparece três vezes quase idênticas. Uma diferença entre cópias pode introduzir bug silencioso (ex: timeout diferente, URL hardcoded em uma cópia).

**Correção:** Extrair método privado:
```ts
private async getEfiToken(): Promise<string> {
  const baseUrl = this.config.get<string>("EFI_COBRANCA_BASE_URL") ?? "https://cobrancas-h.api.efipay.com.br";
  const basic = Buffer.from(`${this.getRequiredConfig("EFI_CLIENT_ID")}:${this.getRequiredConfig("EFI_CLIENT_SECRET")}`).toString("base64");
  const cli = axios.create({ baseURL: baseUrl, timeout: 15_000 });
  const resp = await cli.post("/v1/authorize", { grant_type: "client_credentials" }, {
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" },
  });
  const token = resp.data?.access_token;
  if (!token) throw new Error("Token não retornado pela EFI");
  return token;
}
```

---

### WR-03: `handleToggleAll` usa `titulos.length` mas checkboxes só aparecem em `titulosLivres` — seleção "all" quebrada

**Arquivo:** `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx:372-378`, `142`
**Problema:** `handleToggleAll` e a variável `allSelected` comparam `selectedIds.size === titulos.length`, mas a tabela com checkboxes só exibe `titulosLivres` (sem boleto). Se existirem títulos com boleto, o checkbox "selecionar todos" nunca fica marcado como completamente selecionado mesmo quando todos os títulos livres estão marcados, e clicar nele tentará selecionar também os `idcontareceber` de títulos que não têm checkbox na UI.

```ts
// linha 142 — usa titulos.length, deveria ser titulosLivres.length
const allSelected = titulos.length > 0 && selectedIds.size === titulos.length;
// linha 373 — mesma inconsistência
if (selectedIds.size === titulos.length) { ... }
```

**Correção:**
```ts
const allSelected = titulosLivres.length > 0 && titulosLivres.every((t) => selectedIds.has(t.idcontareceber));
// handleToggleAll:
if (titulosLivres.every((t) => selectedIds.has(t.idcontareceber))) {
  setSelectedIds(new Set());
} else {
  setSelectedIds(new Set(titulosLivres.map((t) => t.idcontareceber)));
}
```

---

### WR-04: `someSelected` usa `titulos.length` — indeterminate state do checkbox "selecionar todos" incorreto

**Arquivo:** `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx:143`
**Problema:** `someSelected = selectedIds.size > 0 && selectedIds.size < titulos.length` — mesma inconsistência do WR-03. Com títulos em boleto presentes, o estado `indeterminate` nunca é acionado corretamente.

**Correção:**
```ts
const someSelected = selectedIds.size > 0 && !titulosLivres.every((t) => selectedIds.has(t.idcontareceber));
```

---

### WR-05: Seção NFS-e Emitidas não recarrega após cancelamento bem-sucedido da NFS-e na aba de títulos

**Arquivo:** `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx:861`
**Problema:** Ao remover uma NFS-e clicando no botão "x" na coluna NF da tabela de títulos livres (linha 856), o código só incrementa `refetchKey` (que recarrega os títulos). A lista `nfseEmitidas` da seção "NFS-e Emitidas" não é invalidada — `nfseCarregada` permanece `true`, então o `IntersectionObserver` não recarrega. O usuário vê a NFS-e recém-removida ainda listada na seção inferior.

**Correção:** Após o `setRefetchKey((k) => k + 1)` bem-sucedido, também resetar `nfseCarregada`:
```ts
setRefetchKey((k) => k + 1);
setNfseCarregada(false); // força reload da seção NFS-e Emitidas
```

---

### WR-06: `emitirNfse` — verificação de duplicidade apenas pelo primeiro `idvenda` da lista de títulos

**Arquivo:** `apps/backend/src/modules/cobranca/cobranca.service.ts:285-293`
**Problema:** A verificação de duplicidade busca `titulosFiltrados[0]?.idvenda` — apenas o primeiro título. Se forem selecionados múltiplos títulos de vendas diferentes, os demais `idvenda` não são verificados. É possível emitir NFS-e para uma venda que já tem NFS-e se ela não for o primeiro título da lista.

```ts
const idvenda = titulosFiltrados[0]?.idvenda ?? null; // apenas o primeiro
if (idvenda !== null) {
  const existente = await this.prisma.nfseEmitida.findFirst({ where: { idvenda } });
  // demais idvendas não checados
```

**Correção:** Verificar todos os `idvenda` únicos da lista:
```ts
const idvendasUnicas = [...new Set(titulosFiltrados.map(t => t.idvenda).filter((v): v is number => v != null))];
for (const idvenda of idvendasUnicas) {
  const existente = await this.prisma.nfseEmitida.findFirst({ where: { idvenda } });
  if (existente) throw new BadRequestException(`NFS-e já emitida para venda ${idvenda} (Nº ${existente.numeroNfse})`);
}
```

---

### WR-07: `buscarTodasNfesParaTitulos` retorna `valorNota: 0` hardcoded — campo do tipo de retorno enganoso

**Arquivo:** `apps/backend/src/modules/integrations/athos/athos.service.ts:1894-1898`
**Problema:** O tipo de retorno declara `valorNota: number` mas o campo é sempre `0`, com um comentário inline dizendo "distribuição proporcional indisponível". Isso engana os consumidores do método, que podem tentar usar `valorNota` para cálculos e obteriam sempre zero.

```ts
return (result.rows as ...).map((r) => ({
  idcontareceber: Number(r["idcontareceber"]),
  numero: String(r["numero"] ?? "").trim(),
  valorNota: 0, // sempre zero — enganoso
}));
```

**Correção:** Ou remover `valorNota` do tipo de retorno e da implementação, ou buscar o valor real. Se mantido como `0`, documentar com `@deprecated` ou renomear para `valorNotaNA` e tipar como `0` literal.

---

## Info

### IN-01: `testarConexao` no `AthosService` não executa `client.connect()` antes do `client.query`

**Arquivo:** `apps/backend/src/modules/integrations/athos/athos.service.ts:531-543`
**Problema:** O método cria um `new Client(...)` e chama `client.query("SELECT 1")` diretamente sem chamar `await client.connect()` primeiro. O driver `pg` requer conexão explícita para `Client` (diferente de `Pool`). Em produção, isso provavelmente resulta em erro "client not connected". No contexto atual o método pode não estar sendo utilizado, mas é um bug latente.

**Correção:**
```ts
await client.connect();
await client.query("SELECT 1");
```

---

### IN-02: `athos-notas-fiscais.test.ts` — teste (d) apenas verifica presença de `LIMIT 50` no SQL, sem testar o valor retornado

**Arquivo:** `apps/backend/src/modules/integrations/athos/athos-notas-fiscais.test.ts:123-131`
**Problema:** O teste que verifica o `LIMIT 50` não verifica o mapeamento dos dados retornados — ele passa `rows: []` como mock, então um bug no mapeamento passaria neste teste sem ser detectado.

---

### IN-03: `page.tsx` — uso de `window.location.reload()` em dois lugares em vez de `refetchKey`

**Arquivo:** `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx:724`, `735`
**Problema:** Os botões "Verificar pagamento" e "Cancelar boleto" chamam `window.location.reload()`. O restante da página usa o padrão `setRefetchKey` para atualizar dados sem reload completo. `window.location.reload()` descarta todo o estado React e reinicia as fetches de dados do cliente/títulos, causando UX degradada (flash de tela, perda de seções abertas).

**Correção:** Substituir pelos padrões já existentes:
```ts
// Em vez de window.location.reload()
setRefetchKey((k) => k + 1);
setNfseCarregada(false);
```

---

### IN-04: `cobranca.service.ts` — comentário "Passo 3" e depois "Passo 4" aparece duas vezes na função `criarBoleto`

**Arquivo:** `apps/backend/src/modules/cobranca/cobranca.service.ts:54`, `70`, `99`
**Problema:** O comentário numera "Passo 3" na linha 54 e há dois comentários "Passo 4" (linhas 70 e 99), indicando que a numeração se desincronizou durante refatorações. Não afeta funcionamento mas pode confundir manutenção futura.

**Correção:** Renumerar os passos sequencialmente.

---

_Revisado: 2026-05-27T12:00:00Z_
_Revisor: Claude (gsd-code-reviewer)_
_Profundidade: standard_
