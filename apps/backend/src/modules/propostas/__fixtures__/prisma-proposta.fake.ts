/**
 * Prisma em memoria para os testes do modulo de propostas (Fase 55). Reutilizado pelos testes dos
 * planos 55-08 e 55-13. Implementa apenas o subconjunto usado pelo PropostasService:
 *  - proposta: create, findUnique, findMany, count, update, updateMany;
 *  - propostaItem: create, update, delete, findMany;
 *  - $transaction (array de promessas).
 * Valores Decimal ficam como foram recebidos (texto ou numero); o servico sempre normaliza com String(...).
 * `Prisma.DbNull` e guardado como null (coluna Json limpa).
 */
import { randomUUID } from "crypto";

import { Prisma } from "@prisma/client";

type Reg = Record<string, any>;

function normalizar(valor: unknown): unknown {
  return valor === Prisma.DbNull || valor === Prisma.JsonNull ? null : valor;
}

function aplicarDados(alvo: Reg, dados: Reg): void {
  for (const [k, v] of Object.entries(dados)) {
    if (v === undefined) continue;
    alvo[k] = normalizar(v);
  }
}

/** Avalia um filtro JSON do Prisma ({ path, string_contains, mode }) sobre o valor guardado. */
function filtroJsonCasa(valor: unknown, filtro: Reg): boolean {
  if (valor === null || valor === undefined) return false;
  let atual: any = valor;
  for (const chave of (filtro.path as string[]) ?? []) {
    atual = atual?.[chave];
  }
  if (typeof atual !== "string") return false;
  if (typeof filtro.string_contains === "string") {
    const [a, b] = filtro.mode === "insensitive" ? [atual.toLowerCase(), filtro.string_contains.toLowerCase()] : [atual, filtro.string_contains];
    return a.includes(b);
  }
  return false;
}

