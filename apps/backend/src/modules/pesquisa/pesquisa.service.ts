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
import type { PesquisaConfig, PesquisaSatisfacao } from "@prisma/client";

import { PrismaService } from "../database/prisma.service";
import {
  ChatwootAutomationService,
  type ConversaChatwootResumo,
  type GanchoPesquisaFechamento,
} from "../integrations/chatwoot/chatwoot-automation.service";
import { ChatwootService } from "../integrations/chatwoot/chatwoot.service";
import {
  REGEX_TOKEN,
  type Variante,
  formatarDataBR,
  formatarPercentual,
  formatarReais,
  gerarToken,
  normalizarTelefone,
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

const COR_PRIMARIA_PADRAO = "#0d6efd";
const TEXTO_INPUT_CSAT =
  "Pesquisa de satisfação enviada ao cliente. A resposta é registrada pela página da pesquisa.";
/** D-28: estados em que a conversa ja tem a input_csat que o PUT publico vai preencher. */
const ESTADOS_COM_INPUT_CSAT = ["MENSAGEM_OK", "OK", "RESPOSTA_FALHA"];

type Classificacao =
  | { tipo: "INDISPONIVEL" }
  | { tipo: "RESPONDIDA"; pesquisa: PesquisaSatisfacao; config: PesquisaConfig }
  | { tipo: "ABERTA"; pesquisa: PesquisaSatisfacao; config: PesquisaConfig };

@Injectable()
export class PesquisaService implements GanchoPesquisaFechamento, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PesquisaService.name);
  private readonly efeitos = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatwoot: ChatwootService,
    private readonly config: ConfigService,
    private readonly automation: ChatwootAutomationService,
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

  /** Dispara sem await; a promessa guardada nunca rejeita e se remove ao terminar. */
  private dispararEfeito(tarefa: () => Promise<void>): void {
    const promessa: Promise<void> = Promise.resolve()
      .then(tarefa)
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Efeito da pesquisa falhou: ${msg}`);
      })
      .finally(() => {
        this.efeitos.delete(promessa);
      });
    this.efeitos.add(promessa);
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
      const cfg = await this.prisma.pesquisaConfig.findUnique({ where: { id: "default" } });
      if (!cfg || !cfg.ativo) return null;

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

      const bloco = renderizarTexto(cfg.textoFechamento, {
        link: `${baseUrl}/pesquisa/${pesquisa.token}`,
        percentual: formatarPercentual(String(cfg.percentualDesconto)),
        teto: formatarReais(String(cfg.tetoDesconto)),
        compra_minima: formatarReais(String(cfg.compraMinima)),
        validade: formatarDataBR(new Date(agora.getTime() + Number(cfg.validadeCupomDias) * 86_400_000)),
        nome_empresa: this.config.get<string>("EMPRESA_NOME") ?? "",
        codigo: "",
        link_google: "",
      });
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
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
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
    this.dispararEfeito(() => this.enviarNotaAoChatwoot(pesquisa, nota, texto ?? undefined));

    return {
      tipo: "OK",
      resposta: {
        estado: "RESPONDIDA",
        cupom: null, // plano 52-03 preenche
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

    const config = await this.prisma.pesquisaConfig.findUnique({ where: { id: "default" } });
    if (!config || !config.ativo) return { tipo: "INDISPONIVEL" };

    if (pesquisa.revogadaEm) return { tipo: "INDISPONIVEL" };
    if (pesquisa.expiraEm.getTime() <= Date.now()) return { tipo: "INDISPONIVEL" };
    if (pesquisa.respondidaEm) return { tipo: "RESPONDIDA", pesquisa, config };
    return { tipo: "ABERTA", pesquisa, config };
  }

  private viewRespondida(config: PesquisaConfig): PesquisaPublicaView {
    return {
      estado: "RESPONDIDA",
      textos: this.textos(config),
      corPrimaria: this.corPrimaria(),
      linkGoogle: config.linkGoogle ?? null,
    };
  }

  private textos(config: PesquisaConfig): TextosPagina {
    return {
      titulo: config.paginaTitulo,
      subtitulo: config.paginaSubtitulo,
      obrigadoSemRecompensa: config.paginaObrigadoSemRecompensa,
      googleTitulo: config.paginaGoogleTitulo,
      googleCorpo: config.paginaGoogleCorpo,
    };
  }

  private corPrimaria(): string {
    return this.config.get<string>("EMPRESA_COR_PRIMARIA") || COR_PRIMARIA_PADRAO;
  }

  // ---------------------------------------------------------------------------------------------
  // Efeitos em segundo plano
  // ---------------------------------------------------------------------------------------------

  /**
   * Envia a nota ao CSAT nativo. So com a input_csat ja criada (MENSAGEM_OK); nos demais estados nada e
   * chamado e o estado fica como esta (a re-tentativa do plano 52-05 cuida de AGUARDANDO_MENSAGEM e
   * MENSAGEM_FALHA). Nunca rejeita.
   */
  private async enviarNotaAoChatwoot(
    pesquisa: Pick<PesquisaSatisfacao, "id" | "conversationUuid" | "chatwootCsat">,
    nota: number,
    comentario?: string,
  ): Promise<void> {
    if (pesquisa.chatwootCsat !== "MENSAGEM_OK" || !pesquisa.conversationUuid) return;

    let novoEstado = "RESPOSTA_FALHA";
    try {
      const resultado = await this.chatwoot.submitCsatResponse(pesquisa.conversationUuid, nota, comentario);
      if (resultado?.enabled === true) novoEstado = "OK";
      else this.logger.warn(`Nota nao enviada ao Chatwoot pesquisaId=${pesquisa.id} motivo=chatwoot_desabilitado`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Falha ao enviar a nota ao Chatwoot pesquisaId=${pesquisa.id}: ${msg}`);
    }
    try {
      await this.prisma.pesquisaSatisfacao.update({ where: { id: pesquisa.id }, data: { chatwootCsat: novoEstado } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Falha ao gravar o estado do CSAT pesquisaId=${pesquisa.id}: ${msg}`);
    }
  }
}
