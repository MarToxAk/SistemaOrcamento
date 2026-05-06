"""Phase 18 - Fix NFS-e bugs: RPS off-by-one + buscarTomador diagnostics."""
import sys

NFSE_PATH = r"c:\Users\user\Documents\Projetos\cloudeproject\SistemaOrcamento\apps\backend\src\modules\integrations\nfse\nfse.service.ts"
ATHOS_PATH = r"c:\Users\user\Documents\Projetos\cloudeproject\SistemaOrcamento\apps\backend\src\modules\integrations\athos\athos.service.ts"

# ──────────────────────────────────────────────────────────────────────────────
# nfse.service.ts
# ──────────────────────────────────────────────────────────────────────────────
with open(NFSE_PATH, "r", encoding="latin-1") as f:
    nfse = f.read()

errors = []

# Fix 1: Import NotFoundException
OLD_IMPORT = 'import { BadRequestException, Injectable, Logger } from "@nestjs/common";'
NEW_IMPORT = 'import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";'
if OLD_IMPORT in nfse:
    nfse = nfse.replace(OLD_IMPORT, NEW_IMPORT, 1)
    print("✓ Fix 1: NotFoundException adicionado ao import")
else:
    errors.append("ERRO: import não encontrado em nfse.service.ts")

# Fix 2: RPS off-by-one  (already done in prior step — just verify)
if "infoNfse.proximoRps + 1" in nfse:
    print("✓ Fix 2: RPS +1 já aplicado")
else:
    errors.append("ERRO: 'proximoRps + 1' não encontrado — Task 1 não foi aplicada")

# Fix 3: buscarTomador rewrite
OLD_TRY_BLOCK = '''    try {
      const lookupId  = String(quote.externalQuoteId ?? quote.internalNumber ?? "");
      const athosData = await this.athosService.buscarOrcamentoPorNumero(lookupId);
      const clienteId = (athosData as any)?.mapped?.idcliente;
      if (clienteId) {
        const info = await this.athosService.buscarClientePorId(clienteId);
        if (info) {
          nome    = info.name || quote.customer?.fullName || null; // Athos primeiro
          endereco = (info as any).endereco ?? null;
          if (info.type === "juridico" && info.documento?.length === 14) cnpj = info.documento;
          else if (info.type === "fisico" && info.documento?.length === 11) cpf = info.documento;
        }
      }
    } catch (err) {
      this.logger.warn(`Falha ao buscar tomador no Athos: ${err instanceof Error ? err.message : String(err)}`);
    }'''

NEW_TRY_BLOCK = '''    try {
      const lookupId = String(quote.externalQuoteId ?? quote.internalNumber ?? "");
      this.logger.log(
        `[Tomador] buscando: lookupId="${lookupId}" externalQuoteId=${quote.externalQuoteId} internalNumber=${quote.internalNumber}`,
      );

      let athosData: Awaited<ReturnType<typeof this.athosService.buscarOrcamentoPorNumero>> | null = null;
      try {
        athosData = await this.athosService.buscarOrcamentoPorNumero(lookupId);
      } catch (err) {
        if (err instanceof NotFoundException) {
          this.logger.warn(
            `[Tomador] orcamento "${lookupId}" nao encontrado no Athos (NotFoundException) - sem dados do tomador`,
          );
        } else {
          this.logger.warn(
            `[Tomador] erro ao buscar orcamento "${lookupId}" no Athos: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      if (athosData) {
        const clienteId = (athosData as any)?.mapped?.idcliente;
        this.logger.log(`[Tomador] orcamento encontrado - idcliente=${clienteId}`);

        if (clienteId != null && clienteId > 0) {
          const info = await this.athosService.buscarClientePorId(clienteId);
          if (info) {
            nome     = info.name || quote.customer?.fullName || null;
            endereco = (info as any).endereco ?? null;
            if (info.type === "juridico" && info.documento?.length === 14) cnpj = info.documento;
            else if (info.type === "fisico"   && info.documento?.length === 11) cpf  = info.documento;
            this.logger.log(
              `[Tomador] cliente encontrado - tipo=${info.type} nome="${nome}" documento=${info.documento ?? "null"}`,
            );
          } else {
            this.logger.warn(`[Tomador] buscarClientePorId(${clienteId}) retornou null`);
          }
        } else {
          this.logger.warn(
            `[Tomador] idcliente=${clienteId} invalido ou ausente no mapeamento do orcamento "${lookupId}"`,
          );
        }
      }
    } catch (err) {
      this.logger.warn(
        `[Tomador] falha inesperada ao buscar tomador no Athos: ${err instanceof Error ? err.message : String(err)}`,
      );
    }'''

if OLD_TRY_BLOCK in nfse:
    nfse = nfse.replace(OLD_TRY_BLOCK, NEW_TRY_BLOCK, 1)
    print("✓ Fix 3: buscarTomador reescrito com logs e catches separados")
else:
    errors.append("ERRO: bloco try/catch de buscarTomador nao encontrado — verifique manualmente")
    # Print context for debugging
    idx = nfse.find("buscarTomador")
    if idx >= 0:
        print("DEBUG — conteudo atual de buscarTomador:")
        print(repr(nfse[idx:idx+600]))

with open(NFSE_PATH, "w", encoding="latin-1") as f:
    f.write(nfse)
print("✓ nfse.service.ts salvo")

# ──────────────────────────────────────────────────────────────────────────────
# athos.service.ts — add logger.log after identifierColumn detection
# ──────────────────────────────────────────────────────────────────────────────
with open(ATHOS_PATH, "r", encoding="latin-1") as f:
    athos = f.read()

OLD_ATHOS = '''      if (!identifierColumn) {
        throw new InternalServerErrorException(
          "Tabela orcamento sem coluna identificadora conhecida (numero/idorcamento/codorcamento).",
        );
      }

      const query ='''

NEW_ATHOS = '''      if (!identifierColumn) {
        throw new InternalServerErrorException(
          "Tabela orcamento sem coluna identificadora conhecida (numero/idorcamento/codorcamento).",
        );
      }
      this.logger.log(`[Athos] buscarOrcamentoPorNumero: numero="${numero}" identifierColumn="${identifierColumn}"`);

      const query ='''

if OLD_ATHOS in athos:
    athos = athos.replace(OLD_ATHOS, NEW_ATHOS, 1)
    print("✓ Fix 4: log de identifierColumn adicionado em athos.service.ts")
else:
    errors.append("ERRO: bloco identifierColumn nao encontrado em athos.service.ts")

with open(ATHOS_PATH, "w", encoding="latin-1") as f:
    f.write(athos)
print("✓ athos.service.ts salvo")

# ──────────────────────────────────────────────────────────────────────────────
if errors:
    print("\nERROS encontrados:")
    for e in errors:
        print(" -", e)
    sys.exit(1)
else:
    print("\nTodos os fixes aplicados com sucesso.")
