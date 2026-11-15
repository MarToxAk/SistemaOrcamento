/**
 * Teste HTTP da rota PATCH /api/quotes/:id/status (Fase 49, plano 49-01).
 *
 * Guard global real (InternalAuthGuard) e ValidationPipe igual ao main.ts; QuotesService falso,
 * sem banco e sem Chatwoot. ConfigService falso le process.env (sem ConfigModule.forRoot).
 */
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";

import { InternalAuthGuard } from "../security/internal-auth.guard";
import { QuotesController } from "./quotes.controller";
import { QuotesService } from "./quotes.service";

const CHAVE_INTERNA = "chave-interna-teste-49";

describe("QuotesController PATCH :id/status (HTTP)", () => {
  let app: INestApplication;
  let base = "";
  let envAnterior: string | undefined;
  const changeStatus = jest.fn();

  async function patch(corpo: unknown, chaveInterna: string | null = CHAVE_INTERNA) {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (chaveInterna) h["x-internal-api-key"] = chaveInterna;
    const res = await fetch(`${base}/api/quotes/abc/status`, { method: "PATCH", headers: h, body: JSON.stringify(corpo) });
    const json = (await res.json()) as Record<string, any>;
    return { status: res.status, json };
  }

  const corpoBase = { newStatus: "PRONTO_PARA_ENTREGA", changedBy: "Painel" };

  beforeAll(async () => {
    envAnterior = process.env.INTERNAL_API_KEY;
    process.env.INTERNAL_API_KEY = CHAVE_INTERNA;
    const modulo = await Test.createTestingModule({
      controllers: [QuotesController],
      providers: [
        { provide: QuotesService, useValue: { changeStatus } },
        { provide: ConfigService, useValue: { get: (k: string) => process.env[k] } },
        { provide: APP_GUARD, useClass: InternalAuthGuard },
      ],
    }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.listen(0, "127.0.0.1");
    base = (await app.getUrl()).replace("[::1]", "127.0.0.1");
  });

  afterAll(async () => {
    if (app) await app.close();
    if (envAnterior === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = envAnterior;
  });

  beforeEach(() => {
    changeStatus.mockReset().mockResolvedValue({ id: "q1", statusKey: "PRONTO_PARA_ENTREGA" });
  });

  it("notificarCliente false -> 200 e changeStatus recebe { notificarCliente: false }", async () => {
    const { status } = await patch({ ...corpoBase, notificarCliente: false });
    expect(status).toBe(200);
    expect(changeStatus).toHaveBeenCalledWith("abc", "PRONTO_PARA_ENTREGA", "Painel", { notificarCliente: false });
  });

  it("sem notificarCliente -> 200 e changeStatus recebe { notificarCliente: true }", async () => {
    const { status } = await patch(corpoBase);
    expect(status).toBe(200);
    expect(changeStatus).toHaveBeenCalledWith("abc", "PRONTO_PARA_ENTREGA", "Painel", { notificarCliente: true });
  });

  it("notificarCliente true -> 200 e changeStatus recebe { notificarCliente: true }", async () => {
    const { status } = await patch({ ...corpoBase, notificarCliente: true });
    expect(status).toBe(200);
    expect(changeStatus).toHaveBeenCalledWith("abc", "PRONTO_PARA_ENTREGA", "Painel", { notificarCliente: true });
  });

  it("notificarCliente como string 'false' -> 400 e servico nao chamado", async () => {
    const { status } = await patch({ ...corpoBase, notificarCliente: "false" });
    expect(status).toBe(400);
    expect(changeStatus).not.toHaveBeenCalled();
  });

  it("campo desconhecido -> 400 e servico nao chamado", async () => {
    const { status } = await patch({ ...corpoBase, avisar: true });
    expect(status).toBe(400);
    expect(changeStatus).not.toHaveBeenCalled();
  });

  it("sem x-internal-api-key -> 401 e servico nao chamado", async () => {
    const { status } = await patch(corpoBase, null);
    expect(status).toBe(401);
    expect(changeStatus).not.toHaveBeenCalled();
  });
});

describe("PATCH /quotes/status/lote (Fase 49, D-03)", () => {
  let app: INestApplication;
  let base = "";
  let envAnterior: string | undefined;
  const changeStatus = jest.fn();
  const changeStatusLote = jest.fn();
  const resultadoLote = {
    total: 2,
    sucesso: 2,
    falha: 0,
    resultados: [
      { id: "a1", ok: true, quoteId: "u1", statusKey: "ENTREGUE", statusLabel: "Entregue" },
      { id: "123", ok: true, quoteId: "u2", statusKey: "ENTREGUE", statusLabel: "Entregue" },
    ],
  };

  async function patchCaminho(caminho: string, corpo: unknown, chaveInterna: string | null = CHAVE_INTERNA) {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (chaveInterna) h["x-internal-api-key"] = chaveInterna;
    const res = await fetch(`${base}/api/quotes/${caminho}`, { method: "PATCH", headers: h, body: JSON.stringify(corpo) });
    const json = (await res.json()) as Record<string, any>;
    return { status: res.status, json };
  }

  const corpoLote = { ids: ["a1", "123"], newStatus: "ENTREGUE", changedBy: "Painel" };

  beforeAll(async () => {
    envAnterior = process.env.INTERNAL_API_KEY;
    process.env.INTERNAL_API_KEY = CHAVE_INTERNA;
    const modulo = await Test.createTestingModule({
      controllers: [QuotesController],
      providers: [
        { provide: QuotesService, useValue: { changeStatus, changeStatusLote } },
        { provide: ConfigService, useValue: { get: (k: string) => process.env[k] } },
        { provide: APP_GUARD, useClass: InternalAuthGuard },
      ],
    }).compile();
    app = modulo.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.listen(0, "127.0.0.1");
    base = (await app.getUrl()).replace("[::1]", "127.0.0.1");
  });

  afterAll(async () => {
    if (app) await app.close();
    if (envAnterior === undefined) delete process.env.INTERNAL_API_KEY;
    else process.env.INTERNAL_API_KEY = envAnterior;
  });

  beforeEach(() => {
    changeStatus.mockReset().mockResolvedValue({ id: "q1", statusKey: "ENTREGUE" });
    changeStatusLote.mockReset().mockResolvedValue(resultadoLote);
  });

  it("lote valido -> 200, changeStatusLote chamado e corpo igual ao do servico", async () => {
    const { status, json } = await patchCaminho("status/lote", corpoLote);
    expect(status).toBe(200);
    expect(changeStatusLote).toHaveBeenCalledWith(["a1", "123"], "ENTREGUE", "Painel");
    expect(changeStatus).not.toHaveBeenCalled();
    expect(json).toEqual(resultadoLote);
  });

  it("PATCH /quotes/123/status continua em changeStatus e nao em changeStatusLote", async () => {
    const { status } = await patchCaminho("123/status", { newStatus: "ENTREGUE", changedBy: "Painel" });
    expect(status).toBe(200);
    expect(changeStatus).toHaveBeenCalledTimes(1);
    expect(changeStatusLote).not.toHaveBeenCalled();
  });

  it("sem x-internal-api-key -> 401 e servico nao chamado", async () => {
    const { status } = await patchCaminho("status/lote", corpoLote, null);
    expect(status).toBe(401);
    expect(changeStatusLote).not.toHaveBeenCalled();
  });
});
