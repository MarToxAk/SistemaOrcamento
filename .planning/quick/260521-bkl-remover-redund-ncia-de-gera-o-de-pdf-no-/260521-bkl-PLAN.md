---
phase: quick
plan: 260521-bkl
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts
  - apps/backend/src/modules/quotes/quotes.service.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "Clicar 'Enviar ao Cliente' NÃO dispara Puppeteer se já existe PDF no MinIO"
    - "Clicar 'Reenviar PDF' NÃO dispara Puppeteer se já existe PDF no MinIO"
    - "Se o registro QuoteDocument existir no banco mas o objeto não existir no MinIO, o PDF é regenerado"
    - "Se não existir nenhum QuoteDocument para o orçamento, o PDF é gerado normalmente"
  artifacts:
    - path: apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts
      provides: "Método público objectExists(objectName) — retorna boolean"
    - path: apps/backend/src/modules/quotes/quotes.service.ts
      provides: "Lógica cache-first em enviarParaCliente e resendPdfToChatwoot"
  key_links:
    - from: "quotes.service.ts → enviarParaCliente"
      to: "prisma.quoteDocument.findFirst"
      via: "lookup por quoteId, orderBy generatedAt desc"
    - from: "quotes.service.ts → enviarParaCliente"
      to: "quotesPdfStorageService.objectExists"
      via: "storagePath do QuoteDocument encontrado"
---

<objective>
Eliminar a regeneração desnecessária de PDF via Puppeteer nos métodos
`enviarParaCliente` e `resendPdfToChatwoot`. Ambos atualmente chamam
`generateAndStore` incondicionalmente a cada acionamento, lançando um browser
Puppeteer completo mesmo quando o PDF já existe e está salvo no MinIO.

A mudança anterior (260521-bdu) forçou a regeneração sempre para garantir o
template v2 — mas agora o template v2 está compilado no dist/, então a
regeneração forçada não é mais necessária.

Purpose: Reduzir consumo de CPU/memória no servidor; chamadas de envio passam
de ~3-5 s (Puppeteer) para ~200 ms (download do MinIO).

Output: `objectExists` em QuotesPdfStorageService + lógica cache-first em
ambos os métodos de envio.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md

Arquivos diretamente modificados — lidos na íntegra antes de editar:
  apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts
  apps/backend/src/modules/quotes/quotes.service.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Adicionar objectExists em QuotesPdfStorageService</name>
  <files>apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts</files>
  <action>
Adicionar o método público abaixo imediatamente após `downloadObjectBuffer`
(antes do método privado `renderHtml`):

```
async objectExists(objectName: string): Promise<boolean> {
  try {
    const client = this.buildMinioClient();
    const bucket = this.requireEnv("MINIO_BUCKET");
    await client.statObject(bucket, objectName);
    return true;
  } catch {
    return false;
  }
}
```

`client.statObject` lança um erro se o objeto não existir — capturamos tudo e
retornamos `false`. Não adicionar log aqui; o chamador decide se loga.

Nenhuma outra alteração no arquivo.
  </action>
  <verify>
    <automated>cd /d/Projetos/cloudeproject/SistemaOrcamento && npx tsc --noEmit -p apps/backend/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>Método `objectExists` exportado publicamente em QuotesPdfStorageService sem erros de compilação TypeScript.</done>
</task>

<task type="auto">
  <name>Task 2: Lógica cache-first em enviarParaCliente e resendPdfToChatwoot</name>
  <files>apps/backend/src/modules/quotes/quotes.service.ts</files>
  <action>
Extrair a lógica de resolução de PDF num helper privado inline ou aplicar o
padrão diretamente nos dois métodos. A lógica é idêntica para ambos:

**Padrão a aplicar em ambos os métodos (substituir o bloco `generateAndStore`):**

