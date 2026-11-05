# Phase 42: E-mail de boleto com destinatários em cópia (CC) - Context

**Gathered:** 2026-11-05
**Status:** Ready for planning
**Mode:** smart discuss (respostas do usuário: 1c, 2a, 3a, 4 não, 5 sim)

<domain>
## Phase Boundary

No envio de boleto por e-mail da tela de detalhe do cliente (`/contas-receber/[idcliente]`), o operador pode adicionar um ou mais e-mails em cópia (CC), além do destinatário principal. Cada cliente pode ter uma lista fixa de CC salva, editável a cada envio.

**Código atual:** `apps/backend/src/modules/cobranca/email-envio.service.ts` (`enviarBoletoENotas`, nodemailer, `to: destinatario`), DTO `dto/enviar-email-cobranca.dto.ts`, endpoint `POST /cobranca/email/enviar`, modelo Prisma `CobrancaEmailEnvio`, modal de e-mail em `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` (`abreEmailModal` / `confirmarEnviarEmail`).

**In scope:**
- Campo de CC no modal de envio (vários e-mails)
- Lista fixa de CC por cliente (`idclienteAthos`), persistida e pré-preenchida no modal, editável a cada envio
- Backend: `cc` no DTO (validado) e no `sendMail`
- Registro dos CC no histórico (`CobrancaEmailEnvio`)

**Out of scope:**
- E-mail interno fixo da empresa em cópia (decidido: não)
- Alterar o corpo/layout do e-mail, pixel de abertura ou confirmação
- Qualquer mudança no Athos (a lista de CC fica no banco do Sistema, não no ERP)
</domain>

<decisions>
## Implementation Decisions

- **D-01:** CC combinado: lista fixa por cliente salva no cadastro **e** editável a cada envio (pré-preenche o modal com a lista salva; o operador adiciona/remove antes de enviar).
- **D-02:** Vários e-mails de CC, cada um validado no formato (`IsEmail` por item); duplicados removidos; sem o e-mail principal repetido em CC (case-insensitive). Definir limite razoável (ex.: 10) no plan.
- **D-03:** O CC vale para todo e-mail que leva boleto (`enviarBoletoENotas`: boleto consolidado e reenvios), um único caminho de código.
- **D-04:** Sem e-mail da empresa fixo em cópia.
- **D-05:** Os CC ficam registrados no histórico do envio (novo campo em `CobrancaEmailEnvio`, migration Prisma aditiva e nullable/array default vazio).
- **D-06 (Claude's discretion):** Persistência da lista fixa em nova tabela Prisma própria do Sistema (por `idclienteAthos`), com endpoints de leitura/gravação. Salvar a lista ao enviar é opt-in explícito no modal (checkbox "Salvar como padrão deste cliente"), para um CC pontual não virar permanente.
- **D-07 (Claude's discretion):** UI segue o padrão Bootstrap do modal atual; entrada de múltiplos e-mails por campo com chips/lista simples, sem nova dependência.

## Canonical refs
- `apps/backend/src/modules/cobranca/email-envio.service.ts`
- `apps/backend/src/modules/cobranca/email-envio.service.test.ts`
- `apps/backend/prisma/schema.prisma` (CobrancaEmailEnvio)
- `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx`
- Regra do projeto: Prisma em migration idempotente (Fase 09)
</decisions>

<deferred>
## Deferred Ideas
- CC por tipo de documento (só NFS-e etc.)
- Bcc / e-mail interno da empresa
</deferred>
