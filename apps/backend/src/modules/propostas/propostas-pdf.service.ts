import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PdfTemplateFamilia } from "@prisma/client";

import { CalcOrcamentoError } from "../integrations/athos/athos-orcamento-calc.util";
import { PrismaService } from "../database/prisma.service";
import { PdfTemplatesRepository } from "../pdf-templates/pdf-templates.repository";
import { QuotesPdfStorageService } from "../quotes/quotes-pdf-storage.service";
import { PropostaError } from "./propostas.errors";
import { CalcPropostaError } from "./propostas-calc.util";
import {
  ContextoPropostaPdf,
  EntradaContextoProposta,
  PROPOSTA_MOCK,
  PdfSnapshotProposta,
  PropostaParaPdf,
  montarContextoProposta,
} from "./propostas-pdf.util";

const NOME_ARQUIVO_TEMPLATE = "proposta-institucional.hbs";
const RODAPE_PREVIA = "PRÉVIA - sem valor oficial";

/** Prefixo FIXO dos PDFs de proposta no bucket (nao usa MINIO_PATH_PREFIX, que e dos orcamentos). */
const PREFIXO_OBJETO = "propostas";

function pdfIndisponivel(mensagem: string): PropostaError {
  return new PropostaError("PDF_INDISPONIVEL", mensagem, 503);
}

