import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { createHash } from "crypto";
import * as soap from "soap";

import { PrismaService } from "../../database/prisma.service";
import { AthosService } from "../athos/athos.service";
import { ChatwootService } from "../chatwoot/chatwoot.service";

export interface EmitirNfseInput {
  tomadorCnpj?: string;
  tomadorCpf?: string;
  tomadorNome?: string;
  tomadorEnderecoLogradouro?: string;
  tomadorEnderecoNumero?: string;
  tomadorEnderecoBairro?: string;
  tomadorEnderecoCep?: string;
  tomadorEnderecoCodigoMunicipio?: string;
  tomadorEnderecoUf?: string;
  servicoCodigo?: string; // ex: "24.01", "13.05", "14.08"
  codigoTributacaoNacional?: string; // override manual
  /** Ativa aplicacao de desconto na emissao da NFS-e (NFSD-01) */
  descontoAtivo?: boolean;
  /** Percentual de desconto (0-100) sobre valorServicos (NFSD-02) */
  descontoPorcentagem?: number;
  /** Valor fixo de desconto em reais (NFSD-03) */
  descontoValor?: number;
  /** @deprecated Mantido por compatibilidade; percentual agora usa sempre valorServicos */
  totalPago?: number;
  /** ID do cliente Athos selecionado explicitamente; quando informado substitui o lookup via orcamento (TOMAD-01) */
  clienteAthosId?: number;
}

type TomadorEndereco = {
  logradouro: string;
  numero: string;
  bairro: string;
  cep: string;
  codigoMunicipio: string;
  uf: string;
};

// ServiÃ§os disponÃ­veis para emissÃ£o de NFS-e
const SERVICOS: Record<string, { itemLista: string; codigoNacional: string; aliquotaIss: string; descricao: string }> = {
  "24.01":    { itemLista: "24.01", codigoNacional: "240101", aliquotaIss: "3.73", descricao: "ConfecÃ§Ã£o de carimbos, banners, placas e sinalizaÃ§Ã£o" },
  "24.01-02": { itemLista: "24.01", codigoNacional: "240102", aliquotaIss: "3.73", descricao: "GravaÃ§Ã£o de objetos e joias" },
  "13.05":    { itemLista: "13.05", codigoNacional: "130501", aliquotaIss: "3.73", descricao: "ComposiÃ§Ã£o grÃ¡fica e confecÃ§Ã£o de matrizes" },
  "14.08":    { itemLista: "14.08", codigoNacional: "140801", aliquotaIss: "3.73", descricao: "EncadernaÃ§Ã£o e acabamento" },
};

const DEFAULT_SERVICO = "24.01";
const CBS_RATE  = 0.009;  // 0.9%
const IBS_RATE  = 0.001;  // 0.1%

@Injectable()
export class NfseService {
  private readonly logger = new Logger(NfseService.name);

  private readonly CODIGO_MUNICIPIO  = "3520400";
  private readonly SERIE_RPS         = "RPS";

  private readonly DEFAULT_ENDPOINT = "https://ilhabela2.iibr.com.br/rps/3520400/1/soap/producao/rps";
  private readonly DEFAULT_AUX_URL  = "https://ilhabela2.iibr.com.br/rps/3520400/2/AUXILIARRPS";

