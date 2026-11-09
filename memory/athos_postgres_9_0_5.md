---
name: athos-postgres-9-0-5
description: "O banco Athos roda PostgreSQL 9.0.5 (32-bit) — versão muito antiga, afeta SQL/introspecção"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 385543f4-0635-4a2d-9df3-fe67e7d95d3f
---

O banco do Athos (ERP) roda **PostgreSQL 9.0.5 (32-bit, Visual C++ build 1500)** — confirmado em 2026-06-30 rodando `SELECT version()` em `192.168.3.198/athos` (usuário read-only `usuario_leitura`).

Implicações ao escrever SQL contra o Athos:
- `pg_sequence_last_value()` **não existe** (só PG 10+) — foi a causa do bug do conta_pagar (PR #44 removeu essa chamada).
- `information_schema.triggers` **não tem** `action_timing`; `pg_rules` não tem `ev_type/is_instead/oid`. Para introspecção, usar `pg_catalog` direto (`pg_trigger`, `pg_constraint`, `pg_rules` só com `rulename/definition`), não `information_schema`.
- `RETURNING` funciona (desde 8.2) — OK para PK serial.
- O host real é `192.168.33.198` (mesmo servidor que `100.102.146.44` via Tailscale) e é o **Athos de PRODUÇÃO** (max idorcamento bate com capturas ao vivo do Balcão). O usuário `usuario_leitura` **não é read-only de fato**: tem INSERT em `orcamento` (verificado 2026-11-09). Nunca rodar escrita de teste nele.
- Para testes de escrita: clone local `athos-teste` (Docker, `127.0.0.1:5440`, db `athos`, user `postgres`/`athosteste`, PG14) criado em 2026-11-09 via `pg_dump` read-only (pg_dump ≤14 é necessário: 15+ não lê servidor 9.0). Conectar ao original pela rede do container `orcamento-ts-webserver2`.

Relacionado: [[athos-conta-pagar-sequence]] se existir.
