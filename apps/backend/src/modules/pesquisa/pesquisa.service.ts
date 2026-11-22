/**
 * Fase 52 (plano 52-01): pesquisa de satisfacao (CSAT) ligada ao fechamento da conversa do Chatwoot.
 *
 * Fluxo do tracer: o fechamento (fase 51) pede o bloco com o link (`prepararFechamento`), envia a
 * mensagem e avisa (`aoFechamentoEnviado`), que cria a input_csat PRIVADA no Chatwoot; o cliente abre
 * o link (`obterPublica`), responde uma unica vez (`responder`) e a nota segue em segundo plano para o
 * CSAT nativo do Chatwoot. Falha no Chatwoot nunca bloqueia o cliente (D-10).
 *
 * Logs: so conversationId, pesquisaId e motivo. Nunca o token, o telefone nem o texto das mensagens.
 */
import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CupomRecompensa, PesquisaSatisfacao } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import {
  ChatwootAutomationService,
  type ConversaChatwootResumo,
  type GanchoPesquisaFechamento,
} from "../integrations/chatwoot/chatwoot-automation.service";
import { ChatwootService } from "../integrations/chatwoot/chatwoot.service";
import {
  ETIQUETAS_PESQUISA,
  agendarEnvioFechamento,
  aplicarEtiquetasGerenciadas,
  cancelarEnvioFechamento,
  enfileirarPorConversa,
  sortearAtrasoHumanoMs,
} from "../integrations/chatwoot/chatwoot-etiquetas";
import { PesquisaConfigService, type PesquisaConfigView } from "./pesquisa-config.service";
import {
  etiquetasDaPesquisa,
  montarAtributosContato,
  montarNotaPrivada,
  montarVariaveisMensagem,
} from "./pesquisa-efeitos";
import {
  REGEX_TOKEN,
  type Variante,
  corPrimariaAcessivel,
  formatarDataBR,
  formatarPercentual,
  formatarReais,
  gerarCodigoCupom,
  gerarToken,
  janelaMesSaoPaulo,
  mascararTelefone,
  normalizarTelefone,
  notaValida,
  paraCentavos,
  renderizarTexto,
  sortearVariante,
} from "./pesquisa-regras";

export type TextosPagina = {
  titulo: string;
  subtitulo: string;
  obrigadoSemRecompensa: string;
  googleTitulo: string;
  googleCorpo: string;
};
export type CupomPublico = {
  codigo: string;
  percentual: number;
  teto: number;
  compraMinima: number;
  validadeAte: string;
};
export type PesquisaPublicaView =
  | { estado: "ABERTA"; variante: Variante; textos: TextosPagina; corPrimaria: string; linkGoogle: string | null }
  | { estado: "RESPONDIDA"; textos: TextosPagina; corPrimaria: string; linkGoogle: string | null }
  | { estado: "INDISPONIVEL" };
export type RespostaPublica = {
  estado: "RESPONDIDA";
  cupom: CupomPublico | null;
  textos: TextosPagina;
  corPrimaria: string;
  linkGoogle: string | null;
};
export type ResultadoResponder =
  | { tipo: "OK"; resposta: RespostaPublica }
  | { tipo: "JA_RESPONDIDA"; view: PesquisaPublicaView }
  | { tipo: "INDISPONIVEL" };

const TEXTO_INPUT_CSAT =
  "Pesquisa de satisfação enviada ao cliente. A resposta é registrada pela página da pesquisa.";
/** D-28: estados em que a conversa ja tem a input_csat que o PUT publico vai preencher. */
const ESTADOS_COM_INPUT_CSAT = ["MENSAGEM_OK", "OK", "RESPOSTA_FALHA"];

