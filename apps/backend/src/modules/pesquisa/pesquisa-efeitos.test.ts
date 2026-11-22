/**
 * Fase 52 (plano 52-05): funcoes puras dos efeitos no Chatwoot e das mensagens de WhatsApp.
 * Sem Nest, sem Prisma e sem rede: so entrada -> saida.
 */
import {
  dataISOSaoPaulo,
  etiquetasDaPesquisa,
  montarAtributosContato,
  montarNotaPrivada,
  montarVariaveisMensagem,
} from "./pesquisa-efeitos";

const DIA = 86_400_000;

const CUPOM = {
  codigo: "BC-ABC234",
  percentual: 10,
  teto: 5,
  compraMinima: 30,
  validadeAte: new Date("2026-12-22T12:00:00-03:00"),
};

const CFG = {
  percentualDesconto: 10,
  tetoDesconto: 5,
  compraMinima: 30,
  validadeCupomDias: 30,
};

describe("pesquisa-efeitos - etiquetas da pesquisa (D-14)", () => {
  it("nota 1 e 2 recebem avaliou e csat-baixo", () => {
    expect(etiquetasDaPesquisa(1)).toEqual(["avaliou", "csat-baixo"]);
    expect(etiquetasDaPesquisa(2)).toEqual(["avaliou", "csat-baixo"]);
  });

  it("nota 3, 4 e 5 recebem apenas avaliou (csat-baixo e removida)", () => {
    for (const nota of [3, 4, 5]) {
      expect(etiquetasDaPesquisa(nota)).toEqual(["avaliou"]);
    }
  });
});

