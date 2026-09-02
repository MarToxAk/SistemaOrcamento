---
phase: quick-260902-hal
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/backend/src/modules/integrations/nfse/nfse.service.ts
  - apps/backend/src/modules/integrations/nfse/nfse.module.ts
  - apps/backend/src/modules/integrations/nfse/nfse.service.chatwoot.test.ts
  - apps/frontend/src/app/orcamento/[id]/page.tsx
autonomous: true
requirements: [QT-HAL-01, QT-HAL-02, QT-HAL-03]

estimate:
  tokens: 60000
  raw_tokens: 30000
  tasks: 2
  confidence: low

must_haves:
  truths:
    - "Ao emitir a NFS-e automaticamente pelo /orcamento/[id], o cliente recebe no Chatwoot uma mensagem com o DANFSe (PDF) anexado, sem nenhuma acao extra do operador (D-00, D-01)."
    - "Se o envio ao Chatwoot falhar (sem conversationId, render do PDF quebrado, API do Chatwoot fora), a emissao da NFS-e permanece bem-sucedida e persistida — nada e revertido (D-04)."
    - "O operador ve na tela de orcamento se o DANFSe foi entregue ao cliente ou nao, e o motivo quando nao foi (D-02)."
    - "O DANFSe enviado e o layout nacional NT 008/2026, o mesmo renderizado por DanfseNacionalPdfService no fluxo de contas a receber (D-03)."
    - "Nenhum arquivo de cobranca/** ou contas-receber/** e modificado (D-06)."
  artifacts:
    - apps/backend/src/modules/integrations/nfse/nfse.service.ts
    - apps/backend/src/modules/integrations/nfse/nfse.module.ts
    - apps/backend/src/modules/integrations/nfse/nfse.service.chatwoot.test.ts
    - apps/frontend/src/app/orcamento/[id]/page.tsx
  key_links:
    - "NfseNacionalService.emitir() devolve nfseXml (XML assinado nacional) -> DanfseNacionalPdfService.gerar(nfseXml) -> Buffer PDF"
    - "Quote.conversationId (BigInt) -> ChatwootService.sendOutgoingMessage + ChatwootService.sendAttachment"
    - "NfseModule importa ChatwootModule para injetar ChatwootService em NfseService (ChatwootModule nao tem imports — sem ciclo)"
    - "Campo envioChatwoot no retorno de emitirQuoteNfseAutomatica -> proxy /api/quotes/[id]/nfse/emitir (repassa o JSON inteiro, sem alteracao) -> setNfseMsg no page.tsx"
---

<objective>
Depois que `NfseService.emitirQuoteNfseAutomatica` emite a NFS-e com sucesso pelo fluxo do orcamento (`/orcamento/[id]`), gerar o DANFSe nacional (PDF) a partir do XML assinado que a propria emissao ja devolve em memoria e envia-lo automaticamente ao cliente pelo Chatwoot, anexado a uma mensagem curta.

Purpose: hoje a nota e emitida e fica so no sistema — o operador precisa baixar o PDF e mandar a mao. O cliente deve receber a nota sozinho, no mesmo canal onde recebeu o orcamento.
Output: novo caminho de entrega em `NfseService` (best-effort, isolado por try/catch), fiacao do `ChatwootModule` no `NfseModule`, testes unitarios novos e feedback do envio na tela do orcamento.

## Decisoes derivadas (D-NN)

- **D-00 (CONFIRMADA PELO USUARIO em 2026-09-02)** — O usuario confirmou a opcao 1 do
  checkpoint de decisao que abria este plano: **A1 + B1**. A entrega e feita **anexando o PDF
  do DANFSe diretamente na mensagem do Chatwoot** (nao link), e o envio e **sincrono/aguardado**
  dentro de `emitirQuoteNfseAutomatica`, com um campo `envioChatwoot` na resposta indicando
  sucesso ou falha. Nao ha mais checkpoint neste plano.
- **D-01** — O anexo usa `ChatwootService.sendAttachment`, que ja existe e roda em producao
  para o PDF do orcamento (`quotes.service.ts:1074` e `:1971`). Descartada a alternativa de
  link: nao existe URL publica do PDF — `quote.nfseLink` aponta para o **XML** no MinIO, e
  expor uma URL nao autenticada de documento fiscal seria superficie nova de vazamento.
