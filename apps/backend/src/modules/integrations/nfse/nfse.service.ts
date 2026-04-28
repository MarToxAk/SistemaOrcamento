import { BadRequestException, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { createHash } from "crypto";

import { PrismaService } from "../../database/prisma.service";
import { AthosService } from "../athos/athos.service";

@Injectable()
export class NfseService {
  private readonly logger = new Logger(NfseService.name);

  private readonly CNPJ_PRESTADOR = "62391927000157";
  private readonly INSCRICAO_MUNICIPAL = "13788";
  private readonly CODIGO_MUNICIPIO = "3520400";
  private readonly ITEM_LISTA_SERVICO = "24.01";
  private readonly CODIGO_TRIBUTACAO = "240101";
  private readonly ALIQUOTA_ISS = "3.73";
  private readonly CBS_RATE = 0.009;   // 0.9%
  private readonly IBS_RATE = 0.001;   // 0.1%
  private readonly SERIE_RPS = "RPS";

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly athosService: AthosService,
  ) {}

  private isProduction(): boolean {
    return (this.config.get<string>("NODE_ENV") ?? "development") === "production";
  }

  private getToken(): string {
    return this.isProduction()
      ? (this.config.get<string>("NFSE_TOKEN") ?? "")
      : "TLXX4JN38KXTRNSEAJYYEA==";
  }

  private getCnpjPrestador(): string {
    return this.isProduction() ? this.CNPJ_PRESTADOR : "88888888888888";
  }

  private getInscricaoMunicipal(): string {
    return this.isProduction() ? this.INSCRICAO_MUNICIPAL : "123456";
  }

  private getSoapUrl(): string {
    return this.isProduction()
      ? "https://ilhabela2.iibr.com.br/rps/3520400/1/soap/producao/rps"
      : "https://ilhabela2.iibr.com.br/rps/3520400/1/soap/homologacao/rps";
  }

  private getAuxUrl(): string {
    return "https://ilhabela2.iibr.com.br/rps/3520400/2/AUXILIARRPS";
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  private buildCabecalho(): string {
    return `<?xml version="1.0" encoding="UTF-8"?><cabecalho xmlns="http://www.abrasf.org.br/nfse.xsd" versao="2.04"><versaoDados>2.04</versaoDados></cabecalho>`;
  }

  private buildInfRpsXml(input: {
    numero: number;
    dataEmissao: string;
    valorServicos: number;
    discriminacao: string;
    tomadorCnpj?: string | null;
    tomadorCpf?: string | null;
    tomadorNome?: string | null;
  }): string {
    const valorCbs = Number((input.valorServicos * this.CBS_RATE).toFixed(2));
    const valorIbs = Number((input.valorServicos * this.IBS_RATE).toFixed(2));

    const tomadorXml = input.tomadorCnpj || input.tomadorCpf
      ? `<TomadorServico>
        <IdentificacaoTomador>
          <CpfCnpj>
            ${input.tomadorCnpj ? `<Cnpj>${input.tomadorCnpj}</Cnpj>` : `<Cpf>${input.tomadorCpf}</Cpf>`}
          </CpfCnpj>
        </IdentificacaoTomador>
        ${input.tomadorNome ? `<RazaoSocial>${this.escapeXml(input.tomadorNome).slice(0, 115)}</RazaoSocial>` : ""}
        <AtualizaTomador>2</AtualizaTomador>
        <TomadorExterior>2</TomadorExterior>
      </TomadorServico>`
      : "";

    return `<InfDeclaracaoPrestacaoServico Id="1">
      <Rps>
        <IdentificacaoRps>
          <Numero>${input.numero}</Numero>
          <Serie>${this.SERIE_RPS}</Serie>
          <Tipo>1</Tipo>
        </IdentificacaoRps>
        <DataEmissao>${input.dataEmissao}</DataEmissao>
        <Status>1</Status>
      </Rps>
      <Competencia>${input.dataEmissao}</Competencia>
      <Servico>
        <Valores>
          <ValorServicos>${input.valorServicos.toFixed(2)}</ValorServicos>
          <ValorDeducoes>0</ValorDeducoes>
          <ValorPis>0</ValorPis>
          <ValorCofins>0</ValorCofins>
          <ValorInss>0</ValorInss>
          <ValorIr>0</ValorIr>
          <ValorCsll>0</ValorCsll>
          <ValorCbs>${valorCbs.toFixed(2)}</ValorCbs>
          <ValorIbs>${valorIbs.toFixed(2)}</ValorIbs>
          <OutrasRetencoes>0</OutrasRetencoes>
          <Aliquota>${this.ALIQUOTA_ISS}</Aliquota>
          <DescontoIncondicionado>0</DescontoIncondicionado>
          <DescontoCondicionado>0</DescontoCondicionado>
        </Valores>
        <IssRetido>2</IssRetido>
        <ItemListaServico>${this.ITEM_LISTA_SERVICO}</ItemListaServico>
        <CodigoTributacaoMunicipio>${this.CODIGO_TRIBUTACAO}</CodigoTributacaoMunicipio>
        <Discriminacao>${this.escapeXml(input.discriminacao).slice(0, 2000)}</Discriminacao>
        <CodigoMunicipio>${this.CODIGO_MUNICIPIO}</CodigoMunicipio>
      </Servico>
      <Prestador>
        <CpfCnpj><Cnpj>${this.getCnpjPrestador()}</Cnpj></CpfCnpj>
        <InscricaoMunicipal>${this.getInscricaoMunicipal()}</InscricaoMunicipal>
      </Prestador>
      ${tomadorXml}
      <OptanteSimplesNacional>2</OptanteSimplesNacional>
      <IncentivoFiscal>2</IncentivoFiscal>
    </InfDeclaracaoPrestacaoServico>`;
  }

  private buildRpsXml(infXml: string): string {
    return `<Rps>${infXml}</Rps>`;
  }

  private computeIntegridade(rpsXml: string): string {
    return createHash("sha512").update(rpsXml, "utf8").digest("hex");
  }

  private buildDadosXml(input: {
    numero: number;
    dataEmissao: string;
    valorServicos: number;
    discriminacao: string;
    tomadorCnpj?: string | null;
    tomadorCpf?: string | null;
    tomadorNome?: string | null;
  }): string {
    const infXml = this.buildInfRpsXml(input);
    const rpsXml = this.buildRpsXml(infXml);
    const integridade = this.computeIntegridade(rpsXml);

    return `<?xml version="1.0" encoding="UTF-8"?>
<GerarNfseEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  ${rpsXml}
  <Integridade>${integridade}</Integridade>
</GerarNfseEnvio>`;
  }

  private buildSoapEnvelope(cabecalho: string, dados: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ws="http://nfse.abrasf.org.br"
  xmlns:iibr="http://rps.iibr.com.br/">
  <soapenv:Header>
    <iibr:cnpjRemetente>${this.getCnpjPrestador()}</iibr:cnpjRemetente>
    <iibr:token>${this.getToken()}</iibr:token>
  </soapenv:Header>
  <soapenv:Body>
    <ws:GerarNfseRequest>
      <nfseCabecMsg><![CDATA[${cabecalho}]]></nfseCabecMsg>
      <nfseDadosMsg><![CDATA[${dados}]]></nfseDadosMsg>
    </ws:GerarNfseRequest>
  </soapenv:Body>
</soapenv:Envelope>`;
  }

  private parseNumeroNfse(xml: string): string | null {
    const match = xml.match(/<NumeroNfse>(\d+)<\/NumeroNfse>/);
    return match?.[1] ?? null;
  }

  private parseCodigoVerificacao(xml: string): string | null {
    const match = xml.match(/<CodigoVerificacao>([^<]+)<\/CodigoVerificacao>/);
    return match?.[1]?.trim() ?? null;
  }

  private parseLinkNfse(xml: string): string | null {
    const match = xml.match(/<LinkNfse>([^<]+)<\/LinkNfse>/);
    if (!match?.[1]?.trim()) return null;
    try {
      return Buffer.from(match[1].trim(), "base64").toString("utf8");
    } catch {
      return match[1].trim();
    }
  }

  private parseErro(xml: string): string | null {
    const match = xml.match(/<Mensagem>([^<]+)<\/Mensagem>/);
    return match?.[1]?.trim() ?? null;
  }

  // Consulta dados da NFS-e via API Auxiliar REST (fallback para link/codigoVerificacao)
  private async consultarViaAuxiliar(numero: string): Promise<{ link?: string | null; codigoVerificacao?: string | null } | null> {
    try {
      const params = new URLSearchParams({
        cnpj: this.getCnpjPrestador(),
        token: this.getToken(),
        numero,
      });
      const url = `${this.getAuxUrl()}?${params.toString()}`;
      this.logger.debug(`API Auxiliar: GET ${url}`);
      const resp = await axios.get(url, { timeout: 15_000 });
      const data = resp.data as Record<string, unknown>;
      if (!data) return null;
      this.logger.debug(`API Auxiliar resposta: ${JSON.stringify(data)}`);
      return {
        link: (data.link ?? data.linkNfse ?? data.LinkNfse ?? null) as string | null,
        codigoVerificacao: (data.codigoVerificacao ?? data.CodigoVerificacao ?? data.codigo ?? null) as string | null,
      };
    } catch (err) {
      this.logger.warn(`API Auxiliar falhou para NFS-e #${numero}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private async findQuote(identifier: string) {
    const include = { customer: true, items: { orderBy: { sequence: "asc" } } };
    const numeric = /^\d+$/.test(identifier) ? Number(identifier) : null;

    if (numeric !== null) {
      const byExternal = await (this.prisma as any).quote.findFirst({
        where: { externalQuoteId: BigInt(numeric) },
        include,
      });
      if (byExternal) return byExternal;

      return (this.prisma as any).quote.findFirst({ where: { internalNumber: numeric }, include });
    }

    return (this.prisma as any).quote.findFirst({ where: { id: identifier }, include });
  }

  async emitir(quoteId: string) {
    const quote = await this.findQuote(quoteId);

    if (!quote) throw new BadRequestException("Orçamento não encontrado");

    if (quote.status !== "APROVADO") {
      throw new BadRequestException("A NFS-e só pode ser emitida para orçamentos aprovados (pagos).");
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

    const dataEmissao = new Date().toISOString().slice(0, 10);
    const valorServicos = Number(quote.total);

    const itensDesc = (quote.items ?? [])
      .map((item: any, i: number) =>
        `${i + 1}. ${item.shortDescription || item.description} (${Number(item.quantity)}x) - R$ ${Number(item.finalPrice).toFixed(2)}`)
      .join("; ");
    const discriminacao = itensDesc
      ? `Orcamento #${quote.internalNumber}: ${itensDesc}`
      : `Orcamento #${quote.internalNumber}`;

    let tomadorCnpj: string | null = null;
    let tomadorCpf: string | null = null;
    let tomadorNome: string | null = quote.customer?.fullName ?? null;

    try {
      const lookupId = String(quote.externalQuoteId ?? quote.internalNumber ?? "");
      const athosData = await this.athosService.buscarOrcamentoPorNumero(lookupId);
      const athosMapped = (athosData as any)?.mapped ?? null;
      const clienteId = athosMapped?.idcliente;

      if (clienteId) {
        const clienteInfo = await this.athosService.buscarClientePorId(clienteId);
        if (clienteInfo) {
          tomadorNome = tomadorNome ?? clienteInfo.name;
          if (clienteInfo.type === "juridico" && clienteInfo.documento?.length === 14) {
            tomadorCnpj = clienteInfo.documento;
          } else if (clienteInfo.type === "fisico" && clienteInfo.documento?.length === 11) {
            tomadorCpf = clienteInfo.documento;
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Falha ao buscar tomador no Athos para NFS-e do orçamento ${quoteId}: ${err instanceof Error ? err.message : String(err)}`);
    }

    const cabecalho = this.buildCabecalho();
    const dados = this.buildDadosXml({
      numero: Number(quote.internalNumber),
      dataEmissao,
      valorServicos,
      discriminacao,
      tomadorCnpj,
      tomadorCpf,
      tomadorNome,
    });
    const envelope = this.buildSoapEnvelope(cabecalho, dados);

    this.logger.log(`Emitindo NFS-e para orçamento #${quote.internalNumber} (${this.isProduction() ? "produção" : "homologação"}) — tomador: ${tomadorCnpj ?? tomadorCpf ?? "sem documento"}`);
    this.logger.debug(`XML NFS-e:\n${dados}`);

    let responseXml: string;
    try {
      const resp = await axios.post(this.getSoapUrl(), envelope, {
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: "http://nfse.abrasf.org.br/GerarNfse",
        },
        timeout: 30_000,
      });
      responseXml = typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data);
    } catch (err: any) {
      const detail = err?.response?.data ?? err?.message;
      this.logger.error(`Falha SOAP NFS-e: ${JSON.stringify(detail)}`);
      throw new InternalServerErrorException("Falha na comunicação com o serviço NFS-e da prefeitura.");
    }

    this.logger.debug(`Resposta NFS-e: ${responseXml.slice(0, 800)}`);

    const erro = this.parseErro(responseXml);
    if (erro && !this.parseNumeroNfse(responseXml)) {
      throw new BadRequestException(`Erro na emissão da NFS-e: ${erro}`);
    }

    const numeroNfse = this.parseNumeroNfse(responseXml);
    let codigoVerificacao = this.parseCodigoVerificacao(responseXml);
    let linkNfse = this.parseLinkNfse(responseXml);

    if (!numeroNfse) {
      this.logger.error(`NFS-e sem número. Response: ${responseXml}`);
      throw new InternalServerErrorException("NFS-e processada mas número não retornado. Verifique no painel da prefeitura.");
    }

    // Se o SOAP não retornou link ou código, busca via API Auxiliar
    if (!linkNfse || !codigoVerificacao) {
      const aux = await this.consultarViaAuxiliar(numeroNfse);
      if (aux) {
        linkNfse = linkNfse ?? aux.link ?? null;
        codigoVerificacao = codigoVerificacao ?? aux.codigoVerificacao ?? null;
      }
    }

    // Usa quote.id (UUID real) para evitar falha quando o orçamento foi localizado por internalNumber
    await (this.prisma as any).quote.update({
      where: { id: quote.id },
      data: {
        nfseNumero: numeroNfse,
        nfseCodigoVerificacao: codigoVerificacao ?? null,
        nfseLink: linkNfse ?? null,
        nfseEmitidaEm: new Date(),
      },
    });

    this.logger.log(`NFS-e #${numeroNfse} emitida para orçamento #${quote.internalNumber}`);

    return {
      jaEmitida: false,
      numero: numeroNfse,
      codigoVerificacao,
      link: linkNfse,
      emitidaEm: new Date().toISOString(),
    };
  }

  async consultar(quoteId: string) {
    const quote = await this.findQuote(quoteId);
    if (!quote) throw new BadRequestException("Orçamento não encontrado");

    // Se já tem número mas ainda não tem link, tenta buscar via API Auxiliar
    if (quote.nfseNumero && !quote.nfseLink) {
      const aux = await this.consultarViaAuxiliar(quote.nfseNumero);
      if (aux?.link) {
        await (this.prisma as any).quote.update({
          where: { id: quote.id },
          data: {
            nfseLink: aux.link,
            ...(aux.codigoVerificacao && !quote.nfseCodigoVerificacao
              ? { nfseCodigoVerificacao: aux.codigoVerificacao }
              : {}),
          },
        });
        quote.nfseLink = aux.link;
        if (aux.codigoVerificacao && !quote.nfseCodigoVerificacao) {
          quote.nfseCodigoVerificacao = aux.codigoVerificacao;
        }
      }
    }

    return {
      emitida: !!quote.nfseNumero,
      numero: quote.nfseNumero ?? null,
      codigoVerificacao: quote.nfseCodigoVerificacao ?? null,
      link: quote.nfseLink ?? null,
      emitidaEm: quote.nfseEmitidaEm ?? null,
      podeEmitir: quote.status === "APROVADO" && !quote.nfseNumero,
    };
  }
}
