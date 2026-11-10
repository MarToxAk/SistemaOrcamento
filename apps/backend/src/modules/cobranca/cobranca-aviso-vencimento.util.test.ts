import {
  AVISO_DIAS_MAX,
  AVISO_DIAS_MIN,
  JANELAS_AVISO,
  TIPOS_AVISO,
  calcularDiasParaVencer,
  classificarVencimento,
  mascararEmail,
  somarDias,
  tipoAvisoAplicavel,
} from "./cobranca-aviso-vencimento.util";

describe("cobranca-aviso-vencimento.util (Fase 45)", () => {
  it.each([
    [4, null],
    [3, "D-3"],
    [2, "D-3"],
    [1, "D-1"],
    [0, null],
    [-1, null],
    [-2, "A+2"],
    [-6, "A+2"],
    [-7, "A+7"],
    [-13, "A+7"],
    [-14, "A+14"],
    [-20, "A+14"],
    [-21, null],
    [null, null],
  ])("U1 tabela de tipos: dias=%s -> %s", (dias, esperado) => {
    expect(tipoAvisoAplicavel(dias as number | null)).toBe(esperado);
  });

  it("U2 janelas disjuntas: de -40 a 40 no maximo um tipo contem o dia", () => {
    for (let dia = -40; dia <= 40; dia += 1) {
      const aplicaveis = TIPOS_AVISO.filter(
        (t) => dia >= JANELAS_AVISO[t].min && dia <= JANELAS_AVISO[t].max,
      );
      expect(aplicaveis.length).toBeLessThanOrEqual(1);
    }
  });

  it("U3 dias para vencer: virada de mes/ano, bissexto e entradas invalidas", () => {
    expect(calcularDiasParaVencer("2026-12-01", "2026-11-30")).toBe(1);
    expect(calcularDiasParaVencer("2027-01-01", "2026-12-31")).toBe(1);
    expect(calcularDiasParaVencer("2026-03-01", "2026-02-28")).toBe(1);
    expect(calcularDiasParaVencer("2026-11-01", "2026-11-10")).toBe(-9);
    expect(calcularDiasParaVencer(null, "2026-11-10")).toBeNull();
    expect(calcularDiasParaVencer("", "2026-11-10")).toBeNull();
    expect(calcularDiasParaVencer("10/11/2026", "2026-11-10")).toBeNull();
    expect(calcularDiasParaVencer("2026-02-30", "2026-11-10")).toBeNull();
  });

  it("U4 somarDias", () => {
    expect(somarDias("2026-11-10", -20)).toBe("2026-10-21");
    expect(somarDias("2026-11-10", 3)).toBe("2026-11-13");
    expect(somarDias("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("U5 classificarVencimento", () => {
    expect(classificarVencimento(-1, "pendente")).toBe("atrasado");
    expect(classificarVencimento(0, "pendente")).toBe("vence_hoje");
    expect(classificarVencimento(1, "pendente")).toBe("a_vencer");
    expect(classificarVencimento(2, "pendente")).toBe("a_vencer");
    expect(classificarVencimento(3, "pendente")).toBe("a_vencer");
    expect(classificarVencimento(4, "pendente")).toBeNull();
    expect(classificarVencimento(null, "pendente")).toBeNull();
    expect(classificarVencimento(-5, "pago")).toBeNull();
    expect(classificarVencimento(2, "cancelado")).toBeNull();
  });

  it("U6 limites derivados das janelas", () => {
    expect(AVISO_DIAS_MIN).toBe(-20);
    expect(AVISO_DIAS_MAX).toBe(3);
    expect([...TIPOS_AVISO]).toEqual(["D-3", "D-1", "A+2", "A+7", "A+14"]);
  });

  it("U7 mascararEmail", () => {
    expect(mascararEmail("cobranca@cliente.com.br")).toBe("co***@cliente.com.br");
    expect(mascararEmail("ab@x.com")).toBe("a***@x.com");
    expect(mascararEmail(null)).toBe("(sem e-mail)");
    expect(mascararEmail("")).toBe("(sem e-mail)");
    expect(mascararEmail("sem-arroba")).toBe("(sem e-mail)");
  });
});
