import { hojeSaoPaulo } from "../integrations/athos/athos-conta-receber-baixa.service";
import {
  calcularBoletoAtualizado,
  configuracoesEfi,
  formatarDataBr,
  formatarPercentual,
  formatarReais,
  montarMensagemAtualizacao,
  novoVencimentoPermitido,
  proximoDiaUtil,
  validarTaxas,
  vencimentosPermitidos,
} from "./cobranca-boleto-atualizado.util";

const taxas = { taxaJurosMes: 0.99, multaPercentual: 2 };

describe("cobranca-boleto-atualizado.util", () => {
  it("U1 proximoDiaUtil: seg-sex, virada de mes e de ano, feriado nao considerado", () => {
    expect(proximoDiaUtil("2026-11-17")).toBe("2026-11-18"); // terca
    expect(proximoDiaUtil("2026-11-20")).toBe("2026-11-23"); // sexta
    expect(proximoDiaUtil("2026-11-21")).toBe("2026-11-23"); // sabado
    expect(proximoDiaUtil("2026-11-22")).toBe("2026-11-23"); // domingo
    expect(proximoDiaUtil("2026-11-30")).toBe("2026-12-01");
    expect(proximoDiaUtil("2026-12-31")).toBe("2027-01-01");
  });

  it("U2 vencimentosPermitidos = [hoje, proximo dia util]", () => {
    expect(vencimentosPermitidos("2026-11-17")).toEqual(["2026-11-17", "2026-11-18"]);
    expect(vencimentosPermitidos("2026-11-20")).toEqual(["2026-11-20", "2026-11-23"]);
  });

  it("U3 novoVencimentoPermitido aceita so as duas datas e nunca lanca", () => {
    expect(novoVencimentoPermitido("2026-11-17", "2026-11-17")).toBe(true);
    expect(novoVencimentoPermitido("2026-11-18", "2026-11-17")).toBe(true);
    expect(novoVencimentoPermitido("2026-11-16", "2026-11-17")).toBe(false);
    expect(novoVencimentoPermitido("2026-11-19", "2026-11-17")).toBe(false);
    expect(novoVencimentoPermitido("2026-02-30", "2026-11-17")).toBe(false);
    expect(novoVencimentoPermitido("18/11/2026", "2026-11-17")).toBe(false);
    expect(novoVencimentoPermitido("2026-11-21", "2026-11-20")).toBe(false);
    expect(novoVencimentoPermitido("2026-11-23", "2026-11-20")).toBe(true);
  });

  it("U4 fuso: 23:30 em Sao Paulo ainda e o dia anterior em UTC", () => {
    expect(hojeSaoPaulo(new Date("2026-11-18T02:30:00Z"))).toBe("2026-11-17");
  });

  it("U5 caso dourado: 1000,00 venc. 10/11, novo 18/11 -> 8 dias, juros 2,64, multa 20,00, total 1022,64", () => {
    const r = calcularBoletoAtualizado({
      titulos: [{ idcontareceber: 1, principal: 1000, vencimentoOriginal: "2026-11-10" }],
      novoVencimento: "2026-11-18",
      ...taxas,
    });
    expect(r.titulos[0].diasAtraso).toBe(8);
    expect(r.titulos[0].juros).toBe(2.64);
    expect(r.titulos[0].multa).toBe(20);
    expect(r.total).toBe(1022.64);
    expect(r.algumTituloVencido).toBe(true);
  });

  it("U6 casos reais do Athos com 10 dias e soma por titulo", () => {
    const um = (principal: number, vencimentoOriginal: string) =>
      calcularBoletoAtualizado({
        titulos: [{ idcontareceber: 1, principal, vencimentoOriginal }],
        novoVencimento: "2026-11-18",
        ...taxas,
      });
    const a = um(457, "2026-11-08");
    expect([a.juros, a.multa, a.total]).toEqual([1.51, 9.14, 467.65]);
    const b = um(252.93, "2026-11-08");
    expect([b.juros, b.multa]).toEqual([0.83, 5.06]);
    const c = calcularBoletoAtualizado({
      titulos: [
        { idcontareceber: 1, principal: 1000, vencimentoOriginal: "2026-11-10" },
        { idcontareceber: 2, principal: 457, vencimentoOriginal: "2026-11-08" },
      ],
      novoVencimento: "2026-11-18",
      ...taxas,
    });
    expect([c.principal, c.juros, c.multa, c.total]).toEqual([1457, 4.15, 29.14, 1490.29]);
  });

  it("U7 arredonda meio para cima: multa de 2% sobre 100,25 = 2,01", () => {
    const r = calcularBoletoAtualizado({
      titulos: [{ idcontareceber: 1, principal: 100.25, vencimentoOriginal: "2026-11-10" }],
      novoVencimento: "2026-11-18",
      ...taxas,
    });
    expect(r.multa).toBe(2.01);
  });

  it("U8 titulo a vencer ou vencendo no novo vencimento nao tem encargos", () => {
    const r = calcularBoletoAtualizado({
      titulos: [
        { idcontareceber: 1, principal: 300, vencimentoOriginal: "2026-11-20" },
        { idcontareceber: 2, principal: 200, vencimentoOriginal: "2026-11-18" },
      ],
      novoVencimento: "2026-11-18",
      ...taxas,
    });
    for (const t of r.titulos) expect([t.diasAtraso, t.juros, t.multa]).toEqual([0, 0, 0]);
    expect(r.total).toBe(500);
    expect(r.algumTituloVencido).toBe(false);
  });

  it("U9 titulo de desconto vencido e taxas zero nao geram encargos", () => {
    const desconto = calcularBoletoAtualizado({
      titulos: [{ idcontareceber: 1, principal: -50, vencimentoOriginal: "2026-11-10" }],
      novoVencimento: "2026-11-18",
      ...taxas,
    });
    expect([desconto.titulos[0].juros, desconto.titulos[0].multa, desconto.titulos[0].total]).toEqual([0, 0, -50]);
    const zero = calcularBoletoAtualizado({
      titulos: [{ idcontareceber: 1, principal: 1000, vencimentoOriginal: "2026-11-10" }],
      novoVencimento: "2026-11-18",
      taxaJurosMes: 0,
      multaPercentual: 0,
    });
    expect([zero.juros, zero.multa]).toEqual([0, 0]);
  });

  it("U10 validarTaxas: tetos de 1% a.m. e 2% e valores invalidos", () => {
    expect(validarTaxas({ taxaJurosMes: 1, multaPercentual: 2 })).toBeNull();
    expect(validarTaxas({ taxaJurosMes: 0, multaPercentual: 0 })).toBeNull();
    expect(validarTaxas({ taxaJurosMes: 1.01, multaPercentual: 2 })).toContain("1%");
    expect(validarTaxas({ taxaJurosMes: 1, multaPercentual: 2.01 })).toContain("2%");
    expect(validarTaxas({ taxaJurosMes: -0.1, multaPercentual: 2 })).not.toBeNull();
    expect(validarTaxas({ taxaJurosMes: Number.NaN, multaPercentual: 2 })).not.toBeNull();
  });

  it("U11 configuracoesEfi: fine em centesimos de %, interest em milesimos ao dia, chave omitida em 0", () => {
    expect(configuracoesEfi({ taxaJurosMes: 0.99, multaPercentual: 2 })).toEqual({ fine: 200, interest: 33 });
    expect(configuracoesEfi({ taxaJurosMes: 1, multaPercentual: 2 })).toEqual({ fine: 200, interest: 33 });
    expect(configuracoesEfi({ taxaJurosMes: 0.5, multaPercentual: 1.5 })).toEqual({ fine: 150, interest: 17 });
    expect(configuracoesEfi({ taxaJurosMes: 0, multaPercentual: 0 })).toEqual({});
  });

  it("U12 montarMensagemAtualizacao: texto do caso dourado, varias datas e limites da EFI", () => {
    const base = {
      juros: 2.64,
      multa: 20,
      vencimentosOriginais: ["2026-11-10"],
      novoVencimento: "2026-11-18",
      taxaJurosMesPosVencimento: 0.99,
      multaPercentualPosVencimento: 2,
    };
    expect(montarMensagemAtualizacao(base)).toEqual([
      "Valor atualizado com juros de R$ 2,64 e multa de R$ 20,00",
      "referentes ao vencimento original 10/11/2026.",
      "Em caso de novo atraso apos 18/11/2026, incidirao juros de 0,99% a.m.",
      "e multa de 2% sobre o valor atualizado.",
    ]);
    const varias = montarMensagemAtualizacao({ ...base, vencimentosOriginais: ["2026-11-10", "2026-11-08", "2026-11-10"] });
    expect(varias[1]).toBe("referentes aos vencimentos originais de 08/11/2026 a 10/11/2026.");
    const grande = montarMensagemAtualizacao({ ...base, juros: 12345.67, multa: 98765.43 });
    expect(grande.length).toBeLessThanOrEqual(4);
    for (const l of [...grande, ...varias]) {
      expect(l.length).toBeLessThanOrEqual(100);
      expect(l).toMatch(/^[\x20-\x7E]+$/);
    }
    expect(grande.join(" ")).toContain("12.345,67");
    expect(grande.join(" ")).toContain("98.765,43");
  });

  it("U13 formatadores", () => {
    expect(formatarReais(1022.64)).toBe("1.022,64");
    expect(formatarReais(0.5)).toBe("0,50");
    expect(formatarReais(123456.78)).toBe("123.456,78");
    expect(formatarReais(-50)).toBe("-50,00");
    expect(formatarPercentual(0.99)).toBe("0,99");
    expect(formatarPercentual(2)).toBe("2");
    expect(formatarPercentual(1.5)).toBe("1,5");
    expect(formatarDataBr("2026-11-10")).toBe("10/11/2026");
  });
});
