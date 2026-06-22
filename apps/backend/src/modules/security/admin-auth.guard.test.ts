import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AdminAuthGuard } from "./admin-auth.guard";

function makeContext(headers: Record<string, string | undefined>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

function makeConfigService(adminKey: string | undefined): ConfigService {
  return {
    get: (key: string) => (key === "ADMIN_API_KEY" ? adminKey : undefined),
  } as unknown as ConfigService;
}

describe("AdminAuthGuard", () => {
  it("deve rejeitar requisicao sem header x-admin-api-key", () => {
    const guard = new AdminAuthGuard(makeConfigService("chave-secreta-valida"));
    const ctx = makeContext({});
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("deve rejeitar requisicao com header errado (mesmo tamanho)", () => {
    const guard = new AdminAuthGuard(makeConfigService("chave-secreta-valida"));
    const ctx = makeContext({ "x-admin-api-key": "chave-secreta-errad" });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("deve rejeitar requisicao com header errado (tamanho diferente)", () => {
    const guard = new AdminAuthGuard(makeConfigService("chave-secreta-valida"));
    const ctx = makeContext({ "x-admin-api-key": "curta" });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("deve aceitar requisicao com header correto", () => {
    const guard = new AdminAuthGuard(makeConfigService("chave-secreta-valida"));
    const ctx = makeContext({ "x-admin-api-key": "chave-secreta-valida" });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("deve rejeitar quando ADMIN_API_KEY nao esta configurada no env", () => {
    const guard = new AdminAuthGuard(makeConfigService(undefined));
    const ctx = makeContext({ "x-admin-api-key": "qualquer-chave" });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("deve aceitar header em lowercase", () => {
    const guard = new AdminAuthGuard(makeConfigService("chave-secreta-valida"));
    const ctx = makeContext({ "x-admin-api-key": "chave-secreta-valida" });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it("deve rejeitar quando ADMIN_API_KEY esta vazia no env", () => {
    const guard = new AdminAuthGuard(makeConfigService(""));
    const ctx = makeContext({ "x-admin-api-key": "" });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
