import {
  CONF_FINANCEIRO_COLUNAS,
  ConfFinanceiroEncargos,
  PERCENTUAL_MULTA_PADRAO,
  calcularEncargosTitulo,
  decidirValoresBaixa,
  diasEntre,
} from "./athos-baixa-encargos.util";

/**
 * Fase 43 / plano 43-02. D-07: puro, sem banco, sem rede.
 *
 * ATENCAO - evidencia limitada: o usuario PROIBIU consultar o Athos real (introspeccao
 * somente leitura nao foi executada). Os unicos casos dourados sao os 2 capturados via
 * pktmon (43-REFERENCIA-SQL-ATHOS.md e relato do usuario). A configuracao real de
 * conf_financeiro (taxajurosmes, carenciadiascobrancajuros) NAO e conhecida: CONF_REAL
 * abaixo e a configuracao ASSUMIDA (1% ao mes, sem carencia, multa 2%) sob a qual a
 * formula reproduz os dois casos. Validar contra a Q4/Q5 reais continua pendente.
 */
const CONF_REAL: ConfFinanceiroEncargos = { taxaJurosMes: 1, carenciaDias: 0, percentualMulta: 2 };

// Origem: capturas do Athos real (principal, dias de atraso, juros, multa, valorpago).
const CASOS_DOURADOS = [
  { principal: 457.0, vencimento: "2026-10-27", pagamento: "2026-11-06", atraso: 10, juros: 1.51, multa: 9.14, valorpago: 467.65 },
  { principal: 252.93, vencimento: "2026-10-27", pagamento: "2026-11-06", atraso: 10, juros: 0.83, multa: 5.06, valorpago: 258.82 },
];

// Variantes de formula DESCARTADAS contra os mesmos 2 casos (documenta a escolha, em reais).
function variante(principal: number, dias: number, opts: { base: number; arred: "round" | "floor" | "ceil"; milesimos: boolean }) {
  let taxaDia = 1 / opts.base; // % ao dia
  if (opts.milesimos) taxaDia = Math.round(taxaDia * 1000) / 1000;
  const bruto = (principal * taxaDia * dias) / 100;
  return Math[opts.arred](bruto * 100) / 100;
}

