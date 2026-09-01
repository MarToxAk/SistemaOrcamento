# Decisões travadas — quick 260828-g45 (2026-08-28)

## Objetivo (opção "B" confirmada pelo usuário)
Backfill das NFS-e via **Distribuição de DF-e do ADN** usando a lib **`nfse-node`**: preencher `NfseEmitida.chaveAcesso` + guardar o XML assinado, e renderizar o **DANFSe nacional (NT 008/2026)** com `nfse-node` no fluxo de **contas a receber** (e-mail + `baixarDanfsePdf`). Assim até as 67 NFS-e antigas (era iiBrasil, hoje só com PDF do provedor) ganham o DANFSe no padrão.

## Fatos já validados nesta sessão (não re-litigar)

- `GET https://sefin.nfse.gov.br/SefinNacional/nfse/{chave}` com mTLS (nosso cert `NFSE_NACIONAL_CERT_PEM`/`KEY_PEM`) → JSON `{ ..., nfseXmlGZipB64 }` → XML assinado (`<NFSe versao="1.01">`). Funciona (testado com a chave da NFS-e 239).
- **Distribuição DF-e do ADN funciona** com o mesmo cert: nosso CNPJ tem **248 documentos** (NSU 1..248), lotes de até 50, depois erro `E2220` "Nenhum documento localizado" = fim.
- `nfse-node@0.3.2`, **Apache-2.0**, deps 100% JS (`pdfkit`, `@xmldom/xmldom`, `node-forge`, `qrcode`, `xml-crypto`) — sem build nativo. Instala limpo (58 pacotes). **É ESM puro** (`"type": "module"`, `exports` só com `import`, sem `require`).
- `nfse-node/cliente`: `criarClienteSefin({ ambiente: "producao"|"homologacao", certificado: { chavePrivadaPem, certificadoPem }, timeoutMs? }) → ClienteSefin` com:
  - `baixarDfe(nsu: number, opcoes?: { cnpjConsulta?, lote? }) → LoteDistribuicaoNsu` — GET `/contribuintes/DFe/{nsu}` no ADN. `nsu=0` sincroniza do início. Continuar por `max(doc.nsu)+1` (o `ultimoNsu` do lote veio `undefined` na prática). Em "sem mais documentos" a lib **lança** `ErroComunicacaoSefin` com `status: 404` e `erros[0].codigo === "E2220"` — tratar como fim da sincronização, não erro.
  - `consultarNfse(chave) → { status, corpo }` — GET `/nfse/{chave}` no SEFIN. (o `corpo` traz `nfseXmlGZipB64` — descompactar com `nfse-node/cliente` `descompactarGZipBase64` ou `zlib`.)
  - `listarEventos(chave)` — NÃO usar nesta rodada (item "sem marca d'água").
- `LoteDistribuicaoNsu`: `{ statusProcessamento: "DOCUMENTOS_LOCALIZADOS"|"NENHUM_DOCUMENTO_LOCALIZADO"|"REJEICAO", documentos: DocumentoDistribuicao[], alertas, erros, ambiente, versaoAplicativo, dataHoraProcessamento, ultimoNsu? }`.
- `DocumentoDistribuicao`: `{ nsu: number, chaveAcesso: string, tipoDocumento: "NFSE"|"EVENTO"|"DPS"|..., tipoEvento?: string, xml: string, dataHoraGeracao: string }`. **O `xml` vem em texto puro.** O DF-e traz notas onde somos **prestador E tomador** — filtrar.
- `nfse-node/danfse`: `gerarDanfse(xml: string, opcoes?: OpcoesGerarDanfse) → Promise<Buffer>`. `OpcoesGerarDanfse = { situacaoEspecial?: "Cancelada"|"Substituida"; resolverMunicipio?; logomarca?: Buffer /* PNG/JPEG */; incluirCanhoto?: boolean /* default true */ }`. Leiaute NT 008/2026 v1.02, fontes livres embutidas. Já renderizou a 239 → PDF 32 KB, 1 página.

## Restrições / defaults confirmados

1. **Gatilho da sincronização**: endpoint autenticado `POST /cobranca/nfse/sincronizar-dfe` (guard global, NÃO `@Public()`). **Sem cron.** Sem botão em tela.
2. **Persistência**:
   - `NfseEmitida.xmlNacional String? @db.Text` (novo campo — cache do XML assinado).
   - Nova tabela singleton `NfseDfeSync { id Int @id @default(1); ultimoNsu Int @default(0); atualizadoEm DateTime @updatedAt }` para o cursor da distribuição. (id fixo 1.)
   - `NfseEmitida.chaveAcesso` já existe (`String?`) — reusar.
   - Migration SQL escrita à mão (padrão do repo, `apps/backend/prisma/migrations/<ts>_<nome>/migration.sql`; última existente `20260827120000`).
