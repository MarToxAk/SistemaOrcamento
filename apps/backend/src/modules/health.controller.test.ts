import axios from "axios";

import { HealthController } from "./health.controller";

jest.mock("axios");

const mockedGet = axios.get as jest.MockedFunction<typeof axios.get>;

function criarController(env: Record<string, string | undefined>) {
  const prismaMock = { $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]) };
  const configMock = { get: jest.fn((key: string) => env[key]) };
  const controller = new HealthController(prismaMock as never, configMock as never);
  return { controller, prismaMock };
}

const ENV_CHATWOOT = {
  CHATWOOT_BASE_URL: "https://chatwoot.example",
  CHATWOOT_API_TOKEN: "t",
  CHATWOOT_ACCOUNT_ID: "1",
};

describe("HealthController", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedGet.mockResolvedValue({ status: 200 } as never);
  });

  it("nfse ok quando certificado, chave e CNPJ do prestador estao em *_PEM", async () => {
    const { controller } = criarController({
      ...ENV_CHATWOOT,
      NFSE_NACIONAL_CERT_PEM: "cert",
      NFSE_NACIONAL_KEY_PEM: "key",
      NFSE_NACIONAL_CNPJ_PRESTADOR: "62391927000157",
    });
    const res = await controller.getHealth();
    expect(res.integrations.nfse).toEqual({ ok: true });
    expect(res.status).toBe("ok");
  });

  it("nfse ok quando certificado e chave vem por *_PATH", async () => {
    const { controller } = criarController({
      ...ENV_CHATWOOT,
      NFSE_NACIONAL_CERT_PATH: "/certs/cert.pem",
      NFSE_NACIONAL_KEY_PATH: "/certs/key.pem",
      NFSE_NACIONAL_CNPJ_PRESTADOR: "62391927000157",
    });
    const res = await controller.getHealth();
    expect(res.integrations.nfse).toEqual({ ok: true });
  });

  it.each([
    ["certificado", { NFSE_NACIONAL_KEY_PEM: "key", NFSE_NACIONAL_CNPJ_PRESTADOR: "1" }],
    ["chave", { NFSE_NACIONAL_CERT_PEM: "cert", NFSE_NACIONAL_CNPJ_PRESTADOR: "1" }],
    ["CNPJ", { NFSE_NACIONAL_CERT_PEM: "cert", NFSE_NACIONAL_KEY_PEM: "key" }],
    ["tudo (valores so com espacos)", { NFSE_NACIONAL_CERT_PEM: "  ", NFSE_NACIONAL_KEY_PEM: " ", NFSE_NACIONAL_CNPJ_PRESTADOR: " " }],
  ])("nfse nao configurado quando falta %s", async (_nome, env) => {
    const { controller } = criarController({ ...ENV_CHATWOOT, ...env });
    const res = await controller.getHealth();
    expect(res.integrations.nfse).toEqual({ ok: false, error: "nao configurado" });
    expect(res.status).toBe("degraded");
  });

  it("nao faz nenhuma chamada de rede ao iiBrasil", async () => {
    const { controller } = criarController({
      ...ENV_CHATWOOT,
      NFSE_NACIONAL_CERT_PEM: "cert",
      NFSE_NACIONAL_KEY_PEM: "key",
      NFSE_NACIONAL_CNPJ_PRESTADOR: "62391927000157",
      NFSE_TOKEN: "legado",
    });
    await controller.getHealth();
    const urls = mockedGet.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("iibr.com.br"))).toBe(false);
    // so a sonda do Chatwoot usa a rede
    expect(urls).toEqual(["https://chatwoot.example/auth/sign_in"]);
  });

  it("mantem o formato da resposta e allOk considera db, chatwoot e nfse", async () => {
    const { controller, prismaMock } = criarController({
      ...ENV_CHATWOOT,
      NFSE_NACIONAL_CERT_PEM: "cert",
      NFSE_NACIONAL_KEY_PEM: "key",
      NFSE_NACIONAL_CNPJ_PRESTADOR: "62391927000157",
    });
    const ok = await controller.getHealth();
    expect(ok).toMatchObject({ status: "ok", service: "orcamento-backend" });
    expect(typeof ok.now).toBe("string");
    expect(Object.keys(ok.integrations).sort()).toEqual(["chatwoot", "db", "nfse"]);

    prismaMock.$queryRaw.mockRejectedValueOnce(new Error("db fora"));
    const degradado = await controller.getHealth();
    expect(degradado.status).toBe("degraded");
    expect(degradado.integrations.db).toMatchObject({ ok: false, error: "db fora" });
  });
});
