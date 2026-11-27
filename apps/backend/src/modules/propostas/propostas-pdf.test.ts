import { readFileSync } from "node:fs";
import path from "node:path";

import Handlebars from "handlebars";

import { PdfTemplatesService } from "../pdf-templates/pdf-templates.service";
import {
  BancoPdf,
  EmpresaPdf,
  PROPOSTA_MOCK,
  PropostaParaPdf,
  formatarBRL,
  formatarDataBR,
  formatarDocumento,
  formatarQuantidade,
  montarContextoProposta,
  somarDias,
  tipoDocumento,
} from "./propostas-pdf.util";

const TEMPLATE_PATH = path.resolve(__dirname, "../../../templates/proposta-institucional.hbs");
const SOURCE = readFileSync(TEMPLATE_PATH, "utf-8");

/** Mesma compilacao hardened do QuotesPdfStorageService. */
function renderizar(contexto: unknown, source: string = SOURCE): string {
  const hbs = Handlebars.create();
  const template = hbs.compile(source, { knownHelpers: {}, knownHelpersOnly: true, strict: false, noEscape: false });
  return template(contexto);
}

// Dados FICTICIOS de teste (nunca usar dados reais da empresa em fixtures versionadas).
const EMPRESA: EmpresaPdf = {
  nome: "Empresa Teste Papelaria Ltda",
  cnpj: "00.000.000/0001-91",
  endereco: "Rua de Teste, 10 - Centro - Cidade Teste/SP",
  telefones: "(12) 3000-0000",
  email: "contato@empresa-teste.test",
};

const BANCO: BancoPdf = {
  bancoNome: "Banco de Teste",
  agencia: "1234",
  conta: "56789-0",
  titular: "Empresa Teste Papelaria Ltda",
  documentoTitular: "00000000000191",
};

const CLIENTE_SNAPSHOT = {
  idcliente: 77,
  razaoSocial: "MUNICIPIO DE ILHABELA",
  nomeFantasia: "Prefeitura de Ilhabela",
  documento: "46639345000130",
  endereco: {
    logradouro: "Avenida Princesa Isabel",
    numero: "1",
    complemento: null,
    bairro: "Perequê",
    cidade: "Ilhabela",
    uf: "SP",
    cep: "11630000",
  },
};

/** Proposta com campos internos (custo, margem, nome do Athos) que NUNCA podem sair no PDF (D-12). */
function propostaBase(extra: Record<string, unknown> = {}): PropostaParaPdf {
  const base = {
    idorcamentoAthos: 123456,
    athosData: "2026-11-27",
    athosHora: "14:32:10",
    clienteSnapshot: CLIENTE_SNAPSHOT,
    clienteOverride: null,
    numeroProcesso: null,
    setorResponsavel: null,
    contatoEmail: null,
    contatoTelefone: null,
    validadeDias: 1,
    prazoEntregaDias: 15,
    observacao: null,
    assinanteNome: null,
    assinanteCargo: null,
    assinanteCpf: null,
    // Campos internos da linha do Prisma, so para provar que nao vazam.
    precoBase: "7.777",
    margemPercentual: "66.675",
    totalValor: "1234.56",
    itens: [
      {
        sequencia: 1,
        idproduto: 4321,
        nome: "Papel sulfite A4",
        descricaoCurta: "Resma 500 folhas",
        unidade: "RM",
        quantidade: "2.000",
        precoUnitario: "24.90",
        nomeAthos: "PAPEL SULFITE A4 ORIGINAL ATHOS XYZ",
        custoUnitario: "7.777",
        precoBase: "7.777",
        ajusteTipo: "PERCENTUAL",
        ajusteValor: "7.777",
      },
    ],
    ...extra,
  };
  return base as unknown as PropostaParaPdf;
}

function contexto(proposta: PropostaParaPdf, extra: { previa?: boolean; logo?: string; hoje?: string } = {}) {
  return montarContextoProposta({
    proposta,
    empresa: { ...EMPRESA, logoDataUri: extra.logo },
    banco: BANCO,
    previa: extra.previa ?? false,
    hoje: extra.hoje,
  });
}

