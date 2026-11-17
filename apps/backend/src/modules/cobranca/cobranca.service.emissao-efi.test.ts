import { InternalServerErrorException } from "@nestjs/common";
import { CobrancaService } from "./cobranca.service";

// Helper comum de emissao EFI (Fase 50): sem rede, axios mockado.
jest.mock("axios");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const axios = require("axios");

function montar(opts: {
  documento?: string | null;
  clienteRejeita?: boolean;
  authRejeita?: boolean;
  appBaseUrl?: string;
}) {
  const instancia = {
    post: opts.authRejeita
      ? jest.fn().mockRejectedValue(new Error("401"))
      : jest.fn().mockResolvedValue({ data: { access_token: "tok" } }),
  };
  axios.create = jest.fn(() => instancia);

  const athosService = {
    buscarDadosClienteContasReceber: jest.fn().mockResolvedValue({ nome_cliente: "ACME LTDA" }),
    buscarClientePorId: opts.clienteRejeita
      ? jest.fn().mockRejectedValue(new Error("athos fora"))
      : jest.fn().mockResolvedValue({ documento: opts.documento ?? null }),
  };
  const valores: Record<string, string | undefined> = {
    EFI_CLIENT_ID: "id-ficticio",
    EFI_CLIENT_SECRET: "seg-ficticio",
    APP_BASE_URL: opts.appBaseUrl,
  };
  const config = { get: jest.fn((k: string) => valores[k]) };

  const service = Object.create(CobrancaService.prototype) as CobrancaService;
  (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  (service as any).athosService = athosService;
  (service as any).config = config;
  return { service, instancia, logger: (service as any).logger };
}

describe("CobrancaService.prepararEmissaoEfi", () => {
  const envAnterior = { w: process.env.WEBHOOK_BASE_URL, a: process.env.APP_URL };
  beforeEach(() => {
    delete process.env.WEBHOOK_BASE_URL;
    delete process.env.APP_URL;
  });
  afterAll(() => {
    if (envAnterior.w !== undefined) process.env.WEBHOOK_BASE_URL = envAnterior.w;
    if (envAnterior.a !== undefined) process.env.APP_URL = envAnterior.a;
  });

  it("E1 PF: customer com cpf, token e cliente axios com timeout de 15 s", async () => {
    const { service, instancia } = montar({ documento: "123.456.789-09" });
    const ctx = await service.prepararEmissaoEfi(2641);
    expect(ctx.customer).toEqual({ name: "ACME LTDA", cpf: "12345678909" });
    expect(ctx.token).toBe("tok");
    expect(ctx.nomeCliente).toBe("ACME LTDA");
    expect(ctx.cli).toBe(instancia);
    expect(axios.create).toHaveBeenCalledWith(expect.objectContaining({ timeout: 15000 }));
  });

  it("E2 PJ: customer com juridical_person", async () => {
    const { service } = montar({ documento: "12.345.678/0001-95" });
    const ctx = await service.prepararEmissaoEfi(2641);
    expect(ctx.customer).toEqual({ juridical_person: { corporate_name: "ACME LTDA", cnpj: "12345678000195" } });
  });

  it("E3 falha ao ler o documento: customer so com nome e aviso no log", async () => {
    const { service, logger } = montar({ clienteRejeita: true });
    const ctx = await service.prepararEmissaoEfi(2641);
    expect(ctx.customer).toEqual({ name: "ACME LTDA" });
    expect(logger.warn).toHaveBeenCalled();
  });

  it("E4 falha na autenticacao da EFI -> InternalServerErrorException", async () => {
    const { service } = montar({ documento: "12345678909", authRejeita: true });
    await expect(service.prepararEmissaoEfi(2641)).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it("E5 notificationUrl so com APP_BASE_URL publica", async () => {
    const publica = montar({ appBaseUrl: "https://app.exemplo.com" });
    expect((await publica.service.prepararEmissaoEfi(1)).notificationUrl).toBe(
      "https://app.exemplo.com/api/cobranca/boleto/notificacao",
    );
    const local = montar({ appBaseUrl: "http://localhost:3000" });
    expect((await local.service.prepararEmissaoEfi(1)).notificationUrl).toBeUndefined();
  });
});
