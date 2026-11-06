import { ValidationPipe } from "@nestjs/common";
import type { ArgumentMetadata } from "@nestjs/common";

import { AdminAuthGuard } from "../security/admin-auth.guard";
import { CobrancaController } from "./cobranca.controller";
import { BaixarAthosDto } from "./dto/baixar-athos.dto";

// Controller instanciado com colaboradores falsos: nenhum Nest app, nenhuma rede, nenhum Athos (D-07).

function montar() {
  const baixaAthos = {
    baixarManual: jest.fn().mockResolvedValue({ simulado: false, status: "baixado" }),
    consultarStatus: jest.fn().mockResolvedValue({ athosBaixaStatus: "baixado", historico: [] }),
  };
  const controller = new CobrancaController({} as any, {} as any, baixaAthos as any);
  return { controller, baixaAthos };
}

// Mesma configuracao do ValidationPipe global de apps/backend/src/main.ts
function pipeGlobal() {
  return new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
}
const META: ArgumentMetadata = { type: "body", metatype: BaixarAthosDto, data: "" };

describe("CobrancaController - baixa Athos (plano 43-03)", () => {
  it("C1. baixarAthos esta protegido por AdminAuthGuard; consultar status nao", () => {
    const guardsBaixar: unknown[] = Reflect.getMetadata("__guards__", CobrancaController.prototype.baixarAthos) ?? [];
    expect(guardsBaixar).toContain(AdminAuthGuard);

    const guardsStatus: unknown[] =
      Reflect.getMetadata("__guards__", CobrancaController.prototype.statusBaixaAthos) ?? [];
    expect(guardsStatus).not.toContain(AdminAuthGuard);
  });

  it("C1b. nenhuma das duas rotas e @Public", () => {
    // Public() grava metadata via SetMetadata; o decorator existente marca o handler.
    const chaves = (alvo: unknown) => Reflect.getMetadataKeys(alvo as object);
    for (const handler of [CobrancaController.prototype.baixarAthos, CobrancaController.prototype.statusBaixaAthos]) {
      const valores = chaves(handler).map((k) => Reflect.getMetadata(k, handler));
      expect(valores).not.toContain(true);
    }
  });

  it("C2. ValidationPipe do main.ts rejeita data fora do padrao, simular nao booleano e campo desconhecido", async () => {
    const pipe = pipeGlobal();
    await expect(pipe.transform({ dataPagamento: "06/11/2026" }, META)).rejects.toBeDefined();
    await expect(pipe.transform({ simular: "sim" }, META)).rejects.toBeDefined();
    await expect(pipe.transform({ ignorarValorEfi: "sim" }, META)).rejects.toBeDefined();
    await expect(pipe.transform({ outraCoisa: 1 }, META)).rejects.toBeDefined();
  });

  it("C2b. aceita body vazio e body completo valido", async () => {
    const pipe = pipeGlobal();
    await expect(pipe.transform({}, META)).resolves.toBeInstanceOf(BaixarAthosDto);
    const completo = await pipe.transform(
      { dataPagamento: "2026-11-05", simular: true, ignorarValorEfi: false },
      META,
    );
    expect(completo).toMatchObject({ dataPagamento: "2026-11-05", simular: true, ignorarValorEfi: false });
  });

  it("C3. o controller delega ao orquestrador com id numerico e o DTO transformado", async () => {
    const { controller, baixaAthos } = montar();
    const dto = (await pipeGlobal().transform({ dataPagamento: "2026-11-05", simular: true }, META)) as BaixarAthosDto;
    await controller.baixarAthos(7, dto);
    expect(baixaAthos.baixarManual).toHaveBeenCalledWith(7, dto);

    await controller.statusBaixaAthos(7);
    expect(baixaAthos.consultarStatus).toHaveBeenCalledWith(7);
  });
});
