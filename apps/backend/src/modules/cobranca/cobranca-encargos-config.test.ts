import { BadRequestException, ValidationPipe } from "@nestjs/common";
import type { ArgumentMetadata } from "@nestjs/common";

import { AdminAuthGuard } from "../security/admin-auth.guard";
import { CobrancaEncargosConfigController } from "./cobranca-encargos-config.controller";
import { CobrancaEncargosConfigService } from "./cobranca-encargos-config.service";
import { AtualizarEncargosConfigDto } from "./dto/atualizar-encargos-config.dto";

// Prisma falso: nenhum banco, nenhuma rede (Fase 50, plano 04).

function montarServico(linha: Record<string, unknown> | null) {
  const cobrancaEncargosConfig = {
    findUnique: jest.fn().mockResolvedValue(linha),
    create: jest.fn().mockResolvedValue({
      id: "default",
      taxaJurosMes: "0.9900",
      multaPercentual: "2.0000",
      atualizadoEm: new Date("2026-11-01T10:00:00Z"),
    }),
    update: jest.fn().mockImplementation(({ data }: { data: Record<string, number> }) =>
      Promise.resolve({ id: "default", ...data, atualizadoEm: new Date("2026-11-02T10:00:00Z") }),
    ),
  };
  const servico = new CobrancaEncargosConfigService({ cobrancaEncargosConfig } as any);
  return { servico, cobrancaEncargosConfig };
}

function pipeGlobal() {
  return new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
}
const META: ArgumentMetadata = { type: "body", metatype: AtualizarEncargosConfigDto, data: "" };

describe("CobrancaEncargosConfig - taxas padrao do boleto atualizado (plano 50-04)", () => {
  it("K1. obter sem linha cria o singleton e devolve 0,99 / 2", async () => {
    const { servico, cobrancaEncargosConfig } = montarServico(null);
    const r = await servico.obter();
    expect(cobrancaEncargosConfig.create).toHaveBeenCalledWith({ data: { id: "default" } });
    expect(r).toMatchObject({ taxaJurosMes: 0.99, multaPercentual: 2 });
  });

  it("K2. obter com linha existente converte Decimal sem criar", async () => {
    const { servico, cobrancaEncargosConfig } = montarServico({
      id: "default",
      taxaJurosMes: "0.7500",
      multaPercentual: "1.5000",
      atualizadoEm: new Date(),
    });
    const r = await servico.obter();
    expect(cobrancaEncargosConfig.create).not.toHaveBeenCalled();
    expect(r).toMatchObject({ taxaJurosMes: 0.75, multaPercentual: 1.5 });
  });

  it("K3. atualizar grava no id default e devolve numeros", async () => {
    const { servico, cobrancaEncargosConfig } = montarServico({
      id: "default",
      taxaJurosMes: "0.9900",
      multaPercentual: "2.0000",
      atualizadoEm: new Date(),
    });
    const r = await servico.atualizar({ taxaJurosMes: 0.95, multaPercentual: 1.5 });
    expect(cobrancaEncargosConfig.update).toHaveBeenCalledWith({
      where: { id: "default" },
      data: { taxaJurosMes: 0.95, multaPercentual: 1.5 },
    });
    expect(r).toMatchObject({ taxaJurosMes: 0.95, multaPercentual: 1.5 });
  });

  it("K4. atualizar acima dos tetos ou negativo lanca BadRequest e nunca grava", async () => {
    const { servico, cobrancaEncargosConfig } = montarServico(null);
    await expect(servico.atualizar({ taxaJurosMes: 1.01, multaPercentual: 2 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(servico.atualizar({ taxaJurosMes: 1, multaPercentual: 2.01 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(servico.atualizar({ taxaJurosMes: -1, multaPercentual: 2 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(cobrancaEncargosConfig.update).not.toHaveBeenCalled();
  });

  it("K5. obter e atualizar do controller tem AdminAuthGuard e nao sao @Public", () => {
    for (const handler of [
      CobrancaEncargosConfigController.prototype.obter,
      CobrancaEncargosConfigController.prototype.atualizar,
    ]) {
      const guards: unknown[] = Reflect.getMetadata("__guards__", handler) ?? [];
      expect(guards).toContain(AdminAuthGuard);
      const valores = Reflect.getMetadataKeys(handler).map((k) => Reflect.getMetadata(k, handler));
      expect(valores).not.toContain(true);
    }
  });

  it("K6. ValidationPipe rejeita fora dos tetos, negativo, ausente, texto e campo extra; aceita validos", async () => {
    const pipe = pipeGlobal();
    const invalidos = [
      { taxaJurosMes: 1.01, multaPercentual: 2 },
      { taxaJurosMes: 1, multaPercentual: 2.5 },
      { taxaJurosMes: -0.1, multaPercentual: 2 },
      { multaPercentual: 2 },
      { taxaJurosMes: "0,99", multaPercentual: 2 },
      { taxaJurosMes: 0.99, multaPercentual: 2, extra: 1 },
    ];
    for (const corpo of invalidos) {
      await expect(pipe.transform(corpo, META)).rejects.toBeDefined();
    }
    await expect(pipe.transform({ taxaJurosMes: 0.99, multaPercentual: 2 }, META)).resolves.toBeInstanceOf(
      AtualizarEncargosConfigDto,
    );
    await expect(pipe.transform({ taxaJurosMes: 0, multaPercentual: 0 }, META)).resolves.toMatchObject({
      taxaJurosMes: 0,
      multaPercentual: 0,
    });
  });

  it("K7. o controller devolve padroes, tetos e atualizadoEm em ISO", async () => {
    const data = new Date("2026-11-03T12:00:00Z");
    const encargos = {
      obter: jest.fn().mockResolvedValue({ taxaJurosMes: 0.95, multaPercentual: 1.5, atualizadoEm: data }),
      atualizar: jest.fn().mockResolvedValue({ taxaJurosMes: 0.95, multaPercentual: 1.5, atualizadoEm: null }),
    };
    const controller = new CobrancaEncargosConfigController(encargos as any);
    const r = await controller.obter();
    expect(r).toEqual({
      taxaJurosMes: 0.95,
      multaPercentual: 1.5,
      atualizadoEm: data.toISOString(),
      padroes: { taxaJurosMes: 0.99, multaPercentual: 2 },
      tetos: { taxaJurosMes: 1, multaPercentual: 2 },
    });
    const dto = await pipeGlobal().transform({ taxaJurosMes: 0.95, multaPercentual: 1.5 }, META);
    const r2 = await controller.atualizar(dto as AtualizarEncargosConfigDto);
    expect(encargos.atualizar).toHaveBeenCalledWith({ taxaJurosMes: 0.95, multaPercentual: 1.5 });
    expect(r2.atualizadoEm).toBeNull();
  });
});
