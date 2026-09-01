import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MinLength } from "class-validator";

export class UpdateChatwootAutomationConfigDto {
  @ApiPropertyOptional({ description: "Prompt (Handlebars) usado para gerar a mensagem de fechamento via IA. Placeholder disponivel: {{saudacao}}" })
  @IsOptional()
  @IsString()
  @MinLength(10)
  promptFechamento?: string;

  @ApiPropertyOptional({ description: "Texto da nota interna postada quando ha pedido pendente e a conversa e reaberta" })
  @IsOptional()
  @IsString()
  @MinLength(10)
  mensagemPedidoPendente?: string;

  @ApiPropertyOptional({ example: "Jose" })
  @IsOptional()
  @IsString()
  updatedBy?: string;
}
