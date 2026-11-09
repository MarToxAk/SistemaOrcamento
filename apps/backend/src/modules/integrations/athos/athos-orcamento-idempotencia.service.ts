import { createHash } from "crypto";

import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../database/prisma.service";
import { CriarOrcamentoInput, CriarOrcamentoResultado, OrcamentoAthosError } from "./athos-orcamento.service";

/**
 * Idempotencia e auditoria da criacao de orcamento pela IA (Fase 44, D-03).
 *
 * Reserva-primeiro: a chave (Idempotency-Key) e gravada no banco do SISTEMA (AthosOrcamentoIa,
 * idempotencyKey unico) ANTES de tocar o Athos. Duas chamadas concorrentes com a mesma chave
 * colidem no indice unico (P2002): uma cria, a outra recebe replay ou 409. As duas bases nao
 * compartilham transacao, entao nenhuma chamada ao Prisma acontece enquanto `criar` (o INSERT
 * no Athos) esta em andamento: o Prisma fica sempre antes e depois dele.
 *
 * Se o Sistema falhar depois do COMMIT no Athos, o orcamento NAO e escondido: a resposta de
 * sucesso e devolvida e o idorcamento vai para logger.error. O obs do Athos carrega
 * "[IA] ref:<12 hex>" para localizar orfaos (obs LIKE '[IA] ref:<ref>%').
 */

export const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9._:-]{8,128}$/;

export type ResultadoComReplay = CriarOrcamentoResultado & { replay?: boolean };

/** Serializacao canonica: chaves de objetos ordenadas (recursivo), arrays na ordem, undefined omitido. */
function canonizar(valor: unknown): string {
  if (Array.isArray(valor)) {
    return `[${valor.map((v) => (v === undefined ? "null" : canonizar(v))).join(",")}]`;
  }
  if (valor !== null && typeof valor === "object") {
    const obj = valor as Record<string, unknown>;
    const partes = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonizar(obj[k])}`);
    return `{${partes.join(",")}}`;
  }
  return JSON.stringify(valor) ?? "null";
}

/** sha256 hex do corpo canonico, sem a chave "simular" do topo. */
export function hashPayloadOrcamento(payload: unknown): string {
  return createHash("sha256").update(canonizar(semSimular(payload))).digest("hex");
}

/** 12 primeiros hex de sha256(base): marcador "[IA] ref:<ref>" no obs do orcamento no Athos. */
export function refDoOrcamento(base: string): string {
  return createHash("sha256").update(base).digest("hex").slice(0, 12);
}

function semSimular(payload: unknown): unknown {
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    const { simular: _simular, ...resto } = payload as Record<string, unknown>;
    return resto;
  }
  return payload;
}

/** Copia JSON pura (DTO de classe -> objeto simples) aceita pelo Prisma como Json. */
function paraJson(valor: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(valor)) as Prisma.InputJsonValue;
}

function ehConflitoUnico(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "P2002";
}

@Injectable()
export class AthosOrcamentoIdempotenciaService {
  private readonly logger = new Logger(AthosOrcamentoIdempotenciaService.name);

  constructor(private readonly prisma: PrismaService) {}

  async executar(
    idempotencyKey: string | undefined,
    payload: CriarOrcamentoInput,
    criar: (opts: { ref?: string }) => Promise<CriarOrcamentoResultado>,
  ): Promise<ResultadoComReplay> {
    // (1) Simulacao nao consome chave nem grava auditoria.
    if (payload.simular === true) {
      return criar({});
    }

    // (2) Chave presente e invalida: recusa antes de qualquer acesso ao banco.
    if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY_REGEX.test(idempotencyKey)) {
      throw new OrcamentoAthosError(
        "IDEMPOTENCY_KEY_INVALIDA",
        "Idempotency-Key invalida: use de 8 a 128 caracteres entre letras, numeros, ponto, hifen, dois-pontos e sublinhado.",
        400,
      );
    }

    // (3) Hash do corpo e ref (marcador no obs do Athos).
    const payloadHash = hashPayloadOrcamento(payload);
    const ref = refDoOrcamento(idempotencyKey ?? payloadHash);
    const request = paraJson(semSimular(payload));

    // (4) Reserva da chave antes de tocar o Athos.
    if (idempotencyKey !== undefined) {
      try {
        await this.prisma.athosOrcamentoIa.create({
          data: { idempotencyKey, payloadHash, status: "processando", request },
        });
      } catch (err) {
        if (!ehConflitoUnico(err)) throw err;
        return this.resolverConflito(idempotencyKey, payloadHash);
      }
    }

    // (5) Criacao no Athos. Falha antes do COMMIT libera a reserva (permite retentativa).
    let resultado: CriarOrcamentoResultado;
    try {
      resultado = await criar({ ref });
    } catch (err) {
      if (idempotencyKey !== undefined) {
        try {
          await this.prisma.athosOrcamentoIa.delete({ where: { idempotencyKey } });
        } catch (delErr) {
          this.logger.error(
            `Falha ao liberar a reserva da Idempotency-Key ${idempotencyKey.slice(0, 8)}... (ref ${ref}): ${
              (delErr as Error)?.message ?? delErr
            }`,
          );
        }
      }
      throw err;
    }

    // (6) Auditoria. Falha aqui nunca desfaz nem esconde o orcamento ja commitado no Athos.
    const dadosAuditoria = {
      status: "criado",
      idorcamento: resultado.idorcamento,
      senhabalcao: resultado.senhabalcao,
      valorBruto: resultado.valorBruto,
      valorLiquido: resultado.valorLiquido,
      resposta: paraJson(resultado),
    };
    try {
      if (idempotencyKey !== undefined) {
        await this.prisma.athosOrcamentoIa.update({ where: { idempotencyKey }, data: dadosAuditoria });
      } else {
        await this.prisma.athosOrcamentoIa.create({
          data: { idempotencyKey: null, payloadHash, request, ...dadosAuditoria },
        });
      }
    } catch (err) {
      this.logger.error(
        `Orcamento ${resultado.idorcamento} criado no Athos (ref ${ref}) mas a auditoria falhou: ${
          (err as Error)?.message ?? err
        }. Localizar no Athos por obs LIKE '[IA] ref:${ref}%'.`,
      );
    }

    return resultado;
  }

  private async resolverConflito(idempotencyKey: string, payloadHash: string): Promise<ResultadoComReplay> {
    const existente = await this.prisma.athosOrcamentoIa.findUnique({ where: { idempotencyKey } });
    if (existente && existente.status === "criado" && existente.payloadHash === payloadHash && existente.resposta) {
      return { ...(existente.resposta as unknown as CriarOrcamentoResultado), replay: true };
    }
    if (existente && existente.payloadHash !== payloadHash) {
      throw new OrcamentoAthosError(
        "IDEMPOTENCY_KEY_REUTILIZADA",
        "Esta Idempotency-Key ja foi usada com outro corpo. Use uma chave nova para um orcamento diferente.",
        409,
      );
    }
    throw new OrcamentoAthosError(
      "IDEMPOTENCY_EM_PROCESSAMENTO",
      "Ja existe uma criacao em andamento com esta Idempotency-Key. Aguarde e repita a chamada.",
      409,
    );
  }
}
