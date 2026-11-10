import { Injectable, Logger } from "@nestjs/common";

import { PrismaService } from "../database/prisma.service";
import { hojeSaoPaulo } from "../integrations/athos/athos-conta-receber-baixa.service";
import {
  AVISO_DIAS_MAX,
  AVISO_DIAS_MIN,
  calcularDiasParaVencer,
  mascararEmail,
  somarDias,
  tipoAvisoAplicavel,
  type TipoAviso,
} from "./cobranca-aviso-vencimento.util";
import { EmailEnvioService } from "./email-envio.service";

/** Teto de candidatos lidos por ciclo (take da consulta). */
export const AVISO_MAX_CANDIDATOS = 500;
/** Teto de tentativas SMTP por ciclo (aplicado em 45-02). */
export const AVISO_MAX_ENVIOS_POR_CICLO = 100;
/** Tentativas por (boleto, tipo) antes de desistir (retomada em 45-02). */
export const AVISO_MAX_TENTATIVAS = 3;
/** Pausa entre envios para nao saturar o SMTP (aplicada em 45-02). */
export const AVISO_INTERVALO_ENVIO_MS = 250;

const ERRO_MAX_CHARS = 300;

export type DesfechoAviso =
  | "enviado"
  | "erro"
  | "sem_email"
  | "ja_processado"
  | "lookup_falhou"
  | "previa_enviaria"
  | "previa_sem_email";

export interface ItemCicloAviso {
  cobrancaBoletoId: number;
  idclienteAthos: number;
  tipo: TipoAviso;
  diasParaVencer: number;
  desfecho: DesfechoAviso;
  destinatarioMascarado: string | null;
  ccQuantidade: number;
}

export interface ResultadoCicloAviso {
  hoje: string;
  dryRun: boolean;
  candidatos: number;
  enviados: number;
  semEmail: number;
  jaProcessados: number;
  erros: number;
  lookupFalhou: number;
  itens: ItemCicloAviso[];
}

/**
 * Orquestra um ciclo de avisos de vencimento/atraso (Fase 45): seleciona boletos pendentes dentro das
 * janelas, reserva a linha de idempotencia (unique cobrancaBoletoId+tipo) ANTES de enviar e envia o e-mail
 * pelo EmailEnvioService. Nunca escreve no Athos (so le o cadastro do cliente).
 */
@Injectable()
export class CobrancaAvisoVencimentoService {
  private readonly logger = new Logger(CobrancaAvisoVencimentoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailEnvio: EmailEnvioService,
  ) {}