function texto(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("formatadores pt-BR", () => {
  it("formatarBRL", () => {
    expect(formatarBRL(123456n)).toBe("R$ 1.234,56");
    expect(formatarBRL(5n)).toBe("R$ 0,05");
    expect(formatarBRL(0n)).toBe("R$ 0,00");
    expect(formatarBRL(100000000n)).toBe("R$ 1.000.000,00");
  });

  it("formatarQuantidade: inteiro sem casas, fracionado com virgula e sem zeros finais", () => {
    expect(formatarQuantidade(2000n)).toBe("2");
    expect(formatarQuantidade(2500n)).toBe("2,5");
    expect(formatarQuantidade(1n)).toBe("0,001");
    expect(formatarQuantidade(10000000n)).toBe("10.000");
    expect(formatarQuantidade(1234567n)).toBe("1.234,567");
  });

  it("formatarDataBR e somarDias com virada de mes e de ano", () => {
    expect(formatarDataBR("2026-11-27")).toBe("27/11/2026");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2026-01-31", 30)).toBe("2026-03-02");
    expect(somarDias("2028-02-28", 1)).toBe("2028-02-29");
    expect(somarDias("2026-11-27", 0)).toBe("2026-11-27");
  });

  it("formatarDocumento e tipoDocumento", () => {
    expect(formatarDocumento("46639345000130")).toBe("46.639.345/0001-30");
    expect(formatarDocumento("12345678909")).toBe("123.456.789-09");
    expect(formatarDocumento("1234567")).toBe("1234567");
    expect(tipoDocumento("46639345000130")).toBe("CNPJ");
    expect(tipoDocumento("12345678909")).toBe("CPF");
    expect(tipoDocumento("123")).toBe("CNPJ/CPF");
  });
});

describe("montarContextoProposta + template institucional (tracer)", () => {
  it("(a) HTML tem numero, razao social, item, codigo, total e dados bancarios", () => {
    const html = renderizar(contexto(propostaBase()));
    const t = texto(html);
    expect(t).toContain("123456");
    expect(t).toContain("MUNICIPIO DE ILHABELA");
    expect(t).toContain("46.639.345/0001-30");
    expect(t).toContain("Papel sulfite A4");
    expect(t).toContain("Resma 500 folhas");
    expect(t).toContain("4321");
    expect(t).toContain("R$ 24,90");
    expect(t).toContain("R$ 49,80");
    expect(t).toContain("Total geral R$ 49,80");
    expect(t).toContain("Banco de Teste");
    expect(t).toContain("1234");
    expect(t).toContain("56789-0");
    expect(t).toContain("00.000.000/0001-91");
    expect(t).toContain("27/11/2026");
    expect(t).toContain("14:32");
    expect(t).toContain("PROPOSTA COMERCIAL");
  });

  it("(b) custo sentinela, margem e nome do Athos nao aparecem no contexto nem no HTML (D-12)", () => {
    const ctx = contexto(propostaBase());
    const json = JSON.stringify(ctx);
    const html = renderizar(ctx);
    for (const proibido of ["7.777", "7,777", "66.675", "ORIGINAL ATHOS", "custoUnitario", "precoBase", "ajuste", "margem"]) {
      expect(json).not.toContain(proibido);
      expect(html).not.toContain(proibido);
    }
  });

  it("(c) previa nao tem numero e tem PRÉVIA; oficial nao tem marca d'agua", () => {
    const previa = renderizar(contexto(propostaBase(), { previa: true, hoje: "2026-03-10" }));
    expect(previa).toContain("PRÉVIA");
    expect(previa).not.toContain("123456");
    expect(texto(previa)).not.toContain("Proposta nº");
    expect(texto(previa)).toContain("10/03/2026");

    const oficial = renderizar(contexto(propostaBase()));
    expect(oficial).not.toContain("PRÉVIA");
    expect(texto(oficial)).toContain("Proposta nº 123456");
  });

  it("(d) campos de endereco ausentes mostram 'Não informado' e nenhum fallback inventado", () => {
    const html = renderizar(
      contexto(propostaBase({ clienteSnapshot: { razaoSocial: "ORGAO SEM ENDERECO", nomeFantasia: null, documento: null, endereco: null } })),
    );
    const t = texto(html);
    // documento, logradouro, numero, bairro, cidade, uf e cep
    expect((t.match(/Não informado/g) ?? []).length).toBeGreaterThanOrEqual(7);
    expect(t).toContain("ORGAO SEM ENDERECO");
    for (const inventado of ["Centro", "S/N", "3520400"]) {
      // "Centro" so existe no endereco da empresa de teste? Nao: ele esta la, entao checa fora do cabecalho.
      if (inventado === "Centro") continue;
      expect(t).not.toContain(inventado);
    }
    const ctx = contexto(propostaBase({ clienteSnapshot: { razaoSocial: "X", endereco: null } }));
    expect(ctx.cliente.bairro).toBe("Não informado");
    expect(ctx.cliente.numero).toBe("Não informado");
    expect(ctx.cliente.uf).toBe("Não informado");
    expect(JSON.stringify(ctx.cliente)).not.toMatch(/Centro|S\/N|SP|3520400/);
    // complemento vazio e omitido (nao vira "Não informado")
    expect(ctx.cliente.complemento).toBeNull();
    expect(t).not.toContain("Complemento");
  });

  it("(e) override de razao social e do endereco vence o snapshot; complemento aparece quando preenchido", () => {
    const html = renderizar(
      contexto(
        propostaBase({
          clienteOverride: { razaoSocial: "PREFEITURA MUNICIPAL OVERRIDE", cidade: "São Sebastião", complemento: "Bloco B" },
        }),
      ),
    );
    const t = texto(html);
    expect(t).toContain("PREFEITURA MUNICIPAL OVERRIDE");
    expect(t).not.toContain("MUNICIPIO DE ILHABELA");
    expect(t).toContain("São Sebastião");
    expect(t).toContain("Bloco B");
    // fantasia do snapshot aparece como linha propria somente quando difere da razao social
    expect(t).toContain("Prefeitura de Ilhabela");
  });

  it("(f) texto com tag HTML e aspas no nome do produto sai escapado", () => {
    const perigoso = `<b>Tinta</b> "premium" <script>alert(1)</script>`;
    const proposta = propostaBase();
    proposta.itens[0].nome = perigoso;
    proposta.observacao = `<img src=x> & "obs"`;
    const html = renderizar(contexto(proposta));
    expect(html).not.toContain("<b>Tinta</b>");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;b&gt;Tinta&lt;/b&gt;");
    expect(html).toContain("&quot;premium&quot;");
    expect(html).toContain("&lt;img src&#x3D;x&gt; &amp; &quot;obs&quot;");
  });

  it("(g) validade de 1 dia a partir de 2026-12-31 e '1 dia (até 01/01/2027)'; prazo e plural", () => {
    const ctx = contexto(propostaBase({ athosData: "2026-12-31", validadeDias: 1, prazoEntregaDias: 15 }));
    expect(ctx.validade).toBe("1 dia (até 01/01/2027)");
    expect(ctx.prazoEntrega).toBe("15 dias");
    const outro = contexto(propostaBase({ athosData: "2026-11-27", validadeDias: 30 }));
    expect(outro.validade).toBe("30 dias (até 27/12/2026)");
    expect(texto(renderizar(ctx))).toContain("1 dia (até 01/01/2027)");
  });

  it("(h) o fonte passa em validateUpload e nao tem URL externa, script nem chave tripla", () => {
    const svc = new PdfTemplatesService({} as never);
    expect(() => svc.validateUpload(SOURCE)).not.toThrow();
    expect(SOURCE).not.toMatch(/[a-z][a-z0-9+.-]*:\/\//i);
    expect(SOURCE).not.toMatch(/<script/i);
    expect(SOURCE).not.toContain("{{{");
    expect(SOURCE).not.toMatch(/\son\w+\s*=/i);
  });

  it("(i) thead tem exatamente os seis titulos; logo da empresa aparece so quando fornecido", () => {
    const html = renderizar(contexto(propostaBase()));
    const thead = /<thead>([\s\S]*?)<\/thead>/.exec(html)?.[1] ?? "";
    const titulos = [...thead.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => m[1].trim());
    expect(titulos).toEqual(["Código", "Descrição", "Un.", "Quantidade", "Valor unitário", "Total"]);
    expect(thead.toLowerCase()).not.toMatch(/marca|desconto|de\/por/);

    const logo = "data:image/png;base64,iVBORw0KGgo=";
    const comLogo = renderizar(contexto(propostaBase(), { logo }));
    expect(comLogo).toContain(`<img class="head__logo" src="${logo.replace("=", "&#x3D;")}"`);
    const semLogo = renderizar(contexto(propostaBase()));
    expect(semLogo).not.toContain("<img");
  });

  it("(j) paleta: so o teal #0e6d73 (declarado uma vez) e tons de cinza", () => {
    const cores = [...SOURCE.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g)].map((m) => m[1].toLowerCase());
    expect(cores.length).toBeGreaterThan(3);
    for (const c of cores) {
      if (c === "0e6d73") continue;
      const canais = c.length === 3 ? [c[0], c[1], c[2]] : [c.slice(0, 2), c.slice(2, 4), c.slice(4, 6)];
      expect(new Set(canais).size).toBe(1);
    }
    expect(cores.filter((c) => c === "0e6d73")).toHaveLength(1);
    expect(SOURCE).toContain("--accent:#0e6d73");
  });

  it("dados de orgao e assinante so aparecem quando preenchidos", () => {
    const vazio = texto(renderizar(contexto(propostaBase())));
    expect(vazio).not.toContain("Processo / pregão");
    expect(vazio).not.toContain("Órgão");
    expect(vazio).not.toContain("CPF 1");

    const cheio = texto(
      renderizar(
        contexto(
          propostaBase({
            numeroProcesso: "Pregão 12/2026",
            setorResponsavel: "Compras",
            contatoEmail: "compras@ilhabela.sp.gov.br",
            contatoTelefone: "(12) 3896-1111",
            observacao: "Entregar no almoxarifado",
            assinanteNome: "Fulano de Tal",
            assinanteCargo: "Sócio",
            assinanteCpf: "12345678909",
          }),
        ),
      ),
    );
    for (const v of [
      "Pregão 12/2026",
      "Compras",
      "compras@ilhabela.sp.gov.br",
      "(12) 3896-1111",
      "Entregar no almoxarifado",
      "Fulano de Tal",
      "Sócio",
      "CPF 123.456.789-09",
    ]) {
      expect(cheio).toContain(v);
    }
  });

  it("itens em ordem de sequencia, total recalculado dos itens e unidade padrao UN", () => {
    const proposta = propostaBase();
    proposta.itens = [
      { sequencia: 2, idproduto: 2, nome: "B", quantidade: "1.5", precoUnitario: "10.00", unidade: null },
      { sequencia: 1, idproduto: 1, nome: "A", quantidade: "3", precoUnitario: "3.46" },
    ];
    const ctx = contexto(proposta);
    expect(ctx.itens.map((i) => i.nome)).toEqual(["A", "B"]);
    expect(ctx.itens[0]).toMatchObject({ codigo: "1", unidade: "UN", quantidade: "3", valorUnitario: "R$ 3,46", total: "R$ 10,38" });
    expect(ctx.itens[1]).toMatchObject({ quantidade: "1,5", total: "R$ 15,00" });
    expect(ctx.totalGeral).toBe("R$ 25,38");
  });

  it("oficial sem idorcamentoAthos ou data do Athos e recusado", () => {
    expect(() => contexto(propostaBase({ idorcamentoAthos: null }))).toThrow();
    expect(() => contexto(propostaBase({ athosData: null }))).toThrow();
  });

  it("PROPOSTA_MOCK renderiza como previa com o template empacotado", () => {
    const html = renderizar(montarContextoProposta(PROPOSTA_MOCK));
    expect(html).toContain("PRÉVIA");
    expect(texto(html)).toContain("exemplo");
    expect(texto(html)).toContain("Total geral");
  });
});
