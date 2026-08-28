# Decisões travadas — quick 260828-e3v (2026-08-28, revisado)

## Objetivo
Anexar a **NF-e de produto como PDF (DANFE)** — não mais `.xml` — no e-mail de contas a receber (feito na quick 260827-ood). Motivo: no teste real (e-mail id 2) veio `NF-e-573.xml`; usuário quer o PDF.

## ABORDAGEM: usar biblioteca pronta (NÃO construir do zero)

**Lib escolhida: `nfe-danfe-pdf` (flaviosoliver), v1.0.3, MIT.**
- Deps 100% JS: `pdfkit`, `bwip-js`, `qrcode`, `xml2js`, `date-fns`. **Zero dependência nativa** (nada de `canvas`/node-gyp) — não afeta a imagem Docker Alpine.
- `node-sped-pdf` foi **descartada**: puxa `canvas` (nativo), ruim pro build Alpine.
- Já validada localmente: renderizou a NF-e 573 real (Simples Nacional, CSOSN 500) → PDF válido, 1 página, ~84 KB. Fixture salva em `fixture-nfe-573.xml` nesta pasta.

### API da lib
```ts
import { gerarPDF } from "nfe-danfe-pdf";
const doc = await gerarPDF(xml: string, opcoes?: {
  pathLogo?: string;      // caminho de ARQUIVO de imagem (não data URI)
  cancelada?: boolean;
  textoRodape?: string;
}); // => PDFKit.PDFDocument (stream)
```
**Pegadinha confirmada no teste:** NÃO chamar `doc.end()` — a lib já finaliza. Coletar assim:
```ts
const chunks: Buffer[] = [];
await new Promise<void>((res, rej) => {
  doc.on("data", (c) => chunks.push(c));
  doc.on("end", () => res());
  doc.on("error", rej);
});
const pdfBuffer = Buffer.concat(chunks);
```
Fontes (Times New Roman + Barlow Condensed) já vêm embutidas na lib. Modelo 55 e 65 suportados; nós só usamos 55. Orientação/canhoto/código de barras são tratados pela própria lib (DANFE 55 é retrato por padrão — a lib faz certo; a ideia anterior de "A4 paisagem" estava errada).

## Mudanças concretas (branch `fix/orcamento-total-desconto-zerado` — NÃO tocar main / PR #56)

1. `apps/backend/package.json`: `npm install nfe-danfe-pdf`.
2. **Novo** `apps/backend/src/modules/integrations/nfse/danfe-pdf.service.ts` — `DanfePdfService` (`@Injectable()`):
   - `async gerarDanfe(input: { xml: string; cancelada?: boolean }): Promise<Buffer>` — chama `gerarPDF`, coleta o stream em Buffer (padrão acima), com timeout de segurança (~20s) e `error` → throw.
   - **Logo**: método privado que resolve `EMPRESA_LOGO_URL` (env) uma vez para um arquivo temp em disco (cache em memória do path; baixa via axios; se falhar, segue sem logo) e passa como `pathLogo`. Se `EMPRESA_LOGO_URL` vazia → sem `pathLogo`.
   - Registrar o provider no mesmo módulo onde `DanfsePdfService` está registrado; exportar se necessário para o `CobrancaModule`.
3. `AthosService.buscarNotasFiscaisXmlPorTitulos(idcontasReceber[])`: estender o `SELECT` para trazer também `n.cancelada` (para o flag `cancelada` da lib). Retorno passa a `Array<{ numero: string; xml: string; cancelada: boolean }>`. Manter dedupe por `numero` com `xml` não-vazio, pool read-only, warn+`return []`. Atualizar o teste do método se existir (`git grep buscarNotasFiscaisXmlPorTitulos`).
4. `EmailEnvioService.enviarBoletoENotas` (`apps/backend/src/modules/cobranca/email-envio.service.ts`):
   - Injetar `DanfePdfService`.
   - Para cada NF-e `{ numero, xml, cancelada }`: tentar `const pdf = await this.danfePdfService.gerarDanfe({ xml, cancelada })` → anexo `{ filename: \`NF-e-${numero}.pdf\`, content: pdf, contentType: "application/pdf" }`.
   - **Fallback**: se `gerarDanfe` lançar → `this.logger.warn(...)`, anexar o XML cru `{ filename: \`NF-e-${numero}.xml\`, content: xml, contentType: "application/xml" }` e seguir. O e-mail nunca falha por causa do DANFE.
   - `nfeNumeros` continua sendo gravado igual.
5. Frontend `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx`: no texto do modal de e-mail, trocar `"{M} NF-e (XML)"` → `"{M} NF-e (PDF)"`.
6. **Endpoint autenticado de debug** (sem botão em tela): `GET /cobranca/nfe/danfe?numero=<n>&idclienteAthos=<id>` no `cobranca.controller.ts` — resolve o XML via `buscarNotasFiscaisXmlPorTitulos` (a partir dos títulos do cliente) ou uma consulta direta, e devolve o PDF (`res` com `application/pdf`). Só pra validar o render sem disparar e-mail. Guard global já protege (não é `@Public()`).
7. Testes:
   - `danfe-pdf.service` — teste que mocka `nfe-danfe-pdf` (`jest.mock`) e valida: coleta do stream em Buffer, flag `cancelada` repassada, fallback de logo quando `EMPRESA_LOGO_URL` vazia.
   - `email-envio.service.test.ts` — atualizar: anexo de NF-e agora é `NF-e-<n>.pdf` `application/pdf`; adicionar caso em que `gerarDanfe` rejeita → anexo cai para `.xml`.
   - Um teste de integração leve (pode ser `*.test.ts` marcado, ou no manual) que renderiza `fixture-nfe-573.xml` de verdade e assere `%PDF` + tamanho > 10 KB.

## Verificação manual
- Rodar o backend, `GET /cobranca/nfe/danfe?...` da nota 573 → abrir o PDF, conferir emitente/destinatário/itens/totais/chave/código de barras/protocolo e o logo (se `EMPRESA_LOGO_URL` setada).
- Reenviar o e-mail de teste de contas a receber (cliente 3504 / boleto 139) → confirmar que chega `NF-e-573.pdf` (PDF real, não XML).

## Fora de escopo
- Construir parser/template/DANFE do zero; Puppeteer para NF-e; NFC-e modelo 65; consulta SEFAZ; assinatura/validação de XML; qualquer botão avulso em tela (o único botão continua sendo "Confirmar recebimento" no e-mail); mexer em `main` ou PR #56.

## Notas
- `pathLogo` da lib é caminho de arquivo, não data URI nem Buffer — por isso o `DanfePdfService` baixa o logo pra um arquivo temp.
- A lib comprime os content streams (FlateDecode) — `grep`/`strings` no PDF não acham texto; validar com `pdftotext` (se disponível) ou abrindo o arquivo.
- `nfe-danfe-pdf` lê o protocolo de autorização do próprio `<nfeProc><protNFe>` no XML; as notas do Athos têm o wrapper `<nfeProc>` (confirmado na 573), então não precisa das colunas `nfeprotocolo*`.
