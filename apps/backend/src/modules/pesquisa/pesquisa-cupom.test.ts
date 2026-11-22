/**
 * Fase 52 (plano 52-07): PesquisaCupomService — consulta, lista paginada e resgate atomico.
 * Prisma em memoria (cliente base e cliente da transacao compartilham o mesmo estado), config falsa e
 * o gasto do mes lido dentro da transacao pelo aggregate.
 */
import { type HttpException, Logger } from "@nestjs/common";

import { type PesquisaConfigView } from "./pesquisa-config.service";
import { PesquisaCupomService } from "./pesquisa-cupom.service";

type Linha = Record<string, any>;

const AGORA = new Date("2026-11-22T15:00:00Z");
const TELEFONE = "5512996484918";
const DIA = 86_400_000;

const CONFIG: PesquisaConfigView = {
  ativo: true,
  percentualDesconto: 10,
  tetoDesconto: 5,
  compraMinima: 30,
  validadeCupomDias: 30,
  validadeLinkDias: 7,
  intervaloDias: 90,
  tetoMensal: 300,
  prefixoCupom: "BOX",
  linkGoogle: null,
  varianteVisual: "AB",
  textoFechamento: "a {link}",
  textoSemRecompensa: "b {link}",
  textoPosResposta: "c {codigo}",
  textoConviteGoogle: "d {link_google}",
  paginaTitulo: "t",
  paginaSubtitulo: "s",
  paginaObrigadoSemRecompensa: "o",
  paginaGoogleTitulo: "g",
  paginaGoogleCorpo: "c",
  atualizadoEm: null,
  atualizadoPor: null,
};

function cupom(extra: Linha = {}): Linha {
  return {
    id: "cup-1",
    codigo: "BOX-7K3Q9M",
    pesquisaId: "pes-1",
    telefone: TELEFONE,
    percentual: 10,
    teto: 5,
    compraMinima: 6,
    status: "EMITIDO",
    validadeAte: new Date("2026-12-20T15:00:00Z"),
    criadoEm: new Date("2026-11-10T12:00:00Z"),
    valorCompra: null,
    descontoAplicado: null,
    usadoEm: null,
    usadoPor: null,
    pesquisa: { nota: 5 },
    ...extra,
  };
}

function casa(linha: Linha, where: Linha | undefined): boolean {
  if (!where) return true;
  for (const [campo, cond] of Object.entries(where)) {
    if (campo === "OR") {
      if (!(cond as Linha[]).some((sub) => casa(linha, sub))) return false;
      continue;
    }
    const valor = linha[campo];
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as Record<string, any>;
      if ("gte" in c) {
        if (valor == null || new Date(valor).getTime() < new Date(c.gte).getTime()) return false;
      }
      if ("lt" in c) {
        if (valor == null || new Date(valor).getTime() >= new Date(c.lt).getTime()) return false;
      }
      if ("gt" in c) {
        if (valor == null || new Date(valor).getTime() <= new Date(c.gt).getTime()) return false;
      }
      if ("in" in c) {
        if (!(c.in as unknown[]).includes(valor)) return false;
      }
      continue;
    }
    if (valor !== cond) return false;
  }
  return true;
}

type Opcoes = {
  cupons?: Linha[];
  gasto?: string | null; // soma lida pelo aggregate dentro da transacao (Decimal)
  gastoMesCentavos?: number; // gasto lido por PesquisaService.gastoDoMesCentavos (detalhe/lista)
  config?: Partial<PesquisaConfigView>;
};

