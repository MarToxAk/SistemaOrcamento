import { UnprocessableEntityException } from "@nestjs/common";
import { validarFkExiste } from "./athos-fk.util";

describe("validarFkExiste", () => {
  it("resolve sem lancar quando client.query retorna pelo menos uma linha (FK existe)", async () => {
    const mClient = {
      query: jest.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
    };

    await expect(
      validarFkExiste(mClient as any, "produto_departamento", "iddepartamento", 5, "Departamento"),
    ).resolves.toBeUndefined();
  });

  it("lanca UnprocessableEntityException com mensagem correta quando rows esta vazio (FK ausente)", async () => {
    const mClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    await expect(
      validarFkExiste(mClient as any, "produto_grupo", "idgrupo", 99, "Grupo"),
    ).rejects.toThrow(UnprocessableEntityException);

    await expect(
      validarFkExiste(mClient as any, "produto_grupo", "idgrupo", 99, "Grupo"),
    ).rejects.toThrow("Grupo com id 99 nao encontrado no Athos");
  });

  it("passa o id como parametro $1 (array [id]) — nunca interpolado na SQL", async () => {
    const mClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    await expect(
      validarFkExiste(mClient as any, "produto_marca", "idmarca", 42, "Marca"),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(mClient.query).toHaveBeenCalledWith(
      expect.stringContaining("$1"),
      [42],
    );
  });
});