3. **Matching**: só `tipoDocumento === "NFSE"`; ler `nNFSe` e o CNPJ do emitente do XML; se emitente === `NFSE_NACIONAL_CNPJ_PRESTADOR` (`62391927000157`) e existir `NfseEmitida` com `numeroNfse == nNFSe` e (`chaveAcesso IS NULL` OU `xmlNacional IS NULL`) → `update` setando `chaveAcesso` + `xmlNacional`. Idempotente (rodar de novo não duplica nem regride). Documentos que não casam são ignorados (contam só pra avançar o cursor).
4. **Cancelamento/substituição (marca d'água)**: **fora desta rodada.** `gerarDanfse` é chamado sem `situacaoEspecial`. Anotar como pendência conhecida (precisaria `listarEventos` por nota).
5. **Render no fluxo de contas a receber** — `CobrancaService.baixarDanfsePdf(nfseEmitidaId)` passa a ter prioridade:
   1. `nfseEmitida.xmlNacional` presente → `DanfseNacionalPdfService.gerar(xmlNacional)` (nfse-node).
   2. senão, `nfseEmitida.chaveAcesso` presente → `clienteSefin.consultarNfse(chave)` → extrai o XML → **persiste em `xmlNacional`** → renderiza com nfse-node.
   3. senão → comportamento atual (baixa `linkNfse`; se `%PDF` repassa; se XML nacional cai no `DanfsePdfService` legado). Fallback intacto.
6. **Fluxo de orçamento** (`nfse.service.ts`, `DanfsePdfService` template Handlebars) — **NÃO mexer.** Continua como está.
7. **Não** trocar `DanfePdfService` (NF-e/DANFE) nem `DanfsePdfService` (fica como fallback do item 5.3). Só **adicionar** `DanfseNacionalPdfService`.

## Wrinkle técnico: `nfse-node` é ESM, backend compila p/ CommonJS

- Nos serviços: usar **`await import("nfse-node/danfse")` / `await import("nfse-node/cliente")`** (dynamic import) dentro dos métodos, não `import` estático no topo. Com `tsconfig` `module: Node16`, o `tsc` preserva o `import()` nativo — ok em runtime (Node 24 no deploy).
- Nos **testes** (ts-jest, `module: CommonJS`): `jest.mock("nfse-node/danfse", () => ({ gerarDanfse: jest.fn() }))` e `jest.mock("nfse-node/cliente", () => ({ criarClienteSefin: jest.fn(), descompactarGZipBase64: jest.fn() }))` — o ESM real nunca é carregado no jest.
- O **teste de render real** (fixture 239) NÃO roda bem sob ts-jest CJS (downlevel de `import()` vira `require` de ESM). Opções: (a) marcá-lo `describe.skip` com um comentário e deixar a validação real no "Verificação manual"; (b) rodar como script `.mjs` separado na seção de verificação; (c) `const { gerarDanfse } = await (new Function('return import("nfse-node/danfse")')())` pra driblar o transform. Preferir (b) — script `.mjs` na verificação manual, sem teste jest de render real.
- `@types/pdfkit` provavelmente necessário como devDep (mesmo motivo da quick 260828-e3v — o `.d.ts` de deps pdfkit-based usa o global `PDFKit`). Confirmar no `tsc`.

## Arquivos-alvo (planner refina)

- `apps/backend/package.json` (+ `nfse-node`, talvez `@types/pdfkit`)
- `apps/backend/prisma/schema.prisma` + nova migration
- `apps/backend/src/modules/integrations/nfse/nfse-nacional-distribuicao.service.ts` (novo — cliente ADN + sincronização)
- `apps/backend/src/modules/integrations/nfse/danfse-nacional-pdf.service.ts` (novo — wrapper `gerarDanfse`)
- `apps/backend/src/modules/integrations/nfse/nfse.module.ts` (providers + exports)
- `apps/backend/src/modules/cobranca/cobranca.service.ts` (`baixarDanfsePdf` — nova prioridade; injetar os 2 serviços novos via NfseModule)
- `apps/backend/src/modules/cobranca/cobranca.controller.ts` (`POST nfse/sincronizar-dfe`)
- testes: `nfse-nacional-distribuicao.service.test.ts`, `danfse-nacional-pdf.service.test.ts`, ajuste em `cobranca.service.*.test.ts` se o construtor mudar (usam `Object.create`, então geralmente ok)
- fixture: `.planning/quick/260828-g45-.../fixture-nfse-nacional-239.xml` (copiar p/ `src/.../__fixtures__/` se for usado em teste)

## Fora de escopo
Cron/agendamento; marca d'água de cancelamento/substituição; trocar o DANFSe do fluxo de orçamento; UI/botão; reprocessar eventos; NFС-e; deploy/stack.env (nenhuma env var nova — reusa `NFSE_NACIONAL_*`). NÃO tocar `main` nem PR #56; sem push.