function montar(opcoes: Opcoes = {}) {
  const cupons: Linha[] = (opcoes.cupons ?? [cupom()]).map((c) => ({ ...c }));
  const cfg: PesquisaConfigView = { ...CONFIG, ...(opcoes.config ?? {}) };

  const cliente = () => ({
    cupomRecompensa: {
      findUnique: jest.fn(async ({ where, include }: Linha) => {
        const achado = cupons.find((c) => casa(c, where));
        if (!achado) return null;
        const copia = { ...achado };
        if (include) copia.pesquisa = { nota: achado.pesquisa?.nota ?? null };
        return copia;
      }),
      findMany: jest.fn(async ({ where, take, cursor }: Linha) => {
        let lista = cupons.filter((c) => casa(c, where));
        lista = [...lista].sort((a, b) => {
          const t = new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime();
          return t !== 0 ? t : String(b.id).localeCompare(String(a.id));
        });
        if (cursor) {
          const indice = lista.findIndex((c) => c.id === cursor.id);
          lista = indice >= 0 ? lista.slice(indice + 1) : lista;
        }
        return lista.slice(0, take ?? lista.length).map((c) => ({ ...c, pesquisa: { nota: c.pesquisa?.nota ?? null } }));
      }),
      updateMany: jest.fn(async ({ where, data }: Linha) => {
        const alvo = cupons.filter((c) => casa(c, where));
        alvo.forEach((c) => Object.assign(c, data));
        return { count: alvo.length };
      }),
      aggregate: jest.fn(async () => ({ _sum: { descontoAplicado: opcoes.gasto ?? null } })),
    },
    $executeRaw: jest.fn(async (..._args: unknown[]) => 1),
  });

  const base = cliente();
  const tx = cliente();
  let fila: Promise<unknown> = Promise.resolve();
  const prisma = {
    ...base,
    $transaction: jest.fn((fn: (t: unknown) => Promise<unknown>) => {
      const execucao = fila.then(() => fn(tx));
      fila = execucao.catch(() => undefined);
      return execucao;
    }),
  };
  const configPesquisa = { obter: jest.fn(async () => ({ ...cfg })), padroes: jest.fn(() => ({ ...cfg })) };
  const pesquisa = { gastoDoMesCentavos: jest.fn(async () => opcoes.gastoMesCentavos ?? 0) };

  const service = new PesquisaCupomService(prisma as never, configPesquisa as never, pesquisa as never);
  return { service, prisma, tx, cupons, cfg };
}

async function capturar(promessa: Promise<unknown>): Promise<unknown> {
  try {
    await promessa;
    return null;
  } catch (err) {
    return err;
  }
}

function erroDe(resultado: unknown): HttpException {
  return resultado as HttpException;
}