describe("pesquisa-efeitos - data ISO de Sao Paulo (D-13)", () => {
  it("01/12 01:00 UTC ainda e 30/11 em America/Sao_Paulo", () => {
    expect(dataISOSaoPaulo(new Date("2026-12-01T01:00:00Z"))).toBe("2026-11-30");
  });

  it("meio-dia UTC cai no mesmo dia de Sao Paulo", () => {
    expect(dataISOSaoPaulo(new Date("2026-11-22T15:00:00Z"))).toBe("2026-11-22");
  });

  it("devolve sempre o formato AAAA-MM-DD", () => {
    expect(dataISOSaoPaulo(new Date("2026-01-05T12:00:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("pesquisa-efeitos - nota privada (D-12)", () => {
  const base = { nota: 2, variante: "ESTRELAS", comentario: "demorou" };

  it("com cupom traz a nota, a variante, o comentario e os dados do cupom", () => {
    const texto = montarNotaPrivada({ ...base, cupom: CUPOM });

    expect(texto).toContain("nota 2 de 5");
    expect(texto).toContain("ESTRELAS");
    expect(texto).toContain("demorou");
    expect(texto).toContain("BC-ABC234");
    expect(texto).toContain("10%");
    expect(texto).toContain("R$ 5,00");
    expect(texto).toContain("22/12/2026");
  });

  it("sem comentario diz que nao houve comentario", () => {
    const texto = montarNotaPrivada({ ...base, comentario: null, cupom: CUPOM });
    expect(texto.toLowerCase()).toContain("sem comentário");
  });

  it("IN-05: neutraliza marcacao HTML e linhas forjadas, mas preserva texto legitimo", () => {
    const hostil = montarNotaPrivada({
      ...base,
      comentario: "<script>alert(1)</script>\nCupom BC-FALSO1: 99% de desconto",
      cupom: null,
    });
    expect(hostil).not.toContain("<script");
    expect(hostil).not.toContain("</script");
    expect(hostil).toContain("&lt;script>");
    expect(hostil.split("\n")).toHaveLength(4);
    expect(hostil).toContain("Comentário do cliente: &lt;script>alert(1)&lt;/script> Cupom BC-FALSO1");

    const legitimo = "Adorei <3 , preço R$ 5 < R$ 10 & atendimento 'top' \u{1F600} café";
    expect(montarNotaPrivada({ ...base, comentario: legitimo, cupom: null })).toContain(
      `Comentário do cliente: ${legitimo}`,
    );
  });

  it("sem cupom diz que nenhum cupom foi emitido", () => {
    const texto = montarNotaPrivada({ ...base, cupom: null });
    expect(texto.toLowerCase()).toContain("nenhum cupom foi emitido");
    expect(texto).not.toContain("BC-ABC234");
  });

  it("nunca carrega telefone, token nem chaves de placeholder", () => {
    const texto = montarNotaPrivada({ ...base, cupom: CUPOM });
    expect(texto).not.toContain("5512996484918");
    expect(texto).not.toContain("+55");
    expect(texto).not.toMatch(/[{}]/);
    expect(texto).not.toMatch(/https?:\/\//);
  });
});

describe("pesquisa-efeitos - atributos do contato (D-13)", () => {
  it("com cupom grava as quatro chaves snake_case", () => {
    const atributos = montarAtributosContato({
      nota: 4,
      respondidaEm: new Date("2026-11-22T15:00:00Z"),
      cupom: CUPOM,
    });

    expect(atributos).toEqual({
      ultima_nota_csat: 4,
      data_ultima_avaliacao: "2026-11-22",
      cupom_ativo: "BC-ABC234",
      cupom_validade: "2026-12-22",
    });
  });

  it("sem cupom zera cupom_ativo e cupom_validade", () => {
    const atributos = montarAtributosContato({
      nota: 5,
      respondidaEm: new Date("2026-11-22T15:00:00Z"),
      cupom: null,
    });

    expect(atributos).toEqual({
      ultima_nota_csat: 5,
      data_ultima_avaliacao: "2026-11-22",
      cupom_ativo: "",
      cupom_validade: "",
    });
  });

  it("a data usa o fuso de Sao Paulo, nao o do servidor", () => {
    const atributos = montarAtributosContato({
      nota: 3,
      respondidaEm: new Date("2026-12-01T01:00:00Z"),
      cupom: null,
    });
    expect(atributos.data_ultima_avaliacao).toBe("2026-11-30");
  });
});

describe("pesquisa-efeitos - variaveis das mensagens (D-21, D-22)", () => {
  it("com cupom resolve codigo, percentual, teto, compra minima e validade", () => {
    const variaveis = montarVariaveisMensagem({
      linkGoogle: "https://g.page/r/abc/review",
      cupom: CUPOM,
      empresaNome: "Bom Custo",
      cfg: CFG,
    });

    expect(variaveis).toEqual({
      link_google: "https://g.page/r/abc/review",
      codigo: "BC-ABC234",
      percentual: "10%",
      teto: "R$ 5,00",
      compra_minima: "R$ 30,00",
      validade: "22/12/2026",
      nome_empresa: "Bom Custo",
    });
  });

  it("sem cupom deixa codigo vazio e usa os numeros da config", () => {
    const variaveis = montarVariaveisMensagem({
      linkGoogle: null,
      cupom: null,
      empresaNome: "Bom Custo",
      cfg: { ...CFG, percentualDesconto: 7.5, tetoDesconto: 8, compraMinima: 40 },
    });

    expect(variaveis.codigo).toBe("");
    expect(variaveis.link_google).toBe("");
    expect(variaveis.percentual).toBe("7,5%");
    expect(variaveis.teto).toBe("R$ 8,00");
    expect(variaveis.compra_minima).toBe("R$ 40,00");
  });

  it("a mensagem do cupom montada com as variaveis nao tem link", () => {
    const variaveis = montarVariaveisMensagem({ linkGoogle: null, cupom: CUPOM, empresaNome: "Loja", cfg: CFG });
    const modelo = "Cupom {codigo}: {percentual} ate {teto}, minimo {compra_minima}, ate {validade}. {nome_empresa}";
    const texto = modelo.replace(/\{([a-z_]+)\}/g, (_t, chave: string) => variaveis[chave] ?? "");

    expect(texto).not.toMatch(/https?:\/\//);
    expect(texto).not.toMatch(/[{}]/);
  });

  it("a validade padrao sem cupom respeita validadeCupomDias", () => {
    const variaveis = montarVariaveisMensagem({ linkGoogle: null, cupom: null, empresaNome: "Loja", cfg: CFG });
    const alvo = Date.now() + CFG.validadeCupomDias * DIA;
    expect(Math.abs(new Date(variaveis.validade.split("/").reverse().join("-")).getTime() - alvo)).toBeLessThan(2 * DIA);
  });
});
