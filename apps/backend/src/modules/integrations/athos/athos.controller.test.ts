import { InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { AthosController } from "./athos.controller";

describe("AthosController - Autenticacao fail-closed", () => {
  let controller: AthosController;

  beforeEach(() => {
    controller = new AthosController(null as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("validateAthosToken - listarContasPagar", () => {
    it("deve lançar InternalServerErrorException quando ATHOS_API_TOKEN nao estiver configurado", () => {
      const originalToken = process.env.ATHOS_API_TOKEN;
      delete process.env.ATHOS_API_TOKEN;

      try {
        expect(() => controller["validateAthosToken"](undefined, "any-token")).toThrow(InternalServerErrorException);
      } finally {
        if (originalToken) {
          process.env.ATHOS_API_TOKEN = originalToken;
        }
      }
    });

    it("deve lançar UnauthorizedException quando token estiver ausente", () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";

      expect(() => controller["validateAthosToken"](undefined, undefined)).toThrow(UnauthorizedException);
    });

    it("deve lançar UnauthorizedException quando x-api-token estiver incorreto", () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";

      expect(() => controller["validateAthosToken"](undefined, "wrong-token")).toThrow(UnauthorizedException);
    });

    it("deve lançar UnauthorizedException quando authorization Bearer estiver incorreto", () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";

      expect(() => controller["validateAthosToken"]("Bearer wrong-token", undefined)).toThrow(UnauthorizedException);
    });

    it("deve passar quando x-api-token estiver correto", () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";

      expect(() => controller["validateAthosToken"](undefined, "valid-token-123")).not.toThrow();
    });

    it("deve passar quando authorization Bearer estiver correto", () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";

      expect(() => controller["validateAthosToken"]("Bearer valid-token-123", undefined)).not.toThrow();
    });
  });

  describe("validateAthosToken - buscarClientes", () => {
    it("deve validar token corretamente", () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";

      expect(() => controller["validateAthosToken"](undefined, "valid-token-123")).not.toThrow();
      expect(() => controller["validateAthosToken"](undefined, "wrong-token")).toThrow(UnauthorizedException);
    });
  });

  describe("validateAthosToken - criarContaPagar", () => {
    it("deve validar token corretamente", () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";

      expect(() => controller["validateAthosToken"](undefined, "valid-token-123")).not.toThrow();
      expect(() => controller["validateAthosToken"]("Bearer valid-token-123", undefined)).not.toThrow();
      expect(() => controller["validateAthosToken"](undefined, "wrong-token")).toThrow(UnauthorizedException);
    });
  });
});