describe("PesquisaCupomService.resgatar", () => {
  it("resgate valido: desconto em centavos, updateMany condicionado a EMITIDO/validade e lock antes da leitura", async () => {
    const { service, tx } = montar();
    const log = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    try {
      const resultado = await service.resgatar("BOX-7K3Q9M", 30, AGORA);

      expect(resultado.descontoAplicado).toBe(3);
      expect(resultado.valorFinal).toBe(27);
      expect(resultado.cupom.situacao).toBe("USADO");
      expect(resultado.cupom.valorCompra).toBe(30);
      expect(resultado.cupom.descontoAplicado).toBe(3);
      expect(resultado.cupom.usadoPor).toBe("balcao");

      expect(tx.cupomRecompensa.updateMany).toHaveBeenCalledWith({
        where: { id: "cup-1", status: "EMITIDO", validadeAte: { gte: AGORA } },
        data: {
          status: "USADO",
          valorCompra: "30.00",
          descontoAplicado: "3.00",
          usadoEm: AGORA,
          usadoPor: "balcao",
        },
      });
      const sql = String(tx.$executeRaw.mock.calls[0][0]);
      expect(sql).toContain("pg_advisory_xact_lock");
      expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.cupomRecompensa.findUnique.mock.invocationCallOrder[0],
      );
    } finally {
      log.mockRestore();
    }
  });

  it("box (10%, teto R$ 2, minimo R$ 6): 6,00 da 0,60 e 100,00 para no teto de 2,00", async () => {
    const base = { percentual: 10, teto: 2, compraMinima: 6 };
    const primeiro = montar({ cupons: [cupom({ ...base })] });
    expect((await primeiro.service.resgatar("BOX-7K3Q9M", 6, AGORA)).descontoAplicado).toBe(0.6);

    const segundo = montar({ cupons: [cupom({ ...base })] });
    expect((await segundo.service.resgatar("BOX-7K3Q9M", 100, AGORA)).descontoAplicado).toBe(2);
  });

  it("abaixo do minimo: 0,01 e 5,99 recusam com 422 ABAIXO_DO_MINIMO e nao gravam", async () => {
    for (const valor of [0.01, 5.99]) {
      const { service, tx } = montar();
      const erro = erroDe(await capturar(service.resgatar("BOX-7K3Q9M", valor, AGORA)));
      expect(erro.getStatus()).toBe(422);
      expect(erro.getResponse()).toMatchObject({ codigo: "ABAIXO_DO_MINIMO" });
      expect(String((erro.getResponse() as Linha).message)).toContain("Compra mínima");
      expect(tx.cupomRecompensa.updateMany).not.toHaveBeenCalled();
    }
  });

  it("usa a compra minima gravada no cupom (snapshot), nao a da config atual", async () => {
    const { service } = montar({ cupons: [cupom({ compraMinima: 10 })], config: { compraMinima: 30 } });

    const resultado = await service.resgatar("BOX-7K3Q9M", 12, AGORA);

    expect(resultado.descontoAplicado).toBe(1.2);
  });

  it("uso unico: cupom USADO responde 409 JA_USADO", async () => {
    const { service, tx } = montar({ cupons: [cupom({ status: "USADO", usadoEm: new Date("2026-11-20T10:00:00Z") })] });

    const erro = erroDe(await capturar(service.resgatar("BOX-7K3Q9M", 30, AGORA)));

    expect(erro.getStatus()).toBe(409);
    expect(erro.getResponse()).toMatchObject({ codigo: "JA_USADO" });
    expect(tx.cupomRecompensa.updateMany).not.toHaveBeenCalled();
  });

  it("corrida com a revogacao: cupom cancelado entre a leitura e o update responde 422 CANCELADO (IN-03)", async () => {
    const { service, tx, cupons } = montar();
    tx.cupomRecompensa.updateMany.mockImplementationOnce(async () => {
      cupons[0].status = "CANCELADO";
      return { count: 0 };
    });

    const erro = erroDe(await capturar(service.resgatar("BOX-7K3Q9M", 30, AGORA)));

    expect(erro.getStatus()).toBe(422);
    expect(erro.getResponse()).toMatchObject({ codigo: "CANCELADO" });
  });

  it("dois resgates simultaneos do mesmo codigo: um 200 e um 409", async () => {
    const { service } = montar();

    const resultados = await Promise.allSettled([
      service.resgatar("BOX-7K3Q9M", 30, AGORA),
      service.resgatar("BOX-7K3Q9M", 30, AGORA),
    ]);

    const ok = resultados.filter((r) => r.status === "fulfilled");
    const falhas = resultados.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(falhas).toHaveLength(1);
    const erro = (falhas[0] as PromiseRejectedResult).reason as HttpException;
    expect(erro.getStatus()).toBe(409);
    expect(erro.getResponse()).toMatchObject({ codigo: "JA_USADO" });
  });

  it("situacoes: CANCELADO persiste 422 CANCELADO; EXPIRADO e validade vencida dao 422 VENCIDO", async () => {
    const cancelado = montar({ cupons: [cupom({ status: "CANCELADO" })] });
    const errCancelado = erroDe(await capturar(cancelado.service.resgatar("BOX-7K3Q9M", 30, AGORA)));
    expect(errCancelado.getStatus()).toBe(422);
    expect(errCancelado.getResponse()).toMatchObject({ codigo: "CANCELADO" });
    expect(cancelado.tx.cupomRecompensa.updateMany).not.toHaveBeenCalled();

    for (const extra of [
      { status: "EXPIRADO" },
      { status: "EMITIDO", validadeAte: new Date("2026-11-01T00:00:00Z") },
    ]) {
      const { service } = montar({ cupons: [cupom(extra)] });
      const erro = erroDe(await capturar(service.resgatar("BOX-7K3Q9M", 30, AGORA)));
      expect(erro.getStatus()).toBe(422);
      expect(erro.getResponse()).toMatchObject({ codigo: "VENCIDO" });
    }
  });

  it("codigo inexistente ou fora do formato responde 404 com a mensagem do UI-SPEC", async () => {
    for (const codigo of ["BOX-ZZZZZZ", "codigo-invalido"]) {
      const { service, tx } = montar();
      const erro = erroDe(await capturar(service.resgatar(codigo, 30, AGORA)));
      expect(erro.getStatus()).toBe(404);
      expect(String((erro.getResponse() as Linha).message)).toContain("Cupom não encontrado");
      expect(tx.cupomRecompensa.updateMany).not.toHaveBeenCalled();
    }

    // Fora do formato o banco nem e consultado.
    const malformado = montar();
    await capturar(malformado.service.resgatar("codigo-invalido", 30, AGORA));
    expect(malformado.tx.cupomRecompensa.findUnique).not.toHaveBeenCalled();
  });

  it("normaliza espacos e minusculas do codigo digitado", async () => {
    const { service } = montar();

    const resultado = await service.resgatar("  box-7k3q9m ", 30, AGORA);

    expect(resultado.cupom.codigo).toBe("BOX-7K3Q9M");
    expect(resultado.descontoAplicado).toBe(3);
  });

  it("teto rigido: gasto 299,00 + desconto 2,00 estoura o teto de 300,00 e nao grava", async () => {
    const { service, tx } = montar({ cupons: [cupom({ percentual: 10, teto: 5 })], gasto: "299.00" });

    const erro = erroDe(await capturar(service.resgatar("BOX-7K3Q9M", 20, AGORA)));

    expect(erro.getStatus()).toBe(422);
    const resposta = erro.getResponse() as Linha;
    expect(resposta.codigo).toBe("TETO_MENSAL");
    expect(resposta.liberadoEm).toBe("2026-12-01T03:00:00.000Z");
    expect(String(resposta.message)).toContain("Teto mensal atingido");
    expect(tx.cupomRecompensa.updateMany).not.toHaveBeenCalled();
  });

  it("teto rigido: gasto 298,00 + desconto 2,00 = teto de 300,00 e permitido", async () => {
    const { service } = montar({ cupons: [cupom({ percentual: 10, teto: 5 })], gasto: "298.00" });

    const resultado = await service.resgatar("BOX-7K3Q9M", 20, AGORA);

    expect(resultado.descontoAplicado).toBe(2);
  });

  it("teto rigido: gasto ja no teto bloqueia qualquer resgate", async () => {
    const { service } = montar({ cupons: [cupom()], gasto: "300.00" });

    const erro = erroDe(await capturar(service.resgatar("BOX-7K3Q9M", 30, AGORA)));

    expect(erro.getStatus()).toBe(422);
    expect(erro.getResponse()).toMatchObject({ codigo: "TETO_MENSAL" });
  });

  it("le a soma do gasto dentro da transacao", async () => {
    const { service, prisma, tx } = montar({ gasto: "10.00" });

    await service.resgatar("BOX-7K3Q9M", 30, AGORA);

    expect(tx.cupomRecompensa.aggregate).toHaveBeenCalledTimes(1);
    expect(prisma.cupomRecompensa.aggregate).not.toHaveBeenCalled();
  });

  it("valor da compra invalido (zero, negativo, NaN ou mais de 2 casas) e BadRequest sem tocar no banco", async () => {
    for (const valor of [0, -1, Number.NaN, 10.005]) {
      const { service, prisma } = montar();
      const erro = erroDe(await capturar(service.resgatar("BOX-7K3Q9M", valor, AGORA)));
      expect(erro.getStatus()).toBe(400);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    }
  });
});

