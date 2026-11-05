---
phase: 42-e-mail-de-boleto-com-destinatarios-em-copia-cc
reviewed: 2026-11-05T00:00:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - apps/backend/prisma/migrations/20261105120000_add_cobranca_email_envio_cc/migration.sql
  - apps/backend/prisma/migrations/20261105130000_add_cobranca_email_cc_padrao/migration.sql
  - apps/backend/prisma/schema.prisma
  - apps/backend/src/modules/cobranca/cobranca.controller.ts
  - apps/backend/src/modules/cobranca/cobranca.service.ts
  - apps/backend/src/modules/cobranca/dto/enviar-email-cobranca.dto.ts
  - apps/backend/src/modules/cobranca/dto/salvar-cc-padrao.dto.ts
  - apps/backend/src/modules/cobranca/email-envio.service.ts
  - apps/frontend/src/app/api/cobranca/email/cc-padrao/[idclienteAthos]/route.ts
  - apps/frontend/src/app/api/cobranca/email/enviar/route.ts
  - apps/frontend/src/app/contas-receber/[idcliente]/page.tsx
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 42: Code Review Report

**Reviewed:** 2026-11-05
**Depth:** standard
**Files Reviewed:** 11 (diff `73bb479..HEAD -- apps/`; `email-envio.service.test.ts` lido apenas para checar cobertura)
**Status:** issues_found

## Summary

Nenhum blocker. As migrations são idempotentes (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`), batem com o `schema.prisma` e vêm depois de `20260827120000_add_cobranca_email_envio`, que cria a tabela alterada. Os endpoints novos `GET/PUT email/cc-padrao/:id` ficam atrás do `InternalAuthGuard` global (não são `@Public`). O proxy Next exige `requireAdminSession`, o mesmo cookie do `PasswordGate` de `/contas-receber`, com `SameSite=strict`. Não encontrei injeção de SQL: o único acesso é via Prisma, parametrizado.

Injeção de cabeçalho/CRLF: não explorável hoje. Testei `validator.isEmail` e `EMAIL_RE`. O DTO (`IsEmail`) aceita `"a\r\nBcc: x"@y.com` (local-part entre aspas aceita `\s`), mas `EMAIL_RE` em `normalizarListaCc` (`[^\s@]`) rejeita CR/LF, e o `trim()` roda antes. Um CRLF só é barrado pela segunda camada, e ela é frouxa e não tem teste de regressão (WR-04).

A guarda de corrida `emailCcCargaSeq` em `carregarCcPadrao` funciona para reaberturas do modal. Os riscos reais ficam em autorização inconsistente, UX com bloqueio e sobrescrita do padrão.

## Warnings

### WR-01: Proxy `/api/cobranca/email/enviar` sem `requireAdminSession` enquanto `cc-padrao` exige

**File:** `apps/frontend/src/app/api/cobranca/email/enviar/route.ts:5-47`
**Issue:** O comentário do novo `cc-padrao/route.ts` justifica a guarda de sessão porque "a lista decide para onde vão documentos fiscais". Mas o canal que realmente envia boleto, NFS-e e NF-e, o `POST /enviar`, não tem guarda alguma. Ele repassa ao backend usando a `INTERNAL_API_KEY` do servidor. Qualquer pessoa que alcance a URL do frontend, sem cookie de admin, pode enviar documentos fiscais de qualquer `idclienteAthos` para `destinatario` mais até 10 endereços `cc` arbitrários. A mudança do `cc` amplia o vetor de exfiltração (de 1 para 11 destinatários) e torna a guarda do `cc-padrao` incoerente. O `destinatario` livre já era um problema anterior, mas esta fase tocou o arquivo.
**Fix:**
```ts
import { requireAdminSession } from "@/lib/admin-session";

export async function POST(req: NextRequest) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  }
  // ...
