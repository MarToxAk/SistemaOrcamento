/**
 * Fase 55 (plano 55-07): smoke com Chromium REAL do PDF da proposta.
 * Habilitado so com RUN_PUPPETEER_SMOKE=1 (precisa do Chromium do Puppeteer instalado).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { QuotesPdfStorageService } from "../quotes/quotes-pdf-storage.service";
import { PropostaParaPdf, montarContextoProposta } from "./propostas-pdf.util";

const TEMPLATE = readFileSync(path.resolve(__dirname, "../../../templates/proposta-institucional.hbs"), "utf-8");

function proposta(quantidadeItens: number): PropostaParaPdf {
  return {
    idorcamentoAthos: 123456,
    athosData: "2026-11-27",
    athosHora: "14:32:10",
    clienteSnapshot: {
      razaoSocial: "MUNICIPIO DE TESTE",
      documento: "46639345000130",
      endereco: { logradouro: "Avenida Teste", numero: "1", bairro: "Centro", cidade: "Cidade Teste", uf: "SP", cep: "11630000" },
    },
    validadeDias: 1,
    prazoEntregaDias: 15,
    observacao: "Observacao de teste.",
    assinanteNome: "Fulano de Tal",
    itens: Array.from({ length: quantidadeItens }, (_, i) => ({
      sequencia: i + 1,
      idproduto: 1000 + i,
      nome: `Produto de teste numero ${i + 1} com uma descricao razoavelmente longa para o item`,
      descricaoCurta: i % 3 === 0 ? "Descricao curta do item" : null,
      unidade: "UN",
      quantidade: "3",
      precoUnitario: "12.34",
    })),
  };
}

function contarPaginas(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

const smoke = process.env.RUN_PUPPETEER_SMOKE === "1" ? describe : describe.skip;

smoke("PDF da proposta (smoke real com Chromium)", () => {
  jest.setTimeout(60000);

  const storage = new QuotesPdfStorageService({ get: () => undefined } as never, {} as never);

  async function renderizar(quantidadeItens: number): Promise<Buffer> {
    const contexto = montarContextoProposta({
      proposta: proposta(quantidadeItens),
      empresa: { nome: "Empresa Teste Papelaria Ltda", cnpj: "00.000.000/0001-91", endereco: "Rua de Teste, 10 - Cidade Teste/SP" },
      banco: {
        bancoNome: "Banco de Teste",
        agencia: "1234",
        conta: "56789-0",
        titular: "Empresa Teste Papelaria Ltda",
        documentoTitular: "00000000000191",
      },
      previa: false,
    });
    const html = storage.renderHtmlFromSource(TEMPLATE, contexto as unknown as Record<string, unknown>);
    return storage.renderPdfMultipagina(html, { rodape: "Proposta comercial nº 123456 - Empresa Teste Papelaria Ltda" });
  }

  it("60 itens geram um PDF valido com pelo menos 2 paginas (sem escala de reducao)", async () => {
    const pdf = await renderizar(60);
    expect(pdf.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(contarPaginas(pdf)).toBeGreaterThanOrEqual(2);
  });

  it("1 item gera um PDF valido", async () => {
    const pdf = await renderizar(1);
    expect(pdf.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(contarPaginas(pdf)).toBeGreaterThanOrEqual(1);
  });
});