- **D-02** — Envio aguardado (`await`) dentro do request de emissao, com o resultado no campo
  `envioChatwoot: { enviado, motivo? }` da resposta. O custo de latencia (render do PDF +
  upload) e aceito porque o operador precisa saber na hora se o cliente recebeu; fire-and-forget
  deixaria o resultado so no log do servidor.
- **D-03** — O PDF vem de `DanfseNacionalPdfService.gerar(nfseXml)` recebendo **literalmente**
  a string `nfseXml` que `NfseNacionalService.emitir()` acabou de devolver. E o mesmo valor que
  `CobrancaService` persiste em `NfseEmitida.xmlNacional` antes de chamar o mesmo renderizador
  (`cobranca.service.ts:446` e `:498`) — zero conversao, zero consulta extra ao ADN.
- **D-04** — Toda a entrega e best-effort e nunca lanca: `prisma.quote.update` da nota executa
  ANTES do envio, e qualquer erro de render ou de Chatwoot vira `logger.warn` +
  `{ enviado: false, motivo }`. A nota ja esta fiscalmente definitiva no SEFIN; falha de
  entrega e aviso, jamais erro da emissao.
- **D-05** — O destino e resolvido exclusivamente por `quote.conversationId`, o mesmo caminho
  usado em todo o codebase. Proibido `ChatwootService.searchContact` ou qualquer busca por
  nome/documento — entregar nota fiscal na conversa errada e vazamento de dado fiscal.
- **D-06** — Zero alteracao em `apps/backend/src/modules/cobranca/**` e
  `apps/frontend/src/app/contas-receber/**`. Sao referencia de leitura, nunca destino de escrita.
- **D-07** — `NfseService.baixarDanfsePdf` e `GET /quotes/:quoteId/nfse/pdf` NAO mudam: seguem
  no renderizador legado `DanfsePdfService`. O PDF que o operador baixa tera layout diferente
  do DANFSe enviado ao cliente — divergencia conhecida e aceita, a unificar em outra rodada.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Alvos diretos
@apps/backend/src/modules/integrations/nfse/nfse.service.ts
@apps/backend/src/modules/integrations/nfse/nfse.module.ts
@apps/backend/src/modules/integrations/nfse/nfse.service.tomador.test.ts

# Interfaces ja existentes que serao reusadas (ler, NAO alterar)
@apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts
@apps/backend/src/modules/integrations/nfse/danfse-nacional-pdf.service.ts
</context>

<interfaces>

Assinaturas ja existentes no codebase, verificadas nesta rodada de planejamento. NAO reimplementar nenhuma delas.

**`ChatwootService`** (`apps/backend/src/modules/integrations/chatwoot/chatwoot.service.ts`, exportado por `ChatwootModule`):
- `sendOutgoingMessage(conversationId: string, message: string): Promise<{ enabled: boolean; response?: unknown; message?: string }>` — quando `CHATWOOT_BASE_URL`/`CHATWOOT_ACCOUNT_ID`/`CHATWOOT_API_TOKEN` faltam, devolve `{ enabled: false }` em vez de lancar; erros de rede lancam.
- `sendAttachment(conversationId: string, buffer: Buffer, fileName: string, contentType: string): Promise<{ enabled: boolean; response?: unknown; message?: string }>` — monta multipart `attachments[]` + `message_type=outgoing` + `private=false`. Mesma semantica de `{ enabled: false }` sem config.

**`DanfseNacionalPdfService`** (`apps/backend/src/modules/integrations/nfse/danfse-nacional-pdf.service.ts`, ja e provider E export do `NfseModule`):
- `gerar(xmlNacional: string): Promise<Buffer>` — renderiza o DANFSe nacional NT 008/2026 com canhoto via import dinamico de `nfse-node/danfse`.

**`NfseNacionalService.emitir(...)`** (`nfse-nacional.service.ts`) devolve `{ chaveAcesso: string; nfseXml: string }`. O `nfseXml` e exatamente a mesma string que `CobrancaService` persiste em `NfseEmitida.xmlNacional` e passa para `danfseNacionalPdfService.gerar()` — ou seja, ja esta no formato certo, sem nenhuma conversao.

**`Quote`** (`apps/backend/prisma/schema.prisma`): `conversationId BigInt?` (indexado), `nfseNumero String?`, `nfseLink String?`.