describe("athos-baixa-encargos.util", () => {
  describe("dourados", () => {
    it.each(CASOS_DOURADOS)(
      "reproduz o Athos centavo a centavo: principal $principal, atraso $atraso",
      ({ principal, vencimento, pagamento, atraso, juros, multa, valorpago }) => {
        const r = calcularEncargosTitulo({ principal, vencimento, dataPagamento: pagamento, conf: CONF_REAL });
        expect(r.atraso).toBe(atraso);
        expect(r.juros).toBe(juros);
        expect(r.multa).toBe(multa);
        expect(r.dentroCarencia).toBe(false);
        expect(Math.round((principal + r.juros + r.multa) * 100)).toBe(Math.round(valorpago * 100));
      },
    );

    it("a configuracao de juros 0,99 ao mes (mesmo valor diario de 3 casas) tambem reproduz", () => {
      for (const c of CASOS_DOURADOS) {
        const r = calcularEncargosTitulo({
          principal: c.principal,
          vencimento: c.vencimento,
          dataPagamento: c.pagamento,
          conf: { ...CONF_REAL, taxaJurosMes: 0.99 },
        });
        expect([r.juros, r.multa]).toEqual([c.juros, c.multa]);
      }
    });

    it("variantes descartadas NAO reproduzem ambos os casos (evidencia da escolha)", () => {
      const reproduz = (opts: Parameters<typeof variante>[2]) =>
        CASOS_DOURADOS.every((c) => variante(c.principal, c.atraso, opts) === c.juros);
      // adotada: base 30, taxa diaria em milesimos de %, arredondamento meio para cima
      expect(reproduz({ base: 30, arred: "round", milesimos: true })).toBe(true);
      // descartadas
      expect(reproduz({ base: 30, arred: "round", milesimos: false })).toBe(false); // 1,52 e 0,84
      expect(reproduz({ base: 30, arred: "floor", milesimos: true })).toBe(false); // 1,50
      expect(reproduz({ base: 30, arred: "ceil", milesimos: true })).toBe(false); // 0,84
      expect(reproduz({ base: 365 / 12, arred: "round", milesimos: false })).toBe(false);
      expect(reproduz({ base: 30.4, arred: "round", milesimos: false })).toBe(false);
    });
  });

  describe("em dia, carencia e entradas invalidas", () => {
    it("pagamento no vencimento ou antes -> tudo zero", () => {
      for (const dataPagamento of ["2026-11-06", "2026-11-01"]) {
        const r = calcularEncargosTitulo({ principal: 29, vencimento: "2026-11-06", dataPagamento, conf: CONF_REAL });
        expect(r).toEqual({ atraso: 0, juros: 0, multa: 0, dentroCarencia: false });
      }
    });

    it("atraso positivo ate a carencia: regiao NAO validada -> dentroCarencia e encargos zerados", () => {
      const conf = { ...CONF_REAL, carenciaDias: 5 };
      const r = calcularEncargosTitulo({ principal: 100, vencimento: "2026-11-01", dataPagamento: "2026-11-06", conf });
      expect(r).toEqual({ atraso: 5, juros: 0, multa: 0, dentroCarencia: true });
      const alem = calcularEncargosTitulo({ principal: 100, vencimento: "2026-11-01", dataPagamento: "2026-11-07", conf });
      expect(alem.dentroCarencia).toBe(false);
      expect(alem.atraso).toBe(6);
      expect(alem.multa).toBe(2);
    });

    it("configuracao invalida lanca erro", () => {
      expect(() =>
        calcularEncargosTitulo({
          principal: 10,
          vencimento: "2026-11-01",
          dataPagamento: "2026-11-06",
          conf: { taxaJurosMes: -1, carenciaDias: 0, percentualMulta: 2 },
        }),
      ).toThrow();
      expect(() =>
        calcularEncargosTitulo({
          principal: 10,
          vencimento: "2026-11-01",
          dataPagamento: "2026-11-06",
          conf: { taxaJurosMes: 1, carenciaDias: Number.NaN, percentualMulta: 2 },
        }),
      ).toThrow();
    });

    it("constantes do modulo", () => {
      expect(PERCENTUAL_MULTA_PADRAO).toBe(2);
      expect(CONF_FINANCEIRO_COLUNAS).toEqual({ taxaJurosMes: "taxajurosmes", carenciaDias: "carenciadiascobrancajuros" });
      for (const nome of Object.values(CONF_FINANCEIRO_COLUNAS)) expect(nome).toMatch(/^[a-z_]+$/);
    });
  });

  describe("diasEntre", () => {
    it("mesmo dia 0; um dia 1", () => {
      expect(diasEntre("2026-11-06", "2026-11-06")).toBe(0);
      expect(diasEntre("2026-11-06", "2026-11-07")).toBe(1);
    });
    it("atravessa mes e ano", () => {
      expect(diasEntre("2026-10-27", "2026-11-06")).toBe(10);
      expect(diasEntre("2026-12-30", "2027-01-02")).toBe(3);
    });
    it("fim anterior retorna negativo", () => {
      expect(diasEntre("2026-11-06", "2026-11-01")).toBe(-5);
    });
    it("virada de horario de verao nao altera (UTC)", () => {
      expect(diasEntre("2019-02-15", "2019-02-20")).toBe(5);
      expect(diasEntre("2018-11-01", "2018-11-05")).toBe(4);
    });
  });

  describe("decidirValoresBaixa", () => {
    const base = { dataPagamento: "2026-11-06", conf: CONF_REAL };
    const atrasado = [{ idcontareceber: 1, principal: 457, vencimento: "2026-10-27" }];

    it("em dia, EFI desconhecida -> com_encargos, valorPago = principal, soma em centavos", () => {
      const r = decidirValoresBaixa({
        ...base,
        titulos: [
          { idcontareceber: 1, principal: 0.1, vencimento: "2026-11-06" },
          { idcontareceber: 2, principal: 0.2, vencimento: "2026-12-01" },
        ],
        valorPagoEfi: null,
      });
      expect(r).toMatchObject({ ok: true, modo: "com_encargos", valorTotal: 0.3 });
      if (r.ok) expect(r.titulos.map((t) => t.valorPago)).toEqual([0.1, 0.2]);
    });

    it("em dia com EFI divergente -> VALOR_INCOMPATIVEL", () => {
      const r = decidirValoresBaixa({
        ...base,
        titulos: [{ idcontareceber: 1, principal: 457, vencimento: "2026-11-06" }],
        valorPagoEfi: 500,
      });
      expect(r).toMatchObject({ ok: false, codigo: "VALOR_INCOMPATIVEL" });
    });

    it("atraso, EFI desconhecida -> com_encargos: principal + juros + multa (caso dourado)", () => {
      const r = decidirValoresBaixa({ ...base, titulos: atrasado, valorPagoEfi: null });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.modo).toBe("com_encargos");
      expect(r.titulos[0]).toEqual({ idcontareceber: 1, principal: 457, juros: 1.51, multa: 9.14, atraso: 10, valorPago: 467.65 });
      expect(r.valorTotal).toBe(467.65);
    });

    it("atraso, EFI igual a principal + encargos: aceita 0,10 de diferenca, rejeita 0,11", () => {
      for (const efi of [467.65, 467.75, 467.55]) {
        const r = decidirValoresBaixa({ ...base, titulos: atrasado, valorPagoEfi: efi });
        expect(r).toMatchObject({ ok: true, modo: "com_encargos", valorTotal: 467.65 });
      }
      const fora = decidirValoresBaixa({ ...base, titulos: atrasado, valorPagoEfi: 467.76 });
      expect(fora).toMatchObject({ ok: false, codigo: "VALOR_INCOMPATIVEL" });
    });

    it("atraso, EFI igual ao principal -> nominal: juros e multa zero, atraso preservado", () => {
      const r = decidirValoresBaixa({ ...base, titulos: atrasado, valorPagoEfi: 457 });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.modo).toBe("nominal");
      expect(r.titulos[0]).toEqual({ idcontareceber: 1, principal: 457, juros: 0, multa: 0, atraso: 10, valorPago: 457 });
      expect(r.valorTotal).toBe(457);
    });

    it("atraso, EFI diferente de ambos -> VALOR_INCOMPATIVEL com os tres valores na mensagem", () => {
      const r = decidirValoresBaixa({ ...base, titulos: atrasado, valorPagoEfi: 300 });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.codigo).toBe("VALOR_INCOMPATIVEL");
      expect(r.mensagem).toContain("300.00");
      expect(r.mensagem).toContain("467.65");
      expect(r.mensagem).toContain("457.00");
    });

    it("encargos menores que a tolerancia: prefere com_encargos quando ambos coincidem", () => {
      // principal 1,00 em 1 dia de atraso: multa 0,02 + juros 0,00 = total 1,02; EFI 1,05 esta a 0,03 do total e 0,05 do principal
      const t = [{ idcontareceber: 1, principal: 1, vencimento: "2026-11-05" }];
      const r = decidirValoresBaixa({ ...base, titulos: t, valorPagoEfi: 1.05 });
      expect(r).toMatchObject({ ok: true, modo: "com_encargos" });
    });

    it("multi-titulo com atrasos diferentes soma em centavos sem erro de ponto flutuante", () => {
      const titulos = [
        { idcontareceber: 1, principal: 457, vencimento: "2026-10-27" }, // 10 dias
        { idcontareceber: 2, principal: 252.93, vencimento: "2026-10-27" }, // 10 dias
        { idcontareceber: 3, principal: 0.1, vencimento: "2026-12-01" }, // em dia
      ];
      const r = decidirValoresBaixa({ ...base, titulos, valorPagoEfi: null });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.valorTotal).toBe(726.57); // 467.65 + 258.82 + 0.10
      expect(r.titulos.map((t) => t.valorPago)).toEqual([467.65, 258.82, 0.1]);
    });

    it("atraso dentro da carencia (regiao nao validada) -> ATRASO_REQUER_ENCARGOS sem escrever", () => {
      const r = decidirValoresBaixa({
        ...base,
        conf: { ...CONF_REAL, carenciaDias: 15 },
        titulos: atrasado,
        valorPagoEfi: null,
      });
      expect(r).toMatchObject({ ok: false, codigo: "ATRASO_REQUER_ENCARGOS" });
    });

    it("arredondamento: 0,1 + 0,2 nao produz 0,30000000000000004", () => {
      const r = decidirValoresBaixa({
        ...base,
        titulos: [
          { idcontareceber: 1, principal: 0.1, vencimento: "2026-11-06" },
          { idcontareceber: 2, principal: 0.2, vencimento: "2026-11-06" },
        ],
        valorPagoEfi: null,
      });
      expect(r.ok && r.valorTotal).toBe(0.3);
    });
  });
});
