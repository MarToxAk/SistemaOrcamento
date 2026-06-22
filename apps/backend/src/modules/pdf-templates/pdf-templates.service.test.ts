/**
 * Scaffold Wave 0 — pdf-templates.service
 *
 * Cobre: D-02 (validação de upload / compile hardened), D-04 (swap atômico do ativo).
 * Implementação completa: Plano 05 (módulo de gerenciamento).
 *
 * Os testes abaixo são placeholders honestos (it.todo) que documentam os
 * comportamentos esperados. Nenhum arquivo do módulo é importado aqui,
 * pois o módulo ainda não existe — evita erros de importação na Wave 0.
 */

describe('PdfTemplatesService', () => {
  describe('validação de upload (D-02)', () => {
    it.todo('rejeita template com tag <script> explícita');

    it.todo('rejeita template com handler de evento on*= (ex: onerror=)');

    it.todo('rejeita template com protocolo javascript:');

    it.todo('rejeita template acima de 512KB');

    it.todo('aceita template .hbs limpo sem scripts/eventos');
  });

  describe('compilação Handlebars hardened (D-02)', () => {
    it.todo('lança erro ao compilar template com helper desconhecido (knownHelpersOnly=true)');

    it.todo('compila corretamente template usando apenas built-ins (#if, #each, #unless)');
  });

  describe('ativação de template (D-04)', () => {
    it.todo('ativar um template zera isActive de todos os demais (swap atômico por transação)');

    it.todo('após ativar, exatamente 1 registro tem isActive=true');
  });
});
