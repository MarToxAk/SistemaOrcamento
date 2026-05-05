import pathlib

f = pathlib.Path("apps/backend/src/modules/integrations/athos/athos.service.ts")
c = f.read_text(encoding="utf-8")

# Detect and replace the LATERAL join block
lateral_marker = "LEFT JOIN LATERAL ("
distinct_replacement = """LEFT JOIN (
          SELECT DISTINCT ON (idcliente)
            idcliente, tipologradouro, logradouro, numero, bairro, cep, codigocidade, uf
          FROM cliente_endereco
          ORDER BY idcliente, idenderecocliente
        ) ce ON ce.idcliente = c.idcliente"""

if lateral_marker not in c:
    print("ERRO: marcador LATERAL nao encontrado")
    exit(1)

# Find the LATERAL block boundaries
start = c.find("        LEFT JOIN LATERAL (")
if start == -1:
    print("ERRO: bloco LATERAL nao encontrado com indentacao esperada")
    exit(1)

# Find end: ') ce ON true'
end_marker = ") ce ON true"
end = c.find(end_marker, start)
if end == -1:
    print("ERRO: fim do bloco LATERAL nao encontrado")
    exit(1)

end = end + len(end_marker)

old_block = c[start:end]
print(f"Bloco encontrado ({len(old_block)} chars):")
print(old_block[:200])

new_block = "        " + distinct_replacement

new_c = c[:start] + new_block + c[end:]
f.write_text(new_c, encoding="utf-8")
print("\nOK - LATERAL substituido por DISTINCT ON")
