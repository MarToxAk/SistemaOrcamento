import { UnprocessableEntityException } from "@nestjs/common";
import { PoolClient } from "pg";

/**
 * Valida que uma linha existe em `tabela` onde `coluna = id`.
 * Lança UnprocessableEntityException (422) se não encontrada.
 * Extraído de AthosProdutoService para ser reutilizável em todos os
 * serviços do módulo Athos (v2.5: AthosProdutoCompostoService).
 */
export async function validarFkExiste(
  client: PoolClient,
  tabela: string,
  coluna: string,
  id: number,
  nomeEntidade: string,
): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM "${tabela}" WHERE "${coluna}" = $1 LIMIT 1`,
    [id],
  );
  if (result.rows.length === 0) {
    throw new UnprocessableEntityException(
      `${nomeEntidade} com id ${id} nao encontrado no Athos`,
    );
  }
}
