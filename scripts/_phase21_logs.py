"""Fase 21 - Plano 02: adiciona logs estruturados no nfse.service.ts e athos.service.ts"""
import pathlib, sys

ROOT = pathlib.Path(__file__).parent.parent

# ============================================================
# nfse.service.ts — substituir log Tomador-A, adicionar B e C
# ============================================================
nfse_path = ROOT / "apps/backend/src/modules/integrations/nfse/nfse.service.ts"
c = nfse_path.read_text(encoding="utf-8")

# 1. Atualizar log Caminho A (log existente)
old_a = (
    "      this.logger.log(\n"
    "        `[Tomador] resolvido via clienteAthosId=${input.clienteAthosId} tipo=${info.type} doc=${info.documento ?? \"null\"}`,\n"
    "      );"
)
new_a = (
    "      this.logger.log(\n"
    "        `[Tomador-A] clienteAthosId=${input.clienteAthosId} tipo=${info.type} nome=\"${info.name ?? \"?\"}\" doc=${info.documento ? info.documento.slice(0, 4) + \"****\" : \"null\"}`,\n"
    "      );"
)
if old_a in c:
    c = c.replace(old_a, new_a)
    print("nfse: [Tomador-A] log atualizado")
else:
    print("WARN: log Tomador original nao encontrado")
    sys.exit(1)

# 2. Adicionar log Caminho C
old_c = (
    "      // Caminho C — nenhum clienteAthosId nem documento manual: lookup via orçamento\n"
    "      const tomador = await this.buscarTomador(quote);"
)
new_c = (
    "      // Caminho C — nenhum clienteAthosId nem documento manual: lookup via orçamento\n"
    "      this.logger.log(`[Tomador-C] quoteId=${quoteId} — lookup completo de tomador via orcamento (sem clienteAthosId e sem documento manual)`);\n"
    "      const tomador = await this.buscarTomador(quote);"
)
if old_c in c:
    c = c.replace(old_c, new_c)
    print("nfse: [Tomador-C] log adicionado")
else:
    print("WARN: Caminho C nao encontrado")
    sys.exit(1)

# 3. Adicionar log Caminho B
old_b = (
    "      // Caminho B — documento manual informado: buscar apenas endereço se ausente\n"
    "      tomadorNome = tomadorNome ?? quote.customer?.fullName ?? null;"
)
new_b = (
    "      // Caminho B — documento manual informado: buscar apenas endereço se ausente\n"
    "      this.logger.log(`[Tomador-B] quoteId=${quoteId} — documento manual informado; buscando endereco via Athos/orcamento se ausente`);\n"
    "      tomadorNome = tomadorNome ?? quote.customer?.fullName ?? null;"
)
if old_b in c:
    c = c.replace(old_b, new_b)
    print("nfse: [Tomador-B] log adicionado")
else:
    print("WARN: Caminho B nao encontrado")
    sys.exit(1)

nfse_path.write_text(c, encoding="utf-8")
print("nfse.service.ts salvo")

# ============================================================
# athos.service.ts — adicionar [Athos-busca] antes do return
# ============================================================
athos_path = ROOT / "apps/backend/src/modules/integrations/athos/athos.service.ts"
ca = athos_path.read_text(encoding="utf-8")

old_return = "      return { total, page, take, items };\n    } catch (err) {"
new_return = (
    "      this.logger.log(\n"
    "        `[Athos-busca] nome=\"${nomeFilter ?? \"\"}\" doc=\"${documentoFilter ?? \"\"}\" idcliente=${idclienteFilter ?? \"\"} \u2192 ${total} resultado(s) page=${page} take=${take}`,\n"
    "      );\n"
    "      return { total, page, take, items };\n"
    "    } catch (err) {"
)
if old_return in ca:
    ca = ca.replace(old_return, new_return)
    print("athos: [Athos-busca] log adicionado")
else:
    print("WARN: return { total, page, take, items } nao encontrado")
    sys.exit(1)

athos_path.write_text(ca, encoding="utf-8")
print("athos.service.ts salvo")
print("DONE")
