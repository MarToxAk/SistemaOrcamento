/**
 * Configuracao bancaria da proposta (D-18) editada em Configuracoes > Propostas.
 * HTTP real com os guards (InternalAuthGuard global + AdminAuthGuard via @AdminOnly) e o mesmo
 * ValidationPipe do main.ts. Os dados bancarios dos testes sao FICTICIOS (repositorio publico).
 */
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";

import { AthosService } from "../integrations/athos/athos.service";
import { AthosOrcamentoService } from "../integrations/athos/athos-orcamento.service";
import { PrismaService } from "../database/prisma.service";
import { PdfTemplatesService } from "../pdf-templates/pdf-templates.service";
import { InternalAuthGuard } from "../security/internal-auth.guard";
import { PropostasController } from "./propostas.controller";
import { PropostasPdfService } from "./propostas-pdf.service";
import { PropostasService } from "./propostas.service";

const CHAVE_INTERNA = "chave-interna-teste-config";
const CHAVE_ADMIN = "chave-admin-teste-config";

type Linha = {
  id: string;
  bancoNome: string;
  agencia: string;
  conta: string;
  titular: string;
  documentoTitular: string;
  atualizadoEm: Date;
};

function criarPrismaConfigFake() {
  const tabela = new Map<string, Linha>();
  return {
    _tabela: tabela,
    propostaConfig: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => tabela.get(where.id) ?? null),
      upsert: jest.fn(
        async ({ where, create, update }: { where: { id: string }; create: Omit<Linha, "atualizadoEm">; update: Partial<Linha> }) => {
          const atual = tabela.get(where.id);
          const linha: Linha = atual
            ? { ...atual, ...update, atualizadoEm: new Date("2026-11-28T10:00:00Z") }
            : { ...(create as Linha), atualizadoEm: new Date("2026-11-28T09:00:00Z") };
          tabela.set(where.id, linha);
          return linha;
        },
      ),
    },
  };
}

const VALIDO = {
  bancoNome: "Banco Exemplo",
  agencia: "1234",
  conta: "98765-4",
  titular: "Empresa Ficticia Ltda",
  documentoTitular: "11.222.333/0001-81",
};

describe("PropostasController config bancaria (HTTP)", () => {
  let app: INestApplication;
  let base = "";
  let prisma: ReturnType<typeof criarPrismaConfigFake>;
  const envAnterior: Record<string, string | undefined> = {};

  async function chamar(metodo: string, corpo?: unknown, chaves = { interna: CHAVE_INTERNA, admin: CHAVE_ADMIN as string | null }) {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (chaves.interna) h["x-internal-api-key"] = chaves.interna;
    if (chaves.admin) h["x-admin-api-key"] = chaves.admin;
    const res = await fetch(`${base}/api/propostas/config`, {
      method: metodo,
      headers: h,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    return { status: res.status, json: (await res.json()) as Record<string, any> };
  }

  beforeAll(async () => {
    for (const k of ["INTERNAL_API_KEY", "ADMIN_API_KEY"]) envAnterior[k] = process.env[k];
    process.env.INTERNAL_API_KEY = CHAVE_INTERNA;
    process.env.ADMIN_API_KEY = CHAVE_ADMIN;
    prisma = criarPrismaConfigFake();
    const modulo = await Test.createTestingModule({
      controllers: [PropostasController],
      providers: [
        PropostasService,
        { provide: PrismaService, useValue: prisma },
        { provide: AthosOrcamentoService, useValue: {} },
        { provide: AthosService, useValue: {} },
        { provide: PropostasPdfService, useValue: {} },
        { provide: PdfTemplatesService, useValue: {} },
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
    for (const [k, v] of Object.entries(envAnterior)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  beforeEach(() => prisma._tabela.clear());

  it("GET sem registro devolve campos vazios e completa=false", async () => {
    const r = await chamar("GET");
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ agencia: "", conta: "", completa: false, atualizadoEm: null });
  });

  it("GET com o seed da migration (agencia e conta vazias) devolve completa=false", async () => {
    prisma._tabela.set("default", {
      id: "default",
      bancoNome: "Santander",
      agencia: "",
      conta: "",
      titular: "Empresa Ficticia Ltda",
      documentoTitular: "00.000.000/0001-00",
      atualizadoEm: new Date("2026-11-27T00:00:00Z"),
    });
    const r = await chamar("GET");
    expect(r.status).toBe(200);
    expect(r.json.bancoNome).toBe("Santander");
    expect(r.json.completa).toBe(false);
  });

  it("PATCH grava (upsert no id default), apara espacos e devolve completa=true", async () => {
    const r = await chamar("PATCH", { ...VALIDO, agencia: " 1234 ", titular: "  Empresa Ficticia Ltda " });
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ agencia: "1234", conta: "98765-4", titular: "Empresa Ficticia Ltda", completa: true });
    expect(prisma.propostaConfig.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "default" } }));
    expect(prisma._tabela.get("default")?.agencia).toBe("1234");
    const lida = await chamar("GET");
    expect(lida.json.conta).toBe("98765-4");
  });

  it.each([
    ["agencia vazia", { agencia: "" }],
    ["agencia com letras", { agencia: "abc" }],
    ["conta vazia", { conta: "" }],
    ["conta com script", { conta: "<script>" }],
    ["documento curto", { documentoTitular: "123" }],
    ["titular vazio", { titular: "" }],
    ["agencia terminando em hifen", { agencia: "1234-" }],
    ["conta terminando em hifen", { conta: "98765-" }],
    ["conta com hifen no meio", { conta: "12-34-5" }],
    ["CNPJ com digito errado", { documentoTitular: "11.222.333/0001-82" }],
    ["CPF com 10 digitos", { documentoTitular: "123.456.789-0" }],
    ["documento so com pontos", { documentoTitular: "..........." }],
    ["documento repetido", { documentoTitular: "11111111111" }],
  ])("PATCH recusa %s com 400 sem gravar", async (_nome, troca) => {
    const r = await chamar("PATCH", { ...VALIDO, ...troca });
    expect(r.status).toBe(400);
    expect(prisma._tabela.size).toBe(0);
  });

  it.each([
    ["agencia com digito", { agencia: "1234-5" }],
    ["conta com X minusculo", { conta: "123456-x" }],
    ["CPF valido", { documentoTitular: "529.982.247-25" }],
  ])("PATCH aceita %s", async (_nome, troca) => {
    const r = await chamar("PATCH", { ...VALIDO, ...troca });
    expect(r.status).toBe(200);
    if ("conta" in troca) expect(r.json.conta).toBe("123456-X");
  });

  it("PATCH recusa campo fora da lista (forbidNonWhitelisted)", async () => {
    const r = await chamar("PATCH", { ...VALIDO, id: "outro" });
    expect(r.status).toBe(400);
    expect(prisma._tabela.size).toBe(0);
  });

  it("sem chave de admin responde 401 e nao grava", async () => {
    const r = await chamar("PATCH", VALIDO, { interna: CHAVE_INTERNA, admin: null });
    expect(r.status).toBe(401);
    expect(prisma._tabela.size).toBe(0);
    const g = await chamar("GET", undefined, { interna: CHAVE_INTERNA, admin: null });
    expect(g.status).toBe(401);
  });
});