```
// 1. Tentar reusar PDF existente
let resolvedBuffer: Buffer | null = null;
let resolvedFileName: string | null = null;
let resolvedContentType: string | null = null;

const existingDoc = await this.prisma.quoteDocument.findFirst({
  where: { quoteId: quote.id },
  orderBy: { generatedAt: "desc" },
});

if (existingDoc?.storagePath) {
  const exists = await this.quotesPdfStorageService.objectExists(existingDoc.storagePath);
  if (exists) {
    this.logger.debug(`PDF existente reutilizado para orcamento ${quote.id}: ${existingDoc.storagePath}`);
    resolvedBuffer = await this.quotesPdfStorageService.downloadObjectBuffer(existingDoc.storagePath);
    resolvedFileName = existingDoc.fileName;
    resolvedContentType = existingDoc.contentType;
  } else {
    this.logger.debug(`QuoteDocument encontrado mas objeto ausente no MinIO para orcamento ${quote.id} — regenerando`);
  }
}

// 2. Gerar se não encontrado/ausente no MinIO
if (!resolvedBuffer) {
  const stored = await this.quotesPdfStorageService.generateAndStore(this.mapQuoteBody(quote).body);
  try {
    await this.prisma.quoteDocument.create({
      data: {
        quoteId: quote.id,
        fileName: stored.fileName,
        contentType: stored.contentType,
        storagePath: stored.objectName,
        publicUrl: stored.publicUrl,
        generatedBy: "<METHOD_TAG>",   // substituir por "enviar" ou "resend"
      },
    });
  } catch (err) {
    this.logger.debug(`Falha ao persistir QuoteDocument para orcamento ${quote.id}: ${err instanceof Error ? err.message : String(err)}`);
  }
  resolvedBuffer = await this.quotesPdfStorageService.downloadObjectBuffer(stored.objectName);
  resolvedFileName = stored.fileName;
  resolvedContentType = stored.contentType;
}
```

**Em `enviarParaCliente` (linhas ~1903-1929):**
- O bloco atual começa em `// Sempre regera o PDF com o template mais recente`
- Substituir o bloco inteiro de `generateAndStore` até a chamada
  `sendAttachment` pelo padrão acima com `generatedBy: "enviar"`
- A chamada `sendAttachment` usa `resolvedBuffer`, `resolvedFileName`,
  `resolvedContentType` em vez das variáveis locais `fileBuffer`/`stored.*`
- Remover o comentário `// Sempre regera o PDF com o template mais recente antes de anexar`

**Em `resendPdfToChatwoot` (linhas ~1030-1053):**
- O bloco atual dentro do `try` chama `generateAndStore` diretamente
- Substituir pelo padrão acima com `generatedBy: "resend"`
- A variável `fileBuffer` que é usada na chamada `sendAttachment` mais abaixo
  deve ser substituída por `resolvedBuffer`
- `fileName` e `contentType` usam `resolvedFileName` e `resolvedContentType`
- Manter o bloco `catch` externo que lança `BadRequestException` em caso de falha

**Checklist de integridade:**
- Não remover o `try/catch` externo de `resendPdfToChatwoot`
- Não remover a verificação de `convId` em `enviarParaCliente`
- Não alterar a lógica de `sendAttachment` ou `sendOutgoingMessage`
- As variáveis `resolvedBuffer`, `resolvedFileName`, `resolvedContentType`
  devem ser declaradas com `let` antes do bloco condicional para ficarem
  acessíveis ao `sendAttachment`
  </action>
  <verify>
    <automated>cd /d/Projetos/cloudeproject/SistemaOrcamento && npx tsc --noEmit -p apps/backend/tsconfig.json 2>&1 | head -20</automated>
  </verify>
  <done>
Ambos os métodos compilam sem erros TypeScript. Nenhuma chamada a
`generateAndStore` permanece incondicionalmente no fluxo de envio —
`generateAndStore` só é chamado quando `resolvedBuffer` for `null` após
tentativa de busca no banco + MinIO.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Descrição |
|----------|-----------|
| Service → MinIO | `statObject` pode expor informação de existência de objetos; conexão interna |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-bkl-01 | Information Disclosure | objectExists via statObject | accept | Chamado apenas internamente no backend; o resultado não é exposto ao cliente |
| T-bkl-02 | Denial of Service | statObject em cada envio | accept | Latência de ~5 ms vs. ~3-5 s do Puppeteer — trade-off extremamente favorável |
</threat_model>

<verification>
1. TypeScript compila sem erros: `npx tsc --noEmit -p apps/backend/tsconfig.json`
2. Grep confirma que `generateAndStore` em `enviarParaCliente` está dentro de bloco condicional `if (!resolvedBuffer)`:
   `grep -n "generateAndStore" apps/backend/src/modules/quotes/quotes.service.ts`
3. Grep confirma que `objectExists` existe no service de PDF:
   `grep -n "objectExists" apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts`
4. Teste manual: enviar orçamento duas vezes — segundo envio não deve logar "Gerando PDF" nos logs do backend
</verification>

<success_criteria>
- `QuotesPdfStorageService.objectExists` existe e retorna `Promise<boolean>`
- `enviarParaCliente` só chama `generateAndStore` quando não houver QuoteDocument com objeto válido no MinIO
- `resendPdfToChatwoot` só chama `generateAndStore` quando não houver QuoteDocument com objeto válido no MinIO
- Zero erros TypeScript após as alterações
</success_criteria>

<output>
Criar `.planning/quick/260521-bkl-remover-redund-ncia-de-gera-o-de-pdf-no-/260521-bkl-SUMMARY.md` quando concluído.
</output>
