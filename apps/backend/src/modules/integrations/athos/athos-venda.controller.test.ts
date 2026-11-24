import "reflect-metadata";
import { HttpException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";

import { AdminAuthGuard } from "../../security/admin-auth.guard";
import { AthosVendaController, erroHttp } from "./athos-venda.controller";
import type { AthosVendaService } from "./athos-venda.service";
import { VendaAthosError } from "./athos-venda.util";
import { LancarVendaDto } from "./dto/lancar-venda.dto";

const RESULTADO = { simulado: true, valores: {}, comandos: [] } as never;

function criar() {
  const lancar = jest.fn().mockResolvedValue(RESULTADO);
  const controller = new AthosVendaController({ lancarVendaDeOrcamento: lancar } as unknown as AthosVendaService);
  return { controller, lancar };
}

const CORPO = { idvendedor: 3, idterminal: 3, idcaixaMovimento: 291 } as LancarVendaDto;

describe("AthosVendaController", () => {
  it("a rota e administrativa (AdminAuthGuard no handler)", () => {
    const guards = Reflect.getMetadata("__guards__", AthosVendaController.prototype.lancar) as unknown[];
    expect(guards).toContain(AdminAuthGuard);
    expect(Reflect.getMetadata("path", AthosVendaController)).toBe("athos/venda");
    expect(Reflect.getMetadata("path", AthosVendaController.prototype.lancar)).toBe("de-orcamento/:idorcamento");
  });

  it("corpo sem `simular` e SIMULACAO (nunca grava por omissao)", async () => {
    const { controller, lancar } = criar();
    await controller.lancar(26698, CORPO);
    expect(lancar).toHaveBeenCalledWith(expect.objectContaining({ idorcamento: 26698, simular: true }));
  });

  it("repassa simular:false e o desconto do cupom ao servico", async () => {
    const { controller, lancar } = criar();
    await controller.lancar(26698, { ...CORPO, simular: false, descontoCupom: 11.5, idformapagamento: 5 });
    expect(lancar).toHaveBeenCalledWith({
      idorcamento: 26698,
      idvendedor: 3,
      idterminal: 3,
      idcaixaMovimento: 291,
      descontoCupom: 11.5,
      idformapagamento: 5,
      simular: false,
    });
  });

  it.each([
    ["ORCAMENTO_NAO_ENCONTRADO", 404],
    ["ORCAMENTO_JA_LANCADO", 409],
    ["RECURSO_DESLIGADO", 503],
    ["ATHOS_INDISPONIVEL", 503],
    ["FORMA_PAGAMENTO_NAO_SUPORTADA", 422],
    ["CAIXA_FECHADO", 422],
    ["PRODUTO_NAO_VENDAVEL", 422],
    ["DESCONTO_INVALIDO", 422],
    ["DESCONTO_ACIMA_DO_MAXIMO", 422],
    ["ERRO_BANCO", 500],
    ["ESQUEMA_DIVERGENTE", 500],
  ] as const)("mapeia %s para HTTP %i", async (codigo, status) => {
    const { controller, lancar } = criar();
    lancar.mockRejectedValue(new VendaAthosError(codigo, "mensagem segura", codigo === "ORCAMENTO_JA_LANCADO" ? 777 : undefined));
    await expect(controller.lancar(1, CORPO)).rejects.toMatchObject({ status });
  });

  it("ORCAMENTO_JA_LANCADO devolve o idvenda existente", () => {
    const e = erroHttp(new VendaAthosError("ORCAMENTO_JA_LANCADO", "ja existe", 777));
    expect((e.getResponse() as { idvenda: number }).idvenda).toBe(777);
  });

  it("erro desconhecido vira 500 generico, sem vazar detalhes", () => {
    const e = erroHttp(new Error("password authentication failed for user x host 10.0.0.1"));
    expect(e).toBeInstanceOf(HttpException);
    expect(e.getStatus()).toBe(500);
    expect(JSON.stringify(e.getResponse())).not.toMatch(/password|10\.0\.0\.1/);
  });
});

describe("LancarVendaDto", () => {
  async function erros(corpo: Record<string, unknown>) {
    return validate(plainToInstance(LancarVendaDto, corpo));
  }

  it("aceita o corpo minimo e o completo", async () => {
    expect(await erros({ idvendedor: 3, idterminal: 3, idcaixaMovimento: 291 })).toHaveLength(0);
    expect(await erros({ idvendedor: 3, idterminal: 3, idcaixaMovimento: 291, descontoCupom: 11.5, idformapagamento: 5, simular: false })).toHaveLength(0);
  });

  it("recusa ids ausentes, desconto negativo ou com 3 casas, e simular nao booleano", async () => {
    expect((await erros({})).length).toBeGreaterThan(0);
    expect((await erros({ idvendedor: 3, idterminal: 3, idcaixaMovimento: 291, descontoCupom: -1 })).length).toBeGreaterThan(0);
    expect((await erros({ idvendedor: 3, idterminal: 3, idcaixaMovimento: 291, descontoCupom: 1.234 })).length).toBeGreaterThan(0);
    expect((await erros({ idvendedor: 3, idterminal: 3, idcaixaMovimento: 291, simular: "talvez" })).length).toBeGreaterThan(0);
  });
});
