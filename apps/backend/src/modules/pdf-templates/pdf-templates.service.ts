import { BadRequestException, Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PdfTemplateKind } from "@prisma/client";
import sanitizeHtml from "sanitize-html";

import { PrismaService } from "../database/prisma.service";
import { PdfTemplateSummary } from "./pdf-templates.types";

const MAX_UPLOAD_BYTES = 512 * 1024;

/**
 * Padrões perigosos verificados na validação de upload (D-02).
 *
 * Decisão de design (RESEARCH Open Question 3): REJEITAR (não limpar
 * silenciosamente) quando o HTML/Handlebars enviado contém qualquer um
 * destes padrões. Limpar destruiria CSS/Handlebars legítimos e produziria
 * PDFs visualmente quebrados sem o usuário entender o porquê.
 */
const DANGEROUS_PATTERNS: RegExp[] = [
  /<script[\s>]/i,
  /<\/script/i,
  /\son\w+\s*=/i, // onerror=, onload=, onclick=, etc.
  /javascript:/i,
  /<iframe[\s>]/i,
  /<object[\s>]/i,
  /<embed[\s>]/i,
  /file:/i,
];

@Injectable()
export class PdfTemplatesService {
  private readonly logger = new Logger(PdfTemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valida o template recebido no upload (D-02 / T-999.1-14 / T-999.1-15).
   *
   * REJEITA (lança BadRequestException) — não sanitiza/limpa — quando:
   *   - o tamanho excede 512KB (T-999.1-15);
   *   - o conteúdo contém qualquer padrão perigoso (T-999.1-14).
   *
   * Quando aprovado, retorna o `raw` original intacto — preserva CSS e
   * expressões Handlebars legítimas do template do usuário.
   *
   * Usa `sanitize-html` para detectar divergência entre o HTML original e
   * a versão saneada como sinal adicional de conteúdo potencialmente
   * perigoso, somado às checagens regex explícitas acima.
   */
  validateUpload(raw: string): string {
    const byteLength = Buffer.byteLength(raw, "utf8");
    if (byteLength > MAX_UPLOAD_BYTES) {
      throw new BadRequestException(
        `Template excede o limite de ${MAX_UPLOAD_BYTES / 1024}KB (recebido: ${(byteLength / 1024).toFixed(1)}KB).`,
      );
    }

    const hasDangerousPattern = DANGEROUS_PATTERNS.some((pattern) => pattern.test(raw));
    if (hasDangerousPattern) {
      throw new BadRequestException(
        "Template contém conteúdo não permitido (scripts, handlers de evento ou protocolos perigosos). Remova-os e tente novamente.",
      );
    }

    // Sinal adicional: se a versão sanitizada remove conteúdo de forma
    // significativa em relação ao original, trate como suspeito também.
    const sanitized = sanitizeHtml(raw, {
      allowedTags: false,
      allowedAttributes: false,
      disallowedTagsMode: "discard",
    });

    if (this.hasSignificantDivergence(raw, sanitized)) {
      throw new BadRequestException(
        "Template contém conteúdo não permitido detectado pela sanitização. Remova-o e tente novamente.",
      );
    }

    return raw;
  }

  /**
   * Cria um novo template CUSTOM a partir do upload validado (D-01).
   * Sempre criado com isActive=false — ativação é uma ação explícita
   * separada (activate).
   */
  async create(input: { name: string; source: string }): Promise<PdfTemplateSummary> {
    const validatedSource = this.validateUpload(input.source);

    const created = await this.prisma.pdfTemplate.create({
      data: {
        name: input.name,
        slug: this.buildUniqueSlug(input.name),
        source: validatedSource,
        kind: PdfTemplateKind.CUSTOM,
        isActive: false,
      },
    });

    return this.toSummary(created);
  }

  /**
   * Ativa um template — swap atômico via transação (D-04 / Pattern 3).
   * Garante que exatamente um template fique com isActive=true.
   */
  async activate(id: string): Promise<PdfTemplateSummary> {
    const template = await this.prisma.pdfTemplate.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template ${id} não encontrado.`);
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.pdfTemplate.updateMany({ data: { isActive: false } }),
      this.prisma.pdfTemplate.update({ where: { id }, data: { isActive: true } }),
    ]);

    this.logger.log(`Template ${id} (${updated.slug}) ativado — demais desativados.`);

    return this.toSummary(updated);
  }

  /**
   * Lista todos os templates (presets + customizados) para a galeria.
   */
  async list(): Promise<PdfTemplateSummary[]> {
    const templates = await this.prisma.pdfTemplate.findMany({
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    });

    return templates.map((t) => this.toSummary(t));
  }

  /**
   * Remove um template. Impede excluir o template ativo (precisa trocar
   * antes) — protege contra ficar sem nenhum ativo. CONTEXT: não destruir
   * para permitir rollback — aqui a guarda é apenas sobre o ativo; presets
   * podem ser removidos como qualquer CUSTOM se não estiverem ativos.
   */
  async remove(id: string): Promise<void> {
    const template = await this.prisma.pdfTemplate.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template ${id} não encontrado.`);
    }

    if (template.isActive) {
      throw new BadRequestException(
        "Não é possível excluir o template ativo. Ative outro template antes de excluir este.",
      );
    }

    await this.prisma.pdfTemplate.delete({ where: { id } });
  }

  private hasSignificantDivergence(raw: string, sanitized: string): boolean {
    // Heurística simples: se a sanitização removeu uma parcela grande do
    // conteúdo (ex: tags inteiras descartadas por disallowedTagsMode),
    // trate como suspeito. Pequenas divergências de whitespace/atributos
    // não disparam esta checagem.
    if (raw.length === 0) return false;
    const removedRatio = 1 - sanitized.length / raw.length;
    return removedRatio > 0.3;
  }

  private buildUniqueSlug(name: string): string {
    const base = name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const suffix = Date.now().toString(36);
    return `${base || "template"}-${suffix}`;
  }

  private toSummary(template: {
    id: string;
    name: string;
    slug: string;
    kind: PdfTemplateKind;
    isActive: boolean;
    createdAt: Date;
  }): PdfTemplateSummary {
    return {
      id: template.id,
      name: template.name,
      slug: template.slug,
      kind: template.kind,
      isActive: template.isActive,
      createdAt: template.createdAt,
    };
  }
}
