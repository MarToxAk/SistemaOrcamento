import Handlebars from "handlebars";

// Permite simular "nenhum .hbs empacotado encontrado" sem tocar no disco.
let semArquivoEmpacotado = false;
jest.mock("node:fs", () => {
  const actual = jest.requireActual("node:fs");
  return {
    ...actual,
    existsSync: jest.fn((p: string) => (semArquivoEmpacotado && String(p).endsWith("proposta-institucional.hbs") ? false : actual.existsSync(p))),
  };
});

import { readFileSync } from "node:fs";
import path from "node:path";

import { PdfTemplateFamilia } from "@prisma/client";

import { PropostaError } from "./propostas.errors";
import { PropostasPdfService } from "./propostas-pdf.service";
import { PdfSnapshotProposta, PropostaParaPdf } from "./propostas-pdf.util";

const HBS_EMPACOTADO = readFileSync(path.resolve(__dirname, "../../../templates/proposta-institucional.hbs"), "utf-8");

// Dados FICTICIOS de teste.
const LINHA_BANCO = {
  id: "default",
  bancoNome: "Banco de Teste",
  agencia: "1234",
  conta: "56789-0",
  titular: "Empresa Teste Papelaria Ltda",
  documentoTitular: "00000000000191",
  atualizadoEm: new Date(),
};

const ENV_INICIAL: Record<string, string | undefined> = {
  EMPRESA_NOME: "Empresa Teste Papelaria Ltda",
  EMPRESA_CNPJ: "00.000.000/0001-91",
  EMPRESA_ENDERECO: "Rua de Teste, 10 - Cidade Teste/SP",
  EMPRESA_TELEFONES: "(12) 3000-0000",
  EMPRESA_EMAIL: "contato@empresa-teste.test",
  EMPRESA_LOGO_URL: "https://cdn.exemplo.test/logo.png",
};

function proposta(extra: Record<string, unknown> = {}): PropostaParaPdf {
  return {
    idorcamentoAthos: 123456,
    athosData: "2026-11-27",
    athosHora: "14:32:10",
    clienteSnapshot: {
      razaoSocial: "MUNICIPIO DE ILHABELA",
      nomeFantasia: null,
      documento: "46639345000130",
      endereco: { logradouro: "Avenida Princesa Isabel", numero: "1", complemento: null, bairro: "Perequê", cidade: "Ilhabela", uf: "SP", cep: "11630000" },
    },
    validadeDias: 1,
    prazoEntregaDias: 15,
    itens: [
      {
        sequencia: 1,
        idproduto: 4321,
        nome: "Papel sulfite A4",
        quantidade: "2.000",
        precoUnitario: "24.90",
        // campos internos que nunca podem chegar ao render
        custoUnitario: "7.777",
        nomeAthos: "NOME ORIGINAL ATHOS XYZ",
        precoBase: "7.777",
      },
    ],
    ...extra,
  } as unknown as PropostaParaPdf;
}

function montar() {
  const env: Record<string, string | undefined> = { ...ENV_INICIAL };
  const prisma = { propostaConfig: { findUnique: jest.fn().mockResolvedValue(LINHA_BANCO) } };
  const config = { get: jest.fn((k: string) => env[k]) };
  const repo = { getActiveSource: jest.fn().mockResolvedValue(null as string | null) };
  const storage = {
    resolveLogoDataUri: jest.fn().mockResolvedValue("data:image/png;base64,AAAA"),
    renderHtmlFromSource: jest.fn((source: string, ctx: Record<string, unknown>) =>
      Handlebars.create().compile(source, { knownHelpers: {}, knownHelpersOnly: true, strict: false, noEscape: false })(ctx),
    ),
    renderPdfMultipagina: jest.fn().mockResolvedValue(Buffer.from("%PDF-1.4 fake")),
    armazenarPdf: jest.fn(async (objectName: string) => ({ objectName })),
    downloadObjectBuffer: jest.fn().mockResolvedValue(Buffer.from("conteudo")),
    objectExists: jest.fn().mockResolvedValue(true),
  };
  const service = new PropostasPdfService(prisma as never, config as never, storage as never, repo as never);
  return { service, env, prisma, config, repo, storage };
}

