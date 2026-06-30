# Summary - 01-01

## Objective
Fundacao de seguranca global no backend (auth por padrao, rotas publicas explicitas, fail-fast de env e CORS restrito).

## Implemented
- Criado modulo de seguranca com:
  - `InternalAuthGuard`
  - `Public` decorator
  - constantes de seguranca
- Registrado `InternalAuthGuard` como `APP_GUARD` no `AppModule`.
- `ConfigModule.forRoot` passou a validar envs obrigatorias em startup.
- `main.ts` atualizado para:
  - `rawBody: true` no bootstrap
  - CORS com allowlist (`CORS_ORIGINS`) em vez de aberto para qualquer origem.
- `health` marcado como publico explicitamente.

## Files
- apps/backend/src/modules/security/security.constants.ts
- apps/backend/src/modules/security/public.decorator.ts
- apps/backend/src/modules/security/internal-auth.guard.ts
- apps/backend/src/modules/security/security.module.ts
- apps/backend/src/modules/app.module.ts
- apps/backend/src/main.ts
- apps/backend/src/modules/health.controller.ts

## Verification
- `npm --workspace @bomcusto/backend run prisma:generate` ✅
- `npm --workspace @bomcusto/backend run build` ✅

## Notes
- Validacao funcional em runtime (401/200 via chamadas HTTP) depende de ambiente com `.env` completo.