  async processarCiclo(
    opts: { dryRun?: boolean; agora?: Date } = {},
  ): Promise<ResultadoCicloAviso> {
    const dryRun = opts.dryRun ?? false;
    const hoje = hojeSaoPaulo(opts.agora ?? new Date());

    const candidatos = await this.prisma.cobrancaBoleto.findMany({
      where: {
        status: "pendente",
        expireAt: { gte: somarDias(hoje, AVISO_DIAS_MIN), lte: somarDias(hoje, AVISO_DIAS_MAX) },
        // OR explicito: um "notIn" sozinho excluiria athosBaixaStatus nulo (semantica SQL de NULL).
        OR: [{ athosBaixaStatus: null }, { athosBaixaStatus: { notIn: ["baixado", "ja_baixado"] } }],
      },
      select: {
        id: true,
        idclienteAthos: true,
        status: true,
        valor: true,
        expireAt: true,
        linkBoleto: true,
        athosBaixaStatus: true,
        avisos: { select: { id: true, tipo: true, status: true, tentativas: true } },
      },
      orderBy: [{ expireAt: "asc" }, { id: "asc" }],
      take: AVISO_MAX_CANDIDATOS,
    });

    const resultado: ResultadoCicloAviso = {
      hoje,
      dryRun,
      candidatos: candidatos.length,
      enviados: 0,
      semEmail: 0,
      jaProcessados: 0,
      erros: 0,
      lookupFalhou: 0,
      itens: [],
    };

    for (const b of candidatos) {
      // Defesa dupla: a consulta ja filtra, mas o estado pode mudar entre a leitura e o processamento.
      if (b.status !== "pendente") continue;
      if (b.athosBaixaStatus === "baixado" || b.athosBaixaStatus === "ja_baixado") continue;
      const dias = calcularDiasParaVencer(b.expireAt, hoje);
      const tipo = tipoAvisoAplicavel(dias);
      if (tipo === null || dias === null || b.expireAt === null) continue;

      const item: ItemCicloAviso = {
        cobrancaBoletoId: b.id,
        idclienteAthos: b.idclienteAthos,
        tipo,
        diasParaVencer: dias,
        desfecho: "ja_processado",
        destinatarioMascarado: null,
        ccQuantidade: 0,
      };

      if (b.avisos.some((a) => a.tipo === tipo && a.status !== "erro")) {
        resultado.jaProcessados += 1;
        resultado.itens.push(item);
        continue;
      }

      const dest = await this.emailEnvio.resolverDestinatariosAviso(b.idclienteAthos);
      if (dest.lookup === "falha") {
        this.logger.warn(
          `Aviso ${tipo}: cadastro do cliente indisponivel (boleto=${b.id}, cliente=${b.idclienteAthos}) - tentara no proximo ciclo.`,
        );
        item.desfecho = "lookup_falhou";
        resultado.lookupFalhou += 1;
        resultado.itens.push(item);
        continue;
      }
      if (!dest.destinatario) {
        this.logger.warn(
          `Aviso ${tipo}: cliente sem e-mail valido (boleto=${b.id}, cliente=${b.idclienteAthos}, motivo=${dest.motivoSemEmail ?? "vazio"}).`,
        );
        item.desfecho = dryRun ? "previa_sem_email" : "sem_email";
        if (!dryRun) resultado.semEmail += 1;
        resultado.itens.push(item);
        continue;
      }

      item.destinatarioMascarado = mascararEmail(dest.destinatario);
      item.ccQuantidade = dest.cc.length;

      if (dryRun) {
        item.desfecho = "previa_enviaria";
        resultado.itens.push(item);
        continue;
      }

      let linhaId: number;
      try {
        const linha = await this.prisma.cobrancaAvisoVencimento.create({
          data: {
            cobrancaBoletoId: b.id,
            idclienteAthos: b.idclienteAthos,
            tipo,
            status: "enviando",
            tentativas: 1,
            destinatario: dest.destinatario,
            cc: dest.cc,
          },
        });
        linhaId = linha.id;
      } catch (err) {
        if ((err as { code?: string } | null)?.code === "P2002") {
          resultado.jaProcessados += 1;
          item.desfecho = "ja_processado";
          resultado.itens.push(item);
          continue;
        }
        throw err;
      }

      try {
        await this.emailEnvio.enviarAvisoVencimento({
          cobrancaBoletoId: b.id,
          idclienteAthos: b.idclienteAthos,
          nomeCliente: dest.nomeCliente,
          destinatario: dest.destinatario,
          cc: dest.cc,
          tipo,
          diasParaVencer: dias,
          valor: Number(b.valor),
          expireAt: b.expireAt,
          linkBoleto: b.linkBoleto,
        });
        await this.prisma.cobrancaAvisoVencimento.update({
          where: { id: linhaId },
          data: { status: "enviado", enviadoEm: new Date(), erro: null },
        });
        item.desfecho = "enviado";
        resultado.enviados += 1;
        this.logger.log(
          `Aviso ${tipo} enviado (boleto=${b.id}, cliente=${b.idclienteAthos}, para=${item.destinatarioMascarado}).`,
        );
      } catch (err) {
        const msg = `${err instanceof Error ? err.name : "Erro"}: ${err instanceof Error ? err.message : String(err)}`;
        await this.prisma.cobrancaAvisoVencimento.update({
          where: { id: linhaId },
          data: { status: "erro", erro: msg.slice(0, ERRO_MAX_CHARS) },
        });
        item.desfecho = "erro";
        resultado.erros += 1;
        this.logger.error(
          `Aviso ${tipo} falhou (boleto=${b.id}, cliente=${b.idclienteAthos}): ${err instanceof Error ? err.name : "erro"}.`,
        );
      }
      resultado.itens.push(item);
    }

    this.logger.log(
      `Ciclo de avisos${dryRun ? " (dry-run)" : ""} concluido: candidatos=${resultado.candidatos}, enviados=${resultado.enviados}, sem_email=${resultado.semEmail}, ja_processados=${resultado.jaProcessados}, erros=${resultado.erros}, lookup_falhou=${resultado.lookupFalhou}.`,
    );
    return resultado;
  }
}