**Padrao de entrega ja em producao** (`apps/backend/src/modules/quotes/quotes.service.ts:1920-1983` em `enviarParaCliente`, e `:1018-1081` em `resendPdfToChatwoot`): `const convId = quote.conversationId ? String(quote.conversationId) : undefined;` seguido de `sendOutgoingMessage` e depois `sendAttachment`, tudo dentro de try/catch com `logger.warn` — a falha de Chatwoot nunca derruba a operacao principal. Reusar essa forma.

**Harness de teste** (`nfse.service.tomador.test.ts`): instancia via `Object.create(NfseService.prototype)` e injeta os campos privados (`prisma`, `athosService`, `nfseNacionalService`, `logger`) mais overrides de `parseXml`/`storeXml` para nao tocar MinIO. Reusar identicamente.

</interfaces>

<tasks>

<!--
  O checkpoint de decisao que abria este plano foi RESOLVIDO antes da execucao: o usuario
  confirmou a opcao 1 — A1 (anexar o PDF do DANFSe direto na mensagem do Chatwoot, nao link)
  + B1 (envio sincrono/aguardado, com campo `envioChatwoot` na resposta indicando sucesso ou
  falha do envio). Ver D-00, D-01 e D-02 no <objective>. Nenhuma tarefa de checkpoint resta,
  por isso o plano e autonomo.
-->

<task type="tracer" tdd="true">
  <name>Tarefa 1: Gerar o DANFSe e entregar no Chatwoot logo apos a emissao</name>
  <files>apps/backend/src/modules/integrations/nfse/nfse.service.ts, apps/backend/src/modules/integrations/nfse/nfse.module.ts, apps/backend/src/modules/integrations/nfse/nfse.service.chatwoot.test.ts</files>
  <behavior>
    - Teste 1: emissao com `conversationId` presente e Chatwoot saudavel — `danfseNacionalPdfService.gerar` recebe exatamente a string `nfseXml` devolvida por `nfseNacionalService.emitir`; `sendOutgoingMessage` e chamado com o conversationId em string; `sendAttachment` recebe o Buffer do PDF, nome `NFSe-<numeroNfse>.pdf` e content type `application/pdf`; a resposta traz `envioChatwoot: { enviado: true }`.
    - Teste 2: quote sem `conversationId` — nenhuma chamada ao Chatwoot e nenhum render de PDF; a resposta ainda traz numero/link da nota e `envioChatwoot.enviado === false` com motivo indicando ausencia de conversa.
    - Teste 3: `danfseNacionalPdfService.gerar` rejeita — a emissao continua bem-sucedida (numero e link presentes na resposta), `prisma.quote.update` foi chamado normalmente, `envioChatwoot.enviado === false`, e nenhuma excecao escapa do metodo.
    - Teste 4: `sendAttachment` rejeita depois de `sendOutgoingMessage` ter passado — mesma garantia do Teste 3: emissao intacta, `envioChatwoot.enviado === false`, sem excecao propagada.
  </behavior>
  <action>
Padrao A1 + B1, confirmado pelo usuario (D-00): anexo do PDF via `sendAttachment`, envio aguardado com `envioChatwoot` na resposta.

A mensagem que acompanha o anexo e, literalmente: `Sua Nota Fiscal de Servico (NFS-e) n. {numero} foi emitida. O documento (DANFSe) esta em anexo.` — com `{numero}` substituido por `parsed.numeroNfse`.

Em `nfse.module.ts`: adicionar `ChatwootModule` (de `../chatwoot/chatwoot.module`) ao array `imports`. `ChatwootModule` nao tem `imports` proprios, entao nao ha ciclo. Nao mexer em providers/exports.

Em `nfse.service.ts`: injetar no construtor `private readonly danfseNacionalPdfService: DanfseNacionalPdfService` e `private readonly chatwootService: ChatwootService` (ambos ja disponiveis: o primeiro e provider/export do proprio NfseModule, o segundo vem do ChatwootModule recem-importado).