async function codigoDoErro(promessa: Promise<unknown>): Promise<string | undefined> {
  try {
    await promessa;
  } catch (err) {
    expect(err).toBeInstanceOf(PropostaError);
    return (err as PropostaError).codigo;
  }
  return undefined;
}

beforeEach(() => {
  semArquivoEmpacotado = false;
});

describe("PropostasPdfService.capturarSnapshot", () => {
  it("usa o template PROPOSTA ativo do banco (origem BANCO)", async () => {
    const { service, repo } = montar();
    repo.getActiveSource.mockResolvedValue("<html>{{numero}} template do banco</html>");

    const snap = await service.capturarSnapshot();

    expect(repo.getActiveSource).toHaveBeenCalledWith(PdfTemplateFamilia.PROPOSTA);
    expect(snap.template).toEqual({ origem: "BANCO", source: "<html>{{numero}} template do banco</html>" });
    expect(snap.versao).toBe(1);
  });

  it("sem template ativo cai no .hbs empacotado (origem EMPACOTADO)", async () => {
    const { service } = montar();
    const snap = await service.capturarSnapshot();
    expect(snap.template.origem).toBe("EMPACOTADO");
    expect(snap.template.source).toBe(HBS_EMPACOTADO);
  });

  it("guarda banco, empresa e o TEXTO do logo (nunca o data URI)", async () => {
    const { service, storage } = montar();
    const snap = await service.capturarSnapshot();
    expect(snap.banco).toEqual({
      bancoNome: "Banco de Teste",
      agencia: "1234",
      conta: "56789-0",
      titular: "Empresa Teste Papelaria Ltda",
      documentoTitular: "00000000000191",
    });
    expect(snap.empresa).toEqual({
      nome: "Empresa Teste Papelaria Ltda",
      cnpj: "00.000.000/0001-91",
      endereco: "Rua de Teste, 10 - Cidade Teste/SP",
      telefones: "(12) 3000-0000",
      email: "contato@empresa-teste.test",
      logoUrl: "https://cdn.exemplo.test/logo.png",
    });
    expect(JSON.stringify(snap)).not.toContain("data:image");
    expect(storage.resolveLogoDataUri).not.toHaveBeenCalled();
  });

  it("opcionais ausentes ficam fora do snapshot", async () => {
    const { service, env } = montar();
    env.EMPRESA_TELEFONES = "";
    env.EMPRESA_EMAIL = undefined;
    env.EMPRESA_LOGO_URL = undefined;
    const snap = await service.capturarSnapshot();
    expect(Object.keys(snap.empresa).sort()).toEqual(["cnpj", "endereco", "nome"]);
  });

  it("dados bancarios ausentes geram PDF_INDISPONIVEL", async () => {
    const { service, prisma } = montar();
    prisma.propostaConfig.findUnique.mockResolvedValue(null);
    expect(await codigoDoErro(service.capturarSnapshot())).toBe("PDF_INDISPONIVEL");
  });

  it("nenhum template (nem ativo nem empacotado) gera PDF_INDISPONIVEL", async () => {
    const { service } = montar();
    semArquivoEmpacotado = true;
    expect(await codigoDoErro(service.capturarSnapshot())).toBe("PDF_INDISPONIVEL");
  });

  it("empresa sem nome ou CNPJ gera PDF_INDISPONIVEL", async () => {
    const { service, env } = montar();
    env.EMPRESA_CNPJ = "";
    expect(await codigoDoErro(service.capturarSnapshot())).toBe("PDF_INDISPONIVEL");
  });
});

