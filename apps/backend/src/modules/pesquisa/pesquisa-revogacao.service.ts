/**
 * Fase 52 (plano 52-12): revogacao de uma pesquisa (D-02 e a decisao de revogacao do CONTEXT).
 *
 * Revogar e definitivo: grava `revogadaEm` (o token fica guardado para auditoria, sem coluna unica
 * anulavel), cancela o cupom EMITIDO ligado a pesquisa (UNICO escritor do status CANCELADO) e cancela
 * o convite do Google agendado em memoria. Nunca apaga linhas e nunca altera cupom USADO ou EXPIRADO.
 * A partir da revogacao, a rota publica responde INDISPONIVEL com o mesmo corpo generico de um token
 * inexistente (a checagem de `revogadaEm` fica em PesquisaService.obterPublica/responder, plano 52-01).
 *
 * Logs: so pesquisaId e os flags. Nunca telefone, token ou codigo do cupom.
 */
import { Injectable, Logger, NotFoundException } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { cancelarEnvioFechamento } from "../integrations/chatwoot/chatwoot-etiquetas";

export interface ResultadoRevogacao {
  pesquisaId: string;
  jaRevogada: boolean;
  cupomCancelado: boolean;
  cupomJaUsado: boolean;
}

/** Formato UUID (versao 1-5, variante 8-b) antes de qualquer acesso ao banco. */
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MSG_NAO_ENCONTRADA = "Pesquisa não encontrada.";

@Injectable()
export class PesquisaRevogacaoService {
  private readonly logger = new Logger(PesquisaRevogacaoService.name);

  constructor(private readonly prisma: PrismaService) {}

  async revogar(pesquisaId: string, agora: Date = new Date()): Promise<ResultadoRevogacao> {
    if (typeof pesquisaId !== "string" || !REGEX_UUID.test(pesquisaId)) {
      throw new NotFoundException(MSG_NAO_ENCONTRADA);
    }

    const resultado = await this.prisma.$transaction(async (tx) => {
      const pesquisa = await tx.pesquisaSatisfacao.findUnique({
        where: { id: pesquisaId },
        select: { id: true, revogadaEm: true, cupom: { select: { id: true, status: true } } },
      });
      if (!pesquisa) throw new NotFoundException(MSG_NAO_ENCONTRADA);

      // Idempotente: o filtro `revogadaEm: null` nunca sobrescreve a data original. Contagem 0
      // significa que outra chamada revogou primeiro.
      const gravadas = await tx.pesquisaSatisfacao.updateMany({
        where: { id: pesquisaId, revogadaEm: null },
        data: { revogadaEm: agora },
      });
      const jaRevogada = pesquisa.revogadaEm !== null || gravadas.count === 0;

      // UNICO escritor de CANCELADO: apenas o cupom ainda EMITIDO muda de status (USADO/EXPIRADO ficam).
      const canceladas = await tx.cupomRecompensa.updateMany({
        where: { pesquisaId, status: "EMITIDO" },
        data: { status: "CANCELADO" },
      });

      return {
        pesquisaId,
        jaRevogada,
        cupomCancelado: canceladas.count > 0,
        cupomJaUsado: pesquisa.cupom?.status === "USADO",
      };
    });

    // D-21/D-49: o convite agendado em memoria morre junto (o envio ainda re-checa revogadaEm no disparo).
    cancelarEnvioFechamento(`convite:${pesquisaId}`);

    this.logger.log(
      `Revogacao da pesquisa pesquisaId=${pesquisaId} jaRevogada=${resultado.jaRevogada} cupomCancelado=${resultado.cupomCancelado} cupomJaUsado=${resultado.cupomJaUsado}`,
    );
    return resultado;
  }
}