/** where com campos simples, `not: null`, filtro JSON, OR e AND. */
function casa(reg: Reg, where: Reg | undefined): boolean {
  if (!where) return true;
  for (const [campo, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (campo === "OR") {
      if (!(cond as Reg[]).some((w) => casa(reg, w))) return false;
      continue;
    }
    if (campo === "AND") {
      if (!(cond as Reg[]).every((w) => casa(reg, w))) return false;
      continue;
    }
    const valor = reg[campo];
    if (cond !== null && typeof cond === "object" && !(cond instanceof Date)) {
      if ("string_contains" in cond || "path" in cond) {
        if (!filtroJsonCasa(valor, cond)) return false;
      } else if ("not" in cond) {
        if (cond.not === null ? valor === null || valor === undefined : valor === cond.not) return false;
      } else if ("in" in cond) {
        if (!(cond.in as unknown[]).includes(valor)) return false;
      }
      continue;
    }
    if ((valor ?? null) !== cond) return false;
  }
  return true;
}

export function criarPrismaPropostaFake() {
  const propostas: Reg[] = [];
  const itens: Reg[] = [];

  const itensDe = (propostaId: string) =>
    itens.filter((i) => i.propostaId === propostaId).sort((a, b) => a.sequencia - b.sequencia);

  function projetar(p: Reg, include?: Reg): Reg {
    const saida: Reg = { ...p };
    if (include?.itens) saida.itens = itensDe(p.id).map((i) => ({ ...i }));
    if (include?._count) saida._count = { itens: itensDe(p.id).length };
    return saida;
  }

  const proposta = {
    create: async ({ data, include }: { data: Reg; include?: Reg }) => {
      const agora = new Date();
      const novo: Reg = {
        id: randomUUID(),
        status: "RASCUNHO",
        idclienteAthos: null,
        clienteSnapshot: null,
        clienteOverride: null,
        numeroProcesso: null,
        setorResponsavel: null,
        contatoEmail: null,
        contatoTelefone: null,
        validadeDias: 1,
        prazoEntregaDias: 15,
        observacao: null,
        assinanteNome: null,
        assinanteCargo: null,
        assinanteCpf: null,
        totalValor: 0,
        idorcamentoAthos: null,
        senhaBalcao: null,
        athosData: null,
        athosHora: null,
        lancandoEm: null,
        enviadaEm: null,
        fechadaEm: null,
        canceladaEm: null,
        pdfObjectName: null,
        pdfGeradoEm: null,
        pdfSnapshot: null,
        duplicadaDeId: null,
        criadoEm: agora,
        atualizadoEm: agora,
      };
      const { itens: itensCriar, ...resto } = data;
      aplicarDados(novo, resto);
      propostas.push(novo);
      for (const item of itensCriar?.create ?? []) {
        await propostaItem.create({ data: { ...item, propostaId: novo.id } });
      }
      return projetar(novo, include);
    },
    findUnique: async ({ where, include }: { where: Reg; include?: Reg }) => {
      const achado = propostas.find((p) => (where.id !== undefined ? p.id === where.id : p.idorcamentoAthos === where.idorcamentoAthos));
      return achado ? projetar(achado, include) : null;
    },
    findMany: async ({ where, orderBy, skip, take, include }: { where?: Reg; orderBy?: Reg; skip?: number; take?: number; include?: Reg } = {}) => {
      let lista = propostas.filter((p) => casa(p, where));
      const campo = orderBy ? Object.keys(orderBy)[0] : undefined;
      if (campo) {
        const dir = orderBy![campo] === "desc" ? -1 : 1;
        lista = [...lista].sort((a, b) => {
          const va = a[campo] instanceof Date ? a[campo].getTime() : a[campo];
          const vb = b[campo] instanceof Date ? b[campo].getTime() : b[campo];
          return va === vb ? 0 : va < vb ? -dir : dir;
        });
      }
      const inicio = skip ?? 0;
      lista = lista.slice(inicio, take === undefined ? undefined : inicio + take);
      return lista.map((p) => projetar(p, include));
    },
    count: async ({ where }: { where?: Reg } = {}) => propostas.filter((p) => casa(p, where)).length,
    update: async ({ where, data, include }: { where: Reg; data: Reg; include?: Reg }) => {
      const achado = propostas.find((p) => p.id === where.id);
      if (!achado) throw new Error("Record to update not found.");
      aplicarDados(achado, data);
      achado.atualizadoEm = new Date();
      return projetar(achado, include);
    },
    updateMany: async ({ where, data }: { where?: Reg; data: Reg }) => {
      const alvos = propostas.filter((p) => casa(p, where));
      for (const alvo of alvos) {
        aplicarDados(alvo, data);
        alvo.atualizadoEm = new Date();
      }
      return { count: alvos.length };
    },
  };

  const propostaItem = {
    create: async ({ data }: { data: Reg }) => {
      const agora = new Date();
      const novo: Reg = {
        id: randomUUID(),
        descricaoCurta: null,
        unidade: null,
        permiteFracionar: true,
        ajusteTipo: null,
        ajusteValor: null,
        custoUnitario: 0,
        criadoEm: agora,
        atualizadoEm: agora,
      };
      aplicarDados(novo, data);
      itens.push(novo);
      return { ...novo };
    },
    update: async ({ where, data }: { where: Reg; data: Reg }) => {
      const achado = itens.find((i) => i.id === where.id);
      if (!achado) throw new Error("Record to update not found.");
      aplicarDados(achado, data);
      achado.atualizadoEm = new Date();
      return { ...achado };
    },
    delete: async ({ where }: { where: Reg }) => {
      const idx = itens.findIndex((i) => i.id === where.id);
      if (idx < 0) throw new Error("Record to delete does not exist.");
      const [removido] = itens.splice(idx, 1);
      return { ...removido };
    },
    findMany: async ({ where, orderBy }: { where?: Reg; orderBy?: Reg } = {}) => {
      let lista = itens.filter((i) => casa(i, where));
      if (orderBy?.sequencia) lista = [...lista].sort((a, b) => (orderBy.sequencia === "desc" ? b.sequencia - a.sequencia : a.sequencia - b.sequencia));
      return lista.map((i) => ({ ...i }));
    },
  };

  return {
    proposta,
    propostaItem,
    $transaction: async (operacoes: Array<Promise<unknown>>) => Promise.all(operacoes),
    /**
     * Emula SOMENTE a busca de cliente da listagem (`... ILIKE ${padrao}` sobre razaoSocial e nomeFantasia do
     * clienteSnapshot): `Prisma.sql` expoe os parametros em `values`, e o primeiro e o padrao `%texto%` com
     * coringas escapados por barra invertida.
     */
    $queryRaw: async (sql: { values: unknown[] }) => {
      const padrao = String(sql.values[0] ?? "");
      const termo = padrao.replace(/^%|%$/g, "").replace(/\\(.)/g, "$1").toLowerCase();
      return propostas
        .filter((p) =>
          ["razaoSocial", "nomeFantasia"].some((campo) => {
            const v = (p.clienteSnapshot as Reg | null)?.[campo];
            return typeof v === "string" && v.toLowerCase().includes(termo);
          }),
        )
        .map((p) => ({ id: p.id }));
    },
    /** Acesso direto ao armazenamento, para semear e inspecionar estado nos testes. */
    _propostas: propostas,
    _itens: itens,
  };
}

export type PrismaPropostaFake = ReturnType<typeof criarPrismaPropostaFake>;
