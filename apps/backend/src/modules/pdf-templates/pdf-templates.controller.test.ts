/**
 * Scaffold Wave 0 — pdf-templates.controller
 *
 * Cobre: D-08 (preview retorna PDF sem persistir).
 * Implementação completa: Plano 05 (controller com AdminAuthGuard).
 *
 * Os testes abaixo são placeholders honestos (it.todo) que documentam os
 * comportamentos esperados. Nenhum arquivo do controller é importado aqui,
 * pois o controller ainda não existe — evita erros de importação na Wave 0.
 */

describe('PdfTemplatesController', () => {
  describe('preview de template (D-08)', () => {
    it.todo(
      'POST /pdf-templates/:id/preview retorna buffer PDF sem persistir nada no banco',
    );

    it.todo(
      'preview usa dados de orçamento de exemplo (mock) para preencher o template',
    );
  });

  describe('proteção por AdminAuthGuard (D-03)', () => {
    it.todo(
      'endpoints de escrita (upload, ativar, excluir, preview) retornam 401 sem x-admin-api-key',
    );
  });
});
