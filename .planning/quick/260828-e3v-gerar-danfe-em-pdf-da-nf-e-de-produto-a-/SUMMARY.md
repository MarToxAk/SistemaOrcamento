---
task: "NF-e de produto como PDF (DANFE) no e-mail de contas a receber - lib pronta nfe-danfe-pdf"
quick_id: 260828-e3v-gerar-danfe-em-pdf-da-nf-e-de-produto-a-
branch: fix/orcamento-total-desconto-zerado
status: complete
completed: 2026-08-28
commits:
  - 40fad1b
  - aa8c6a7
  - d01335e
  - f41d506
  - 1f3d32e
key-files:
  created:
    - apps/backend/src/modules/integrations/nfse/danfe-pdf.service.ts
    - apps/backend/src/modules/integrations/nfse/danfe-pdf.service.test.ts
    - apps/backend/src/modules/integrations/nfse/danfe-pdf.service.render.test.ts
    - apps/backend/src/modules/integrations/nfse/__fixtures__/nfe-573.xml
  modified:
    - apps/backend/package.json
    - package-lock.json
    - apps/backend/src/modules/integrations/nfse/nfse.module.ts
    - apps/backend/src/modules/integrations/athos/athos.service.ts
    - apps/backend/src/modules/cobranca/email-envio.service.ts
    - apps/backend/src/modules/cobranca/email-envio.service.test.ts
    - apps/backend/src/modules/cobranca/cobranca.controller.ts
    - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx
---

# Quick task 260828-e3v - NF-e de produto como PDF (DANFE) no e-mail de contas a receber

Troca a NF-e de produto anexada ao e-mail de contas a receber de .xml cru para PDF (DANFE)
renderizado pela biblioteca pronta nfe-danfe-pdf@1.0.3 (MIT, deps 100% JS). Em qualquer erro de
render, o .xml cru volta a ser anexado (fallback) e o e-mail nunca falha.

## Por tarefa

### Task 1 - nfe-danfe-pdf + DanfePdfService + registro no NfseModule - commit 40fad1b

- cd apps/backend && npm install nfe-danfe-pdf && npm install -D @types/pdfkit.
  Instalados: nfe-danfe-pdf ^1.0.3 (dependencia) e @types/pdfkit ^0.17.6 (devDependency).
  O npm (workspaces) elevou nfe-danfe-pdf para o node_modules/ da raiz - comportamento normal do
  monorepo; require("nfe-danfe-pdf") resolve de apps/backend normalmente.
