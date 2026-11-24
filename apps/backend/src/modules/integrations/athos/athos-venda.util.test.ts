import { FORMA_PAGAMENTO_AVISTA, montarVenda, VendaAthosError, type FiscalItem, type MontarVendaEntrada } from "./athos-venda.util";

const FISCAL_102: FiscalItem = { origem: "0", tributacao: "", csosn: "102", cfop: "5102", cest: "", aliquotaEcf: "18" };
const FISCAL_500: FiscalItem = { origem: "0", tributacao: "", csosn: "500", cfop: "5405", cest: "1902700", aliquotaEcf: "FF" };

const CONTEXTO = { idvendedor: 3, idcaixaMovimento: 291, idterminal: 3, idorcamento: 26707, data: "2026-11-23" };

function entrada(parcial: Partial<MontarVendaEntrada>): MontarVendaEntrada {
  return {
    itens: [{ idproduto: 60, quantidade: 1, valorUnitario: 3.3, custoUnitario: 0.853, fiscal: FISCAL_102 }],
    idformapagamento: FORMA_PAGAMENTO_AVISTA,
    contexto: CONTEXTO,
    ...parcial,
  };
}

describe("montarVenda (captura 1: venda a vista sem desconto)", () => {
  it("dois itens 3,30 + 1,90 = 5,20 sem desconto", () => {
    const r = montarVenda(
      entrada({
        itens: [
          { idproduto: 60, quantidade: 1, valorUnitario: 3.3, custoUnitario: 0.853, fiscal: FISCAL_102 },
          { idproduto: 28528, quantidade: 1, valorUnitario: 1.9, custoUnitario: 0.515, fiscal: { ...FISCAL_102, aliquotaEcf: "FF" } },
        ],
      }),
    );
    expect(r.venda.valor).toBe("5.20");
    expect(r.venda.descontoRS).toBe("0.00");
    expect(r.venda.desconto).toBe("0.000");
    expect(r.itens.map((i) => i.vendaValorFinalItem)).toEqual(["3.30", "1.90"]);
    expect(r.itens.map((i) => i.sequenciaitem)).toEqual([1, 2]);
    expect(r.itens[0].valorvendaitem).toBe("3.300");
    expect(r.itens[0].valorcustoitem).toBe("0.853");
    expect(r.pagamento).toEqual({ idformapagamento: 5, valor: "5.20", valorRecebido: "5.20", idcondicaopagamento: 0 });
    expect(r.recebimentoCartao).toEqual({ valorparcelacartao: "5.20", datavencimento: "2026-11-23", status: "AVC", taxacobrada: "0.00" });
    expect(r.venda.idorcamento).toBe(26707);
  });
});

describe("montarVenda (captura 2: 5% de desconto rateado nos itens)", () => {
  const itens = [
    { idproduto: 28, quantidade: 12, valorUnitario: 15, custoUnitario: 8, fiscal: FISCAL_102 },
    { idproduto: 42, quantidade: 2, valorUnitario: 25, custoUnitario: 12, fiscal: FISCAL_500 },
  ];

  it("rateia 11,50 em 9,00 e 2,50 e fecha em 218,50", () => {
    const r = montarVenda(entrada({ itens, descontoCupom: 11.5 }));
    expect(r.venda.valorBruto).toBe("230.00");
    expect(r.venda.descontoRS).toBe("11.50");
    expect(r.venda.desconto).toBe("5.000");
    expect(r.venda.valor).toBe("218.50");
    expect(r.itens.map((i) => i.vendaDesconto)).toEqual(["9.00", "2.50"]);
    expect(r.itens.map((i) => i.vendaValorFinalItem)).toEqual(["171.00", "47.50"]);
    expect(r.itens.every((i) => i.valordesconto === "0.00")).toBe(true);
    expect(r.itens[0].valorvendaitem).toBe("15.000");
    expect(r.pagamento.valor).toBe("218.50");
    expect(r.recebimentoCartao.valorparcelacartao).toBe("218.50");
    expect(r.itens[1].fiscal).toEqual(FISCAL_500);
  });

  it("aceita o desconto como texto decimal", () => {
    const r = montarVenda(entrada({ itens, descontoCupom: "11.50" }));
    expect(r.venda.valor).toBe("218.50");
  });
});

describe("montarVenda (sobra de centavos e quantidade fracionada)", () => {
  it("1,00 em tres itens iguais: sobra vai para o indice maior (ratear)", () => {
    const itens = [1, 2, 3].map((n) => ({ idproduto: n, quantidade: 1, valorUnitario: 10, custoUnitario: 1, fiscal: FISCAL_102 }));
    const r = montarVenda(entrada({ itens, descontoCupom: 1 }));
    expect(r.itens.map((i) => i.vendaDesconto)).toEqual(["0.33", "0.33", "0.34"]);
    const somaFinal = r.itens.reduce((acc, i) => acc + Number(i.vendaValorFinalItem), 0);
    expect(somaFinal.toFixed(2)).toBe(r.venda.valor);
    expect(r.venda.valor).toBe("29.00");
  });

  it("mantem quantidade com 3 casas", () => {
    const r = montarVenda(entrada({ itens: [{ idproduto: 1, quantidade: 1.5, valorUnitario: 2, custoUnitario: 1, fiscal: FISCAL_102 }] }));
    expect(r.itens[0].quantidadeitem).toBe("1.500");
    expect(r.venda.valor).toBe("3.00");
  });
});

describe("montarVenda (erros)", () => {
  it("recusa forma de pagamento diferente de 5", () => {
    expect.assertions(2);
    try {
      montarVenda(entrada({ idformapagamento: 7 }));
    } catch (e) {
      expect(e).toBeInstanceOf(VendaAthosError);
      expect((e as VendaAthosError).codigo).toBe("FORMA_PAGAMENTO_NAO_SUPORTADA");
    }
  });

  it("recusa desconto negativo", () => {
    expect(() => montarVenda(entrada({ descontoCupom: -1 }))).toThrow(VendaAthosError);
    try {
      montarVenda(entrada({ descontoCupom: -1 }));
    } catch (e) {
      expect((e as VendaAthosError).codigo).toBe("DESCONTO_INVALIDO");
    }
  });

  it("recusa desconto maior que o total", () => {
    try {
      montarVenda(entrada({ descontoCupom: 3.31 }));
      throw new Error("deveria falhar");
    } catch (e) {
      expect((e as VendaAthosError).codigo).toBe("DESCONTO_INVALIDO");
    }
  });

  it("recusa item com quantidade zerada, sem itens e preco com casas demais", () => {
    const base = { idproduto: 1, valorUnitario: 1, custoUnitario: 1, fiscal: FISCAL_102 };
    for (const itens of [[{ ...base, quantidade: 0 }], [], [{ ...base, quantidade: 1, valorUnitario: 1.2345 }]]) {
      try {
        montarVenda(entrada({ itens }));
        throw new Error("deveria falhar");
      } catch (e) {
        expect((e as VendaAthosError).codigo).toBe("ITEM_INVALIDO");
      }
    }
  });
});
