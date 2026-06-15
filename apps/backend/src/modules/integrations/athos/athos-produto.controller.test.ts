import { NotFoundException } from "@nestjs/common";
import { ProdutoController } from "./athos-produto.controller";

describe("ProdutoController", () => {
  let controller: ProdutoController;
  let athosServiceMock: {
    buscarProdutos: jest.Mock;
    buscarProdutoPorId: jest.Mock;
    buscarDepartamentos: jest.Mock;
    buscarGrupos: jest.Mock;
    buscarMarcas: jest.Mock;
  };
  let athosProdutoServiceMock: {
    criarProduto: jest.Mock;
    editarProduto: jest.Mock;
    alterarStatusProduto: jest.Mock;
  };

  beforeEach(() => {
    athosServiceMock = {
      buscarProdutos: jest.fn(),
      buscarProdutoPorId: jest.fn(),
      buscarDepartamentos: jest.fn(),
      buscarGrupos: jest.fn(),
      buscarMarcas: jest.fn(),
    };
    athosProdutoServiceMock = {
      criarProduto: jest.fn(),
      editarProduto: jest.fn(),
      alterarStatusProduto: jest.fn(),
    };
    controller = new ProdutoController(athosServiceMock as any, athosProdutoServiceMock as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("buscarProdutos", () => {
    it("deve repassar filtro descricao para o service e retornar o resultado", async () => {
      const mockResult = { total: 2, page: 1, take: 20, items: [] };
      athosServiceMock.buscarProdutos.mockResolvedValue(mockResult);

      const result = await controller.buscarProdutos("papel", undefined, undefined, undefined, undefined, undefined, undefined);

      expect(athosServiceMock.buscarProdutos).toHaveBeenCalledWith(
        expect.objectContaining({ descricao: "papel" }),
      );
      expect(result).toBe(mockResult);
    });

    it("deve repassar filtro codigobarra como string sem alteracao para o service", async () => {
      const mockResult = { total: 1, page: 1, take: 20, items: [] };
      athosServiceMock.buscarProdutos.mockResolvedValue(mockResult);

      const result = await controller.buscarProdutos(undefined, "7891234567890", undefined, undefined, undefined, undefined, undefined);

      expect(athosServiceMock.buscarProdutos).toHaveBeenCalledWith(
        expect.objectContaining({ codigobarra: "7891234567890" }),
      );
      expect(result).toBe(mockResult);
    });

    it("deve converter filtros departamento iddepartamento idgrupo idmarca para number", async () => {
      const mockResult = { total: 5, page: 1, take: 20, items: [] };
      athosServiceMock.buscarProdutos.mockResolvedValue(mockResult);

      await controller.buscarProdutos(undefined, undefined, "1", "2", "3", undefined, undefined);

      expect(athosServiceMock.buscarProdutos).toHaveBeenCalledWith(
        expect.objectContaining({
          iddepartamento: 1,
          idgrupo: 2,
          idmarca: 3,
        }),
      );
    });

    it("deve repassar page e take convertidos para number e retornar paginacao correta", async () => {
      const mockResult = { total: 100, page: 2, take: 10, items: [] };
      athosServiceMock.buscarProdutos.mockResolvedValue(mockResult);

      const result = await controller.buscarProdutos(undefined, undefined, undefined, undefined, undefined, "2", "10");

      expect(athosServiceMock.buscarProdutos).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2, take: 10 }),
      );
      expect(result).toEqual({ total: 100, page: 2, take: 10, items: [] });
    });

    it("deve repassar undefined para page e take quando ausentes (service aplica defaults)", async () => {
      const mockResult = { total: 50, page: 1, take: 20, items: [] };
      athosServiceMock.buscarProdutos.mockResolvedValue(mockResult);

      await controller.buscarProdutos(undefined, undefined, undefined, undefined, undefined, undefined, undefined);

      expect(athosServiceMock.buscarProdutos).toHaveBeenCalledWith(
        expect.objectContaining({ page: undefined, take: undefined }),
      );
    });
  });

  describe("buscarProdutoPorId", () => {
    it("deve retornar o produto quando o service resolve um objeto para idproduto informado", async () => {
      const mockProduto = { idproduto: 42, descricaoproduto: "Papel A4", imagemproduto: null };
      athosServiceMock.buscarProdutoPorId.mockResolvedValue(mockProduto);

      const result = await controller.buscarProdutoPorId(42);

      expect(athosServiceMock.buscarProdutoPorId).toHaveBeenCalledWith(42);
      expect(result).toBe(mockProduto);
    });

    it("deve lancir NotFoundException quando o service resolve null para idproduto nao encontrado", async () => {
      athosServiceMock.buscarProdutoPorId.mockResolvedValue(null);

      await expect(controller.buscarProdutoPorId(999)).rejects.toThrow(NotFoundException);
      expect(athosServiceMock.buscarProdutoPorId).toHaveBeenCalledWith(999);
    });
  });

  describe("lookupDepartamentos", () => {
    it("deve delegar para buscarDepartamentos e retornar o array do service", async () => {
      const mockDeps = [{ id: 1, nome: "GRAFICA" }];
      athosServiceMock.buscarDepartamentos.mockResolvedValue(mockDeps);

      const result = await controller.lookupDepartamentos();

      expect(athosServiceMock.buscarDepartamentos).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockDeps);
    });
  });

  describe("lookupGrupos", () => {
    it("deve delegar para buscarGrupos e retornar o array do service", async () => {
      const mockGrupos = [{ id: 1, nome: "CONFECCAO CARIMBO" }];
      athosServiceMock.buscarGrupos.mockResolvedValue(mockGrupos);

      const result = await controller.lookupGrupos();

      expect(athosServiceMock.buscarGrupos).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockGrupos);
    });
  });

  describe("lookupMarcas", () => {
    it("deve delegar para buscarMarcas e retornar o array do service", async () => {
      const mockMarcas = [{ id: 1, nome: "NYKON" }];
      athosServiceMock.buscarMarcas.mockResolvedValue(mockMarcas);

      const result = await controller.lookupMarcas();

      expect(athosServiceMock.buscarMarcas).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockMarcas);
    });
  });

  describe("criarProduto", () => {
    it("POST delega a criarProduto", async () => {
      const dto = { descricaoproduto: "Papel A4 75g" };
      const mockResult = { idproduto: 42 };
      athosProdutoServiceMock.criarProduto.mockResolvedValue(mockResult);

      const result = await controller.criarProduto(dto as any);

      expect(athosProdutoServiceMock.criarProduto).toHaveBeenCalledWith(dto);
      expect(result).toBe(mockResult);
    });
  });

  describe("editarProduto", () => {
    it("PATCH :idproduto delega a editarProduto", async () => {
      const dto = { descricaoproduto: "Papel A4 90g" };
      const mockResult = { idproduto: 5 };
      athosProdutoServiceMock.editarProduto.mockResolvedValue(mockResult);

      const result = await controller.editarProduto(5, dto as any);

      expect(athosProdutoServiceMock.editarProduto).toHaveBeenCalledWith(5, dto);
      expect(result).toBe(mockResult);
    });
  });

  describe("alterarStatusProduto", () => {
    it("PATCH :idproduto/status delega a alterarStatusProduto com ativo boolean", async () => {
      const body = { ativo: false };
      const mockResult = { idproduto: 5, ativo: false };
      athosProdutoServiceMock.alterarStatusProduto.mockResolvedValue(mockResult);

      const result = await controller.alterarStatusProduto(5, body as any);

      expect(athosProdutoServiceMock.alterarStatusProduto).toHaveBeenCalledWith(5, false);
      expect(result).toBe(mockResult);
    });
  });
});
