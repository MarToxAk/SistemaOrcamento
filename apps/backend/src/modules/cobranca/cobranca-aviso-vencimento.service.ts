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
/** Teto de tentativas SMTP por ciclo (D-07). */
export const AVISO_MAX_ENVIOS_POR_CICLO = 100;
/** Tentativas por (boleto, tipo) antes de desistir (D-05). */
export const AVISO_MAX_TENTATIVAS = 3;
/** Pausa entre envios para nao saturar o SMTP (D-07). */
export const AVISO_INTERVALO_ENVIO_MS = 250;

const ERRO_MAX_CHARS = 300;
const EMAIL_RE = /[^\s@]+@[^\s@]+/g;

interface DestinatariosAviso {
  lookup: "ok" | "falha";
  nomeCliente: string;
  destinatario: string | null;
  motivoSemEmail?: "vazio" | "invalido";
  cc: string[];
}

interface LinhaAvisoExistente {
  id: number;
  tipo: string;
  status: string;
  tentativas: number;
}

/** Texto seguro para a coluna erro: sem trechos com formato de e-mail e limitado a 300 caracteres. */
function sanitizarErro(err: unknown): string {
  const bruto = `${err instanceof Error ? err.name : "Erro"}: ${err instanceof Error ? err.message : String(err)}`;
  return bruto.replace(EMAIL_RE, "[email]").slice(0, ERRO_MAX_CHARS);
}