describe("PesquisaCupomService.buscarPorCodigo", () => {
  it("devolve telefone mascarado, situacao derivada e suspensoAte quando o teto do mes foi atingido", async () => {
    const { service } = montar({ gastoMesCentavos: 30000 });

    const detalhe = await service.buscarPorCodigo("box-7k3q9m", AGORA);

    expect(detalhe).not.toBeNull();
    expect(detalhe!.telefoneMascarado).toBe("(12) *****-4918");
    expect(detalhe!.situacao).toBe("SUSPENSO");
    expect(detalhe!.suspensoAte).toBe("2026-12-01T03:00:00.000Z");
    expect(detalhe!.usadoEm).toBeNull();
    expect(detalhe!.notaPesquisa).toBe(5);
    expect(detalhe).not.toHaveProperty("telefone");
    expect(detalhe).not.toHaveProperty("token");
    expect(detalhe).not.toHaveProperty("conversationId");
  });

  it("situacao CANCELADO e USADO vem do status gravado; usadoEm preenchido so quando usado", async () => {
    const cancelado = montar({ cupons: [cupom({ status: "CANCELADO" })] });
    expect((await cancelado.service.buscarPorCodigo("BOX-7K3Q9M", AGORA))!.situacao).toBe("CANCELADO");

    const usado = montar({ cupons: [cupom({ status: "USADO", usadoEm: new Date("2026-11-20T10:00:00Z"), descontoAplicado: 3 })] });
    const detalhe = await usado.service.buscarPorCodigo("BOX-7K3Q9M", AGORA);
    expect(detalhe!.situacao).toBe("USADO");
    expect(detalhe!.usadoEm).toBe("2026-11-20T10:00:00.000Z");
    expect(detalhe!.descontoAplicado).toBe(3);
  });

  it("codigo fora do formato devolve null sem consultar o banco", async () => {
    const { service, prisma } = montar();
    expect(await service.buscarPorCodigo("nada", AGORA)).toBeNull();
    expect(prisma.cupomRecompensa.findUnique).not.toHaveBeenCalled();
  });
});

