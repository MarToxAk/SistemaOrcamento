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
  aplicarEtiquetasGerenciadas,
  enfileirarPorConversa,
} from "../integrations/chatwoot/chatwoot-etiquetas";
import { PesquisaConfigService, type PesquisaConfigView } from "./pesquisa-config.service";
import {
  etiquetasDaPesquisa,
  montarAtributosContato,
  montarNotaPrivada,
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

type Classificacao =
  | { tipo: "INDISPONIVEL" }
  | { tipo: "RESPONDIDA"; pesquisa: PesquisaSatisfacao; config: PesquisaConfigView }
  | { tipo: "ABERTA"; pesquisa: PesquisaSatisfacao; config: PesquisaConfigView };

type Elegibilidade = { disponivel: boolean; motivo?: "TETO_MENSAL" | "INTERVALO" };

@Injectable()
export class PesquisaService implements GanchoPesquisaFechamento, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PesquisaService.name);
  private readonly efeitos = new Set<Promise<void>>();
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
    this.dispararEfeito(() => this.aplicarEfeitosChatwoot(gravada, cupom));

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
  // Efeitos em segundo plano
  // ---------------------------------------------------------------------------------------------

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
