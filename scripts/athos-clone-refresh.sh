#!/usr/bin/env bash
# Refaz o clone local do Athos (container athos-teste, 127.0.0.1:5440, banco athos) a partir de um
# dump SOMENTE LEITURA do Athos original (Fase 46 / plano 46-03, decisao D-10).
#
# Seguranca:
#   - A unica ferramenta que toca a origem e o dump (leitura). Nada de escrita contra ela.
#   - A origem NUNCA pode ser o proprio clone (127.0.0.1, localhost, ::1).
#   - Credenciais so por variavel de ambiente; a senha nunca e impressa nem gravada em arquivo.
#   - O restore acontece primeiro em um banco temporario (athos_novo); a troca de nomes so ocorre
#     depois da conferencia de sanidade. O banco antigo so e apagado apos a troca.
#
# Variaveis de ambiente:
#   ATHOS_ORIGEM_HOST, ATHOS_ORIGEM_USER, ATHOS_ORIGEM_PASS   (obrigatorias)
#   ATHOS_ORIGEM_PORT (padrao 5432), ATHOS_ORIGEM_DB (padrao athos)
#   ATHOS_ORIGEM_REDE (padrao container:orcamento-ts-webserver2: rede de onde o Athos e alcancavel)
#   PG_DUMP_IMAGE (padrao postgres:14-alpine; o servidor original e 9.0.5 e o dump 15+ nao le)
#
# Uso:
#   scripts/athos-clone-refresh.sh --dry-run   # valida as guardas e imprime o plano; nao executa nada
#   scripts/athos-clone-refresh.sh             # refresh de verdade

set -euo pipefail

CONTAINER_CLONE="athos-teste"
PORTA_CLONE_ESPERADA="127.0.0.1:5440"
BANCO_NOVO="athos_novo"
BANCO_ANTIGO="athos_antigo"
# Limiares da sanidade (o dump novo precisa ser MAIOR que o clone de 2026-11-09). Sobrescreviveis por
# ATHOS_SANIDADE_MIN_ORCAMENTOS / ATHOS_SANIDADE_MIN_MAXID apenas para ensaiar o script contra uma origem local.
MIN_ORCAMENTOS_ESPERADOS="${ATHOS_SANIDADE_MIN_ORCAMENTOS:-25833}"
MIN_MAX_ID_ESPERADO="${ATHOS_SANIDADE_MIN_MAXID:-25866}"
IDS_REFERENCIA="25822 25877 25900 25951 25952 26047 26109"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,22p' "$0"
      exit 0
      ;;
    *)
      echo "ERRO: argumento desconhecido: $arg (use --dry-run ou nenhum)" >&2
      exit 2
      ;;
  esac
done

# --- variaveis obrigatorias (sem imprimir valores) -------------------------------------------
faltando=()
[ -n "${ATHOS_ORIGEM_HOST:-}" ] || faltando+=("ATHOS_ORIGEM_HOST")
[ -n "${ATHOS_ORIGEM_USER:-}" ] || faltando+=("ATHOS_ORIGEM_USER")
[ -n "${ATHOS_ORIGEM_PASS:-}" ] || faltando+=("ATHOS_ORIGEM_PASS")
if [ "${#faltando[@]}" -gt 0 ]; then
  echo "ERRO: variavel(is) obrigatoria(s) ausente(s): ${faltando[*]}" >&2
  exit 2
fi

ORIGEM_PORTA="${ATHOS_ORIGEM_PORT:-5432}"
ORIGEM_BANCO="${ATHOS_ORIGEM_DB:-athos}"
REDE="${ATHOS_ORIGEM_REDE:-container:orcamento-ts-webserver2}"
IMAGEM_DUMP="${PG_DUMP_IMAGE:-postgres:14-alpine}"

# --- guarda: a origem nao pode ser o proprio clone ---------------------------------------------
host_minusculo="$(printf '%s' "$ATHOS_ORIGEM_HOST" | tr '[:upper:]' '[:lower:]')"
case "$host_minusculo" in
  127.*|localhost|::1|0.0.0.0|"[::1]")
    echo "ERRO: origem recusada: o host de origem nao pode ser local (o clone e 127.0.0.1:5440)." >&2
    exit 3
    ;;
