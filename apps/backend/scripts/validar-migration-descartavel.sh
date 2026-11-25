#!/usr/bin/env bash
# Valida uma migration SQL aditiva num Postgres Docker DESCARTAVEL (127.0.0.1 apenas).
# Uso: validar-migration-descartavel.sh <pasta-da-migration> <tabela> <num-colunas-esperado>
# Aplica o migration.sql DUAS vezes (idempotencia) e confere a contagem de colunas.
# Nunca le DATABASE_URL e nunca conecta em outro host (nem Athos, nem producao).
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "uso: $0 <pasta-da-migration> <tabela> <num-colunas-esperado>" >&2
  exit 2
fi

PASTA="$1"
TABELA="$2"
ESPERADO="$3"
SQL="$PASTA/migration.sql"
[ -f "$SQL" ] || { echo "migration.sql nao encontrado em $PASTA" >&2; exit 2; }

NOME="pg54-validacao"
PORTA="55454"
# Senha de teste sem significado: o container e descartado ao final.
SENHA_TESTE="descartavel-sem-valor"

limpar() {
  docker rm -f "$NOME" >/dev/null 2>&1 || true
}
trap limpar EXIT
limpar

docker run -d --name "$NOME" \
  -e POSTGRES_PASSWORD="$SENHA_TESTE" -e POSTGRES_DB=validacao \
  -p "127.0.0.1:${PORTA}:5432" postgres:16-alpine >/dev/null

# pg_isready via TCP evita pegar o servidor temporario da fase de init.
PRONTO=0
for _ in $(seq 1 60); do
  if docker exec "$NOME" pg_isready -h 127.0.0.1 -U postgres -d validacao >/dev/null 2>&1; then
    PRONTO=1
    break
  fi
  sleep 1
done
[ "$PRONTO" = "1" ] || { echo "Postgres descartavel nao ficou pronto" >&2; exit 1; }

PSQL=(docker exec -i "$NOME" psql -h 127.0.0.1 -U postgres -d validacao -v ON_ERROR_STOP=1 -q)

echo "Aplicacao 1/2"
"${PSQL[@]}" < "$SQL"
echo "Aplicacao 2/2 (idempotencia)"
"${PSQL[@]}" < "$SQL"

COLUNAS=$("${PSQL[@]}" -t -A -c "SELECT count(*) FROM information_schema.columns WHERE table_name = '${TABELA}'")
if [ "$COLUNAS" != "$ESPERADO" ]; then
  echo "FALHA: ${TABELA} tem ${COLUNAS} colunas, esperado ${ESPERADO}" >&2
  exit 1
fi
echo "OK: ${TABELA} com ${COLUNAS} colunas; migration aplicada duas vezes sem erro"
