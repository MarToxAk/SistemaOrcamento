import { PdfTemplateFamilia, PdfTemplateKind } from '@prisma/client';

/**
 * Sumário de um template PDF usado na listagem da galeria.
 * Não inclui o campo `source` (HTML bruto) para economizar banda.
 */
export interface PdfTemplateSummary {
  id: string;
  name: string;
  slug: string;
  kind: PdfTemplateKind;
  familia: PdfTemplateFamilia;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Template ativo resolvido pelo serviço de renderização.
 * Inclui o `source` Handlebars/HTML para compilação.
 */
export interface ActiveTemplate {
  slug: string;
  source: string;
}

/**
 * Slugs estáveis dos 3 presets iniciais (D-06).
 * Usados pelo seed para upsert idempotente.
 */
export const PRESET_SLUGS = ['colorful', 'minimal', 'classic'] as const;

/**
 * Slug do preset ativo por padrão.
 * Preserva o comportamento atual (colorido era o único template).
 */
export const DEFAULT_ACTIVE_SLUG = 'colorful' as const;

/**
 * Slugs estáveis dos presets da família PROPOSTA (D-22).
 * Linha de templates separada da de orçamento da gráfica.
 */
export const PROPOSTA_PRESET_SLUGS = ['proposta-institucional'] as const;

/**
 * Slug do preset de proposta ativo por padrão (aplicado só no create do seed).
 */
export const DEFAULT_ACTIVE_PROPOSTA_SLUG = 'proposta-institucional' as const;
