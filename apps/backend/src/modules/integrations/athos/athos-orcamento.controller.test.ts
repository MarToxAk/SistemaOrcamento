/**
 * Teste HTTP do AthosOrcamentoController (Fase 44, plano 44-03).
 *
 * Guard global real (InternalAuthGuard) e ValidationPipe igual ao main.ts; servicos falsos,
 * sem banco. Nao usa ConfigModule.forRoot (carregaria .env): ConfigService falso le process.env.
 */
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";

import { InternalAuthGuard } from "../../security/internal-auth.guard";
import { AthosOrcamentoController } from "./athos-orcamento.controller";
import { AthosOrcamentoIdempotenciaService } from "./athos-orcamento-idempotencia.service";
import { AthosOrcamentoService, CriarOrcamentoResultado, OrcamentoAthosError } from "./athos-orcamento.service";

const CHAVE_INTERNA = "chave-interna-teste-44";
const CHAVE_IDEM = "chave-teste-0001";

function resultado(): CriarOrcamentoResultado {
  return {
    simulado: false,
    idorcamento: 25866,
    senhabalcao: 25866,
    valorBruto: "8.50",
    descontoRS: "0.00",
    descontoPercentual: "0.00",
    valorLiquido: "8.50",
    itens: [],
    pagamento: { idformapagamento: 5, idcondicaopagamento: 0, valor: "8.50" },
  };
}

describe("AthosOrcamentoController (HTTP)", () => {
  let app: INestApplication;
  let base = "";
  let envAnterior: string | undefined;
  const criarOrcamento = jest.fn();
  const executar = jest.fn();

  async function postar(corpo: unknown, headers: Record<string, string> = {}, chaveInterna: string | null = CHAVE_INTERNA) {
    const h: Record<string, string> = { "content-type": "application/json", ...headers };
    if (chaveInterna) h["x-internal-api-key"] = chaveInterna;
    const res = await fetch(`${base}/api/athos/orcamentos`, { method: "POST", headers: h, body: JSON.stringify(corpo) });
    const json = (await res.json()) as Record<string, any>;
    return { status: res.status, json };
  }

  const corpoValido = { itens: [{ idproduto: 29246, quantidade: 2 }] };

  beforeAll(async () => {
    envAnterior = process.env.INTERNAL_API_KEY;
    process.env.INTERNAL_API_KEY = CHAVE_INTERNA;
    const modulo = await Test.createTestingModule({
      controllers: [AthosOrcamentoController],
      providers: [
        { provide: AthosOrcamentoService, useValue: { criarOrcamento } },
        { provide: AthosOrcamentoIdempotenciaService, useValue: { executar } },
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
    criarOrcamento.mockReset().mockResolvedValue(resultado());
    executar.mockReset().mockImplementation((_chave, _dto, criar) => criar({ ref: "r1" }));
  });

  it("C1 sem x-internal-api-key -> 401 e nenhum servico chamado", async () => {
    const { status } = await postar(corpoValido, {}, null);
    expect(status).toBe(401);
    expect(executar).not.toHaveBeenCalled();
    expect(criarOrcamento).not.toHaveBeenCalled();
  });

  it("C2 chave interna errada -> 401", async () => {
    const { status } = await postar(corpoValido, {}, "chave-errada");
    expect(status).toBe(401);
    expect(executar).not.toHaveBeenCalled();
  });

  it("C3 POST valido com Idempotency-Key -> 201 e executar recebe chave, dto e funcao", async () => {
    const { status, json } = await postar(corpoValido, { "Idempotency-Key": CHAVE_IDEM });
    expect(status).toBe(201);
    expect(json).toEqual(resultado());
    expect(executar).toHaveBeenCalledTimes(1);
    const [chave, dto, criar] = executar.mock.calls[0];
    expect(chave).toBe(CHAVE_IDEM);
    expect(dto.itens).toEqual([{ idproduto: 29246, quantidade: 2 }]);
    expect(typeof criar).toBe("function");
    expect(criarOrcamento).toHaveBeenCalledWith(expect.objectContaining({ itens: expect.any(Array) }), { ref: "r1" });
  });

  it("C4 sem header -> executar recebe undefined", async () => {
    const { status } = await postar(corpoValido);
    expect(status).toBe(201);
    expect(executar.mock.calls[0][0]).toBeUndefined();
  });

  it("C5 corpo com idformapagamento -> 400 (D-04) e servico nao chamado", async () => {
    const { status } = await postar({ ...corpoValido, idformapagamento: 1 });
    expect(status).toBe(400);
    expect(executar).not.toHaveBeenCalled();
  });

  it("C6 itens vazio, 201 itens e quantidade com 4 casas -> 400", async () => {
    const vazio = await postar({ itens: [] });
    expect(vazio.status).toBe(400);
    const muitos = await postar({ itens: Array.from({ length: 201 }, () => ({ idproduto: 1, quantidade: 1 })) });
    expect(muitos.status).toBe(400);
    const fracao = await postar({ itens: [{ idproduto: 1, quantidade: 1.2345 }] });
    expect(fracao.status).toBe(400);
    expect(executar).not.toHaveBeenCalled();
  });

  it("C7 erro de regra legivel por IA: 422 com codigo, mensagem e detalhes", async () => {
    executar.mockRejectedValue(
      new OrcamentoAthosError("PRODUTO_INEXISTENTE", "Produto 9 nao existe", 422, { idsInexistentes: [9] }),
    );
    const { status, json } = await postar(corpoValido);
    expect(status).toBe(422);
    expect(json.statusCode).toBe(422);
    expect(json.codigo).toBe("PRODUTO_INEXISTENTE");
    expect(json.mensagem).toBe("Produto 9 nao existe");
    expect(json.detalhes.idsInexistentes).toEqual([9]);
  });

  it("C8 conflito de chave -> 409 com codigo", async () => {
    executar.mockRejectedValue(
      new OrcamentoAthosError("IDEMPOTENCY_KEY_REUTILIZADA", "Chave ja usada com outro corpo", 409),
    );
    const { status, json } = await postar(corpoValido, { "Idempotency-Key": CHAVE_IDEM });
    expect(status).toBe(409);
    expect(json.codigo).toBe("IDEMPOTENCY_KEY_REUTILIZADA");
  });
});