describe("PropostasPdfService.gerarOficial", () => {
  it("armazena sob propostas/<idorcamento>/ e nunca monta URL publica", async () => {
    const { service, storage } = montar();
    const snap = await service.capturarSnapshot();

    const r = await service.gerarOficial(proposta(), snap);

    expect(r.objectName).toBe("propostas/123456/Proposta-123456.pdf");
    expect(r.objectName.startsWith("propostas/")).toBe(true);
    expect(storage.armazenarPdf).toHaveBeenCalledWith("propostas/123456/Proposta-123456.pdf", expect.any(Buffer));
    expect(storage.renderPdfMultipagina).toHaveBeenCalledWith(expect.any(String), {
      rodape: "Proposta comercial nº 123456 - Empresa Teste Papelaria Ltda",
    });
  });

  it("renderiza SOMENTE pelo snapshot: nao le configuracao bancaria, EMPRESA_* nem template ativo", async () => {
    const { service, env, prisma, config, repo, storage } = montar();
    const snap = await service.capturarSnapshot();

    // zera os contadores e MUDA tudo o que o snapshot ja congelou
    prisma.propostaConfig.findUnique.mockClear();
    repo.getActiveSource.mockClear();
    config.get.mockClear();
    prisma.propostaConfig.findUnique.mockResolvedValue({ ...LINHA_BANCO, bancoNome: "BANCO NOVO DEPOIS" });
    repo.getActiveSource.mockResolvedValue("<html>TEMPLATE NOVO DEPOIS</html>");
    env.EMPRESA_NOME = "EMPRESA NOVA DEPOIS";

    await service.gerarOficial(proposta(), snap);

    expect(prisma.propostaConfig.findUnique).toHaveBeenCalledTimes(0);
    expect(repo.getActiveSource).toHaveBeenCalledTimes(0);
    expect(config.get).toHaveBeenCalledTimes(0);

    const [source, ctx] = storage.renderHtmlFromSource.mock.calls[0];
    expect(source).toBe(snap.template.source);
    expect(ctx).toMatchObject({
      empresaNome: "Empresa Teste Papelaria Ltda",
      empresaCnpj: "00.000.000/0001-91",
      empresaEmail: "contato@empresa-teste.test",
      empresaLogoUrl: "data:image/png;base64,AAAA",
      banco: { bancoNome: "Banco de Teste", agencia: "1234", conta: "56789-0" },
      numero: "123456",
      previa: false,
    });
    expect(JSON.stringify(ctx)).not.toContain("DEPOIS");
    expect(storage.resolveLogoDataUri).toHaveBeenCalledWith("https://cdn.exemplo.test/logo.png");
  });

  it("e reproduzivel: duas chamadas com a mesma proposta e o mesmo snapshot entregam o mesmo HTML", async () => {
    const { service, storage, env, repo } = montar();
    const snap = await service.capturarSnapshot();

    await service.gerarOficial(proposta(), snap);
    env.EMPRESA_NOME = "OUTRA";
    repo.getActiveSource.mockResolvedValue("<html>outro</html>");
    await service.gerarOficial(proposta(), snap);

    const htmls = storage.renderPdfMultipagina.mock.calls.map((c) => c[0] as string);
    expect(htmls).toHaveLength(2);
    expect(htmls[0]).toBe(htmls[1]);
    expect(htmls[0]).toContain("Banco de Teste");
    expect(htmls[0]).toContain("Proposta nº");
  });

  it("snapshot invalido gera PDF_INDISPONIVEL e nao renderiza nem armazena", async () => {
    const { service, storage } = montar();
    const bom = await service.capturarSnapshot();
    const invalidos: unknown[] = [
      null,
      "texto",
      {},
      { ...bom, versao: 2 },
      { ...bom, banco: { ...bom.banco, conta: "" } },
      { ...bom, banco: undefined },
      { ...bom, empresa: { ...bom.empresa, nome: " " } },
      { ...bom, empresa: { ...bom.empresa, email: 123 } },
      { ...bom, template: { origem: "OUTRA", source: "x" } },
      { ...bom, template: { origem: "BANCO", source: "" } },
    ];
    for (const snap of invalidos) {
      expect(await codigoDoErro(service.gerarOficial(proposta(), snap as PdfSnapshotProposta))).toBe("PDF_INDISPONIVEL");
    }
    expect(storage.renderPdfMultipagina).not.toHaveBeenCalled();
    expect(storage.armazenarPdf).not.toHaveBeenCalled();
  });

  it("proposta sem numero ou data do Athos gera PDF_INDISPONIVEL", async () => {
    const { service } = montar();
    const snap = await service.capturarSnapshot();
    expect(await codigoDoErro(service.gerarOficial(proposta({ idorcamentoAthos: null }), snap))).toBe("PDF_INDISPONIVEL");
    expect(await codigoDoErro(service.gerarOficial(proposta({ athosData: null }), snap))).toBe("PDF_INDISPONIVEL");
  });

  it("o contexto entregue ao render nao contem custo, preco base nem nome do Athos (D-12)", async () => {
    const { service, storage } = montar();
    const snap = await service.capturarSnapshot();
    await service.gerarOficial(proposta(), snap);

    const ctx = storage.renderHtmlFromSource.mock.calls[0][1];
    const html = storage.renderPdfMultipagina.mock.calls[0][0] as string;
    for (const proibido of ["7.777", "7,777", "ORIGINAL ATHOS", "custoUnitario", "precoBase"]) {
      expect(JSON.stringify(ctx)).not.toContain(proibido);
      expect(html).not.toContain(proibido);
    }
  });

  it("dado de calculo invalido vira erro legivel 422, nao 500", async () => {
    const { service } = montar();
    const snap = await service.capturarSnapshot();
    const ruim = proposta();
    ruim.itens[0].quantidade = "abc";
    try {
      await service.gerarOficial(ruim, snap);
      throw new Error("deveria falhar");
    } catch (err) {
      expect(err).toBeInstanceOf(PropostaError);
      expect((err as PropostaError).getStatus()).toBe(422);
    }
  });
});