describe("PesquisaCupomService.listar", () => {
  const listaBase = (): Linha[] => [
    cupom({ id: "c-disponivel", codigo: "BOX-AAAAA2", status: "EMITIDO", validadeAte: new Date("2026-12-20T15:00:00Z"), criadoEm: new Date("2026-11-21T10:00:00Z") }),
    cupom({ id: "c-suspenso", codigo: "BOX-BBBBB3", status: "EMITIDO", validadeAte: new Date("2026-12-20T15:00:00Z"), criadoEm: new Date("2026-11-20T10:00:00Z") }),
    cupom({ id: "c-usado", codigo: "BOX-CCCCC4", status: "USADO", usadoEm: new Date("2026-11-19T10:00:00Z"), criadoEm: new Date("2026-11-19T10:00:00Z") }),
    cupom({ id: "c-expirado", codigo: "BOX-DDDDD5", status: "EXPIRADO", validadeAte: new Date("2026-11-01T00:00:00Z"), criadoEm: new Date("2026-11-18T10:00:00Z") }),
    cupom({ id: "c-vencido", codigo: "BOX-EEEEE6", status: "EMITIDO", validadeAte: new Date("2026-11-01T00:00:00Z"), criadoEm: new Date("2026-11-17T10:00:00Z") }),
    cupom({ id: "c-cancelado", codigo: "BOX-FFFFF7", status: "CANCELADO", criadoEm: new Date("2026-11-16T10:00:00Z") }),
  ];

  it("filtra por situacao: usados, vencidos, disponiveis, cancelados e todos", async () => {
    const { service } = montar({ cupons: listaBase(), gastoMesCentavos: 30000 });

    const usados = await service.listar({ status: "usados" }, AGORA);
    expect(usados.itens.map((i) => i.codigo)).toEqual(["BOX-CCCCC4"]);

    const vencidos = await service.listar({ status: "vencidos" }, AGORA);
    expect(vencidos.itens.map((i) => i.codigo).sort()).toEqual(["BOX-DDDDD5", "BOX-EEEEE6"]);

    const disponiveis = await service.listar({ status: "disponiveis" }, AGORA);
    expect(disponiveis.itens.map((i) => i.codigo).sort()).toEqual(["BOX-AAAAA2", "BOX-BBBBB3"]);

    const cancelados = await service.listar({ status: "cancelados" }, AGORA);
    expect(cancelados.itens.map((i) => i.codigo)).toEqual(["BOX-FFFFF7"]);

    const todos = await service.listar({}, AGORA);
    expect(todos.itens).toHaveLength(6);
    expect(todos.itens[0].codigo).toBe("BOX-AAAAA2");
    expect(todos.itens[1].situacao).toBe("SUSPENSO");
  });

  it("ordena por criadoEm decrescente e mascara o telefone (anonimizado vira *****)", async () => {
    const { service } = montar({
      cupons: [
        cupom({ id: "c-1", codigo: "BOX-AAAAA2", criadoEm: new Date("2026-11-01T10:00:00Z") }),
        cupom({ id: "c-2", codigo: "BOX-BBBBB3", criadoEm: new Date("2026-11-05T10:00:00Z") }),
        cupom({ id: "c-3", codigo: "BOX-CCCCC4", criadoEm: new Date("2026-11-03T10:00:00Z"), telefone: null }),
      ],
    });

    const { itens } = await service.listar({}, AGORA);

    expect(itens.map((i) => i.codigo)).toEqual(["BOX-BBBBB3", "BOX-CCCCC4", "BOX-AAAAA2"]);
    expect(itens[0].telefoneMascarado).toBe("(12) *****-4918");
    expect(itens[1].telefoneMascarado).toBe("*****");
    expect(itens[0]).not.toHaveProperty("telefone");
  });

  it("pagina por cursor: limite+1 define proximoCursor e ele fica null no fim", async () => {
    const { service } = montar({
      cupons: [
        cupom({ id: "c-1", codigo: "BOX-AAAAA2", criadoEm: new Date("2026-11-05T10:00:00Z") }),
        cupom({ id: "c-2", codigo: "BOX-BBBBB3", criadoEm: new Date("2026-11-04T10:00:00Z") }),
        cupom({ id: "c-3", codigo: "BOX-CCCCC4", criadoEm: new Date("2026-11-03T10:00:00Z") }),
      ],
    });

    const primeira = await service.listar({ limite: 2 }, AGORA);
    expect(primeira.itens.map((i) => i.codigo)).toEqual(["BOX-AAAAA2", "BOX-BBBBB3"]);
    expect(primeira.proximoCursor).toBe("c-2");

    const segunda = await service.listar({ limite: 2, cursor: primeira.proximoCursor! }, AGORA);
    expect(segunda.itens.map((i) => i.codigo)).toEqual(["BOX-CCCCC4"]);
    expect(segunda.proximoCursor).toBeNull();
  });

  it("limite padrao 50 e teto 100 (500 vira 100)", async () => {
    const cupons = Array.from({ length: 120 }, (_, i) =>
      cupom({
        id: `c-${i}`,
        codigo: `BOX-${String(i).padStart(5, "0")}`,
        criadoEm: new Date(AGORA.getTime() - i * 60_000),
      }),
    );

    const padrao = await montar({ cupons }).service.listar({}, AGORA);
    expect(padrao.itens).toHaveLength(50);
    expect(padrao.proximoCursor).not.toBeNull();

    const maximo = await montar({ cupons }).service.listar({ limite: 500 }, AGORA);
    expect(maximo.itens).toHaveLength(100);
  });
});
