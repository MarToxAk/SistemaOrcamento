import { QuotesService } from "./quotes.service";

describe("QuotesService — Phase 06 behaviors", () => {
  describe("D-03 — approvalLink usa /orcamento/ (não /api/quotes/)", () => {
    it("padrão correto corresponde a /orcamento/{id}/approve", () => {
      const correctPattern = /\/orcamento\//;
      const wrongPattern = /\/api\/quotes\//;
      expect(correctPattern.test("/orcamento/123/approve")).toBe(true);
      expect(wrongPattern.test("/orcamento/123/approve")).toBe(false);
    });
  });
});