function textoNaoVazio(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

/** Data de hoje (YYYY-MM-DD) no horario de Brasilia (UTC-3), para a emissao da previa. */
function hojeBrasilia(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Valida a FORMA de um snapshot recebido (ele vem de uma coluna Json e pode estar corrompido).
 * Devolve o snapshot tipado ou lanca PDF_INDISPONIVEL.
 */
function validarSnapshot(entrada: unknown): PdfSnapshotProposta {
  const invalido = (): never => {
    throw pdfIndisponivel(
      "O snapshot de emissao do PDF da proposta esta incompleto ou invalido; nao e possivel gerar o PDF.",
    );
  };
  const reg = (v: unknown): Record<string, unknown> => {
    if (v === null || typeof v !== "object" || Array.isArray(v)) invalido();
    return v as Record<string, unknown>;
  };

  const s = reg(entrada);
  if (s.versao !== 1) invalido();

  const banco = reg(s.banco);
  for (const campo of ["bancoNome", "agencia", "conta", "titular", "documentoTitular"]) {
    if (!textoNaoVazio(banco[campo])) invalido();
  }

  const empresa = reg(s.empresa);
  if (!textoNaoVazio(empresa.nome) || !textoNaoVazio(empresa.cnpj) || typeof empresa.endereco !== "string") invalido();
  for (const campo of ["telefones", "email", "logoUrl"]) {
    if (empresa[campo] !== undefined && typeof empresa[campo] !== "string") invalido();
  }

  const template = reg(s.template);
  if ((template.origem !== "BANCO" && template.origem !== "EMPACOTADO") || !textoNaoVazio(template.source)) invalido();

  return entrada as PdfSnapshotProposta;
}

/** Erros de calculo do util viram erro legivel (422), nunca 500. */
function converterErroCalculo(err: unknown): never {
  if (err instanceof CalcPropostaError || err instanceof CalcOrcamentoError) {
    throw new PropostaError("VALOR_INVALIDO", err.message, 422);
  }
  throw err;
}

/**
 * PDF institucional da proposta comercial (Fase 55, D-17..D-22).
 *
 * O PDF OFICIAL e renderizado SOMENTE a partir de um snapshot capturado no lancamento
 * (`capturarSnapshot`): template, dados bancarios e dados da empresa nao sao consultados de novo,
 * entao um PDF regenerado e identico ao emitido (D-09, D-18). A previa nunca e armazenada.
 */
@Injectable()
export class PropostasPdfService {
  private readonly logger = new Logger(PropostasPdfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly storage: QuotesPdfStorageService,
    private readonly templatesRepository: PdfTemplatesRepository,
  ) {}

  /**
   * Captura o retrato do que o PDF oficial vai usar: template (PROPOSTA ativo do banco, ou o
   * `.hbs` empacotado), dados bancarios e dados da empresa. E o UNICO ponto deste servico que le a
   * configuracao bancaria, as variaveis EMPRESA_* e o template ativo. Chamado pelo lancamento ANTES
   * de reservar a proposta, para que falta de configuracao seja descoberta antes da escrita one-way
   * no Athos.
   */
  async capturarSnapshot(): Promise<PdfSnapshotProposta> {
    const template = await this.resolverTemplate();

    const linhaBanco = await this.prisma.propostaConfig.findUnique({ where: { id: "default" } });
    if (!linhaBanco) {
      throw pdfIndisponivel(
        "Dados bancarios da proposta nao configurados. Cadastre-os na configuracao de propostas antes de lancar.",
      );
    }

    const lerEnv = (nome: string): string => (this.configService.get<string>(nome) ?? "").trim();
    const empresa: PdfSnapshotProposta["empresa"] = {
      nome: lerEnv("EMPRESA_NOME"),
      cnpj: lerEnv("EMPRESA_CNPJ"),
      endereco: lerEnv("EMPRESA_ENDERECO"),
    };
    const telefones = lerEnv("EMPRESA_TELEFONES");
    const email = lerEnv("EMPRESA_EMAIL");
    // So o TEXTO da configuracao: o data URI e resolvido na hora do render (rede do Chromium bloqueada).
    const logoUrl = lerEnv("EMPRESA_LOGO_URL");
    if (telefones) empresa.telefones = telefones;
    if (email) empresa.email = email;
    if (logoUrl) empresa.logoUrl = logoUrl;

    const snapshot: PdfSnapshotProposta = {
      versao: 1,
      banco: {
        bancoNome: linhaBanco.bancoNome,
        agencia: linhaBanco.agencia,
        conta: linhaBanco.conta,
        titular: linhaBanco.titular,
        documentoTitular: linhaBanco.documentoTitular,
      },
      empresa,
      template,
    };
    // Falha cedo se faltar nome ou CNPJ da empresa (documento para orgao publico).
    return validarSnapshot(snapshot);
  }

  /**
   * Gera e armazena o PDF OFICIAL. Usa SOMENTE `snapshot`: nunca consulta configuracao bancaria,
   * EMPRESA_* nem o template ativo. Mesmo proposta + mesmo snapshot = mesmo documento.
   */
  async gerarOficial(proposta: PropostaParaPdf, snapshot: PdfSnapshotProposta): Promise<{ objectName: string }> {
    const valido = validarSnapshot(snapshot);
    if (proposta.idorcamentoAthos == null || !textoNaoVazio(proposta.athosData)) {
      throw pdfIndisponivel("A proposta ainda nao tem numero e data do Athos; o PDF oficial nao pode ser gerado.");
    }
    const numero = proposta.idorcamentoAthos;

    const logoDataUri = await this.storage.resolveLogoDataUri(valido.empresa.logoUrl);
    const contexto = this.montarContexto({
      proposta,
      empresa: {
        nome: valido.empresa.nome,
        cnpj: valido.empresa.cnpj,
        endereco: valido.empresa.endereco,
        telefones: valido.empresa.telefones,
        email: valido.empresa.email,
        logoDataUri,
      },
      banco: valido.banco,
      previa: false,
    });

    const html = this.storage.renderHtmlFromSource(valido.template.source, contexto as unknown as Record<string, unknown>);
    const pdf = await this.storage.renderPdfMultipagina(html, {
      rodape: `Proposta comercial nº ${numero} - ${valido.empresa.nome}`,
    });

    const objectName = `${PREFIXO_OBJETO}/${numero}/Proposta-${numero}.pdf`;
    await this.storage.armazenarPdf(objectName, pdf);
    this.logger.log(`PDF oficial da proposta ${numero} armazenado (${pdf.length} bytes)`);
    return { objectName };
  }

  /**
   * Previa: mesmo caminho do oficial, com marca d'agua, sem numero e NUNCA armazenada. Como nao e
   * oficial, captura um snapshot corrente.
   */
  async gerarPrevia(proposta: PropostaParaPdf): Promise<Buffer> {
    const snapshot = await this.capturarSnapshot();
    const logoDataUri = await this.storage.resolveLogoDataUri(snapshot.empresa.logoUrl);
    const contexto = this.montarContexto({
      proposta,
      empresa: {
        nome: snapshot.empresa.nome,
        cnpj: snapshot.empresa.cnpj,
        endereco: snapshot.empresa.endereco,
        telefones: snapshot.empresa.telefones,
        email: snapshot.empresa.email,
        logoDataUri,
      },
      banco: snapshot.banco,
      previa: true,
      hoje: hojeBrasilia(),
    });
    const html = this.storage.renderHtmlFromSource(snapshot.template.source, contexto as unknown as Record<string, unknown>);
    return this.storage.renderPdfMultipagina(html, { rodape: RODAPE_PREVIA });
  }

  /** Previa de um template da galeria com dados de exemplo (PROPOSTA_MOCK). Nunca armazenada. */
  async gerarPreviaTemplate(source: string): Promise<Buffer> {
    const contexto = this.montarContexto(PROPOSTA_MOCK);
    const html = this.storage.renderHtmlFromSource(source, contexto as unknown as Record<string, unknown>);
    return this.storage.renderPdfMultipagina(html, { rodape: RODAPE_PREVIA });
  }

  baixarOficial(objectName: string): Promise<Buffer> {
    return this.storage.downloadObjectBuffer(objectName);
  }

  existeOficial(objectName: string): Promise<boolean> {
    return this.storage.objectExists(objectName);
  }

  private montarContexto(entrada: EntradaContextoProposta): ContextoPropostaPdf {
    try {
      return montarContextoProposta(entrada);
    } catch (err) {
      return converterErroCalculo(err);
    }
  }

  /** PROPOSTA ativo do banco (BANCO); sem ativo, o `.hbs` empacotado (EMPACOTADO); senao PDF_INDISPONIVEL. */
  private async resolverTemplate(): Promise<PdfSnapshotProposta["template"]> {
    const ativo = await this.templatesRepository.getActiveSource(PdfTemplateFamilia.PROPOSTA);
    if (ativo) return { origem: "BANCO", source: ativo };

    const candidatos = [
      path.resolve(process.cwd(), "apps/backend/templates", NOME_ARQUIVO_TEMPLATE),
      path.resolve(process.cwd(), "templates", NOME_ARQUIVO_TEMPLATE),
      path.resolve(__dirname, "../../../templates", NOME_ARQUIVO_TEMPLATE),
    ];
    for (const caminho of candidatos) {
      if (existsSync(caminho)) {
        return { origem: "EMPACOTADO", source: readFileSync(caminho, "utf-8") };
      }
    }
    throw pdfIndisponivel("Nenhum template de proposta disponivel (nenhum ativo e o modelo padrao nao foi encontrado).");
  }
}