- Novo apps/backend/src/modules/integrations/nfse/danfe-pdf.service.ts:
  - import { gerarPDF } from "nfe-danfe-pdf" (o .d.ts publicado declara export nomeado; tsc Node16
    aceita sem import *).
  - async gerarDanfe({ xml, cancelada? }): Promise<Buffer> - monta opcoes { cancelada: cancelada ?? false },
    so adiciona pathLogo se resolvido; chama gerarPDF; NAO finaliza o doc manualmente; coleta via
    doc.on("data" / "end" / "error") em Buffer.concat(chunks); timeout de seguranca de 20s via
    setTimeout que rejeita Error("DANFE render timeout") (timer limpo no finally).
  - resolveLogoPath() privado: le EMPRESA_LOGO_URL; vazio -> undefined; caminho local existente ->
    retorna; http(s) -> cache Map<url,path> em instancia, axios.get arraybuffer (timeout 5s, max 5MB),
    exige content-type image/*, grava os.tmpdir()/danfe-logo-<sha1(url).slice(0,12)>.<ext>, cacheia o
    path; catch -> logger.warn + undefined (best-effort).
- nfse.module.ts: DanfePdfService adicionado a providers E exports (import no topo).

Aceite - todos PASSARAM (offline):
- cd apps/backend && npx tsc -p tsconfig.build.json --noEmit -> exit 0.
- node -e checando p.dependencies['nfe-danfe-pdf'] && p.devDependencies['@types/pdfkit'] -> exit 0.
- grep -n from "nfe-danfe-pdf" em danfe-pdf.service.ts -> linha 9.
- grep -c 'doc.end()' danfe-pdf.service.ts -> 0.
- grep -c 'DanfePdfService' nfse.module.ts -> 3.
- Sanity da lib crua + fixture (raiz do repo): cd apps/backend && node -e "(async()=>{const {gerarPDF}=require('nfe-danfe-pdf');const fs=require('fs');const xml=fs.readFileSync('../../.planning/quick/260828-e3v-gerar-danfe-em-pdf-da-nf-e-de-produto-a-/fixture-nfe-573.xml','utf8');const doc=await gerarPDF(xml,{});const chunks=[];doc.on('data',c=>chunks.push(c));doc.on('end',()=>{const b=Buffer.concat(chunks);console.log('bytes',b.length,'head',b.subarray(0,5).toString());process.exit(b.subarray(0,4).toString()==='%PDF'&&b.length>10240?0:1)});doc.on('error',e=>{console.error(e);process.exit(1)})})()"
  -> bytes 83854 head %PDF-, exit 0.

### Task 2 - Athos: buscarNotasFiscaisXmlPorTitulos retorna cancelada - commit aa8c6a7

- athos.service.ts (so esse metodo):
  - SELECT DISTINCT n.numero, n.xml -> SELECT DISTINCT n.numero, n.xml, n.cancelada.
  - Retorno: Promise<Array<{ numero: string; xml: string; cancelada: boolean }>>.
  - Map de dedupe guarda { xml, cancelada } (chave = numero, 1a ocorrencia com xml nao-vazio).
  - cancelada = r["cancelada"] === true || r["cancelada"] === "t" (Athos PG 9.0.5: boolean ou "t"/"f").
  - WHERE ... AND COALESCE(n.cancelada, false) = false MANTIDO (NF-e cancelada continua fora do
    e-mail - cancelada sera false na pratica; o flag existe pela assinatura da lib e uso futuro).
  - Pool read-only + client.release() no finally + catch -> warn + return [] inalterados.

Aceite - todos PASSARAM (offline):
- npx tsc -p tsconfig.build.json --noEmit -> exit 0.
- grep -n 'n.numero, n.xml, n.cancelada' athos.service.ts -> linha 2085.
- grep -n 'numero: string; xml: string; cancelada: boolean' athos.service.ts -> linha 2079.
- grep -c 'COALESCE(n.cancelada, false) = false' athos.service.ts -> 6 (inalterado).
- cd apps/backend && npm test - ver secao Regressao.

### Task 3 - EmailEnvioService: DANFE PDF (fallback XML) + previewDanfePdf + teste - commit d01335e

- email-envio.service.ts:
  - Import DanfePdfService + NotFoundException de @nestjs/common.
  - Construtor: + private readonly danfePdfService: DanfePdfService (apos athosService).
  - Loop de NF-e: desestrutura tambem cancelada;
    try { pdf = await danfePdfService.gerarDanfe({ xml, cancelada }); push NF-e-<n>.pdf application/pdf }
    catch { logger.warn(...); push NF-e-<n>.xml application/xml }
  - nfeNumeros e cobrancaEmailEnvio.create({ data: { ..., nfeNumeros } }) INALTERADOS.
  - Frase do corpo: NF-e (XML) -> NF-e (PDF).
  - Novo async previewDanfePdf(cobrancaBoletoId, numero?): cobrancaBoleto.findUnique (include
    titulos.idcontareceber) -> buscarNotasFiscaisXmlPorTitulos -> numero?.trim() seleciona por numero,
    senao notas[0] -> !alvo -> NotFoundException -> gerarDanfe -> { pdfBuffer, nomeArquivo: NF-e-<n>.pdf }.
- email-envio.service.test.ts:
  - makeService(): danfePdfService = { gerarDanfe: jest.fn().mockResolvedValue(Buffer.from("%PDF-1.4 fake-danfe")) }.
  - buscarNotasFiscaisXmlPorTitulos mock -> cada item com cancelada: false.
  - Teste 1 renomeado ("...2 NF-e PDF..."): attachments length 5; application/pdf -> 2, filenames
    ["NF-e-440.pdf","NF-e-441.pdf"], content.subarray(0,4) === "%PDF"; gerarDanfe 2x com
    { xml: "<NFe/>", cancelada: false }; nfeNumeros -> ["440","441"].
  - Novo teste 1b: gerarDanfe.mockRejectedValueOnce(Error("boom")).mockResolvedValue(Buffer.from("%PDF-1.4 ok"))
    -> 1 anexo NF-e-440.xml (application/xml, "<NFe/>") + 1 anexo NF-e-441.pdf (application/pdf);
    sendMail 1x; create com nfeNumeros: ["440","441"].

Aceite - todos PASSARAM (offline):
- npx tsc -p tsconfig.build.json --noEmit -> exit 0.
- grep -n gerarDanfe / application/pdf / previewDanfePdf em email-envio.service.ts -> presentes (linhas 118, 122, 218, 234).
- grep -c 'NF-e (XML)' email-envio.service.ts -> 0; grep -c 'NF-e (PDF)' -> 1.
- cd apps/backend && npx jest src/modules/cobranca/email-envio.service.test.ts -> 8 passed / 8.

### Task 4 - endpoint GET /cobranca/nfe/danfe + copy do modal - commit f41d506

- cobranca.controller.ts: novo handler @Get("nfe/danfe") logo apos @Get("nfse/:id/pdf"):
  @Query("cobrancaBoletoId", ParseIntPipe) + @Query("numero") + @Res(); chama
  emailEnvioService.previewDanfePdf(cobrancaBoletoId, numero); Content-Type application/pdf;
  Content-Disposition inline; filename="NF-e-<n>.pdf". NAO e @Public() - guard global protege.
- page.tsx: unica ocorrencia de NF-e (XML) (<small className="text-muted d-block">) -> NF-e (PDF).

Aceite - todos PASSARAM (offline):
- npx tsc -p tsconfig.build.json --noEmit -> exit 0.
- grep -n '@Get("nfe/danfe")' cobranca.controller.ts -> linha 113 (1 match).
- grep -c '@Public()' cobranca.controller.ts -> 3 (inalterado; endpoint novo NAO e publico).
- git grep -c 'NF-e (XML)' page.tsx -> 0; git grep -c 'NF-e (PDF)' page.tsx -> 1.
- cd apps/frontend && npm run build -> exit 0.

### Task 5 - testes do DanfePdfService: unit (mock) + render real do fixture 573 - commit 1f3d32e

- __fixtures__/nfe-573.xml - copia byte a byte de .planning/quick/260828-e3v/fixture-nfe-573.xml
  (cmp confirmou; 9964 bytes). Teste nao depende de .planning/ (arquivavel pelo gsd-cleanup).
- danfe-pdf.service.test.ts - jest.mock("nfe-danfe-pdf"), Object.create(DanfePdfService.prototype)
  + config/logger/logoPathCache fakes. Casos:
  1. coleta o stream em Buffer (%PDF), concatena os 2 chunks;
  2. cancelada: true repassado as opcoes;
  3. EMPRESA_LOGO_URL vazia -> opts.pathLogo undefined;
  4. doc emite error -> gerarDanfe REJEITA (/render boom/);
  5. timeout de seguranca (fake timers, advanceTimersByTimeAsync(20000)) -> rejeita /timeout/i.
- danfe-pdf.service.render.test.ts - SEM jest.mock; DanfePdfService real + gerarPDF real;
  jest.setTimeout(20000); le __dirname/__fixtures__/nfe-573.xml; buf.subarray(0,5) === "%PDF-";
  buf.length > 10*1024.

Aceite - todos PASSARAM (offline):
- cd apps/backend && npx jest danfe-pdf.service.test.ts danfe-pdf.service.render.test.ts
  -> 6 passed / 6 (2 suites). Render real produziu PDF %PDF- a partir do fixture 573.
- npx tsc -p tsconfig.build.json --noEmit -> exit 0.
- git status --porcelain mostra __fixtures__/nfe-573.xml + os 2 novos *.test.ts.

## Regressao - suite completa do backend

- Apos Task 2 (antes dos testes novos): cd apps/backend && npx jest -> 28 suites / 398 tests passed (exit 0).
- Apos Task 5 (final): cd apps/backend && npx jest -> 30 suites / 404 tests passed (exit 0). +2 suites
  e +6 testes sao exatamente os novos danfe-pdf.service*.test.ts. Zero regressao.

Nota: npm test (jest sem filtro) leva ~6-8 min neste ambiente (ts-jest, sem cache). Um worker e
"force exited" no fim por timers/handles vazando em testes pre-existentes (Athos/EFI/Chatwoot) -
comportamento pre-existente, nao introduzido por esta task.

## Verificacao manual - DEFERIDA ao usuario (precisa backend :4000 + DB Athos + SMTP rodando)

Nenhum destes foi executado (nao faco requisicoes contra backend vivo nem envio e-mail real).
Comandos exatos (backend :4000, apps/backend/.env com INTERNAL_API_KEY, DATABASE_URL, SMTP_*,
APP_BASE_URL; EMPRESA_LOGO_URL opcional):

1. Endpoint de debug (sem e-mail) - cliente 3504 / boleto 139, NF-e 573:
     curl -s "http://localhost:4000/api/cobranca/nfe/danfe?cobrancaBoletoId=139&numero=573" -H "x-internal-api-key: $INTERNAL_API_KEY" -o /tmp/danfe-573.pdf
     file /tmp/danfe-573.pdf
     pdftotext /tmp/danfe-573.pdf - | head -40
   Conferir no PDF: Emitente BOM CUSTO PAPELARIA & GRAFICA RAPIDA LTDA CNPJ 62.391.927/0001-57;
   Destinatario ENOTEC ENGENHARIA OBRAS E TECNOLOGIA LTDA CNPJ 56.096.886/0001-73; 5 itens;
   vProd/vNF R$ 489,29; ICMS 0,00 (CSOSN 500); chave 3526 0862 3919 2700 0157 5500 1000 0005 7317 6355 9432
   + codigo de barras; protocolo 135263532093935 "Autorizado o uso da NF-e" 26/08/2026 12:08:56;
   logo presente so se EMPRESA_LOGO_URL setada. numero errado / boleto sem NF-e -> HTTP 404.

2. E-mail real: UI /contas-receber/3504 -> boleto 139 -> E-mail -> seu proprio e-mail -> Enviar. Ou:
     curl -s -X POST "http://localhost:4000/api/cobranca/email/enviar" -H "x-internal-api-key: $INTERNAL_API_KEY" -H "content-type: application/json" -d "{\"idclienteAthos\":3504,\"cobrancaBoletoId\":139}"
   Modal (pre-envio): "... + N NFS-e (PDF) + M NF-e (PDF)". Caixa de entrada: 1 e-mail, anexo
   NF-e-573.pdf abre num leitor de PDF (NAO XML); corpo "... + 1 NF-e (PDF)"; lista de sucesso na UI
   mostra NF-e-573.pdf.

3. Fallback (opcional): EMPRESA_LOGO_URL invalida -> render sem logo (sem erro). XML corrompido em
   nota.xml -> anexo cai para NF-e-<n>.xml + logger.warn; e-mail ainda sai.

4. Build do frontend (offline, ja executado): cd apps/frontend && npm run build -> exit 0.

## Deviations from Plan

1. danfe-pdf.service.test.ts Teste 1 - strings dos chunks ajustadas. O PLAN sugeria
   Buffer.from("%PDF-1.4 ") + Buffer.from("rest") afirmando length === 12, mas somam 13 bytes
   ("%PDF-1.4 " tem 9 chars). Usei "%PDF-1.4" + "rest" (= 12) para bater com a assercao do PLAN e
   adicionei expect(buf.toString()).toBe("%PDF-1.4rest"). Sem efeito no codigo de producao.

2. danfe-pdf.service.test.ts Teste 5 (timeout, "Opcional" no PLAN) - usa advanceTimersByTimeAsync em
   vez de advanceTimersByTime + await Promise.resolve(). gerarDanfe real faz dois await
   (resolveLogoPath, gerarPDF) antes de registrar o setTimeout; um flush de microtask nao bastava e o
   teste estourava o timeout padrao do Jest. Versao async (Jest 30) flusha microtasks entre callbacks
   e torna o teste deterministico. Sem mudanca no codigo de producao.

3. import { gerarPDF } from "nfe-danfe-pdf" mantido (nao foi preciso import * as). O PLAN previa
   fallback caso o tsc Node16 reclamasse - nao reclamou.

4. apps/frontend/next-env.d.ts revertido. O npm run build (check da Task 4) reescreveu next-env.d.ts
   (.next/dev/types -> .next/types) - churn de artefato gerado pelo toggle build/dev, sem relacao com
   a task. Revertido com git checkout -- para manter o commit limpo.

## Known Stubs

Nenhum. EMPRESA_LOGO_URL vazio e caminho suportado por design (DANFE sem logo, sem erro). O flag
cancelada e false na pratica hoje porque buscarNotasFiscaisXmlPorTitulos filtra
COALESCE(n.cancelada, false) = false - comportamento intencional documentado no PLAN/DECISIONS.

## Self-Check: PASSED

Arquivos criados conferidos em disco:
- apps/backend/src/modules/integrations/nfse/danfe-pdf.service.ts - FOUND
- apps/backend/src/modules/integrations/nfse/danfe-pdf.service.test.ts - FOUND
- apps/backend/src/modules/integrations/nfse/danfe-pdf.service.render.test.ts - FOUND
- apps/backend/src/modules/integrations/nfse/__fixtures__/nfe-573.xml - FOUND

Commits conferidos em git log:
- 40fad1b - FOUND
- aa8c6a7 - FOUND
- d01335e - FOUND
- f41d506 - FOUND
- 1f3d32e - FOUND