describe("PropostasPdfService.gerarPrevia e gerarPreviaTemplate", () => {
  it("previa: marca d'agua, sem numero, rodape de previa e nunca armazena", async () => {
    const { service, storage } = montar();

    const pdf = await service.gerarPrevia(proposta({ idorcamentoAthos: null, athosData: null }));

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(storage.armazenarPdf).not.toHaveBeenCalled();
    const ctx = storage.renderHtmlFromSource.mock.calls[0][1];
    expect(ctx).toMatchObject({ previa: true, numero: null });
    const html = storage.renderPdfMultipagina.mock.calls[0][0] as string;
    expect(html).toContain("PRÉVIA");
    expect(html).not.toContain("Proposta nº");
    expect(storage.renderPdfMultipagina).toHaveBeenCalledWith(expect.any(String), { rodape: "PRÉVIA - sem valor oficial" });
  });

  it("previa de proposta ja lancada tambem nao imprime o numero", async () => {
    const { service, storage } = montar();
    await service.gerarPrevia(proposta());
    const html = storage.renderPdfMultipagina.mock.calls[0][0] as string;
    expect(html).not.toContain("123456");
  });

  it("gerarPreviaTemplate usa PROPOSTA_MOCK, nao toca no banco e nao armazena", async () => {
    const { service, storage, prisma, repo } = montar();

    await service.gerarPreviaTemplate(HBS_EMPACOTADO);

    const [source, ctx] = storage.renderHtmlFromSource.mock.calls[0];
    expect(source).toBe(HBS_EMPACOTADO);
    expect(JSON.stringify(ctx)).toContain("exemplo");
    expect(storage.armazenarPdf).not.toHaveBeenCalled();
    expect(prisma.propostaConfig.findUnique).not.toHaveBeenCalled();
    expect(repo.getActiveSource).not.toHaveBeenCalled();
  });
});

describe("PropostasPdfService download", () => {
  it("baixarOficial e existeOficial delegam ao storage", async () => {
    const { service, storage } = montar();
    expect((await service.baixarOficial("propostas/1/Proposta-1.pdf")).toString()).toBe("conteudo");
    expect(await service.existeOficial("propostas/1/Proposta-1.pdf")).toBe(true);
    expect(storage.downloadObjectBuffer).toHaveBeenCalledWith("propostas/1/Proposta-1.pdf");
    expect(storage.objectExists).toHaveBeenCalledWith("propostas/1/Proposta-1.pdf");
  });
});
