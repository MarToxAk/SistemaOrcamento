import {
  AthosOrcamentoIdempotenciaService,
  IDEMPOTENCY_KEY_REGEX,
  hashPayloadOrcamento,
  refDoOrcamento,
} from "./athos-orcamento-idempotencia.service";
import { CriarOrcamentoInput, CriarOrcamentoResultado, OrcamentoAthosError } from "./athos-orcamento.service";

const CHAVE = "chave-teste-0001";

function resultadoBase(): CriarOrcamentoResultado {
  return {
    simulado: false,
    idorcamento: 25866,
    senhabalcao: 25866,
    valorBruto: "8.50",
    descontoRS: "2.98",
    descontoPercentual: "35.06",
    valorLiquido: "5.52",
    itens: [],
    pagamento: { idformapagamento: 5, idcondicaopagamento: 0, valor: "5.52" },
  };
}

function payloadBase(): CriarOrcamentoInput {
  return { itens: [{ idproduto: 10, quantidade: 2 }], obs: "teste" };
}

function montar() {
  const prisma = {
    athosOrcamentoIa: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  const service = new AthosOrcamentoIdempotenciaService(prisma as never);
  const loggerError = jest.spyOn((service as unknown as { logger: { error: () => void } }).logger, "error").mockImplementation(() => undefined);
  const criar = jest.fn().mockResolvedValue(resultadoBase());
  return { prisma, service, criar, loggerError };
}

describe("AthosOrcamentoIdempotenciaService", () => {
  it("I1 simulacao: chama criar sem Prisma, mesmo com chave", async () => {
    const { prisma, service, criar } = montar();
    const payload = { ...payloadBase(), simular: true };
    const r = await service.executar(CHAVE, payload, criar);
    expect(criar).toHaveBeenCalledWith({});
    expect(r.idorcamento).toBe(25866);
    expect(prisma.athosOrcamentoIa.create).not.toHaveBeenCalled();
    expect(prisma.athosOrcamentoIa.findUnique).not.toHaveBeenCalled();
    expect(prisma.athosOrcamentoIa.update).not.toHaveBeenCalled();
    expect(prisma.athosOrcamentoIa.delete).not.toHaveBeenCalled();
  });

  it("I2 sem chave: cria com ref do hash e grava auditoria com idempotencyKey null", async () => {
    const { prisma, service, criar } = montar();
    const payload = payloadBase();
    const hash = hashPayloadOrcamento(payload);
    const r = await service.executar(undefined, payload, criar);
    const ref = refDoOrcamento(hash);
    expect(ref).toMatch(/^[0-9a-f]{12}$/);
    expect(criar).toHaveBeenCalledWith({ ref });
    expect(prisma.athosOrcamentoIa.create).toHaveBeenCalledTimes(1);
    const dados = prisma.athosOrcamentoIa.create.mock.calls[0][0].data;
    expect(dados).toMatchObject({
      idempotencyKey: null,
      status: "criado",
      idorcamento: 25866,
      senhabalcao: 25866,
      valorBruto: "8.50",
      valorLiquido: "5.52",
      payloadHash: hash,
    });
    expect(dados.request).toEqual(payload);
    expect(dados.resposta).toEqual(resultadoBase());
    expect(r).toEqual(resultadoBase());
    expect((r as { replay?: boolean }).replay).toBeUndefined();
  });

  it("I3 chave nova: create(processando) -> criar -> update(criado)", async () => {
    const { prisma, service, criar } = montar();
    const ordem: string[] = [];
    prisma.athosOrcamentoIa.create.mockImplementation(async () => {
      ordem.push("create");
      return {};
    });
    criar.mockImplementation(async () => {
      ordem.push("criar");
      return resultadoBase();
    });
    prisma.athosOrcamentoIa.update.mockImplementation(async () => {
      ordem.push("update");
      return {};
    });
    const payload = payloadBase();
    const r = await service.executar(CHAVE, payload, criar);
    expect(ordem).toEqual(["create", "criar", "update"]);
    const reserva = prisma.athosOrcamentoIa.create.mock.calls[0][0].data;
    expect(reserva).toMatchObject({ idempotencyKey: CHAVE, status: "processando", payloadHash: hashPayloadOrcamento(payload) });
    expect(reserva.idorcamento).toBeUndefined();
    expect(criar).toHaveBeenCalledWith({ ref: refDoOrcamento(CHAVE) });
    const upd = prisma.athosOrcamentoIa.update.mock.calls[0][0];
    expect(upd.where).toEqual({ idempotencyKey: CHAVE });
    expect(upd.data).toMatchObject({
      status: "criado",
      idorcamento: 25866,
      senhabalcao: 25866,
      valorBruto: "8.50",
      valorLiquido: "5.52",
    });
    expect(upd.data.resposta).toEqual(resultadoBase());
    expect(r.replay).toBeUndefined();
  });

  it("I4 replay: P2002 + criado + mesmo hash devolve resposta salva sem chamar criar", async () => {
    const { prisma, service, criar } = montar();
    const payload = payloadBase();
    const salvo = { ...resultadoBase(), idorcamento: 111, senhabalcao: 222 };
    prisma.athosOrcamentoIa.create.mockRejectedValue({ code: "P2002" });
    prisma.athosOrcamentoIa.findUnique.mockResolvedValue({
      status: "criado",
      payloadHash: hashPayloadOrcamento(payload),
      resposta: salvo,
    });
    const r = await service.executar(CHAVE, payload, criar);
    expect(r).toEqual({ ...salvo, replay: true });
    expect(criar).not.toHaveBeenCalled();
    expect(prisma.athosOrcamentoIa.findUnique).toHaveBeenCalledWith({ where: { idempotencyKey: CHAVE } });
  });

  it("I5 chave reutilizada com outro corpo -> 409 IDEMPOTENCY_KEY_REUTILIZADA", async () => {
    const { prisma, service, criar } = montar();
    prisma.athosOrcamentoIa.create.mockRejectedValue({ code: "P2002" });
    prisma.athosOrcamentoIa.findUnique.mockResolvedValue({ status: "criado", payloadHash: "outro-hash", resposta: resultadoBase() });
    const erro = await service.executar(CHAVE, payloadBase(), criar).catch((e) => e);
    expect(erro).toBeInstanceOf(OrcamentoAthosError);
    expect(erro.codigo).toBe("IDEMPOTENCY_KEY_REUTILIZADA");
    expect(erro.getStatus()).toBe(409);
    expect(criar).not.toHaveBeenCalled();
  });

  it("I6 em processamento -> 409 IDEMPOTENCY_EM_PROCESSAMENTO", async () => {
    const { prisma, service, criar } = montar();
    const payload = payloadBase();
    prisma.athosOrcamentoIa.create.mockRejectedValue({ code: "P2002" });
    prisma.athosOrcamentoIa.findUnique.mockResolvedValue({
      status: "processando",
      payloadHash: hashPayloadOrcamento(payload),
      resposta: null,
    });
    const erro = await service.executar(CHAVE, payload, criar).catch((e) => e);
    expect(erro).toBeInstanceOf(OrcamentoAthosError);
    expect(erro.codigo).toBe("IDEMPOTENCY_EM_PROCESSAMENTO");
    expect(erro.getStatus()).toBe(409);
    expect(criar).not.toHaveBeenCalled();
  });

  it("I7 falha antes do commit libera a reserva e relanca o mesmo erro", async () => {
    const { prisma, service, criar, loggerError } = montar();
    const original = new OrcamentoAthosError("PRODUTO_INEXISTENTE", "Produto 9 nao existe", 422);
    criar.mockRejectedValue(original);
    await expect(service.executar(CHAVE, payloadBase(), criar)).rejects.toBe(original);
    expect(prisma.athosOrcamentoIa.delete).toHaveBeenCalledWith({ where: { idempotencyKey: CHAVE } });
    expect(prisma.athosOrcamentoIa.update).not.toHaveBeenCalled();

    // delete tambem falha: erro original relancado e logger.error chamado
    prisma.athosOrcamentoIa.delete.mockRejectedValue(new Error("db fora"));
    loggerError.mockClear();
    await expect(service.executar(CHAVE, payloadBase(), criar)).rejects.toBe(original);
    expect(loggerError).toHaveBeenCalled();
  });

  it("I8 falha na auditoria depois do commit devolve o sucesso e loga o idorcamento", async () => {
    const { prisma, service, criar, loggerError } = montar();
    prisma.athosOrcamentoIa.update.mockRejectedValue(new Error("db fora"));
    const comChave = await service.executar(CHAVE, payloadBase(), criar);
    expect(comChave.idorcamento).toBe(25866);
    expect(loggerError).toHaveBeenCalledWith(expect.stringContaining("25866"));

    loggerError.mockClear();
    prisma.athosOrcamentoIa.create.mockRejectedValue(new Error("db fora"));
    const semChave = await service.executar(undefined, payloadBase(), criar);
    expect(semChave.idorcamento).toBe(25866);
    expect(loggerError).toHaveBeenCalledWith(expect.stringContaining("25866"));
  });

  it("I9 chave invalida -> 400 IDEMPOTENCY_KEY_INVALIDA sem Prisma e sem criar", async () => {
    for (const chave of ["curta", "x".repeat(129), "chave com espaco"]) {
      const { prisma, service, criar } = montar();
      const erro = await service.executar(chave, payloadBase(), criar).catch((e) => e);
      expect(erro).toBeInstanceOf(OrcamentoAthosError);
      expect(erro.codigo).toBe("IDEMPOTENCY_KEY_INVALIDA");
      expect(erro.getStatus()).toBe(400);
      expect(criar).not.toHaveBeenCalled();
      expect(prisma.athosOrcamentoIa.create).not.toHaveBeenCalled();
    }
    expect(IDEMPOTENCY_KEY_REGEX.test(CHAVE)).toBe(true);
  });

  it("I10 hash canonico: ordem das chaves, simular e quantidades", () => {
    const a = { itens: [{ idproduto: 1, quantidade: 2 }], obs: "x", idcliente: 3 };
    const b = { idcliente: 3, obs: "x", itens: [{ quantidade: 2, idproduto: 1 }] };
    expect(hashPayloadOrcamento(a)).toBe(hashPayloadOrcamento(b));
    expect(hashPayloadOrcamento(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPayloadOrcamento({ ...a, simular: true })).toBe(hashPayloadOrcamento(a));
    expect(hashPayloadOrcamento({ ...a, simular: false })).toBe(hashPayloadOrcamento(a));
    expect(hashPayloadOrcamento({ ...a, itens: [{ idproduto: 1, quantidade: 3 }] })).not.toBe(hashPayloadOrcamento(a));
    // undefined omitido
    expect(hashPayloadOrcamento({ ...a, obs: undefined })).toBe(hashPayloadOrcamento({ itens: a.itens, idcliente: 3 }));
  });

  it("I11 erro inesperado do Prisma na reserva e relancado e criar nao e chamado", async () => {
    const { prisma, service, criar } = montar();
    const boom = new Error("conexao perdida");
    prisma.athosOrcamentoIa.create.mockRejectedValue(boom);
    await expect(service.executar(CHAVE, payloadBase(), criar)).rejects.toBe(boom);
    expect(criar).not.toHaveBeenCalled();
    expect(prisma.athosOrcamentoIa.findUnique).not.toHaveBeenCalled();
  });
});