Criar o metodo `private async enviarDanfseParaCliente(quote, nfseXml: string, numeroNfse: string | null): Promise<{ enviado: boolean; motivo?: string }>`:
- Resolver o destino unicamente por `quote.conversationId` — mesma expressao usada em `quotes.service.ts` (`quote.conversationId ? String(quote.conversationId) : undefined`). Nunca usar `searchContact` nem qualquer busca por nome/documento: mandar nota fiscal para a conversa errada e vazamento de dado fiscal (D-05, e `<threat_model>` T-HAL-01).
- Sem conversationId: retornar `{ enviado: false, motivo: "orcamento sem conversa vinculada no Chatwoot" }`, com `logger.debug`, sem renderizar PDF nenhum.
- Com conversationId: chamar `this.danfseNacionalPdfService.gerar(nfseXml)` para obter o Buffer; em seguida `sendOutgoingMessage(convId, mensagem)` e depois `sendAttachment(convId, pdfBuffer, "NFSe-<numeroNfse ou quote.id>.pdf", "application/pdf")`, nessa ordem (mesma ordem de `enviarParaCliente`).
- Envolver todo o corpo em try/catch: qualquer erro vira `logger.warn` com o id do orcamento e a mensagem do erro, e retorna `{ enviado: false, motivo: <mensagem do erro> }`. O metodo nunca lanca.

Em `emitirQuoteNfseAutomatica`: apos o `prisma.quote.update` que persiste os campos da nota e apos o `logger.log` de sucesso, chamar `const envioChatwoot = await this.enviarDanfseParaCliente(quote, nfseXml, parsed.numeroNfse ?? null);` e incluir `envioChatwoot` no objeto de retorno junto com `numero`, `codigoVerificacao`, `link`, `dataEmissao`, `valorServico` (D-02). A ordem importa (D-04): o update no banco vem ANTES da entrega, para que uma falha de rede na entrega nunca deixe a nota emitida no SEFIN sem registro local.

Criar `nfse.service.chatwoot.test.ts` copiando o harness de `nfse.service.tomador.test.ts` (`Object.create(NfseService.prototype)` + injecao dos campos privados + overrides de `parseXml`/`storeXml`), acrescentando mocks de `danfseNacionalPdfService` (`{ gerar: jest.fn() }`) e `chatwootService` (`{ sendOutgoingMessage: jest.fn(), sendAttachment: jest.fn() }`), e mockando `resolverTomadorQuote` na instancia para nao bater no Athos.

Fora de escopo nesta tarefa, nao alterar: `NfseService.baixarDanfsePdf` e o endpoint `GET /quotes/:quoteId/nfse/pdf`, que continuam usando o renderizador legado `DanfsePdfService` sobre o XML do MinIO (D-07). Nao tocar em `cobranca/**` nem em `contas-receber/**` (D-06). Nenhuma dependencia npm nova: `nfse-node` ja esta instalado e em uso por `DanfseNacionalPdfService`.
  </action>
  <verify>
    <automated>npm --workspace @orcamento/backend run test -- nfse.service.chatwoot</automated>
    <automated>npm --workspace @orcamento/backend run test</automated>
    <automated>npm --workspace @orcamento/backend run build</automated>
  </verify>
  <done>Os 4 testes novos passam, a suite completa do backend segue verde e o `tsc` do backend compila limpo. `emitirQuoteNfseAutomatica` devolve `envioChatwoot` e nenhum caminho de falha de Chatwoot/PDF consegue propagar excecao ou impedir o `prisma.quote.update` da nota.</done>
  <reversibility rating="reversible">Codigo novo isolado atras de try/catch; remover a chamada em `emitirQuoteNfseAutomatica` restaura o comportamento anterior. O envio da mensagem ao cliente em si e irreversivel — foi por isso que o checkpoint existiu, e o usuario ja o aprovou (D-00).</reversibility>
</task>

<task type="auto">
  <name>Tarefa 2: Mostrar ao operador se o cliente recebeu o DANFSe</name>
  <files>apps/frontend/src/app/orcamento/[id]/page.tsx</files>
  <action>
No handler de emissao automatica (o `fetch` para `/api/quotes/${quoteId}/nfse/emitir`, por volta da linha 345), ampliar o tipo do `data` desestruturado para incluir `envioChatwoot?: { enviado: boolean; motivo?: string }` e complementar a mensagem de sucesso: hoje `setNfseMsg` recebe apenas `NFS-e emitida automaticamente! Numero: ${data.numero}`. Acrescentar um sufixo indicando a entrega — quando `data.envioChatwoot?.enviado` for verdadeiro, sinalizar que o DANFSe foi enviado ao cliente pelo Chatwoot; caso contrario, sinalizar que a nota foi emitida mas o envio ao cliente nao ocorreu, exibindo `data.envioChatwoot?.motivo` quando existir.

