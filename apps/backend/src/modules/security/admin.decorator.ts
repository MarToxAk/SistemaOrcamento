import { UseGuards, applyDecorators } from "@nestjs/common";

import { AdminAuthGuard } from "./admin-auth.guard";

/**
 * Decorator de conveniencia que aplica AdminAuthGuard ao handler.
 * Use em endpoints de escrita/preview de templates para exigir x-admin-api-key.
 * NAO aplicar como APP_GUARD global — apenas em handlers especificos (D-03).
 */
export const AdminOnly = () => applyDecorators(UseGuards(AdminAuthGuard));
