import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";

import { AdminAuthGuard } from "../security/admin-auth.guard";
import { CobrancaController } from "./cobranca.controller";

// Controller instanciado com colaboradores falsos: nenhum Nest app, nenhuma rede, nenhum Athos (D-07).

const RESULTADO_PREVIA = {
  hoje: "2026-11-10",
  dryRun: true,
  candidatos: 1,
  enviados: 0,
  semEmail: 0,
  jaProcessados: 0,
  erros: 0,
  lookupFalhou: 0,
  itens: [
    {
      cobrancaBoletoId: 10,
      idclienteAthos: 5,
      tipo: "d_menos_1",
      diasParaVencer: 1,
      desfecho: "simulado",
      destinatarioMascarado: "c***@e***.com",
      ccQuantidade: 0,
    },
  ],
};

function montar() {
  const avisos = { processarCiclo: jest.fn().mockResolvedValue(RESULTADO_PREVIA) };
  const controller = new CobrancaController({} as any, {} as any, {} as any, avisos as any);
  return { controller, avisos };
}

describe("CobrancaController - previa do aviso de vencimento (plano 45-03)", () => {
  it("C1. protegida por AdminAuthGuard", () => {
    const guards: unknown[] =
      Reflect.getMetadata("__guards__", CobrancaController.prototype.previaAvisoVencimento) ?? [];
    expect(guards).toContain(AdminAuthGuard);
  });

  it("C2. nao e publica", () => {
    const handler = CobrancaController.prototype.previaAvisoVencimento;
    const valores = Reflect.getMetadataKeys(handler).map((k) => Reflect.getMetadata(k, handler));
    expect(valores).not.toContain(true);
  });

  it("C3. sempre dry-run: uma chamada com { dryRun: true } e devolve o resultado", async () => {
    const { controller, avisos } = montar();
    await expect(controller.previaAvisoVencimento()).resolves.toEqual(RESULTADO_PREVIA);
    expect(avisos.processarCiclo).toHaveBeenCalledTimes(1);
    expect(avisos.processarCiclo).toHaveBeenCalledWith({ dryRun: true });
  });

  it("C4. rota GET aviso-vencimento/previa e handler sem parametros de entrada", () => {
    const handler = CobrancaController.prototype.previaAvisoVencimento;
    expect(Reflect.getMetadata("path", handler)).toBe("aviso-vencimento/previa");
    expect(Reflect.getMetadata("method", handler)).toBe(RequestMethod.GET);
    expect(handler.length).toBe(0);
  });
});
