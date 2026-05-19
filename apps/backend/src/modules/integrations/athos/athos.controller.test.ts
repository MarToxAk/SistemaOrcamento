import { InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { AthosController } from "./athos.controller";

describe("AthosController - Autenticacao fail-closed", () => {
  let controller: AthosController;
  let athosServiceMock: {
    anexarContaPagar: jest.Mock;
    updateContaPagar: jest.Mock;
    listarLivrosRegistro: jest.Mock;
    listarContasPagar: jest.Mock;
    buscarClientes: jest.Mock;
    criarContaPagar: jest.Mock;
  };

  beforeEach(() => {
    athosServiceMock = {
      anexarContaPagar: jest.fn(),
      updateContaPagar: jest.fn(),
      listarLivrosRegistro: jest.fn(),
      listarContasPagar: jest.fn(),
      buscarClientes: jest.fn(),
      criarContaPagar: jest.fn(),
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

  describe("listarLivrosRegistro", () => {
    it("deve delegar listagem ao service quando token for valido", async () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";
      athosServiceMock.listarLivrosRegistro.mockResolvedValue([
        { idlivroregistro: 1, idcontacorrente: 2, descricao: "Santander", acesso: "BANCO", conciliacaobancaria: true },
      ]);

      const result = await controller.listarLivrosRegistro("2", undefined, "valid-token-123");

      expect(athosServiceMock.listarLivrosRegistro).toHaveBeenCalledWith(2);
      expect(result).toHaveLength(1);
      expect(result[0].idlivroregistro).toBe(1);
    });
  });

  describe("listarContasPagar", () => {
    it("deve delegar listagem ao service quando token for valido", async () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";
      athosServiceMock.listarContasPagar.mockResolvedValue([
        { idcontapagar: 1, descricaoconta: "Aluguel", statusconta: "ABE", valorconta: 4500 },
      ]);

      const result = await controller.listarContasPagar(
        "2026-05-01", "2026-05-31", undefined, undefined, "ABE",
        undefined, "valid-token-123",
      );

      expect(athosServiceMock.listarContasPagar).toHaveBeenCalledWith("2026-05-01", "2026-05-31", "ABE");
      expect(result).toHaveLength(1);
      expect((result as any[])[0].idcontapagar).toBe(1);
    });

    it("deve usar params legados (lowercase) quando params novos nao informados", async () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";
      athosServiceMock.listarContasPagar.mockResolvedValue([]);

      await controller.listarContasPagar(
        undefined, undefined, "2026-01-01", "2026-12-31", undefined,
        undefined, "valid-token-123",
      );

      expect(athosServiceMock.listarContasPagar).toHaveBeenCalledWith("2026-01-01", "2026-12-31", undefined);
    });

    it("deve rejeitar quando token for invalido", async () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";

      await expect(
        controller.listarContasPagar(undefined, undefined, undefined, undefined, undefined, undefined, "wrong-token"),
      ).rejects.toThrow(UnauthorizedException);
      expect(athosServiceMock.listarContasPagar).not.toHaveBeenCalled();
    });
  });

  describe("buscarClientes", () => {
    it("deve delegar ao service quando token for valido", async () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";
      athosServiceMock.buscarClientes.mockResolvedValue({
        total: 1,
        page: 1,
        take: 20,
        items: [{ idcliente: 42, tipoPessoa: "fisico", nome: "João Silva", documento: "12345678901", endereco: null }],
      });

      const result = await controller.buscarClientes("João", undefined, undefined, "1", "20", undefined, "valid-token-123");

      expect(athosServiceMock.buscarClientes).toHaveBeenCalledWith({
        nome: "João",
        documento: undefined,
        idcliente: undefined,
        page: 1,
        take: 20,
      });
      expect((result as any).total).toBe(1);
      expect((result as any).items).toHaveLength(1);
    });

    it("deve converter idcliente para number quando fornecido como string", async () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";
      athosServiceMock.buscarClientes.mockResolvedValue({ total: 1, page: 1, take: 20, items: [] });

      await controller.buscarClientes(undefined, undefined, "99", undefined, undefined, undefined, "valid-token-123");

      expect(athosServiceMock.buscarClientes).toHaveBeenCalledWith({
        nome: undefined,
        documento: undefined,
        idcliente: 99,
        page: undefined,
        take: undefined,
      });
    });

    it("deve rejeitar quando token for invalido", async () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";

      await expect(
        controller.buscarClientes("João", undefined, undefined, undefined, undefined, undefined, "wrong-token"),
      ).rejects.toThrow(UnauthorizedException);
      expect(athosServiceMock.buscarClientes).not.toHaveBeenCalled();
    });
  });

  describe("criarContaPagar", () => {
    it("deve delegar criacao ao service quando token for valido", async () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";
      athosServiceMock.criarContaPagar.mockResolvedValue({ idcontapagar: 99 });

      const dto = { descricaoconta: "Aluguel maio/2026", datavencimento: "2026-06-30", valorconta: 4500 };
      const result = await controller.criarContaPagar(dto as any, undefined, "valid-token-123");

      expect(athosServiceMock.criarContaPagar).toHaveBeenCalledWith(dto);
      expect((result as any).idcontapagar).toBe(99);
    });

    it("deve delegar com campos opcionais do DTO preenchidos", async () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";
      athosServiceMock.criarContaPagar.mockResolvedValue({ idcontapagar: 150 });

      const dto = {
        descricaoconta: "Suzano papel",
        datavencimento: "2026-07-15",
        valorconta: 8200,
        historicocontabil: "Conta Suzano - papel couche",
        idbudget: 2026,
        recorrenciafornecedor: true,
        numeronota: "NF-99887",
      };

      const result = await controller.criarContaPagar(dto as any, undefined, "valid-token-123");

      expect(athosServiceMock.criarContaPagar).toHaveBeenCalledWith(dto);
      expect((result as any).idcontapagar).toBe(150);
    });

    it("deve rejeitar quando token for invalido", async () => {
      process.env.ATHOS_API_TOKEN = "valid-token-123";

      await expect(
        controller.criarContaPagar(
          { descricaoconta: "Aluguel", datavencimento: "2026-06-30", valorconta: 100 } as any,
          undefined,
          "wrong-token",
        ),
      ).rejects.toThrow(UnauthorizedException);
      expect(athosServiceMock.criarContaPagar).not.toHaveBeenCalled();
    });
  });
});
