/**
 * Fase 52 (plano 52-07): corpo do PUT /pesquisa/config (D-24, UI-D16 — a tela salva tudo de uma vez).
 *
 * O ValidationPipe global usa whitelist + forbidNonWhitelisted, por isso todo campo de `ConfigEntrada`
 * tem ao menos um decorador de class-validator. Os limites finos (1-50%, validade, allowlist do Google,
 * placeholders e 600 caracteres) ficam em `validarConfig`, que e a fonte unica tanto da tela quanto do
 * servidor; aqui ficam so tipo e tamanho maxima.
 */
import { IsBoolean, IsIn, IsInt, IsNumber, IsString, Max, MaxLength, ValidateIf } from "class-validator";

import { VALOR_MAXIMO_DINHEIRO } from "../pesquisa-regras";

export class AtualizarPesquisaConfigDto {
  @IsBoolean({ message: "ativo deve ser verdadeiro ou falso." })
  ativo!: boolean;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: "percentualDesconto deve ser um número com até 2 casas decimais." })
  percentualDesconto!: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: "tetoDesconto deve ser um número com até 2 casas decimais." })
  @Max(VALOR_MAXIMO_DINHEIRO, { message: "tetoDesconto deve ser no máximo 9999999999.99." })
  tetoDesconto!: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: "compraMinima deve ser um número com até 2 casas decimais." })
  @Max(VALOR_MAXIMO_DINHEIRO, { message: "compraMinima deve ser no máximo 9999999999.99." })
  compraMinima!: number;

  @IsInt({ message: "validadeCupomDias deve ser um número inteiro de dias." })
  validadeCupomDias!: number;

  @IsInt({ message: "validadeLinkDias deve ser um número inteiro de dias." })
  validadeLinkDias!: number;

  @IsInt({ message: "intervaloDias deve ser um número inteiro de dias." })
  intervaloDias!: number;

  @IsNumber({ maxDecimalPlaces: 2 }, { message: "tetoMensal deve ser um número com até 2 casas decimais." })
  @Max(VALOR_MAXIMO_DINHEIRO, { message: "tetoMensal deve ser no máximo 9999999999.99." })
  tetoMensal!: number;

  @IsString({ message: "prefixoCupom deve ser texto." })
  @MaxLength(20, { message: "prefixoCupom deve ter no máximo 20 caracteres." })
  prefixoCupom!: string;

  @ValidateIf((o: AtualizarPesquisaConfigDto) => o.linkGoogle !== null)
  @IsString({ message: "linkGoogle deve ser texto ou nulo." })
  @MaxLength(500, { message: "linkGoogle deve ter no máximo 500 caracteres." })
  linkGoogle!: string | null;

  @IsIn(["ESTRELAS", "CARINHAS", "AB"], { message: "varianteVisual deve ser ESTRELAS, CARINHAS ou AB." })
  varianteVisual!: string;

  @IsString({ message: "textoFechamento deve ser texto." })
  @MaxLength(2000, { message: "textoFechamento deve ter no máximo 2000 caracteres." })
  textoFechamento!: string;

  @IsString({ message: "textoSemRecompensa deve ser texto." })
  @MaxLength(2000, { message: "textoSemRecompensa deve ter no máximo 2000 caracteres." })
  textoSemRecompensa!: string;

  @IsString({ message: "textoPosResposta deve ser texto." })
  @MaxLength(2000, { message: "textoPosResposta deve ter no máximo 2000 caracteres." })
  textoPosResposta!: string;

  @IsString({ message: "textoConviteGoogle deve ser texto." })
  @MaxLength(2000, { message: "textoConviteGoogle deve ter no máximo 2000 caracteres." })
  textoConviteGoogle!: string;

  @IsString({ message: "paginaTitulo deve ser texto." })
  @MaxLength(2000, { message: "paginaTitulo deve ter no máximo 2000 caracteres." })
  paginaTitulo!: string;

  @IsString({ message: "paginaSubtitulo deve ser texto." })
  @MaxLength(2000, { message: "paginaSubtitulo deve ter no máximo 2000 caracteres." })
  paginaSubtitulo!: string;

  @IsString({ message: "paginaObrigadoSemRecompensa deve ser texto." })
  @MaxLength(2000, { message: "paginaObrigadoSemRecompensa deve ter no máximo 2000 caracteres." })
  paginaObrigadoSemRecompensa!: string;

  @IsString({ message: "paginaGoogleTitulo deve ser texto." })
  @MaxLength(2000, { message: "paginaGoogleTitulo deve ter no máximo 2000 caracteres." })
  paginaGoogleTitulo!: string;

  @IsString({ message: "paginaGoogleCorpo deve ser texto." })
  @MaxLength(2000, { message: "paginaGoogleCorpo deve ter no máximo 2000 caracteres." })
  paginaGoogleCorpo!: string;
}