```
A página `/contas-receber` já usa o `PasswordGate`, então o cookie existe no fluxo normal.

### WR-02: Botão "Enviar e-mail" fica bloqueado indefinidamente se o GET do padrão pendurar

**File:** `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx:852-872, 2559`
**Issue:** `emailCcCarregando` desabilita o campo de CC e o botão Enviar (`disabled={... || emailCcCarregando}`). O `fetch` de `carregarCcPadrao` não tem timeout nem `AbortController`, e o `backendFetch` do proxy também não. Se o backend ficar lento ou pendurado, o usuário não consegue enviar o e-mail, nem sem CC, até recarregar a página. Fechar o modal (`setEmailModalState("idle")`) não invalida `emailCcCargaSeq` nem aborta a requisição. Hoje isso é inofensivo apenas porque a reabertura incrementa o contador. O carregamento de um dado opcional não deveria bloquear a ação principal.
**Fix:** Usar `AbortController` com timeout (por exemplo 5-8 s) no `fetch` do GET. Ao estourar, cair no ramo de aviso e liberar `emailCcCarregando`. Abortar também no cleanup quando o modal fechar. Alternativa: manter o Enviar habilitado e só desabilitar o campo.

### WR-03: "Salvar como padrão" após falha ao carregar sobrescreve o padrão existente

**File:** `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx:858, 869, 918-930, 2528-2543`
**Issue:** Quando o GET falha, a lista fica vazia e aparece apenas um aviso (`emailCcPadraoAviso`). Se o usuário digitar alguns CCs (ou nenhum) e marcar "Salvar como padrão deste cliente", o `PUT` substitui a lista guardada no servidor, que ele não conseguiu ver, por uma lista parcial ou vazia. O aviso "o padrão salvo será removido" só aparece com a lista vazia e não menciona a falha do carregamento. É perda silenciosa de dado em last-write-wins.
**Fix:** Desabilitar o checkbox (ou fazer o PUT ser pulado) enquanto `emailCcPadraoAviso` estiver preenchido, ou exigir confirmação explícita:
```tsx
<input id="email-cc-salvar-padrao" type="checkbox" disabled={!!emailCcPadraoAviso} ... />
```
Também resetar `emailCcSalvarPadrao` para `false` quando o carregamento falhar.

### WR-04: `normalizarListaCc` é a única barreira contra CRLF e é mais frouxa que o DTO, sem teste de regressão

**File:** `apps/backend/src/modules/cobranca/email-envio.service.ts:22, 30-53`
**Issue:** `EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/` aceita `<a@b.com>`, `a,b@x.com`, `"a,b"@x.com` e caracteres de controle fora de `\s`. Testei `a,b@x.com` e `<a@b.com>`: `EMAIL_RE` aceita, `IsEmail` rejeita. Já `"a\r\nBcc: x"@y.com` passa no `IsEmail` e só é barrado pelo `\s` do `EMAIL_RE`. Hoje a combinação DTO mais regex fecha o buraco, porque o controller sempre passa pelo `ValidationPipe`. Mas `normalizarListaCc` é exportada e pode ser chamada por outro caller (job, outro módulo) sem o DTO. Aí `a,b@x.com` viraria dois destinatários no nodemailer, e hoje nada garante que o `\s` não seja afrouxado por engano. Os testes 8-17 não cobrem CRLF, vírgula, `<` ou `>`.
**Fix:** Endurecer a regex ou usar o `isEmail` do `validator` dentro de `normalizarListaCc`, e rejeitar explicitamente caracteres de controle e separadores:
```ts
const EMAIL_RE = /^[^\s@<>,;"()\[\]\\]+@[^\s@<>,;"()\[\]\\]+\.[^\s@<>,;"()\[\]\\]+$/;
```
Adicionar testes com `"x@y.com\r\nBcc: a@b.com"`, `"a,b@x.com"`, `"<a@b.com>"` e `"\"a\r\nBcc: x\"@y.com"` esperando `BadRequestException` e `sendMail` não chamado.

### WR-05: `idclienteAthos` acima de 2^31-1 gera 500 em vez de 400

**File:** `apps/backend/src/modules/cobranca/cobranca.controller.ts:49-58`, `apps/backend/src/modules/cobranca/email-envio.service.ts:306-310`; proxy `apps/frontend/src/app/api/cobranca/email/cc-padrao/[idclienteAthos]/route.ts:11-15`
**Issue:** `ParseIntPipe`, `assertIdCliente` e `Number.isInteger(...) && > 0` no proxy aceitam até 2^53. A coluna `idclienteAthos` é `Int` (32 bits). Um valor como `99999999999` passa por todas as validações e estoura no Prisma (erro de range/overflow), que vira 500 genérico, com ruído de log e sem mensagem útil. O `EnviarEmailCobrancaDto` tem o mesmo defeito (`IsInt` sem `Max`), mas é anterior à fase.
**Fix:** Acrescentar `numId <= 2_147_483_647` em `assertIdCliente` e em `lerIdCliente`.

## Info

### IN-01: Texto excedente é descartado do campo quando o limite de 10 é atingido

**File:** `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx:874-888`
**Issue:** `aplicarMesclaCc` faz `setEmailCcInput(invalidos.join(", "))`. Quando o problema é limite excedido (`excedentes > 0`, sem inválidos), o campo é zerado e os e-mails válidos digitados além do 10º somem. O usuário vê "Limite de 10..." mas perde o texto que digitou.
**Fix:** Recolocar também os tokens excedentes no input, acumulando-os em uma lista `sobras` junto com `invalidos`.

### IN-02: Padrão salvo exclui o destinatário principal e o filtro é feito no carregamento

**File:** `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx:855-860, 921-926`
**Issue:** O padrão é carregado já filtrado pelo principal vigente na abertura e salvo a partir de `data.cc` (que também exclui o principal). Se o endereço de cobrança do cliente mudar depois, o antigo principal já não consta no padrão e não vira CC automaticamente. Comportamento aceitável, só vale documentar.
**Fix:** Nenhuma ação obrigatória. Se a intenção for manter o endereço antigo em cópia, salvar a lista sem filtrar o principal.

### IN-03: Destinatários em CC recebem o link de confirmação e o pixel de rastreio do mesmo token

**File:** `apps/backend/src/modules/cobranca/email-envio.service.ts:246-257`
**Issue:** O mesmo `token` vai para todos os destinatários. Qualquer pessoa em cópia pode registrar "confirmado" e "aberto". A UI já avisa ("a abertura/confirmação pode ter vindo de qualquer destinatário"). Os CCs também veem uns aos outros e o principal, o que é próprio do CC (não é BCC) e foi decisão da fase (D-04).
**Fix:** Sem ação.

### IN-04: `EMAIL_RE`/`EMAIL_CC_MAX` duplicados à mão entre front e back; `salvarCcPadrao` aceita qualquer id positivo

**File:** `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx:99-100`, `apps/backend/src/modules/cobranca/email-envio.service.ts:22`, `:288-300`
**Issue:** As constantes são espelhadas manualmente, com comentário avisando. Existe o pacote `@bomcusto/shared`, e qualquer divergência futura produz erros de validação confusos. Além disso, `salvarCcPadrao` faz upsert para qualquer `idclienteAthos` positivo sem confirmar a existência no Athos, o que pode deixar linhas órfãs. O acesso é autenticado, então o risco é baixo.
**Fix:** Mover as constantes para `@bomcusto/shared`. Opcionalmente validar o cliente via `athosService.buscarDadosClienteContasReceber` antes do upsert.

---

_Reviewed: 2026-11-05_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