esac

# --- guarda: o container de destino e fixo e publicado so em 127.0.0.1:5440 --------------------
if ! command -v docker >/dev/null 2>&1; then
  echo "ERRO: docker nao encontrado no PATH." >&2
  exit 4
fi
porta_publicada="$(docker port "$CONTAINER_CLONE" 5432/tcp 2>/dev/null || true)"
if ! printf '%s\n' "$porta_publicada" | grep -qx "$PORTA_CLONE_ESPERADA"; then
  echo "ERRO: o container $CONTAINER_CLONE nao publica 5432/tcp somente em $PORTA_CLONE_ESPERADA (obtido: '${porta_publicada:-nada}')." >&2
  exit 4
fi

imprimir_plano() {
  echo "Plano do refresh do clone do Athos"
  echo "  Origem (somente dump, leitura): host=$ATHOS_ORIGEM_HOST porta=$ORIGEM_PORTA banco=$ORIGEM_BANCO usuario=$ATHOS_ORIGEM_USER senha=(oculta)"
  echo "  Rede do dump: $REDE   Imagem: $IMAGEM_DUMP"
  echo "  Destino: container $CONTAINER_CLONE ($PORTA_CLONE_ESPERADA), banco athos"
  echo "  Passos:"
  echo "    1. recriar o banco temporario $BANCO_NOVO no clone"
  echo "    2. dump (formato custom, sem dono/privilegios) da origem em pipe para o restore em $BANCO_NOVO"
  echo "    3. sanidade em $BANCO_NOVO: orcamentos > $MIN_ORCAMENTOS_ESPERADOS, max(idorcamento) >= $MIN_MAX_ID_ESPERADO, funcoes precovendaproduto e estanapromocao"
  echo "    4. trocar nomes: athos -> $BANCO_ANTIGO, $BANCO_NOVO -> athos, apagar $BANCO_ANTIGO"
  echo "    5. relatorio: contagem, max(idorcamento) e ids de referencia presentes ($IDS_REFERENCIA)"
}

if [ "$DRY_RUN" = "1" ]; then
  imprimir_plano
  echo "Modo --dry-run: nada foi executado, nenhuma conexao foi aberta e o clone nao foi alterado."
  exit 0
fi

imprimir_plano

TROCA_FEITA=0
NOVO_CRIADO=0
limpar_temporario() {
  if [ "$TROCA_FEITA" != "1" ] && [ "$NOVO_CRIADO" = "1" ]; then
    echo "Limpando o banco temporario $BANCO_NOVO (o banco athos do clone segue intacto)..." >&2
    docker exec athos-teste psql -U postgres -d postgres -q -c "DROP DATABASE IF EXISTS $BANCO_NOVO" >/dev/null 2>&1 || true
  fi
}
trap limpar_temporario EXIT

# --- 1. criacao do banco temporario athos_novo -------------------------------------------------------------------------
echo "[1/5] Recriando $BANCO_NOVO no clone..."
docker exec athos-teste psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $BANCO_NOVO"
docker exec athos-teste psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -c "CREATE DATABASE $BANCO_NOVO TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'en_US.utf8' LC_CTYPE 'en_US.utf8'"
NOVO_CRIADO=1

# --- 2. dump (leitura da origem) em pipe para o restore ------------------------------------------
echo "[2/5] Lendo a origem (uma unica conexao, sem paralelismo) e restaurando em $BANCO_NOVO..."
export PGPASSWORD="$ATHOS_ORIGEM_PASS"
inicio_dump="$(date +%s)"
set +e
docker run --rm --network "$REDE" -e PGPASSWORD "$IMAGEM_DUMP" pg_dump -h "$ATHOS_ORIGEM_HOST" -p "$ORIGEM_PORTA" -U "$ATHOS_ORIGEM_USER" -d "$ORIGEM_BANCO" -Fc --no-owner --no-privileges \
  | docker exec -i athos-teste pg_restore -U postgres -d "$BANCO_NOVO" --no-owner --no-privileges # forma docker exec athos-teste (com -i para ler o stdin)