function ehP2002(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "P2002";
}

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

    if (candidatos.length >= AVISO_MAX_CANDIDATOS) {
      this.logger.warn(
        `Consulta de avisos atingiu o limite de ${AVISO_MAX_CANDIDATOS} candidatos; o restante fica para o proximo disparo.`,
      );
    }

    // Cadastro do cliente lido uma unica vez por ciclo (Athos de producao).
    const cacheClientes = new Map<number, Promise<DestinatariosAviso>>();
    const resolverCliente = (idcliente: number): Promise<DestinatariosAviso> => {
      let p = cacheClientes.get(idcliente);
      if (!p) {
        p = this.emailEnvio.resolverDestinatariosAviso(idcliente);
        cacheClientes.set(idcliente, p);
      }
      return p;
    };
    let tentativasEnvio = 0;

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

    const clientesSemEmailAvisados = new Set<number>();
    const clientesLookupAvisados = new Set<number>();

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

      // Pre-checagem pela lista da consulta: evita ler o Athos para o que ja esta resolvido.
      // A garantia real continua sendo a constraint unica + a troca atomica em reservar().
      const existente = b.avisos.find((a) => a.tipo === tipo) ?? null;
      if (existente && !this.podeRetomar(existente)) {
        if (existente.status === "enviando") {
          this.logger.warn(
            `Aviso ${tipo}: linha ${existente.id} ficou em "enviando" (boleto=${b.id}); nao sera retomada para nao duplicar o e-mail.`,
          );
        }
        resultado.jaProcessados += 1;
        resultado.itens.push(item);
        continue;
      }

      if (!dryRun && tentativasEnvio >= AVISO_MAX_ENVIOS_POR_CICLO) {
        this.logger.warn(
          `Aviso: teto de ${AVISO_MAX_ENVIOS_POR_CICLO} envios por ciclo atingido; o restante fica para o proximo disparo.`,
        );
        break;
      }

      const dest = await resolverCliente(b.idclienteAthos);
      if (dest.lookup === "falha") {
        // Falha transitoria do Athos nao grava nada: tenta de novo no proximo disparo.
        if (!clientesLookupAvisados.has(b.idclienteAthos)) {
          clientesLookupAvisados.add(b.idclienteAthos);
          this.logger.warn(
            `Aviso: cadastro do cliente indisponivel (cliente=${b.idclienteAthos}) - tentara no proximo ciclo.`,
          );
        }
        item.desfecho = "lookup_falhou";
        resultado.lookupFalhou += 1;
        resultado.itens.push(item);
        continue;
      }

      if (!dest.destinatario) {
        const motivo = dest.motivoSemEmail ?? "vazio";
        if (dryRun) {
          item.desfecho = "previa_sem_email";
        } else {
          try {
            await this.prisma.cobrancaAvisoVencimento.create({
              data: {
                cobrancaBoletoId: b.id,
                idclienteAthos: b.idclienteAthos,
                tipo,
                status: "sem_email",
                tentativas: 0,
                destinatario: null,
                cc: [],
                erro: motivo,
              },
            });
            item.desfecho = "sem_email";
            resultado.semEmail += 1;
          } catch (err) {
            if (!ehP2002(err)) throw err;
            // Outra execucao ja registrou este (boleto, tipo): nada a fazer.
            resultado.jaProcessados += 1;
            resultado.itens.push(item);
            continue;
          }
        }
        if (!clientesSemEmailAvisados.has(b.idclienteAthos)) {
          clientesSemEmailAvisados.add(b.idclienteAthos);
          this.logger.warn(
            `Aviso: cliente sem e-mail valido (cliente=${b.idclienteAthos}, motivo=${motivo}) - ${dryRun ? "previa, nada gravado" : "registrado sem_email"}.`,
          );
        }
        resultado.itens.push(item);
        continue;
      }

      item.destinatarioMascarado = mascararEmail(dest.destinatario);
      item.ccQuantidade = dest.cc.length;

      if (dryRun) {
        item.desfecho = "previa_enviaria";
        resultado.itens.push(item);
        this.logger.log(
          `[dry-run] boleto=${b.id} tipo=${tipo} dias=${dias} destinatario=${item.destinatarioMascarado} cc=${item.ccQuantidade}`,
        );
        continue;
      }

      const linhaId = await this.reservar(
        { boletoId: b.id, idclienteAthos: b.idclienteAthos, tipo },
        existente,
        dest.destinatario,
        dest.cc,
      );
      if (linhaId === null) {
        resultado.jaProcessados += 1;
        item.desfecho = "ja_processado";
        resultado.itens.push(item);
        continue;
      }

      tentativasEnvio += 1;
      let enviou = false;
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
        enviou = true;
      } catch (err) {
        item.desfecho = "erro";
        resultado.erros += 1;
        this.logger.error(
          `Aviso ${tipo} falhou (boleto=${b.id}, cliente=${b.idclienteAthos}): ${err instanceof Error ? err.name : "erro"}.`,
        );
        try {
          await this.prisma.cobrancaAvisoVencimento.update({
            where: { id: linhaId },
            data: { status: "erro", erro: sanitizarErro(err) },
          });
        } catch (errUpdate) {
          // Linha fica "enviando" (nunca retomada): prioridade e nao duplicar.
          this.logger.error(
            `Aviso ${tipo}: falha ao registrar erro da linha ${linhaId}: ${errUpdate instanceof Error ? errUpdate.name : "erro"}.`,
          );
        }
      }

      if (enviou) {
        item.desfecho = "enviado";
        resultado.enviados += 1;
        this.logger.log(
          `Aviso ${tipo} enviado (boleto=${b.id}, cliente=${b.idclienteAthos}, para=${item.destinatarioMascarado}).`,
        );
        try {
          await this.prisma.cobrancaAvisoVencimento.update({
            where: { id: linhaId },
            data: { status: "enviado", enviadoEm: new Date(), erro: null },
          });
        } catch (errUpdate) {
          // E-mail ja saiu: nao marcar como erro (reenviaria). A linha fica "enviando" e nunca e retomada.
          this.logger.error(
            `Aviso ${tipo}: e-mail enviado mas a linha ${linhaId} nao foi atualizada: ${errUpdate instanceof Error ? errUpdate.name : "erro"}.`,
          );
        }
      }
      resultado.itens.push(item);
      await this.aguardar(AVISO_INTERVALO_ENVIO_MS);
    }

    this.logger.log(
      `Ciclo de avisos${dryRun ? " (dry-run)" : ""} concluido: candidatos=${resultado.candidatos}, enviados=${resultado.enviados}, sem_email=${resultado.semEmail}, ja_processados=${resultado.jaProcessados}, erros=${resultado.erros}, lookup_falhou=${resultado.lookupFalhou}.`,
    );
    return resultado;
  }

  /** Linha existente so e retomavel se falhou ("erro") e ainda tem tentativas; "enviando" nunca. */
  private podeRetomar(linha: LinhaAvisoExistente): boolean {
    return linha.status === "erro" && linha.tentativas < AVISO_MAX_TENTATIVAS;
  }

  /**
   * Reserva a linha (boleto, tipo) antes de enviar. Devolve o id da linha reservada ou null se outra
   * execucao/ciclo ja cuidou dela. Retomada de "erro" por troca atomica (updateMany condicional).
   */
  private async reservar(
    chave: { boletoId: number; idclienteAthos: number; tipo: TipoAviso },
    existente: LinhaAvisoExistente | null,
    destinatario: string,
    cc: string[],
  ): Promise<number | null> {
    let linha: LinhaAvisoExistente | null = existente;
    if (!linha) {
      try {
        const criada = await this.prisma.cobrancaAvisoVencimento.create({
          data: {
            cobrancaBoletoId: chave.boletoId,
            idclienteAthos: chave.idclienteAthos,
            tipo: chave.tipo,
            status: "enviando",
            tentativas: 1,
            destinatario,
            cc,
          },
        });
        return criada.id;
      } catch (err) {
        if (!ehP2002(err)) throw err;
        linha = await this.prisma.cobrancaAvisoVencimento.findUnique({
          where: { cobrancaBoletoId_tipo: { cobrancaBoletoId: chave.boletoId, tipo: chave.tipo } },
          select: { id: true, tipo: true, status: true, tentativas: true },
        });
        if (!linha) return null;
      }
    }

    if (!this.podeRetomar(linha)) {
      if (linha.status === "enviando") {
        this.logger.warn(
          `Aviso ${chave.tipo}: linha ${linha.id} em "enviando" (boleto=${chave.boletoId}); nao sera retomada para nao duplicar.`,
        );
      }
      return null;
    }

    const troca = await this.prisma.cobrancaAvisoVencimento.updateMany({
      where: { id: linha.id, status: "erro", tentativas: { lt: AVISO_MAX_TENTATIVAS } },
      data: {
        status: "enviando",
        tentativas: { increment: 1 },
        erro: null,
        destinatario,
        cc,
      },
    });
    return troca.count === 1 ? linha.id : null;
  }

  /** Pausa entre envios (substituivel em teste). */
  private aguardar(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
