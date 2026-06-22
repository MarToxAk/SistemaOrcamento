/**
 * Scaffold Wave 0 — quotes-pdf-storage (integração com template ativo)
 *
 * Cobre: D-02 (bloqueio de rede no Puppeteer / anti-SSRF), D-05 (renderHtml usa ativo,
 * sem ativo usa fallback).
 * Implementação completa: Plano 03 (renderHtml async com template ativo) e Plano 05.
 *
 * Os testes abaixo são placeholders honestos (it.todo) que documentam os
 * comportamentos esperados. Nenhum arquivo do módulo é importado aqui
 * com dependência do PdfTemplate ainda inexistente — evita erros de importação.
 */

describe('QuotesPdfStorageService — template ativo e bloqueio de rede', () => {
  describe('resolução de template (D-05)', () => {
    it.todo(
      'renderHtml usa o template marcado como isActive=true no banco (PdfTemplate ativo)',
    );

    it.todo(
      'sem nenhum PdfTemplate ativo no banco, renderHtml cai no fallback: EMPRESA_PDF_TEMPLATE_PATH ou quote-default.hbs',
    );
  });

  describe('bloqueio de rede no Puppeteer (D-02)', () => {
    it.todo(
      'renderPdfBuffer aborta toda requisição http externa via page.setRequestInterception ' +
        '(anti-SSRF / anti-exfiltração)',
    );

    it.todo(
      'renderPdfBuffer permite apenas documento inline (about:blank / data:) durante o render',
    );
  });
});