  private get WSDL_URL()  { return (this.config.get<string>("NFSE_SOAP_URL")?.trim() || this.DEFAULT_ENDPOINT) + "?wsdl"; }
  private get ENDPOINT()  { return this.config.get<string>("NFSE_SOAP_URL")?.trim() || this.DEFAULT_ENDPOINT; }
  private get AUX_URL()   { return this.config.get<string>("NFSE_AUX_URL")?.trim()  || this.DEFAULT_AUX_URL;  }

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly athosService: AthosService,
    private readonly chatwootService: ChatwootService,
  ) {}

  private getToken(): string {
    return this.config.get<string>("NFSE_TOKEN") ?? "";
  }

  private getCnpjPrestador(): string {
    return this.config.get<string>("NFSE_CNPJ_PRESTADOR") ?? "";
  }

  private getInscricaoMunicipal(): string {
    return this.config.get<string>("NFSE_INSCRICAO_MUNICIPAL") ?? "";
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  private computeIntegridade(rpsXml: string, token?: string): string {
    const tkRaw = token ?? this.getToken();
    const tk = (typeof tkRaw === "string" ? tkRaw : String(tkRaw)).trim();

    let cleaned = rpsXml.replace(/[^\x20-\x7E]+/g, "");
    cleaned = cleaned.replace(/[ ]+/g, "");

    const combined = cleaned + tk;
    const bufUtf8 = Buffer.from(combined, "utf8");
    const bufLatin1 = Buffer.from(combined, "latin1");
    const hashUtf8 = createHash("sha512").update(bufUtf8).digest("hex");
    const hashLatin1 = createHash("sha512").update(bufLatin1).digest("hex");

    const debug = this.config.get<boolean>("NFSE_DEBUG_INTEGRIDADE") ?? false;
    if (debug) {
      this.logger.debug(`[INTEGRIDADE] cleaned: ${cleaned}`);
      this.logger.debug(`[INTEGRIDADE] token(hex utf8): ${Buffer.from(tk, "utf8").toString("hex")}`);
      this.logger.debug(`[INTEGRIDADE] combined(hex utf8): ${bufUtf8.toString("hex")}`);
      this.logger.debug(`[INTEGRIDADE] hashUtf8=${hashUtf8}`);
      this.logger.debug(`[INTEGRIDADE] hashLatin1=${hashLatin1}`);
    }

    return hashUtf8;
  }

  private buildCabecalho(): string {
    return `<cabecalho xmlns="http://www.abrasf.org.br/nfse.xsd" versao="2.04">
    <versaoDados>2.04</versaoDados>
</cabecalho>`;
  }

  private buildRpsXml(input: {
    numero: number;
    serie: string;
    dataEmissao: string;
    valorServicos: number;
    descontoIncondicionado: number;
    discriminacao: string;
    itemLista: string;
    codigoNacional: string;
    aliquotaIss: string;
    tomadorCpf?: string | null;
    tomadorCnpj?: string | null;
    tomadorNome?: string | null;
    tomadorEndereco?: { logradouro: string; numero: string; bairro: string; cep: string; codigoMunicipio: string; uf: string } | null;
  }): string {
    const valorCbs      = Number((input.valorServicos * CBS_RATE).toFixed(2));
    const valorIbs      = Number((input.valorServicos * IBS_RATE).toFixed(2));
    const aliquotaCbs   = (CBS_RATE * 100).toFixed(2);
    const aliquotaIbs   = (IBS_RATE * 100).toFixed(2);

    const docTomador = input.tomadorCnpj
      ? `<Cnpj>${input.tomadorCnpj}</Cnpj>`
      : input.tomadorCpf
        ? `<Cpf>${input.tomadorCpf}</Cpf>`
        : null;

    // Testado: Ilhabela EXIGE IdentificacaoTomador com CPF ou CNPJ.
    // Sem documento (consumidor final / sem-tomador) -> servidor retorna HTTP 500 sem mensagem.
    if (!docTomador) {
      throw new BadRequestException(
        "CPF ou CNPJ do cliente Ã© obrigatÃ³rio para emitir NFS-e em Ilhabela. " +
        "Informe o documento no campo correspondente.",
      );
    }

    const partes: string[] = [
      `\t\t\t<TomadorServico>`,
      `\t\t\t\t<IdentificacaoTomador>`,
      `\t\t\t\t\t<CpfCnpj>`,
      `\t\t\t\t\t\t${docTomador}`,
      `\t\t\t\t\t</CpfCnpj>`,
      `\t\t\t\t</IdentificacaoTomador>`,
      `\t\t\t\t<RazaoSocial>${this.escapeXml(input.tomadorNome ?? "CONSUMIDOR").slice(0, 150)}</RazaoSocial>`,
    ];

    if (input.tomadorEndereco) {
      partes.push(
        `\t\t\t\t<Endereco>`,
        `\t\t\t\t\t<Endereco>${this.escapeXml(input.tomadorEndereco.logradouro)}</Endereco>`,
        `\t\t\t\t\t<Numero>${this.escapeXml(input.tomadorEndereco.numero)}</Numero>`,
        `\t\t\t\t\t<Bairro>${this.escapeXml(input.tomadorEndereco.bairro)}</Bairro>`,
        `\t\t\t\t\t<CodigoMunicipio>${input.tomadorEndereco.codigoMunicipio}</CodigoMunicipio>`,
        `\t\t\t\t\t<Uf>${input.tomadorEndereco.uf}</Uf>`,
        `\t\t\t\t\t<Cep>${input.tomadorEndereco.cep.replace(/\D/g, "")}</Cep>`,
        `\t\t\t\t</Endereco>`,
      );
    }

    partes.push(`\t\t\t</TomadorServico>`);
    const tomadorXml = partes.join("\n");

    return `
\t<Rps>
\t\t<InfDeclaracaoPrestacaoServico Id="rps${input.numero}">
\t\t\t<Rps>
\t\t\t\t<IdentificacaoRps>
\t\t\t\t\t<Numero>${input.numero}</Numero>
\t\t\t\t\t<Serie>${input.serie}</Serie>
\t\t\t\t\t<Tipo>1</Tipo>
\t\t\t\t</IdentificacaoRps>
\t\t\t\t<DataEmissao>${input.dataEmissao}</DataEmissao>
\t\t\t\t<Status>1</Status>
\t\t\t</Rps>
\t\t\t<Competencia>${input.dataEmissao}</Competencia>
\t\t\t<Servico>
\t\t\t\t<Valores>
\t\t\t\t\t<ValorServicos>${input.valorServicos.toFixed(2)}</ValorServicos>
\t\t\t\t\t<ValorDeducoes>0.00</ValorDeducoes>
\t\t\t\t\t<ValorPis>0.00</ValorPis>
\t\t\t\t\t<ValorCofins>0.00</ValorCofins>
\t\t\t\t\t<ValorInss>0.00</ValorInss>
\t\t\t\t\t<ValorIr>0.00</ValorIr>
\t\t\t\t\t<ValorCsll>0.00</ValorCsll>
\t\t\t\t\t<ValorCbs>${valorCbs.toFixed(2)}</ValorCbs>
\t\t\t\t\t<AliquotaCbs>${aliquotaCbs}</AliquotaCbs>
\t\t\t\t\t<ValorIbs>${valorIbs.toFixed(2)}</ValorIbs>
\t\t\t\t\t<AliquotaIbs>${aliquotaIbs}</AliquotaIbs>
\t\t\t\t\t<OutrasRetencoes>0.00</OutrasRetencoes>
\t\t\t\t\t<Aliquota>${input.aliquotaIss}</Aliquota>
\t\t\t\t\t<DescontoIncondicionado>${input.descontoIncondicionado.toFixed(2)}</DescontoIncondicionado>
\t\t\t\t\t<DescontoCondicionado>0.00</DescontoCondicionado>
\t\t\t\t</Valores>
\t\t\t\t<IssRetido>2</IssRetido>
\t\t\t\t<ResponsavelRetencao>1</ResponsavelRetencao>
\t\t\t\t<ItemListaServico>${input.itemLista}</ItemListaServico>
\t\t\t\t<CodigoTributacaoNacional>${input.codigoNacional}</CodigoTributacaoNacional>
\t\t\t\t<Discriminacao>${this.escapeXml(input.discriminacao.replace(/[#:()\[\]{}]/g, " ").replace(/\s+/g, " ").trim()).slice(0, 2000)}</Discriminacao>
\t\t\t\t<CodigoMunicipio>${this.CODIGO_MUNICIPIO}</CodigoMunicipio>
\t\t\t</Servico>
\t\t\t<Prestador>
\t\t\t\t<CpfCnpj>
\t\t\t\t\t<Cnpj>${this.getCnpjPrestador()}</Cnpj>
\t\t\t\t</CpfCnpj>
\t\t\t\t<InscricaoMunicipal>${this.getInscricaoMunicipal()}</InscricaoMunicipal>
\t\t\t</Prestador>${tomadorXml ? "\n" + tomadorXml : ""}
\t\t</InfDeclaracaoPrestacaoServico>
\t</Rps>`;
  }

  private async getInfoNfse(): Promise<{ proximoRps: number; serieRps: string } | null> {
    try {
      const url = `${this.AUX_URL}?Metodo=info_nfse&Token=${this.getToken()}&CpfCnpjPrestador=${this.getCnpjPrestador()}`;
      const resp = await axios.get(url, { timeout: 15_000 });
      const raw = resp.data as Record<string, any>;
      const payload = (raw.data ?? raw) as Record<string, unknown>;
      const proximoRps = Number(payload.ProximoRPS ?? payload.proximoRPS ?? 0);
      const serieRps = String(payload.SerieRPS ?? payload.serieRPS ?? this.SERIE_RPS);
      if (!proximoRps || proximoRps <= 0) return null;
      return { proximoRps, serieRps };
    } catch (err) {
      this.logger.warn(`API Auxiliar info_nfse falhou: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private async enviarSoap(cabecalho: string, dados: string): Promise<string> {
    this.logger.log(`[SOAP] Endpoint: ${this.ENDPOINT}`);
    this.logger.log(`[SOAP] CNPJ: ${this.getCnpjPrestador()} | Token: ${this.getToken().slice(0, 6)}...`);
    this.logger.log(`[SOAP] nfseDadosMsg:\n${dados}`);

    const client = await soap.createClientAsync(this.WSDL_URL);
    client.setEndpoint(this.ENDPOINT);
    client.addSoapHeader(
      { "iibr:cnpjRemetente": this.getCnpjPrestador(), "iibr:token": this.getToken() },
      "", "iibr", "http://rps.iibr.com.br/",
    );

    return new Promise<string>((resolve, reject) => {
      (client as any).GerarNfse(
        { nfseCabecMsg: cabecalho, nfseDadosMsg: dados },
        (err: any, _res: any, rawResponse: string, _soapHeader: any, rawRequest: string) => {
          if (rawRequest) {
            this.logger.log(`[SOAP] Request enviado:\n${rawRequest}`);
          }
          if (err) {
            const status  = err?.response?.status;
            const body    = err?.response?.data ?? "";
            const headers = JSON.stringify(err?.response?.headers ?? {});
            this.logger.error(`[SOAP] ERRO status=${status}`);
            this.logger.error(`[SOAP] Response headers: ${headers}`);
            this.logger.error(`[SOAP] Response body: ${String(body).slice(0, 2000)}`);
            this.logger.error(`[SOAP] err.message: ${err?.message}`);
            this.logger.error(`[SOAP] Request que causou erro:\n${(client as any).lastRequest ?? "n/a"}`);
            reject(new Error(`Falha SOAP status=${status}: ${String(body || err?.message).slice(0, 300)}`));
          } else {
            this.logger.log(`[SOAP] Resposta recebida:\n${rawResponse?.slice(0, 2000)}`);
            resolve(rawResponse ?? "");
          }
        }
      );
    });
  }

  /**
   * Extrai e decodifica o conteudo de <outputXML> da resposta SOAP.
   * O servidor iiBrasil retorna o XML real como HTML entities dentro dessa tag.
   * Ex: &lt;NumeroNfse&gt;136&lt;/NumeroNfse&gt; -> <NumeroNfse>136</NumeroNfse>
   */
  private decodeOutputXml(soapResponse: string): string {
    // Tenta extrair o conteudo do outputXML
    const match = soapResponse.match(/<outputXML[^>]*>([\s\S]*?)<\/outputXML>/i);
    const raw = match?.[1] ?? soapResponse;

    // Decodifica HTML entities
    return raw
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  }

  private parseNumeroNfse(xml: string): string | null {
    const decoded = this.decodeOutputXml(xml);
    return decoded.match(/<NumeroNfse>(\d+)<\/NumeroNfse>/)?.[1] ?? null;
  }

  private parseCodigoVerificacao(xml: string): string | null {
    const decoded = this.decodeOutputXml(xml);
    return decoded.match(/<CodigoVerificacao>([^<]+)<\/CodigoVerificacao>/)?.[1]?.trim() ?? null;
  }

  private parseLinkNfse(xml: string): string | null {
    const decoded = this.decodeOutputXml(xml);
    const m = decoded.match(/<LinkNfse>([^<]+)<\/LinkNfse>/);
    if (!m?.[1]?.trim()) return null;
    try { return Buffer.from(m[1].trim(), "base64").toString("utf8"); } catch { return m[1].trim(); }
  }

  private parseErros(xml: string): string[] {
    const decoded = this.decodeOutputXml(xml);
    return [...decoded.matchAll(/<Mensagem>([^<]+)<\/Mensagem>/g)].map(m => m[1].trim());
  }

  private async findQuote(identifier: string) {
    const include = { customer: true, items: { orderBy: { sequence: "asc" } } };
    const numeric = /^\d+$/.test(identifier) ? Number(identifier) : null;

    if (numeric !== null) {
      const byExternal = await (this.prisma as any).quote.findFirst({ where: { externalQuoteId: BigInt(numeric) }, include });
      if (byExternal) return byExternal;
      return (this.prisma as any).quote.findFirst({ where: { internalNumber: numeric }, include });
    }
    return (this.prisma as any).quote.findFirst({ where: { id: identifier }, include });
  }

  private async buscarTomador(quote: any): Promise<{
    cnpj: string | null;
    cpf: string | null;
    nome: string | null;
    endereco: TomadorEndereco | null;
  }> {
    let cnpj:     string | null = null;
    let cpf:      string | null = null;
    let nome:     string | null = null; // Athos tem prioridade; chat e fallback
    let endereco: TomadorEndereco | null = null;

    try {
      const lookupId = String(quote.externalQuoteId ?? quote.internalNumber ?? "");
      this.logger.log(
        `[Tomador] buscando: lookupId="${lookupId}" externalQuoteId=${quote.externalQuoteId} internalNumber=${quote.internalNumber}`,
      );

      let athosData: Awaited<ReturnType<typeof this.athosService.buscarOrcamentoPorNumero>> | null = null;
      try {
        athosData = await this.athosService.buscarOrcamentoPorNumero(lookupId);
      } catch (err) {
        if (err instanceof NotFoundException) {
          this.logger.warn(
            `[Tomador] orcamento "${lookupId}" nao encontrado no Athos (NotFoundException) - sem dados do tomador`,
          );
          const nomeBusca = (quote.customer?.fullName ?? "").trim();
          if (nomeBusca.length >= 3) {
            try {
              const resultado = await this.athosService.buscarClientes({ nome: nomeBusca, take: 1 });
              if (resultado.items.length === 1) {
                const cli = resultado.items[0];
                nome     = cli.nome || nome;
                endereco = cli.endereco ?? endereco;
                if (cli.tipoPessoa === "juridico" && cli.documento?.replace(/\D/g,"").length === 14)
                  cnpj = cli.documento!.replace(/\D/g,"");
                else if (cli.tipoPessoa === "fisico" && cli.documento?.replace(/\D/g,"").length === 11)
                  cpf = cli.documento!.replace(/\D/g,"");
                this.logger.log(
                  `[Tomador] fallback nome="${nomeBusca}" â†’ encontrado: tipo=${cli.tipoPessoa} doc=${cli.documento ?? "null"}`,
                );
              } else {
                this.logger.warn(
                  `[Tomador] fallback nome="${nomeBusca}" â†’ ${resultado.total} resultados (ambiguo ou ausente) â€” sem dados`,
                );
              }
            } catch (fbErr) {
              this.logger.warn(
                `[Tomador] fallback nome="${nomeBusca}" â†’ erro: ${fbErr instanceof Error ? fbErr.message : String(fbErr)}`,
              );
            }
          }
        } else {
          this.logger.warn(
            `[Tomador] erro ao buscar orcamento "${lookupId}" no Athos: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      if (athosData) {
        const clienteId = (athosData as any)?.mapped?.idcliente;
        this.logger.log(`[Tomador] orcamento encontrado - idcliente=${clienteId}`);

        if (clienteId != null && clienteId > 0) {
          const info = await this.athosService.buscarClientePorId(clienteId);
          if (info) {
            nome     = info.name || quote.customer?.fullName || null;
            endereco = (info as any).endereco ?? null;
            if (info.type === "juridico" && info.documento?.length === 14) cnpj = info.documento;
            else if (info.type === "fisico"   && info.documento?.length === 11) cpf  = info.documento;
            this.logger.log(
              `[Tomador] cliente encontrado - tipo=${info.type} nome="${nome}" documento=${info.documento ?? "null"}`,
            );
          } else {
            this.logger.warn(`[Tomador] buscarClientePorId(${clienteId}) retornou null`);
          }
        } else {
          this.logger.warn(
            `[Tomador] idcliente=${clienteId} invalido ou ausente no mapeamento do orcamento "${lookupId}"`,
          );
          const nomeBusca = ((athosData as any)?.mapped?.cliente ?? quote.customer?.fullName ?? "").trim();
          if (nomeBusca.length >= 3) {
            try {
              const resultado = await this.athosService.buscarClientes({ nome: nomeBusca, take: 1 });
              if (resultado.items.length === 1) {
                const cli = resultado.items[0];
                nome     = cli.nome || nome;
                endereco = cli.endereco ?? endereco;
                if (cli.tipoPessoa === "juridico" && cli.documento?.replace(/\D/g,"").length === 14)
                  cnpj = cli.documento!.replace(/\D/g,"");
                else if (cli.tipoPessoa === "fisico" && cli.documento?.replace(/\D/g,"").length === 11)
                  cpf = cli.documento!.replace(/\D/g,"");
                this.logger.log(
                  `[Tomador] fallback nome="${nomeBusca}" â†’ encontrado: tipo=${cli.tipoPessoa} doc=${cli.documento ?? "null"}`,
                );
              } else {
                this.logger.warn(
                  `[Tomador] fallback nome="${nomeBusca}" â†’ ${resultado.total} resultados (ambiguo ou ausente) â€” sem dados`,
                );
              }
            } catch (fbErr) {
              this.logger.warn(
                `[Tomador] fallback nome="${nomeBusca}" â†’ erro: ${fbErr instanceof Error ? fbErr.message : String(fbErr)}`,
              );
            }
          }
        }
      }
    } catch (err) {
      this.logger.warn(
        `[Tomador] falha inesperada ao buscar tomador no Athos: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Fallback para nome do chat se Athos nÃ£o encontrou
    if (!nome) nome = quote.customer?.fullName ?? null;

    return { cnpj, cpf, nome, endereco };
  }

  private sanitizeTomadorEndereco(endereco: TomadorEndereco): TomadorEndereco {
    return {
      logradouro: endereco.logradouro.trim(),
      numero: endereco.numero.trim(),
      bairro: endereco.bairro.trim(),
      cep: endereco.cep.replace(/\D/g, ""),
      codigoMunicipio: endereco.codigoMunicipio.replace(/\D/g, ""),
      uf: endereco.uf.trim().toUpperCase(),
    };
  }

  private buildTomadorEnderecoFromInput(input?: EmitirNfseInput): TomadorEndereco | null {
    if (!input) return null;

    const raw = {
      logradouro: input.tomadorEnderecoLogradouro?.trim() ?? "",
      numero: input.tomadorEnderecoNumero?.trim() ?? "",
      bairro: input.tomadorEnderecoBairro?.trim() ?? "",
      cep: input.tomadorEnderecoCep?.trim() ?? "",
      codigoMunicipio: input.tomadorEnderecoCodigoMunicipio?.trim() ?? "",
      uf: input.tomadorEnderecoUf?.trim() ?? "",
    };

    const hasAnyField = Object.values(raw).some((value) => value.length > 0);
    if (!hasAnyField) return null;

    const hasAllFields = Object.values(raw).every((value) => value.length > 0);
    if (!hasAllFields) {
      throw new BadRequestException(
        "EndereÃ§o do tomador incompleto. Informe logradouro, nÃºmero, bairro, CEP, cÃ³digo do municÃ­pio (IBGE) e UF.",
      );
    }

    const sanitized = this.sanitizeTomadorEndereco(raw);
    if (sanitized.cep.length !== 8) {
      throw new BadRequestException("CEP do tomador invÃ¡lido. Informe 8 dÃ­gitos.");
    }
    if (sanitized.codigoMunicipio.length !== 7) {
      throw new BadRequestException("CÃ³digo do municÃ­pio do tomador invÃ¡lido. Informe 7 dÃ­gitos do IBGE.");
    }
    if (sanitized.uf.length !== 2) {
      throw new BadRequestException("UF do tomador invÃ¡lida. Informe 2 letras.");
    }

    return sanitized;
  }

  getServicosDisponiveis() {
    return Object.entries(SERVICOS).map(([key, s]) => ({
      codigo: key,
      itemLista: s.itemLista,
      codigoNacional: s.codigoNacional,
      descricao: s.descricao,
    }));
  }

  async emitir(quoteId: string, input?: EmitirNfseInput) {
    const quote = await this.findQuote(quoteId);
    if (!quote) throw new BadRequestException("OrÃ§amento nÃ£o encontrado");

    if (quote.status === "CANCELADO") {
      throw new BadRequestException("NÃ£o Ã© possÃ­vel emitir NFS-e para orÃ§amentos cancelados.");
    }

    if (quote.nfseNumero) {
      return {
        jaEmitida: true,
        numero: quote.nfseNumero,
        codigoVerificacao: quote.nfseCodigoVerificacao,
        link: quote.nfseLink ?? null,
        emitidaEm: quote.nfseEmitidaEm,
      };
    }

    // Resolve serviÃ§o
    const servicoKey = input?.servicoCodigo ?? DEFAULT_SERVICO;
    const servico = SERVICOS[servicoKey] ?? SERVICOS[DEFAULT_SERVICO];

    // Resolve RPS nÃºmero e sÃ©rie
    let rpsNumero = Number(quote.internalNumber);
    let rpsSerie  = this.SERIE_RPS;
    const infoNfse = await this.getInfoNfse();
    if (infoNfse) {
      rpsNumero = infoNfse.proximoRps;
      rpsSerie  = infoNfse.serieRps || this.SERIE_RPS;
      this.logger.log(`[RPS] AUXILIARRPS proximoRPS=${rpsNumero} serie=${rpsSerie} (proximo a emitir â€” sem +1)`);
    } else {
      this.logger.warn(`API Auxiliar indisponÃ­vel, usando internalNumber=${rpsNumero} como RPS`);
    }

    const dataEmissao    = new Date().toISOString().slice(0, 10);
    const valorServicosBruto  = Number(quote.total);

    // Calcular desconto (NFSD-01..04)
    let descontoIncondicionado = 0;
    if (input?.descontoAtivo === true) {
      const base = valorServicosBruto;

      if (input.descontoPorcentagem != null) {
        if (input.descontoPorcentagem < 0 || input.descontoPorcentagem > 100) {
          throw new BadRequestException("descontoPorcentagem deve estar entre 0 e 100.");
        }
        descontoIncondicionado = Number((base * input.descontoPorcentagem / 100).toFixed(2));
      } else if (input.descontoValor != null) {
        if (input.descontoValor < 0) {
          throw new BadRequestException("descontoValor nao pode ser negativo.");
        }
        descontoIncondicionado = Number(input.descontoValor.toFixed(2));
      }

      if (descontoIncondicionado > valorServicosBruto) {
        throw new BadRequestException(
          `descontoIncondicionado (${descontoIncondicionado.toFixed(2)}) nao pode ser maior que valorServicos (${valorServicosBruto.toFixed(2)}).`,
        );
      }
    }

    const valorServicos = Number((valorServicosBruto - descontoIncondicionado).toFixed(2));

    const itensDesc = (quote.items ?? [])
      .map((item: any, i: number) => `${i + 1}. ${item.shortDescription || item.description} (${Number(item.quantity)}x) - R$ ${Number(item.finalPrice).toFixed(2)}`)
      .join("; ");
    const discriminacao = itensDesc
      ? `Orcamento ${quote.internalNumber} - ${itensDesc}`
      : `Orcamento ${quote.internalNumber}`;

    // Dados do tomador: clienteAthosId tem prioridade mÃ¡xima; depois manual; depois lookup por orÃ§amento
    let tomadorCnpj = input?.tomadorCnpj ? input.tomadorCnpj.replace(/\D/g, "") : null;
    let tomadorCpf  = input?.tomadorCpf  ? input.tomadorCpf.replace(/\D/g, "")  : null;
    let tomadorNome = input?.tomadorNome?.trim() || null;

    let tomadorEndereco: TomadorEndereco | null = this.buildTomadorEnderecoFromInput(input);
    const documentoManualInformado = Boolean(tomadorCnpj || tomadorCpf);

    // Caminho A â€” clienteAthosId explÃ­cito (TOMAD-01, TOMAD-02)
    if (input?.clienteAthosId != null && Number.isFinite(input.clienteAthosId) && input.clienteAthosId > 0) {
      const info = await this.athosService.buscarClientePorId(input.clienteAthosId);
      if (!info) {
        throw new BadRequestException(
          `Cliente Athos nÃ£o encontrado. Verifique o clienteAthosId informado (${input.clienteAthosId}).`,
        );
      }
      tomadorNome = tomadorNome ?? info.name ?? null;
      // Preservar endereÃ§o do input se informado explicitamente; senÃ£o usar o do Athos
      tomadorEndereco = tomadorEndereco ?? (info.endereco ?? null);
      if (info.type === "juridico" && info.documento?.replace(/\D/g, "").length === 14) {
        tomadorCnpj = info.documento.replace(/\D/g, "");
      } else if (info.type === "fisico" && info.documento?.replace(/\D/g, "").length === 11) {
        tomadorCpf = info.documento.replace(/\D/g, "");
      }
      this.logger.log(
        `[Tomador-A] clienteAthosId=${input.clienteAthosId} tipo=${info.type} nome="${info.name ?? "?"}" doc=${info.documento ? info.documento.slice(0, 4) + "****" : "null"}`,
      );
    } else if (!tomadorCnpj && !tomadorCpf) {
      // Caminho C â€” nenhum clienteAthosId nem documento manual: lookup via orÃ§amento
      this.logger.log(`[Tomador-C] quoteId=${quoteId} â€” lookup completo de tomador via orcamento (sem clienteAthosId e sem documento manual)`);
      const tomador = await this.buscarTomador(quote);
      tomadorCnpj    = tomador.cnpj;
      tomadorCpf     = tomador.cpf;
      tomadorNome    = tomadorNome ?? tomador.nome;
      tomadorEndereco = tomadorEndereco ?? tomador.endereco;
    } else {
      // Caminho B â€” documento manual informado: buscar apenas endereÃ§o se ausente
      this.logger.log(`[Tomador-B] quoteId=${quoteId} â€” documento manual informado; buscando endereco via Athos/orcamento se ausente`);
      tomadorNome = tomadorNome ?? quote.customer?.fullName ?? null;
      if (!tomadorEndereco) {
        const tomador = await this.buscarTomador(quote);
        tomadorEndereco = tomador.endereco;
      }
    }

    if (documentoManualInformado && !input?.clienteAthosId && !tomadorEndereco) {
      throw new BadRequestException(
        "EndereÃ§o do tomador Ã© obrigatÃ³rio quando o documento Ã© informado manualmente. Preencha logradouro, nÃºmero, bairro, CEP, cÃ³digo do municÃ­pio (IBGE) e UF.",
      );
    }

    // TOMAD-04: validar documento e endereÃ§o mÃ­nimo obrigatÃ³rios pÃ³s-resoluÃ§Ã£o
    if (!tomadorCnpj && !tomadorCpf) {
      const fonte = input?.clienteAthosId
        ? `cliente Athos ${input.clienteAthosId}`
        : "orÃ§amento/fallback";
      throw new BadRequestException(
        `CPF ou CNPJ do tomador ausente. NÃ£o foi possÃ­vel obter documento a partir de: ${fonte}. Informe manualmente ou selecione um cliente com documento cadastrado.`,
      );
    }

    if (!tomadorEndereco) {
      const fonte = input?.clienteAthosId
        ? `cliente Athos ${input.clienteAthosId}`
        : "orÃ§amento/fallback";
      throw new BadRequestException(
        `EndereÃ§o do tomador ausente. NÃ£o foi possÃ­vel obter endereÃ§o a partir de: ${fonte}. Informe manualmente ou selecione um cliente com endereÃ§o cadastrado.`,
      );
    }

    const rpsXml = this.buildRpsXml({
      numero:          rpsNumero,
      serie:           rpsSerie,
      dataEmissao,
      valorServicos,
      descontoIncondicionado,
      discriminacao,
      itemLista:       servico.itemLista,
      codigoNacional:  input?.codigoTributacaoNacional ?? servico.codigoNacional,
      aliquotaIss:     servico.aliquotaIss,
      tomadorCnpj,
      tomadorCpf,
      tomadorNome,
      tomadorEndereco,
    });

    const integridade = this.computeIntegridade(rpsXml);
    const dados = `<?xml version="1.0" encoding="UTF-8"?>
<GerarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  ${rpsXml}
  <Integridade>${integridade}</Integridade>
</GerarNfseEnvio>`;

    this.logger.log(`Emitindo NFS-e orÃ§amento #${quote.internalNumber} - RPS #${rpsNumero}/${rpsSerie} - serviÃ§o ${servico.itemLista}/${servico.codigoNacional}`);
    this.logger.debug(`XML:\n${dados}`);

    const responseXml = await this.enviarSoap(this.buildCabecalho(), dados);
    this.logger.debug(`Resposta: ${responseXml.slice(0, 800)}`);

    const erros = this.parseErros(responseXml);
    const numeroNfse = this.parseNumeroNfse(responseXml);

    if (erros.length > 0 && !numeroNfse) {
      throw new BadRequestException(`Erro na emissÃ£o da NFS-e: ${erros.join(" | ")}`);
    }

    if (!numeroNfse) {
      this.logger.error(`NFS-e sem nÃºmero. Response: ${responseXml}`);
      throw new BadRequestException("NFS-e processada mas nÃºmero nÃ£o retornado. Verifique no painel da prefeitura.");
    }

    const codigoVerificacao = this.parseCodigoVerificacao(responseXml);
    const linkNfse          = this.parseLinkNfse(responseXml);

    await (this.prisma as any).quote.update({
      where: { id: quote.id },
      data: {
        nfseNumero:           numeroNfse,
        nfseCodigoVerificacao: codigoVerificacao ?? null,
        nfseLink:             linkNfse ?? null,
        nfseEmitidaEm:        new Date(),
      },
    });

    this.logger.log(`NFS-e #${numeroNfse} emitida para orÃ§amento #${quote.internalNumber}`);

    // Notifica cliente via Chatwoot (mensagem + PDF como anexo)
    if (quote.conversationId) {
      const convId      = String(quote.conversationId);
      const nomeCliente = (quote.customer?.fullName ?? "Cliente").split(" ")[0];

      // 1. Envia mensagem de texto
      try {
        let mensagem = `Ola, ${nomeCliente}!\n\nSua nota fiscal (NFS-e #${numeroNfse}) foi emitida com sucesso.`;
        if (codigoVerificacao) mensagem += `\nCodigo de verificacao: ${codigoVerificacao}`;
        if (linkNfse) mensagem += `\n\nLink: ${linkNfse}`;
        await this.chatwootService.sendOutgoingMessage(convId, mensagem);
      } catch (err) {
        this.logger.warn(`Falha ao enviar mensagem Chatwoot: ${err instanceof Error ? err.message : err}`);
      }

      // 2. Baixa o PDF e envia como anexo
      if (linkNfse) {
        try {
          this.logger.log(`Baixando PDF da NFS-e #${numeroNfse}: ${linkNfse}`);
          const pdfResp = await axios.get(linkNfse, {
            responseType: "arraybuffer",
            timeout: 30_000,
            headers: { Accept: "application/pdf,*/*" },
          });
          const pdfBuffer  = Buffer.from(pdfResp.data as ArrayBuffer);
          const fileName   = `NotaFiscal_NFSe_${numeroNfse}.pdf`;
          const contentType = String(pdfResp.headers["content-type"] ?? "application/pdf").split(";")[0].trim();

          this.logger.log(`PDF baixado (${pdfBuffer.length} bytes) - enviando ao Chatwoot`);
          await this.chatwootService.sendAttachment(convId, pdfBuffer, fileName, contentType || "application/pdf");
          this.logger.log(`PDF da NFS-e #${numeroNfse} enviado ao cliente via Chatwoot`);
        } catch (err) {
          this.logger.warn(`Falha ao enviar PDF da NFS-e #${numeroNfse} via Chatwoot: ${err instanceof Error ? err.message : err}`);
        }
      }
    }

    return { jaEmitida: false, numero: numeroNfse, codigoVerificacao, link: linkNfse, emitidaEm: new Date().toISOString() };
  }

  async consultar(quoteId: string) {
    const quote = await this.findQuote(quoteId);
    if (!quote) throw new BadRequestException("OrÃ§amento nÃ£o encontrado");

    // Busca dados do tomador para o frontend pre-preencher o formulario
    let tomador: { cnpj: string | null; cpf: string | null; nome: string | null; endereco: TomadorEndereco | null } = {
      cnpj: null, cpf: null, nome: quote.customer?.fullName ?? null, endereco: null,
    };
    if (quote.status !== "CANCELADO" && !quote.nfseNumero) {
      tomador = await this.buscarTomador(quote);
    }

    return {
      emitida:             !!quote.nfseNumero,
      numero:              quote.nfseNumero ?? null,
      codigoVerificacao:   quote.nfseCodigoVerificacao ?? null,
      link:                quote.nfseLink ?? null,
      emitidaEm:           quote.nfseEmitidaEm ?? null,
      podeEmitir:          quote.status !== "CANCELADO" && !quote.nfseNumero,
      tomador: {
        nome:               tomador.nome,
        cpf:                tomador.cpf,
        cnpj:               tomador.cnpj,
        temDocumento:       !!(tomador.cpf || tomador.cnpj),
        endereco:           tomador.endereco,
        temEndereco:        !!tomador.endereco,
      },
      servicoSugerido:     DEFAULT_SERVICO,
      servicosDisponiveis: this.getServicosDisponiveis(),
    };
  }

  async emitirTeste() {
    // Teste com dados reais da documentacao - nao altera banco
    const rpsXml = `<Rps>
    <InfDeclaracaoPrestacaoServico Id="rps1">
        <Rps>
            <IdentificacaoRps>
                <Numero>1</Numero>
                <Serie>RPS</Serie>
                <Tipo>1</Tipo>
            </IdentificacaoRps>
            <DataEmissao>${new Date().toISOString().slice(0, 10)}</DataEmissao>
            <Status>1</Status>
        </Rps>
        <Competencia>${new Date().toISOString().slice(0, 10)}</Competencia>
        <Servico>
            <Valores>
                <ValorServicos>30.00</ValorServicos>
                <ValorDeducoes>0.00</ValorDeducoes>
                <ValorPis>0.00</ValorPis>
                <ValorCofins>0.00</ValorCofins>
                <ValorInss>0.00</ValorInss>
                <ValorIr>0.00</ValorIr>
                <ValorCsll>0.00</ValorCsll>
                <ValorCbs>0.27</ValorCbs>
                <AliquotaCbs>0.90</AliquotaCbs>
                <ValorIbs>0.03</ValorIbs>
                <AliquotaIbs>0.10</AliquotaIbs>
                <OutrasRetencoes>0.00</OutrasRetencoes>
                <Aliquota>3.73</Aliquota>
                <DescontoIncondicionado>0.00</DescontoIncondicionado>
                <DescontoCondicionado>0.00</DescontoCondicionado>
            </Valores>
            <IssRetido>2</IssRetido>
            <ResponsavelRetencao>1</ResponsavelRetencao>
            <ItemListaServico>24.01</ItemListaServico>
            <CodigoTributacaoNacional>240101</CodigoTributacaoNacional>
            <Discriminacao>TESTE EMISSAO NFS-E</Discriminacao>
            <CodigoMunicipio>${this.CODIGO_MUNICIPIO}</CodigoMunicipio>
        </Servico>
        <Prestador>
            <CpfCnpj><Cnpj>${this.getCnpjPrestador()}</Cnpj></CpfCnpj>
            <InscricaoMunicipal>${this.getInscricaoMunicipal()}</InscricaoMunicipal>
        </Prestador>
    </InfDeclaracaoPrestacaoServico>
</Rps>`;

    const integridade = this.computeIntegridade(rpsXml);
    const dados = `<?xml version="1.0" encoding="UTF-8"?>
<GerarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  ${rpsXml}
  <Integridade>${integridade}</Integridade>
</GerarNfseEnvio>`;

    this.logger.log(`[TESTE] Hash: ${integridade}`);

    try {
      const responseXml = await this.enviarSoap(this.buildCabecalho(), dados);
      const erros = this.parseErros(responseXml);
      const numero = this.parseNumeroNfse(responseXml);
      return { sucesso: !!numero, numero, erros, hashGerado: integridade };
    } catch (err) {
      return { sucesso: false, erro: err instanceof Error ? err.message : String(err), hashGerado: integridade };
    }
  }
}