function mensagemDeErro(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** D-21/UI-D08: atraso humano entre a mensagem do cupom e o convite do Google. */
export const ATRASO_CONVITE_MIN_S = 60;
export const ATRASO_CONVITE_MAX_S = 180;
/** D-47: limites da re-tentativa (nunca disputa com o envio em andamento, nunca vira tempestade). */
export const IDADE_MINIMA_REENVIO_MS = 5 * 60_000;
export const IDADE_MAXIMA_REENVIO_MS = 3 * 24 * 3600_000;
export const MAX_TENTATIVAS_ENVIO = 6;
/** D-28/P15: o Chatwoot bloqueia o PUT do CSAT nativo 14 dias depois da mensagem. */
export const LIMITE_CSAT_NATIVO_MS = 14 * 24 * 3600_000;
/** Reserva de envio considerada velha (resultado incerto); so entao a re-tentativa confere no Chatwoot. */
export const IDADE_RESERVA_VELHA_MS = 15 * 60_000;

/** Resultado de um envio (WhatsApp ou CSAT nativo) usado pelas contagens da re-tentativa. */
type ResultadoEnvio = "ENVIADA" | "FALHA" | "NAO_APLICAVEL" | "PENDENTE" | "IGNORADO";
type ResultadoCsat = "OK" | "FALHA" | "NAO_APLICAVEL" | "PENDENTE" | "IGNORADO";

/** Compara textos de mensagem ignorando espacos nas pontas e repeticoes internas. */
function normalizarConteudo(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

/** `created_at` do Chatwoot pode vir em segundos, milissegundos, string numerica ou ISO. */
function criadaEmMs(valor: unknown): number | null {
  if (typeof valor === "number") {
    if (!Number.isFinite(valor) || valor < 0) return null;
    return valor < 1e11 ? valor * 1000 : valor;
  }
  if (typeof valor === "string") {
    const texto = valor.trim();
    if (!texto) return null;
    const numero = /^\d+(\.\d+)?$/.test(texto) ? Number(texto) : Date.parse(texto);
    if (!Number.isFinite(numero) || numero < 0) return null;
    return numero < 1e11 ? numero * 1000 : numero;
  }
  return null;
}

type Classificacao =
  | { tipo: "INDISPONIVEL" }
  | { tipo: "RESPONDIDA"; pesquisa: PesquisaSatisfacao; config: PesquisaConfigView }
  | { tipo: "ABERTA"; pesquisa: PesquisaSatisfacao; config: PesquisaConfigView };

type Elegibilidade = { disponivel: boolean; motivo?: "TETO_MENSAL" | "INTERVALO" };

@Injectable()
export class PesquisaService implements GanchoPesquisaFechamento, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PesquisaService.name);
  private readonly efeitos = new Set<Promise<void>>();
  private readonly convitesAgendados = new Set<string>();
  private avisoCorRegistrado = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatwoot: ChatwootService,
    private readonly config: ConfigService,
    private readonly automation: ChatwootAutomationService,
    private readonly configPesquisa: PesquisaConfigService,
  ) {}

  onModuleInit(): void {
    this.automation.registrarGanchoPesquisa(this);
  }

  async onModuleDestroy(): Promise<void> {
    this.automation.registrarGanchoPesquisa(null);
    // D-47: o timer do convite vive em memoria; no shutdown nenhum convite agendado deve sair.
    for (const chave of this.convitesAgendados) cancelarEnvioFechamento(chave);
    this.convitesAgendados.clear();
    await this.aguardarEfeitos();
  }

  /** Resolve quando os efeitos em segundo plano terminarem (testes e shutdown). */
  async aguardarEfeitos(): Promise<void> {
    while (this.efeitos.size > 0) {
      await Promise.allSettled([...this.efeitos]);
    }
  }

  /**
   * Dispara sem await; a promessa guardada nunca rejeita e se remove ao terminar. Devolve a promessa
   * para quem precisa aguarda-la (os testes usam `aguardarEfeitos` e o timer do convite a encadeia).
   */
  private dispararEfeito(tarefa: () => Promise<void>): Promise<void> {
    const promessa: Promise<void> = Promise.resolve()
      .then(tarefa)
      .catch((err) => {
        this.logger.warn(`Efeito da pesquisa falhou: ${mensagemDeErro(err)}`);
      })
      .finally(() => {
        this.efeitos.delete(promessa);
      });
    this.efeitos.add(promessa);
    return promessa;
  }

  // ---------------------------------------------------------------------------------------------
  // Gancho do fechamento
  // ---------------------------------------------------------------------------------------------

  async prepararFechamento(entrada: {
    conversationId: string;
    customerId: string | null;
    conversa: ConversaChatwootResumo;
  }): Promise<{ bloco: string; pesquisaId: string } | null> {
    const { conversationId, customerId, conversa } = entrada;
    try {
      const cfg = await this.configPesquisa.obter();
      if (!cfg.ativo) return null;

      const telefone = normalizarTelefone(conversa.meta?.sender?.phone_number);
      if (!telefone) {
        this.logger.log(`Pesquisa nao criada conversationId=${conversationId} motivo=sem_telefone`);
        return null;
      }

      const suprimido = await this.prisma.pesquisaSupressao.findUnique({ where: { telefone } });
      if (suprimido) {
        this.logger.log(`Pesquisa nao criada conversationId=${conversationId} motivo=optout`);
        return null;
      }

      const baseUrl = (this.config.get<string>("APP_BASE_URL") ?? "").replace(/\/+$/, "");
      if (!baseUrl) {
        this.logger.warn(`Pesquisa nao criada conversationId=${conversationId} motivo=sem_app_base_url`);
        return null;
      }

      const agora = new Date();
      const conversationIdBig = BigInt(conversationId);

      // D-48: no maximo uma pesquisa ABERTA por conversa; reaproveita a aberta, nao expirada e nao revogada.
      let pesquisa = await this.prisma.pesquisaSatisfacao.findFirst({
        where: { conversationId: conversationIdBig, respondidaEm: null, revogadaEm: null, expiraEm: { gt: agora } },
        orderBy: { criadaEm: "desc" },
      });

      if (!pesquisa) {
        const nativoLigado = await this.csatNativoLigadoNaInbox(conversationId, conversa.inbox_id);
        const chatwootCsat = await this.decidirChatwootCsat(conversationIdBig, conversa.uuid, nativoLigado);
        const expiraEm = new Date(agora.getTime() + Number(cfg.validadeLinkDias) * 86_400_000);
        pesquisa = await this.prisma.pesquisaSatisfacao.create({
          data: {
            token: gerarToken(),
            conversationId: conversationIdBig,
            conversationUuid: conversa.uuid ?? null,
            contactId: typeof conversa.meta?.sender?.id === "number" ? BigInt(conversa.meta.sender.id) : null,
            telefone,
            customerId,
            variante: sortearVariante(cfg.varianteVisual),
            status: "CRIADA",
            chatwootCsat,
            expiraEm,
          },
        });
      }

      const bloco = renderizarTexto(
        (await this.avaliarRecompensa(telefone, cfg, agora)).disponivel
          ? cfg.textoFechamento
          : cfg.textoSemRecompensa,
        {
          link: `${baseUrl}/pesquisa/${pesquisa.token}`,
          percentual: formatarPercentual(String(cfg.percentualDesconto)),
          teto: formatarReais(String(cfg.tetoDesconto)),
          compra_minima: formatarReais(String(cfg.compraMinima)),
          validade: formatarDataBR(new Date(agora.getTime() + Number(cfg.validadeCupomDias) * 86_400_000)),
          nome_empresa: this.config.get<string>("EMPRESA_NOME") ?? "",
          codigo: "",
          link_google: "",
        },
      );
      return { bloco, pesquisaId: pesquisa.id };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Falha ao preparar pesquisa conversationId=${conversationId}: ${msg}`);
      return null;
    }
  }

  /** Guarda do CSAT nativo: com `csat_survey_enabled` ligado o Chatwoot ja cria a propria mensagem de CSAT. */
  private async csatNativoLigadoNaInbox(conversationId: string, inboxId: unknown): Promise<boolean> {
    if (typeof inboxId !== "number") {
      this.logger.warn(`Leitura da inbox ignorada conversationId=${conversationId} motivo=inbox_id_ausente`);
      return false;
    }
    try {
      const inbox = await this.chatwoot.getInbox(inboxId);
      if (!inbox) {
        this.logger.warn(`Leitura da inbox sem retorno conversationId=${conversationId} inboxId=${inboxId}`);
        return false;
      }
      if (inbox.csat_survey_enabled === true) {
        this.logger.warn(
          `CSAT nativo ligado na inbox ${inboxId}: a pesquisa nao cria input_csat; desligue o CSAT nativo dessa inbox no Chatwoot.`,
        );
        return true;
      }
      return false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Falha ao ler a inbox conversationId=${conversationId} inboxId=${inboxId} (seguindo como CSAT nativo desligado): ${msg}`,
      );
      return false;
    }
  }

  private async decidirChatwootCsat(
    conversationId: bigint,
    uuid: string | undefined,
    nativoLigado: boolean,
  ): Promise<string> {
    if (!uuid || nativoLigado) return "NAO_APLICAVEL";
    if (this.config.get<string>("PESQUISA_CSAT_NATIVO_ATIVO") === "false") return "NAO_APLICAVEL";
    // D-28: so uma pesquisa por conversa tem registro nativo (o PUT publico grava na primeira input_csat).
    const existentes = await this.prisma.pesquisaSatisfacao.count({
      where: { conversationId, chatwootCsat: { in: ESTADOS_COM_INPUT_CSAT } },
    });
    return existentes > 0 ? "NAO_APLICAVEL" : "AGUARDANDO_MENSAGEM";
  }

  async aoFechamentoEnviado(pesquisaId: string): Promise<void> {
    try {
      const pesquisa = await this.prisma.pesquisaSatisfacao.findUnique({ where: { id: pesquisaId } });
      // Linha anonimizada (conversationId nulo): nenhum fluxo de envio a considera.
      if (!pesquisa || pesquisa.conversationId === null) return;

      await this.prisma.pesquisaSatisfacao.updateMany({
        where: { id: pesquisaId, status: "CRIADA" },
        data: { status: "ENVIADA", enviadaEm: new Date() },
      });

      if (pesquisa.chatwootCsat !== "AGUARDANDO_MENSAGEM") return;

      let novoEstado = "MENSAGEM_FALHA";
      try {
        const resultado = await this.chatwoot.createPrivateCsatMessage(String(pesquisa.conversationId), TEXTO_INPUT_CSAT);
        if (resultado?.enabled === true || resultado?.id !== undefined) novoEstado = "MENSAGEM_OK";
        else this.logger.warn(`input_csat nao criada pesquisaId=${pesquisaId} motivo=chatwoot_desabilitado`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Falha ao criar input_csat pesquisaId=${pesquisaId}: ${msg}`);
      }
      await this.prisma.pesquisaSatisfacao.update({ where: { id: pesquisaId }, data: { chatwootCsat: novoEstado } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Falha no pos-envio da pesquisa pesquisaId=${pesquisaId}: ${msg}`);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Rota publica
  // ---------------------------------------------------------------------------------------------

  async obterPublica(token: string): Promise<PesquisaPublicaView> {
    const c = await this.classificar(token);
    if (c.tipo === "INDISPONIVEL") return { estado: "INDISPONIVEL" };
    if (c.tipo === "RESPONDIDA") return this.viewRespondida(c.config);
    return {
      estado: "ABERTA",
      variante: c.pesquisa.variante === "CARINHAS" ? "CARINHAS" : "ESTRELAS",
      textos: this.textos(c.config),
      corPrimaria: this.corPrimaria(),
      linkGoogle: c.config.linkGoogle ?? null,
    };
  }

  async responder(token: string, nota: number, comentario?: string): Promise<ResultadoResponder> {
    if (!notaValida(nota)) {
      throw new BadRequestException("A nota deve ser um inteiro de 1 a 5.");
    }

    const c = await this.classificar(token);
    if (c.tipo === "INDISPONIVEL") return { tipo: "INDISPONIVEL" };
    if (c.tipo === "RESPONDIDA") return { tipo: "JA_RESPONDIDA", view: this.viewRespondida(c.config) };

    const agora = new Date();
    const texto = comentario?.trim() ? comentario.trim() : null;
    // P12: gravacao condicional; duas respostas simultaneas dao uma OK e uma JA_RESPONDIDA.
    const gravadas = await this.prisma.pesquisaSatisfacao.updateMany({
      where: { id: c.pesquisa.id, respondidaEm: null, revogadaEm: null, expiraEm: { gt: agora } },
      data: { nota, comentario: texto, respondidaEm: agora, status: "RESPONDIDA" },
    });

    if (gravadas.count === 0) {
      const atual = await this.classificar(token);
      if (atual.tipo === "RESPONDIDA") return { tipo: "JA_RESPONDIDA", view: this.viewRespondida(atual.config) };
      return { tipo: "INDISPONIVEL" };
    }

    const { pesquisa } = c;
    // D-10: emitir o cupom nunca desfaz a nota ja gravada; falha vira `cupom: null`.
    const cupom = await this.emitirCupom(pesquisa, c.config, agora);
    // D-10: todos os efeitos saem em segundo plano; a resposta ao cliente nunca e aguardada por eles.
    const gravada: PesquisaSatisfacao = {
      ...pesquisa,
      nota,
      comentario: texto,
      respondidaEm: agora,
      status: "RESPONDIDA",
    };
    this.dispararEfeito(async () => {
      await this.aplicarEfeitosChatwoot(gravada, cupom);
      await this.enviarCupomWhatsApp(gravada);
      await this.agendarConviteGoogle(gravada);
    });

    return {
      tipo: "OK",
      resposta: {
        estado: "RESPONDIDA",
        cupom,
        textos: this.textos(c.config),
        corPrimaria: this.corPrimaria(),
        linkGoogle: c.config.linkGoogle ?? null,
      },
    };
  }

  /** Mesmo resultado generico para token invalido, inexistente, expirado, revogado e pesquisa desativada. */
  private async classificar(token: string): Promise<Classificacao> {
    if (typeof token !== "string" || !REGEX_TOKEN.test(token)) return { tipo: "INDISPONIVEL" };

    const pesquisa = await this.prisma.pesquisaSatisfacao.findUnique({ where: { token } });
    if (!pesquisa) return { tipo: "INDISPONIVEL" };

    const config = await this.configPesquisa.obter();
    if (!config.ativo) return { tipo: "INDISPONIVEL" };

    if (pesquisa.revogadaEm) return { tipo: "INDISPONIVEL" };
    if (pesquisa.expiraEm.getTime() <= Date.now()) return { tipo: "INDISPONIVEL" };
    if (pesquisa.respondidaEm) return { tipo: "RESPONDIDA", pesquisa, config };
    return { tipo: "ABERTA", pesquisa, config };
  }

  private viewRespondida(config: PesquisaConfigView): PesquisaPublicaView {
    return {
      estado: "RESPONDIDA",
      textos: this.textos(config),
      corPrimaria: this.corPrimaria(),
      linkGoogle: config.linkGoogle ?? null,
    };
  }

  private textos(config: PesquisaConfigView): TextosPagina {
    return {
      titulo: config.paginaTitulo,
      subtitulo: config.paginaSubtitulo,
      obrigadoSemRecompensa: config.paginaObrigadoSemRecompensa,
      googleTitulo: config.paginaGoogleTitulo,
      googleCorpo: config.paginaGoogleCorpo,
    };
  }

  private corPrimaria(): string {
    const { cor, ajustada } = corPrimariaAcessivel(this.config.get<string>("EMPRESA_COR_PRIMARIA"));
    if (ajustada && !this.avisoCorRegistrado) {
      this.avisoCorRegistrado = true;
      this.logger.warn("Cor primaria da empresa com contraste abaixo de 4,5:1; usando o fallback #0d6efd");
    }
    return cor;
  }

  // ---------------------------------------------------------------------------------------------
  // Recompensa: gasto do mes, elegibilidade e emissao (plano 52-03)
  // ---------------------------------------------------------------------------------------------

  /**
   * D-18/D-31: soma do desconto real dos cupons USADO no mes de America/Sao_Paulo, em centavos.
   * `inicio` inclusivo e `fim` exclusivo (o cupom usado em 01/12 01:00Z ainda conta em novembro).
   */
  async gastoDoMesCentavos(agora: Date = new Date()): Promise<number> {
    const { inicio, fim } = janelaMesSaoPaulo(agora);
    const soma = await this.prisma.cupomRecompensa.aggregate({
      _sum: { descontoAplicado: true },
      where: { status: "USADO", usadoEm: { gte: inicio, lt: fim } },
    });
    const valor = soma?._sum?.descontoAplicado;
    return valor === null || valor === undefined ? 0 : paraCentavos(String(valor));
  }

  /** D-18/D-19/D-46: na duvida (consulta falhando) nao promete recompensa. */
  private async avaliarRecompensa(
    telefone: string | null,
    cfg: PesquisaConfigView,
    agora: Date,
  ): Promise<Elegibilidade> {
    if (!telefone) return { disponivel: false };
    try {
      const tetoMensalCentavos = paraCentavos(String(cfg.tetoMensal));
      if ((await this.gastoDoMesCentavos(agora)) >= tetoMensalCentavos) {
        return { disponivel: false, motivo: "TETO_MENSAL" };
      }
      if (cfg.intervaloDias > 0) {
        const desde = new Date(agora.getTime() - Number(cfg.intervaloDias) * 86_400_000);
        const recentes = await this.prisma.cupomRecompensa.count({
          where: { telefone, criadoEm: { gte: desde } },
        });
        if (recentes > 0) return { disponivel: false, motivo: "INTERVALO" };
      }
      return { disponivel: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Falha ao avaliar recompensa (seguindo sem cupom) motivo=${msg}`);
      return { disponivel: false };
    }
  }

  private cupomPublico(
    cupom: Pick<CupomRecompensa, "codigo" | "percentual" | "teto" | "compraMinima" | "validadeAte">,
  ): CupomPublico {
    return {
      codigo: cupom.codigo,
      percentual: Number(String(cupom.percentual)),
      teto: Number(String(cupom.teto)),
      compraMinima: Number(String(cupom.compraMinima)),
      validadeAte: new Date(cupom.validadeAte).toISOString(),
    };
  }

  /**
   * D-15/D-16/D-45: emite UM cupom por pesquisa com snapshot da config. Nunca lanca (D-10).
   * P2002 em `pesquisaId` devolve o cupom existente; em `codigo` tenta outro ate 5 vezes.
   * Depois do create relê `revogadaEm` e cancela o cupom se a revogacao passou no meio (T-52-69).
   */
  private async emitirCupom(
    pesquisa: Pick<PesquisaSatisfacao, "id" | "telefone">,
    cfg: PesquisaConfigView,
    agora: Date,
  ): Promise<CupomPublico | null> {
    if (!pesquisa.telefone) return null;
    try {
      // Idempotencia: uma pesquisa tem no maximo um cupom (unique por pesquisaId).
      const existente = await this.prisma.cupomRecompensa.findUnique({ where: { pesquisaId: pesquisa.id } });
      if (existente) return existente.status === "EMITIDO" ? this.cupomPublico(existente) : null;

      if (!(await this.avaliarRecompensa(pesquisa.telefone, cfg, agora)).disponivel) return null;

      for (let tentativa = 1; tentativa <= 5; tentativa += 1) {
        try {
          const criado = await this.prisma.cupomRecompensa.create({
            data: {
              codigo: gerarCodigoCupom(cfg.prefixoCupom),
              pesquisaId: pesquisa.id,
              telefone: pesquisa.telefone,
              percentual: cfg.percentualDesconto,
              teto: cfg.tetoDesconto,
              compraMinima: cfg.compraMinima,
              validadeAte: new Date(agora.getTime() + Number(cfg.validadeCupomDias) * 86_400_000),
              status: "EMITIDO",
              envioCupomStatus: "PENDENTE",
            },
          });

          // T-52-69: a revogacao pode ter rodado entre a gravacao da nota e este create.
          const atual = await this.prisma.pesquisaSatisfacao.findUnique({
            where: { id: pesquisa.id },
            select: { revogadaEm: true },
          });
          if (atual?.revogadaEm) {
            try {
              await this.prisma.cupomRecompensa.updateMany({
                where: { id: criado.id, status: "EMITIDO" },
                data: { status: "CANCELADO" },
              });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              this.logger.warn(`Falha ao cancelar cupom de pesquisa revogada pesquisaId=${pesquisa.id} motivo=${msg}`);
            }
            return null;
          }
          return this.cupomPublico(criado);
        } catch (err) {
          const prismaErro = err as { code?: string; meta?: { target?: unknown }; message?: string };
          if (prismaErro?.code === "P2002") {
            const alvo = Array.isArray(prismaErro.meta?.target)
              ? (prismaErro.meta?.target as string[]).join(",")
              : String(prismaErro.meta?.target ?? "");
            if (alvo.includes("pesquisaId")) {
              const ja = await this.prisma.cupomRecompensa.findUnique({ where: { pesquisaId: pesquisa.id } });
              return ja ? this.cupomPublico(ja) : null;
            }
            if (alvo.includes("codigo") && tentativa < 5) continue;
          }
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Falha ao emitir cupom pesquisaId=${pesquisa.id} motivo=${msg}`);
          return null;
        }
      }
      this.logger.warn(`Falha ao emitir cupom pesquisaId=${pesquisa.id} motivo=colisao_de_codigo`);
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Falha ao emitir cupom pesquisaId=${pesquisa.id} motivo=${msg}`);
      return null;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Mensagens de WhatsApp: cupom na hora, convite do Google com atraso humano (plano 52-05)
  // ---------------------------------------------------------------------------------------------

  /**
   * D-21/D-22/D-49: mensagem do cupom, sem link e sem atraso. Nunca lanca. Pesquisa anonimizada,
   * cupom inexistente ou fora de EMITIDO, pesquisa revogada e telefone no opt-out nao recebem nada
   * (a supressao e consultada imediatamente antes do envio, nao so na criacao).
   */
  private async enviarCupomWhatsApp(
    pesquisa: PesquisaSatisfacao,
    opcoes: { confirmarEnvioIncerto?: boolean } = {},
    agora: Date = new Date(),
  ): Promise<ResultadoEnvio> {
    try {
      if (pesquisa.conversationId === null || !pesquisa.telefone) return "IGNORADO";

      const linha = await this.prisma.cupomRecompensa.findUnique({ where: { pesquisaId: pesquisa.id } });
      if (!linha) return "IGNORADO";

      const marcarNaoAplicavel = () => this.gravarEnvio("cupom", linha.id, "NAO_APLICAVEL");
      if (linha.status !== "EMITIDO" || pesquisa.revogadaEm) {
        await marcarNaoAplicavel();
        return "NAO_APLICAVEL";
      }
      const suprimido = await this.prisma.pesquisaSupressao.findUnique({ where: { telefone: pesquisa.telefone } });
      if (suprimido) {
        await marcarNaoAplicavel();
        return "NAO_APLICAVEL";
      }

      const cfg = await this.configPesquisa.obter();
      const texto = renderizarTexto(
        cfg.textoPosResposta,
        montarVariaveisMensagem({
          linkGoogle: cfg.linkGoogle ?? null,
          cupom: {
            codigo: linha.codigo,
            percentual: Number(String(linha.percentual)),
            teto: Number(String(linha.teto)),
            compraMinima: Number(String(linha.compraMinima)),
            validadeAte: linha.validadeAte,
          },
          empresaNome: this.config.get<string>("EMPRESA_NOME") ?? "",
          cfg,
        }),
      );

      return await this.enviarComReserva({
        canal: "cupom",
        id: linha.id,
        conversationId: String(pesquisa.conversationId),
        texto,
        pesquisaId: pesquisa.id,
        statusAtual: linha.envioCupomStatus,
        reservadoEm: linha.envioCupomReservadoEm,
        confirmar: opcoes.confirmarEnvioIncerto === true,
        agora,
      });
    } catch (err) {
      this.logger.warn(`Falha ao enviar o cupom pesquisaId=${pesquisa.id}: ${mensagemDeErro(err)}`);
      return "PENDENTE";
    }
  }

  /**
   * D-21/UI-D08: agenda o convite do Google com atraso humano entre 60 e 180 s (uma mensagem
   * separada do cupom, para qualquer nota). Sem link na config nada e agendado.
   */
  private async agendarConviteGoogle(pesquisa: PesquisaSatisfacao): Promise<void> {
    try {
      if (pesquisa.conversationId === null || !pesquisa.telefone) return;
      const cfg = await this.configPesquisa.obter();
      if (!cfg.linkGoogle) {
        await this.gravarEnvio("convite", pesquisa.id, "NAO_APLICAVEL");
        return;
      }
      // D-49: quem pediu SAIR nao recebe nem o agendamento (e a checagem se repete no envio).
      const suprimido = await this.prisma.pesquisaSupressao.findUnique({ where: { telefone: pesquisa.telefone } });
      if (suprimido) {
        await this.gravarEnvio("convite", pesquisa.id, "NAO_APLICAVEL");
        return;
      }

      const chave = `convite:${pesquisa.id}`;
      this.convitesAgendados.add(chave);
      agendarEnvioFechamento(chave, sortearAtrasoHumanoMs(ATRASO_CONVITE_MIN_S, ATRASO_CONVITE_MAX_S), () =>
        this.dispararEfeito(async () => {
          this.convitesAgendados.delete(chave);
          await this.enviarConviteGoogle(pesquisa.id);
        }),
      );
    } catch (err) {
      this.logger.warn(`Falha ao agendar o convite pesquisaId=${pesquisa.id}: ${mensagemDeErro(err)}`);
    }
  }

  /**
   * D-21/D-22/D-49: convite do Google. Rele a pesquisa e a config no momento do envio, so usa
   * `link_google` e `nome_empresa` (nunca nada do cupom) e respeita revogacao e opt-out checados
   * na hora, mesmo que o timer nao tenha sido cancelado. Nunca lanca.
   */
  private async enviarConviteGoogle(
    pesquisaId: string,
    opcoes: { confirmarEnvioIncerto?: boolean } = {},
    agora: Date = new Date(),
  ): Promise<ResultadoEnvio> {
    try {
      const pesquisa = await this.prisma.pesquisaSatisfacao.findUnique({ where: { id: pesquisaId } });
      if (!pesquisa || pesquisa.conversationId === null || !pesquisa.telefone) return "IGNORADO";

      const marcarNaoAplicavel = () => this.gravarEnvio("convite", pesquisa.id, "NAO_APLICAVEL");
      if (pesquisa.revogadaEm) {
        await marcarNaoAplicavel();
        return "NAO_APLICAVEL";
      }

      const status = pesquisa.envioConviteStatus;
      if (status === "ENVIANDO") {
        if (!opcoes.confirmarEnvioIncerto) return "IGNORADO";
      } else if (status !== "PENDENTE" && status !== "FALHA") {
        return "IGNORADO";
      }

      const cfg = await this.configPesquisa.obter();
      if (!cfg.linkGoogle) {
        await marcarNaoAplicavel();
        return "NAO_APLICAVEL";
      }
      const suprimido = await this.prisma.pesquisaSupressao.findUnique({ where: { telefone: pesquisa.telefone } });
      if (suprimido) {
        await marcarNaoAplicavel();
        return "NAO_APLICAVEL";
      }

      const texto = renderizarTexto(cfg.textoConviteGoogle, {
        link_google: cfg.linkGoogle,
        nome_empresa: this.config.get<string>("EMPRESA_NOME") ?? "",
      });

      return await this.enviarComReserva({
        canal: "convite",
        id: pesquisa.id,
        conversationId: String(pesquisa.conversationId),
        texto,
        pesquisaId: pesquisa.id,
        statusAtual: status,
        reservadoEm: pesquisa.envioConviteReservadoEm,
        confirmar: opcoes.confirmarEnvioIncerto === true,
        agora,
      });
    } catch (err) {
      this.logger.warn(`Falha ao enviar o convite pesquisaId=${pesquisaId}: ${mensagemDeErro(err)}`);
      return "PENDENTE";
    }
  }

  /**
   * D-47/T-52-67: reserva ANTES de enviar (updateMany condicionado, contagem 1). Quando o status e
   * ENVIANDO (resultado incerto de um ciclo anterior), confere no Chatwoot se a mensagem ja existe
   * antes de reenviar; lista indisponivel nao reenvia (prefere nao duplicar).
   */
  private async enviarComReserva(dados: {
    canal: "cupom" | "convite";
    id: string;
    conversationId: string;
    texto: string;
    pesquisaId: string;
    statusAtual: string;
    reservadoEm: Date | null;
    confirmar: boolean;
    agora: Date;
  }): Promise<ResultadoEnvio> {
    const pendenteOuFalha = dados.statusAtual === "PENDENTE" || dados.statusAtual === "FALHA";
    const incerto = dados.statusAtual === "ENVIANDO";

    if (!pendenteOuFalha) {
      if (!incerto || !dados.confirmar) return "IGNORADO";
      const desde = dados.reservadoEm ? dados.reservadoEm.getTime() : 0;
      const jaEnviada = await this.mensagemJaEnviada(dados.conversationId, dados.texto, desde);
      if (jaEnviada === null) return "PENDENTE";
      if (jaEnviada) {
        await this.gravarEnvio(dados.canal, dados.id, "ENVIADA");
        return "ENVIADA";
      }
    }

    // D-47: a reserva por canal e o unico gate do envio; contagem diferente de 1 = outro ciclo reservou.
    const reservou =
      dados.canal === "cupom"
        ? await this.reservarEnvio("cupom", dados.id, dados.agora, incerto)
        : await this.reservarEnvio("convite", dados.id, dados.agora, incerto);
    if (!reservou) return "IGNORADO";

    return this.enviarMensagem(dados.canal, dados.id, dados.conversationId, dados.texto, dados.pesquisaId);
  }

  /** updateMany condicionado: PENDENTE ou FALHA (e ENVIANDO velho na re-tentativa) -> ENVIANDO. */
  private async reservarEnvio(
    canal: "cupom" | "convite",
    id: string,
    agora: Date,
    aceitarReservaVelha: boolean,
  ): Promise<boolean> {
    try {
      const limiteVelho = new Date(agora.getTime() - IDADE_RESERVA_VELHA_MS);
      if (canal === "cupom") {
        const { count } = await this.prisma.cupomRecompensa.updateMany({
          where: {
            id,
            OR: [
              { envioCupomStatus: { in: ["PENDENTE", "FALHA"] } },
              ...(aceitarReservaVelha
                ? [{ envioCupomStatus: "ENVIANDO", envioCupomReservadoEm: { lt: limiteVelho } }]
                : []),
            ],
          },
          data: { envioCupomStatus: "ENVIANDO", envioCupomReservadoEm: agora },
        });
        return count === 1;
      }
      const { count } = await this.prisma.pesquisaSatisfacao.updateMany({
        where: {
          id,
          OR: [
            { envioConviteStatus: { in: ["PENDENTE", "FALHA"] } },
            ...(aceitarReservaVelha
              ? [{ envioConviteStatus: "ENVIANDO", envioConviteReservadoEm: { lt: limiteVelho } }]
              : []),
          ],
        },
        data: { envioConviteStatus: "ENVIANDO", envioConviteReservadoEm: agora },
      });
      return count === 1;
    } catch (err) {
      this.logger.warn(`Falha ao reservar o envio de ${canal} id=${id}: ${mensagemDeErro(err)}`);
      return false;
    }
  }

  /** Envia pelo Chatwoot e classifica o resultado: HTTP respondido ou enabled falso = FALHA definitiva. */
  private async enviarMensagem(
    canal: "cupom" | "convite",
    id: string,
    conversationId: string,
    texto: string,
    pesquisaId: string,
  ): Promise<ResultadoEnvio> {
    try {
      const resultado = await this.chatwoot.sendOutgoingMessage(conversationId, texto);
      if (resultado?.enabled === true) {
        await this.gravarEnvio(canal, id, "ENVIADA");
        return "ENVIADA";
      }
      await this.gravarEnvio(canal, id, "FALHA");
      this.logger.warn(`Envio de ${canal} desabilitado pesquisaId=${pesquisaId} motivo=chatwoot_desabilitado`);
      return "FALHA";
    } catch (err) {
      const respostaHttp = (err as { response?: unknown })?.response !== undefined;
      if (respostaHttp) {
        await this.gravarEnvio(canal, id, "FALHA");
        this.logger.warn(`Falha ao enviar ${canal} pesquisaId=${pesquisaId}: ${mensagemDeErro(err)}`);
        return "FALHA";
      }
      // Sem resposta (tempo esgotado ou rede): resultado incerto, fica ENVIANDO para a re-tentativa
      // conferir no Chatwoot antes de reenviar.
      this.logger.warn(`Envio de ${canal} com resultado incerto pesquisaId=${pesquisaId}: ${mensagemDeErro(err)}`);
      return "PENDENTE";
    }
  }

  private async gravarEnvio(canal: "cupom" | "convite", id: string, status: string): Promise<void> {
    try {
      if (canal === "cupom") {
        await this.prisma.cupomRecompensa.updateMany({ where: { id }, data: { envioCupomStatus: status } });
      } else {
        await this.prisma.pesquisaSatisfacao.updateMany({ where: { id }, data: { envioConviteStatus: status } });
      }
    } catch (err) {
      this.logger.warn(`Falha ao gravar o envio de ${canal} id=${id}: ${mensagemDeErro(err)}`);
    }
  }

  /**
   * D-47: confere no Chatwoot se uma mensagem de saida com o mesmo texto ja foi criada desde a
   * reserva (as 20 mais recentes, sem afterId). `null` = indeterminado (lista indisponivel).
   */
  private async mensagemJaEnviada(conversationId: string, texto: string, desdeMs: number): Promise<boolean | null> {
    try {
      const mensagens = await this.chatwoot.listMessagesAfter(conversationId);
      if (!Array.isArray(mensagens)) return null;
      const alvo = normalizarConteudo(texto);
      return mensagens.some((item) => {
        if (!item || typeof item !== "object") return false;
        const mensagem = item as { message_type?: unknown; content?: unknown; created_at?: unknown };
        if (mensagem.message_type !== 1 && mensagem.message_type !== "outgoing") return false;
        if (normalizarConteudo(String(mensagem.content ?? "")) !== alvo) return false;
        const quando = criadaEmMs(mensagem.created_at);
        return quando !== null && quando >= desdeMs - 60_000;
      });
    } catch (err) {
      this.logger.warn(`Falha ao conferir mensagem ja enviada conversationId=${conversationId}: ${mensagemDeErro(err)}`);
      return null;
    }
  }

  /** D-28: le conversa -> inbox e diz se o CSAT nativo esta ligado (null = nao foi possivel ler). */
  private async csatNativoLigado(conversationId: string): Promise<boolean | null> {
    try {
      const conversa = await this.chatwoot.getConversation(conversationId);
      const inboxId = conversa?.inbox_id;
      if (typeof inboxId !== "number") {
        this.logger.warn(`Leitura da inbox ignorada conversationId=${conversationId} motivo=inbox_id_ausente`);
        return null;
      }
      const inbox = await this.chatwoot.getInbox(inboxId);
      if (!inbox) {
        this.logger.warn(`Leitura da inbox sem retorno conversationId=${conversationId} inboxId=${inboxId}`);
        return null;
      }
      if (inbox.csat_survey_enabled === true) {
        this.logger.warn(`CSAT nativo ligado na inbox ${inboxId}: nenhuma input_csat sera criada (conversationId=${conversationId})`);
        return true;
      }
      return false;
    } catch (err) {
      this.logger.warn(
        `Falha ao ler a inbox conversationId=${conversationId} (seguindo como CSAT nativo desligado): ${mensagemDeErro(err)}`,
      );
      return null;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Opt-out (D-49): quem responde SAIR deixa de receber pesquisa e convite
  // ---------------------------------------------------------------------------------------------

  /**
   * D-49: grava o telefone na lista de supressao. Upsert idempotente (a mesma mensagem pode chegar
   * duas vezes); log somente com o telefone mascarado (T-52-20).
   */
  async registrarOptOut(telefone: string): Promise<void> {
    await this.prisma.pesquisaSupressao.upsert({
      where: { telefone },
      create: { telefone, origem: "SAIR" },
      update: {},
    });
    this.logger.log(`Opt-out registrado telefone=${mascararTelefone(telefone)}`);
  }

  // ---------------------------------------------------------------------------------------------
  // Re-tentativa e housekeeping (D-47)
  // ---------------------------------------------------------------------------------------------

  /**
   * D-47: re-tenta cupom, convite e CSAT nativo pendentes. Nunca toca itens com menos de 5 minutos,
   * com 3 dias ou mais, ou com 6 tentativas; nunca toca pesquisa anonimizada ou revogada; incrementa
   * `tentativasEnvio` UMA vez por pesquisa por ciclo e nunca lanca por causa de uma pesquisa.
   */
  async reenviarPendentes(
    agora: Date = new Date(),
  ): Promise<{ candidatos: number; cupons: number; convites: number; csat: number; falhas: number }> {
    const resultado = { candidatos: 0, cupons: 0, convites: 0, csat: 0, falhas: 0 };
    try {
      const inicio = new Date(agora.getTime() - IDADE_MAXIMA_REENVIO_MS);
      const limiteMinimo = new Date(agora.getTime() - IDADE_MINIMA_REENVIO_MS);
      const velho = new Date(agora.getTime() - IDADE_RESERVA_VELHA_MS);
      const limiteCsat = new Date(agora.getTime() - LIMITE_CSAT_NATIVO_MS);

      const linhas = await this.prisma.pesquisaSatisfacao.findMany({
        where: {
          respondidaEm: { gte: inicio, lt: limiteMinimo },
          revogadaEm: null,
          tentativasEnvio: { lt: MAX_TENTATIVAS_ENVIO },
        },
      });

      for (const pesquisa of linhas) {
        if (pesquisa.conversationId === null || !pesquisa.telefone) continue;

        const cupom = await this.prisma.cupomRecompensa.findUnique({ where: { pesquisaId: pesquisa.id } });
        const cupomPendente =
          cupom !== null &&
          (cupom.envioCupomStatus === "PENDENTE" ||
            cupom.envioCupomStatus === "FALHA" ||
            (cupom.envioCupomStatus === "ENVIANDO" &&
              cupom.envioCupomReservadoEm !== null &&
              cupom.envioCupomReservadoEm.getTime() < velho.getTime()));
        const convitePendente =
          pesquisa.envioConviteStatus === "PENDENTE" ||
          pesquisa.envioConviteStatus === "FALHA" ||
          (pesquisa.envioConviteStatus === "ENVIANDO" &&
            pesquisa.envioConviteReservadoEm !== null &&
            pesquisa.envioConviteReservadoEm.getTime() < velho.getTime());
        const csatPendente = this.csatPendente(pesquisa, limiteCsat);

        if (!cupomPendente && !convitePendente && !csatPendente) continue;

        resultado.candidatos += 1;
        let falhou = false;

        if (cupomPendente) {
          const envio = await this.enviarCupomWhatsApp(
            pesquisa,
            { confirmarEnvioIncerto: cupom?.envioCupomStatus === "ENVIANDO" },
            agora,
          );
          if (envio === "ENVIADA") resultado.cupons += 1;
          else if (envio === "FALHA" || envio === "PENDENTE") falhou = true;
        }

        if (convitePendente) {
          const envio = await this.enviarConviteGoogle(
            pesquisa.id,
            { confirmarEnvioIncerto: pesquisa.envioConviteStatus === "ENVIANDO" },
            agora,
          );
          if (envio === "ENVIADA") resultado.convites += 1;
          else if (envio === "FALHA" || envio === "PENDENTE") falhou = true;
        }

        if (csatPendente) {
          const estado = await this.reconciliarCsatNativo(pesquisa, agora);
          if (estado === "OK") resultado.csat += 1;
          else if (estado === "FALHA" || estado === "PENDENTE") falhou = true;
        }

        if (falhou) {
          resultado.falhas += 1;
          try {
            await this.prisma.pesquisaSatisfacao.update({
              where: { id: pesquisa.id },
              data: { tentativasEnvio: pesquisa.tentativasEnvio + 1 },
            });
          } catch (err) {
            this.logger.warn(`Falha ao incrementar tentativasEnvio pesquisaId=${pesquisa.id}: ${mensagemDeErro(err)}`);
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Falha na re-tentativa das pesquisas: ${mensagemDeErro(err)}`);
    }
    return resultado;
  }

  private csatPendente(pesquisa: PesquisaSatisfacao, limiteCsat: Date): boolean {
    const estado = pesquisa.chatwootCsat;
    if (estado !== "AGUARDANDO_MENSAGEM" && estado !== "MENSAGEM_FALHA" && estado !== "RESPOSTA_FALHA") return false;
    if (!pesquisa.enviadaEm) return false;
    return pesquisa.enviadaEm.getTime() >= limiteCsat.getTime();
  }

  /**
   * D-28: CSAT nativo na re-tentativa. Antes de criar a input_csat le a inbox (nativo ligado ->
   * NAO_APLICAVEL) e lista as mensagens incluindo as internas (input_csat existente e reutilizada,
   * nunca uma segunda). Lista indisponivel nao cria. RESPOSTA_FALHA so repete o PUT.
   */
  private async reconciliarCsatNativo(pesquisa: PesquisaSatisfacao, agora: Date): Promise<ResultadoCsat> {
    try {
      if (pesquisa.conversationId === null || pesquisa.revogadaEm) return "IGNORADO";
      const conversationId = String(pesquisa.conversationId);
      const estado = pesquisa.chatwootCsat;

      if (estado === "NAO_APLICAVEL" || estado === "OK") return "IGNORADO";
      if (estado === "RESPOSTA_FALHA" || estado === "MENSAGEM_OK") return this.enviarPutCsat(pesquisa);
      if (estado !== "AGUARDANDO_MENSAGEM" && estado !== "MENSAGEM_FALHA") return "IGNORADO";
      if (!pesquisa.enviadaEm || pesquisa.enviadaEm.getTime() < agora.getTime() - LIMITE_CSAT_NATIVO_MS) {
        return "IGNORADO";
      }

      const nativoLigado = await this.csatNativoLigado(conversationId);
      if (nativoLigado === true) {
        await this.gravarCsat(pesquisa.id, "NAO_APLICAVEL");
        return "NAO_APLICAVEL";
      }

      const mensagens = await this.chatwoot.listMessagesAfter(conversationId, undefined, { incluirInternas: true });
      if (!Array.isArray(mensagens)) {
        this.logger.warn(`Lista de mensagens indisponivel pesquisaId=${pesquisa.id} motivo=nao_criar_input_csat`);
        return "PENDENTE";
      }

      const existente = mensagens.some(
        (item) =>
          item !== null && typeof item === "object" && (item as { content_type?: unknown }).content_type === "input_csat",
      );
      if (!existente) {
        try {
          const criada = await this.chatwoot.createPrivateCsatMessage(conversationId, TEXTO_INPUT_CSAT);
          if (!(criada?.enabled === true || criada?.id !== undefined)) {
            await this.gravarCsat(pesquisa.id, "MENSAGEM_FALHA");
            this.logger.warn(`input_csat nao criada pesquisaId=${pesquisa.id} motivo=chatwoot_desabilitado`);
            return "FALHA";
          }
        } catch (err) {
          this.logger.warn(`Falha ao criar input_csat na re-tentativa pesquisaId=${pesquisa.id}: ${mensagemDeErro(err)}`);
          await this.gravarCsat(pesquisa.id, "MENSAGEM_FALHA");
          return "FALHA";
        }
      }

      await this.gravarCsat(pesquisa.id, "MENSAGEM_OK");
      return this.enviarPutCsat(pesquisa);
    } catch (err) {
      this.logger.warn(`Falha ao reconciliar o CSAT nativo pesquisaId=${pesquisa.id}: ${mensagemDeErro(err)}`);
      return "PENDENTE";
    }
  }

  private async enviarPutCsat(pesquisa: PesquisaSatisfacao): Promise<ResultadoCsat> {
    if (!pesquisa.conversationUuid) return "IGNORADO";
    try {
      const resultado = await this.chatwoot.submitCsatResponse(
        pesquisa.conversationUuid,
        pesquisa.nota ?? 0,
        pesquisa.comentario ?? undefined,
      );
      if (resultado?.enabled === true) {
        await this.gravarCsat(pesquisa.id, "OK");
        return "OK";
      }
      await this.gravarCsat(pesquisa.id, "RESPOSTA_FALHA");
      return "FALHA";
    } catch (err) {
      this.logger.warn(`Falha ao enviar a nota ao Chatwoot pesquisaId=${pesquisa.id}: ${mensagemDeErro(err)}`);
      await this.gravarCsat(pesquisa.id, "RESPOSTA_FALHA");
      return "FALHA";
    }
  }

  /**
   * Housekeeping idempotente (chamado pelo job do plano 52-06): cupons EMITIDO vencidos viram EXPIRADO.
   */
  async marcarCuponsExpirados(agora: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.cupomRecompensa.updateMany({
      where: { status: "EMITIDO", validadeAte: { lt: agora } },
      data: { status: "EXPIRADO" },
    });
    return count;
  }

  /**
   * D-10/D-12/D-13/D-14/D-28: efeitos da resposta no Chatwoot. Cada passo roda no proprio try/catch:
   * a falha de um nunca impede os outros, nunca lanca para fora do `dispararEfeito` e o log carrega
   * apenas pesquisaId e motivo (nunca telefone, token ou codigo do cupom). Pesquisa anonimizada
   * (conversationId nulo) nao recebe nenhum efeito.
   */
  private async aplicarEfeitosChatwoot(pesquisa: PesquisaSatisfacao, cupom: CupomPublico | null): Promise<void> {
    if (pesquisa.conversationId === null) return;
    const conversationId = String(pesquisa.conversationId);
    const cupomDaNota = cupom
      ? {
          codigo: cupom.codigo,
          percentual: cupom.percentual,
          teto: cupom.teto,
          validadeAte: new Date(cupom.validadeAte),
        }
      : null;

    // a) CSAT nativo: so com a input_csat ja criada (MENSAGEM_OK). AGUARDANDO_MENSAGEM e MENSAGEM_FALHA
    // ficam como estao: a re-tentativa (reenviarPendentes) cria a mensagem e envia a nota (D-28).
    if (pesquisa.chatwootCsat === "MENSAGEM_OK" && pesquisa.conversationUuid) {
      try {
        let novoEstado = "RESPOSTA_FALHA";
        const resultado = await this.chatwoot.submitCsatResponse(
          pesquisa.conversationUuid,
          pesquisa.nota ?? 0,
          pesquisa.comentario ?? undefined,
        );
        if (resultado?.enabled === true) novoEstado = "OK";
        else this.logger.warn(`Nota nao enviada ao Chatwoot pesquisaId=${pesquisa.id} motivo=chatwoot_desabilitado`);
        await this.gravarCsat(pesquisa.id, novoEstado);
      } catch (err) {
        this.logger.warn(`Falha ao enviar a nota ao Chatwoot pesquisaId=${pesquisa.id}: ${mensagemDeErro(err)}`);
        await this.gravarCsat(pesquisa.id, "RESPOSTA_FALHA");
      }
    }

    // b) Nota privada: o atendimento ve nota, variante, comentario e cupom na conversa.
    try {
      await this.chatwoot.postConversationNote(
        conversationId,
        montarNotaPrivada({
          nota: pesquisa.nota ?? 0,
          variante: pesquisa.variante,
          comentario: pesquisa.comentario ?? null,
          cupom: cupomDaNota,
        }),
      );
    } catch (err) {
      this.logger.warn(`Falha ao gravar a nota privada pesquisaId=${pesquisa.id}: ${mensagemDeErro(err)}`);
    }

    // c) Atributos do contato: so quando a conversa trouxe o contactId.
    if (pesquisa.contactId !== null) {
      try {
        await this.chatwoot.updateContactCustomAttributes(
          Number(pesquisa.contactId),
          montarAtributosContato({
            nota: pesquisa.nota ?? 0,
            respondidaEm: pesquisa.respondidaEm ?? new Date(),
            cupom: cupomDaNota ? { codigo: cupomDaNota.codigo, validadeAte: cupomDaNota.validadeAte } : null,
          }),
        );
      } catch (err) {
        this.logger.warn(`Falha ao atualizar os atributos do contato pesquisaId=${pesquisa.id}: ${mensagemDeErro(err)}`);
      }
    }

    // d) Etiquetas pela fila por conversa (leitura fresca + mescla, nunca sobrescreve escrita paralela).
    try {
      await enfileirarPorConversa(conversationId, () =>
        aplicarEtiquetasGerenciadas(
          this.chatwoot,
          conversationId,
          etiquetasDaPesquisa(pesquisa.nota ?? 0),
          ETIQUETAS_PESQUISA,
        ),
      );
    } catch (err) {
      this.logger.warn(`Falha ao aplicar as etiquetas da pesquisa pesquisaId=${pesquisa.id}: ${mensagemDeErro(err)}`);
    }
  }

  private async gravarCsat(pesquisaId: string, estado: string): Promise<void> {
    try {
      await this.prisma.pesquisaSatisfacao.update({ where: { id: pesquisaId }, data: { chatwootCsat: estado } });
    } catch (err) {
      this.logger.warn(`Falha ao gravar o estado do CSAT pesquisaId=${pesquisaId}: ${mensagemDeErro(err)}`);
    }
  }
}