Ponto critico de UX (D-04): `setNfseState("sucesso")` deve continuar sendo chamado mesmo quando o envio ao Chatwoot falhou — a nota FOI emitida e e fiscalmente definitiva; falha de entrega e aviso, nunca erro da emissao. Nao mudar o fluxo do `catch`.

Nenhuma alteracao e necessaria no proxy `apps/frontend/src/app/api/quotes/[id]/nfse/emitir/route.ts`: ele ja repassa o JSON inteiro do backend com `NextResponse.json(data)`.
  </action>
  <verify>
    <automated>npm --workspace @orcamento/frontend run build</automated>
  </verify>
  <done>O build do Next.js passa limpo e a tela de orcamento, apos emitir, informa explicitamente se o DANFSe foi entregue ao cliente pelo Chatwoot ou o motivo de nao ter sido, mantendo o estado visual de sucesso da emissao nos dois casos.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| backend -> Chatwoot API | documento fiscal do cliente (DANFSe com CPF/CNPJ, endereco e valores) sai da aplicacao para um canal de mensageria externo |
| backend -> SEFIN/ADN | ja existente; o XML assinado que alimenta o PDF vem dessa fronteira |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-HAL-01 | Information Disclosure | `NfseService.enviarDanfseParaCliente` | high | mitigate | Destino resolvido exclusivamente por `quote.conversationId` (vinculo ja estabelecido do orcamento), conforme D-05. Proibido usar `ChatwootService.searchContact` ou qualquer heuristica por nome/documento, que poderia entregar a nota a terceiro. Sem conversationId, nao envia. |
| T-HAL-02 | Denial of Service | render do DANFSe dentro do request de emissao | medium | accept | Render sincrono soma segundos ao request ja lento do SEFIN; endpoint e autenticado, interno e protegido por `THROTTLE_SENSITIVE` no `NfseController`. Aceito em favor do feedback imediato ao operador (D-02, opcao B1 confirmada pelo usuario). |
| T-HAL-03 | Tampering | integridade do registro fiscal | high | mitigate | `prisma.quote.update` da nota executa ANTES da entrega; toda a entrega vive em try/catch que nunca lanca (D-04), garantindo que falha de Chatwoot/PDF nao deixe nota emitida no SEFIN sem registro local nem provoque rollback. |
| T-HAL-SC | Tampering | instalacao de pacotes npm | n/a | accept | Nenhuma dependencia npm nova nesta rodada — `nfse-node` (DANFSe) e `axios` ja estao instalados e em uso. Gate de legitimidade de pacote nao se aplica. |
</threat_model>

<verification>
- `npm --workspace @orcamento/backend run test` verde (suite completa, sem regressao nos testes existentes de NFS-e e Chatwoot).
- `npm --workspace @orcamento/backend run build` sem erro de tipo.
- `npm --workspace @orcamento/frontend run build` sem erro.
- Revisao manual do diff: zero arquivos alterados sob `apps/backend/src/modules/cobranca/`, `apps/frontend/src/app/contas-receber/` ou `apps/frontend/src/app/api/cobranca/`.

Verificacao humana ponta a ponta (pendente, exige SEFIN + Chatwoot reais — registrar no SUMMARY como pendencia, no mesmo padrao das quick tasks 260902-gi9 e 260828-g45): emitir uma NFS-e por um orcamento que tenha conversa Chatwoot vinculada e confirmar que a conversa recebeu a mensagem e o PDF abre com o layout nacional.
</verification>

<success_criteria>
- Emitir NFS-e pelo `/orcamento/[id]` entrega o DANFSe ao cliente no Chatwoot sem acao adicional do operador.
- Falha de geracao de PDF ou de envio ao Chatwoot nunca reverte, bloqueia ou mascara a emissao da nota.
- O operador enxerga o resultado da entrega na propria tela de emissao.
- `cobranca/**` e `contas-receber/**` intocados.
</success_criteria>

<output>
Create `.planning/quick/260902-hal-ap-s-emitir-a-nfs-e-automaticamente-pelo/260902-hal-SUMMARY.md` when done
</output>