status_pipe=("${PIPESTATUS[@]}")   # captura as duas posicoes de uma vez (PIPESTATUS e sobrescrito a cada comando)
status_dump="${status_pipe[0]:-1}"
status_restore="${status_pipe[1]:-1}"
set -e
unset PGPASSWORD
fim_dump="$(date +%s)"
echo "      duracao do dump + restore: $((fim_dump - inicio_dump))s"
if [ "$status_dump" != "0" ]; then
  echo "ERRO: o dump da origem falhou (codigo $status_dump). O clone atual permanece intacto." >&2
  exit 5
fi
if [ "$status_restore" != "0" ]; then
  # Avisos de objetos ignorados sao aceitaveis; a conferencia de sanidade abaixo decide se a troca ocorre.
  echo "AVISO: o restore terminou com codigo $status_restore (objetos ignorados). Seguindo para a sanidade." >&2
fi

# --- 3. sanidade do athos_novo ---------------------------------------------------------------------------------
echo "[3/5] Conferindo sanidade em $BANCO_NOVO..."
total="$(docker exec athos-teste psql -U postgres -d "$BANCO_NOVO" -At -c "select count(*) from orcamento" 2>/dev/null || echo 0)"
maximo="$(docker exec athos-teste psql -U postgres -d "$BANCO_NOVO" -At -c "select coalesce(max(idorcamento),0) from orcamento" 2>/dev/null || echo 0)"
funcoes="$(docker exec athos-teste psql -U postgres -d "$BANCO_NOVO" -At -c "select count(distinct proname) from pg_proc where proname in ('precovendaproduto','estanapromocao')" 2>/dev/null || echo 0)"
echo "      orcamentos=$total max(idorcamento)=$maximo funcoes-esperadas-encontradas=$funcoes/2"
if ! [ "${total:-0}" -gt "$MIN_ORCAMENTOS_ESPERADOS" ] || ! [ "${maximo:-0}" -ge "$MIN_MAX_ID_ESPERADO" ] || [ "${funcoes:-0}" != "2" ]; then
  echo "ERRO: sanidade reprovada; a troca NAO foi feita e o banco athos do clone permanece intacto." >&2
  exit 6
fi

# --- 4. troca de nomes: athos_novo vira athos ---------------------------------------------------------------------------
echo "[4/5] Trocando os bancos..."
docker exec athos-teste psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $BANCO_ANTIGO"
docker exec athos-teste psql -U postgres -d postgres -q -c "select pg_terminate_backend(pid) from pg_stat_activity where datname in ('athos','$BANCO_NOVO') and pid <> pg_backend_pid()" >/dev/null
docker exec athos-teste psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -c "ALTER DATABASE athos RENAME TO $BANCO_ANTIGO"
if ! docker exec athos-teste psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 -c "ALTER DATABASE $BANCO_NOVO RENAME TO athos"; then
  echo "ERRO: falha ao renomear $BANCO_NOVO; revertendo o banco antigo para athos." >&2
  docker exec athos-teste psql -U postgres -d postgres -q -c "ALTER DATABASE $BANCO_ANTIGO RENAME TO athos" || true
  exit 7
fi
TROCA_FEITA=1
docker exec athos-teste psql -U postgres -d postgres -q -c "DROP DATABASE IF EXISTS $BANCO_ANTIGO"

# --- 5. relatorio --------------------------------------------------------------------------------
echo "[5/5] Clone refeito. Estado atual:"
docker exec athos-teste psql -U postgres -d athos -At -F ' ' -c "select 'orcamentos=' || count(*) || ' max(idorcamento)=' || max(idorcamento) from orcamento"
docker exec athos-teste psql -U postgres -d athos -At -c "select 'ids de referencia presentes: ' || coalesce(string_agg(idorcamento::text, ',' order by idorcamento), 'nenhum') from orcamento where idorcamento in (25822,25877,25900,25951,25952,26047,26109)"
docker exec athos-teste psql -U postgres -d athos -At -c "select 'tamanho do banco: ' || pg_size_pretty(pg_database_size('athos'))"
