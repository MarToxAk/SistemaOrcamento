import pathlib

f = pathlib.Path("apps/backend/src/modules/integrations/nfse/nfse.service.ts")
c = f.read_text(encoding="utf-8")

old = "  }): string {\n    const valorCbs      = Number((input.valorServicos * CBS_RATE).toFixed(2));\n    const valorIbs      = Number((input.valorServicos * IBS_RATE).toFixed(2));"
new = "  }): string {\n    const valorLiquido  = Number((input.valorServicos - input.descontoIncondicionado).toFixed(2));\n    const valorCbs      = Number((valorLiquido * CBS_RATE).toFixed(2));\n    const valorIbs      = Number((valorLiquido * IBS_RATE).toFixed(2));"

if old in c:
    f.write_text(c.replace(old, new, 1), encoding="utf-8")
    print("OK - valorLiquido adicionado; CBS/IBS calculados sobre valor com desconto")
else:
    print("ERRO - trecho nao encontrado")
    # debug
    idx = c.find("const valorCbs")
    print(repr(c[idx-60:idx+120]))
