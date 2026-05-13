import { InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { AthosController } from "./athos.controller";

describe("AthosController - Autenticacao fail-closed", () => {
  let controller: AthosController;
  let athosServiceMock: { anexarContaPagar: jest.Mock; updateContaPagar: jest.Mock };

  beforeEach(() => {
    athosServiceMock = {
      anexarContaPagar: jest.fn(),
      updateContaPagar: jest.fn(),
    };
    controller = new AthosController(athosServiceMock as any);
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

  describe("updateContaPagar", () => {
    it("deve delegar update ao service quando token for valido", async () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";
      athosServiceMock.updateContaPagar.mockResolvedValue({
        idcontapagar: 42,
        statusconta: "PAG",
        valorpago: 600,
      });

      const result = await controller.updateContaPagar(
        42,
        { statusconta: "PAG", valorpago: 600 },
        undefined,
        "valid-token-123",
      );

      expect(athosServiceMock.updateContaPagar).toHaveBeenCalledWith(42, { statusconta: "PAG", valorpago: 600 });
      expect(result.idcontapagar).toBe(42);
    });

    it("deve falhar antes de delegar update quando token for invalido", async () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";

      await expect(
        controller.updateContaPagar(42, { statusconta: "PAG" }, undefined, "wrong-token"),
      ).rejects.toThrow(UnauthorizedException);
      expect(athosServiceMock.updateContaPagar).not.toHaveBeenCalled();
    });
  });

  describe("anexarContaPagar", () => {
    it("deve delegar upload ao service quando token for valido", async () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";
      const file = {
        originalname: "boleto.pdf",
        buffer: Buffer.from("file"),
        mimetype: "application/pdf",
        size: 4,
      };

      athosServiceMock.anexarContaPagar.mockResolvedValue({
        idanexo: 77,
        idcontapagar: 42,
        arquivo: "boleto.pdf",
        caminhoanexo: "\\\\192.168.3.203\\html\\Anexo\\contapagar\\42\\boleto.pdf",
      });

      const result = await controller.anexarContaPagar(42, { idfuncionario: 9 }, file, undefined, "valid-token-123");

      expect(athosServiceMock.anexarContaPagar).toHaveBeenCalledWith({
        idcontapagar: 42,
        file,
        idfuncionario: 9,
      });
      expect(result.idanexo).toBe(77);
    });

    it("deve falhar antes de delegar quando token for invalido", async () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";
      const file = {
        originalname: "boleto.pdf",
        buffer: Buffer.from("file"),
        mimetype: "application/pdf",
        size: 4,
      };

      await expect(controller.anexarContaPagar(42, {}, file, undefined, "wrong-token")).rejects.toThrow(UnauthorizedException);
      expect(athosServiceMock.anexarContaPagar).not.toHaveBeenCalled();
    });
  });
});
