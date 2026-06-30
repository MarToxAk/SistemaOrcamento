# Phase 25 Research - Upload de Anexos via SMB

## Discovery Level

Level 1 - quick verification.

Reasoning:
- O repositorio ja contem o modulo Athos alvo da mudanca.
- `multer` ja esta presente no lockfile e o backend usa NestJS com `@nestjs/platform-express`.
- O risco principal nao e escolha de biblioteca, e sim o contrato real da tabela `anexo` e a seguranca do path UNC.

## Source Artifacts Reviewed

- `.planning/milestones/v2.0-ROADMAP.md`
- `.planning/DATABASE_SCHEMA.md`
- `apps/backend/src/modules/integrations/athos/athos.controller.ts`
- `apps/backend/src/modules/integrations/athos/athos.service.ts`
- `apps/backend/src/modules/integrations/athos/athos.module.ts`
- `apps/backend/src/modules/integrations/athos/athos.controller.test.ts`
- `apps/backend/src/modules/integrations/athos/athos.service.test.ts`
- `.planning/phases/24-api-contas-pagar-post/24-01-SUMMARY.md`
- NestJS docs: file upload (`FileInterceptor`, `ParseFilePipe`, validators)
- Node.js docs: `fs/promises` + `path.win32`

## Confirmed Local Patterns

### Athos module extension point

- O endpoint novo deve entrar em `AthosController`, protegido pelo mesmo `validateAthosToken()` fail-closed entregue na fase 24.
- O acesso ao Athos legado ja usa `pg.Pool` singleton em `AthosService` com `pool.connect()` + `client.release()` em `finally`.
- O modulo Athos ja exporta apenas `AthosService`; nao ha padrao local previo para multipart upload.

### Testing baseline

- O backend usa Jest de fato (`apps/backend/package.json` -> `test: jest`).
- Os testes Athos atuais sao unitarios, co-localizados, com `jest.mock("pg")` em `athos.service.test.ts`.
- `athos.controller.test.ts` hoje valida apenas autenticacao fail-closed via acesso ao metodo privado `validateAthosToken`.

## External Verification

### NestJS upload contract

- `FileInterceptor("file")` e o padrao suportado para receber um unico arquivo multipart.
- `ParseFilePipe` / `ParseFilePipeBuilder` permitem validar presenca, tamanho maximo e tipo de arquivo no parametro `@UploadedFile()`.
- `FileInterceptor` vem de `@nestjs/platform-express` e usa Multer por baixo.

### Node filesystem / Windows path behavior

- `fs/promises.mkdir(path, { recursive: true })` cria a arvore destino sem preflight separado.
- `fs/promises.writeFile()` e suficiente para gravar `Buffer` recebido pelo Multer.
- `path.win32.basename()` e `path.win32.extname()` devem ser usados para tratar nomes em caminho Windows/UNC de forma consistente.
- `path.isAbsolute()` sozinho nao mitiga traversal; o nome precisa ser sanitizado antes de compor o path.
- No Windows, caracteres reservados como `< > : " / \\ | ? *` nao podem ir para o nome final.

## Schema Findings

### Requisitos explicitamente cobertos

- `anexo.idcontapagar` existe e conecta com `conta_pagar.idcontapagar`.
- `anexo.caminhoanexo` e `anexo.arquivo` sao obrigatorios e encaixam no requisito funcional.
- `anexo.idfuncionario` e obrigatorio no schema; o milestone ja documenta default operacional `1` quando ausente.

### Lacuna real de contrato

- O DDL da tabela `anexo` mostra `idclientehistorico bigint NOT NULL`.
- O resumo funcional da fase nao informa a origem desse valor.
- Nao ha uso de `idclientehistorico` em codigo do workspace nem memoria de repositorio.

Implication:
- A fase nao pode assumir silenciosamente um valor arbitrario sem arriscar corrupcao semantica.
- O plano precisa incluir um checkpoint de decisao para travar a fonte desse campo antes da implementacao final do INSERT.

## Recommended Implementation Direction

1. Reusar `validateAthosToken()` no controller e expor `POST /athos/contas-pagar/:id/anexo`.
2. Receber upload com `FileInterceptor("file")` em memoria, com validacao de:
   - extensoes permitidas: `.pdf`, `.png`, `.jpg`, `.jpeg`
   - tamanho maximo: 10 MB
3. Sanitizar o nome final com whitelist e compor o destino UNC com `path.win32`:
   - raiz: `\\\\192.168.3.203\\html\\Anexo\\contapagar`
   - pasta: `{idcontapagar}`
4. Gravar o arquivo apenas depois de validar idcontapagar, nome e extensao.
5. Inserir o registro em `anexo` com query parametrizada no Athos.
6. Se o INSERT falhar apos a gravacao fisica, remover o arquivo em best-effort para evitar orfaos.

## Common Pitfalls To Avoid

- Nao usar `path.isAbsolute()` como protecao de traversal.
- Nao confiar em `originalname` sem `basename` + saneamento.
- Nao fazer `fs.access()` antes de `writeFile()`; abrir/gravar e tratar o erro real.
- Nao fazer upload com `diskStorage` apontando direto para a UNC share sem validacao previa; a fase precisa controlar o nome final e a remocao compensatoria.
- Nao inventar valor para `idclientehistorico` sem decisao explicita.

## Planning Consequences

- Plan 25-01 deve ser `autonomous: false` por causa do checkpoint sobre `idclientehistorico`.
- Plan 25-02 pode permanecer autonomo para a cobertura de testes apos a decisao ser resolvida.
- Verificacao executavel minima:
  - `npm --workspace @bomcusto/backend run build`
  - `npm --workspace @bomcusto/backend run test -- athos --no-coverage`