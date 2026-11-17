# Fase 50 - Roteiro de homologacao D-17 (boleto atualizado com juros e multa)

**Quem executa:** o usuario (Diego), na maquina onde esta o Docker. Nenhum agente gera boleto real, paga boleto, envia e-mail,
mexe em producao ou faz deploy.

**O que se prova aqui (hipoteses da pesquisa que so a EFI e o Athos reais confirmam):**

- **A3:** a EFI aceita boleto novo com vencimento **hoje**.
- **A5:** o Athos aceita `juros`, `multa` e `atraso` gravados em `conta_recebida` (testado so no clone).
- **A5b:** os itens do boleto novo aparecem na EFI com os nomes "Juros de mora" e "Multa por atraso".

---

## TRAVAS DE SEGURANCA (leia antes de qualquer passo)

1. **Athos de producao e proibido:** `192.168.33.198` e `100.102.146.44` nunca entram em nenhuma variavel, comando ou tela
   desta homologacao. A baixa so pode ser gravada no clone **`athos-teste`** (`127.0.0.1:5440`).
2. **Bancos em uso sao proibidos:** `orcamento-postgres` (porta 5435) e `box-postgres` (porta 5438). O banco do Sistema desta
   homologacao e o container descartavel **`orcamento-homolog-fase50`** em `127.0.0.1:5450` (ja criado e migrado na Task 1).
3. **Nunca rode `prisma migrate` sem `DATABASE_URL` explicito apontando para `127.0.0.1:5450`.**
4. **Boleto real somente de valor baixo (ate R$ 5,00)**, em nome de **cliente interno**, com CPF/CNPJ e e-mail **seus/da
   empresa**. Nenhum e-mail pode ir para cliente real. Antes de enviar o e-mail, confira o destinatario na tela.
5. Credenciais da EFI (`EFI_CLIENT_ID`, `EFI_CLIENT_SECRET`) entram **somente como variaveis do terminal**, nunca em arquivo
   do repositorio, nunca neste roteiro.
6. **Nao faca deploy e nao reinicie container de producao** (`orcamento-backend`, `orcamento-frontend`, `box-*`).
7. A porta 3000 e do Chatwoot: o frontend desta homologacao roda na **3050**.

---

## Passo 0 - Pre-requisitos (confira antes de comecar)

```bash
# 1) Banco descartavel da homologacao (somente local) - deve listar 127.0.0.1:5450
docker ps --filter name=orcamento-homolog-fase50 --format '{{.Names}} {{.Ports}} {{.Status}}'
docker exec orcamento-homolog-fase50 pg_isready -U postgres

# 2) Clone do Athos - deve listar 127.0.0.1:5440 (se estiver parado: docker start athos-teste)
docker ps -a --filter name=athos-teste --format '{{.Names}} {{.Ports}} {{.Status}}'
docker start athos-teste
docker exec athos-teste pg_isready -U postgres

# 3) A migration da Fase 50 ja esta no banco descartavel (esperado: 1)
docker exec orcamento-homolog-fase50 psql -U postgres -d orcamento_homolog -tAc \
  "select count(*) from _prisma_migrations where migration_name = '20261117120000_add_cobranca_boleto_atualizado'"
```

Se o banco descartavel nao existir (por exemplo, foi removido), recrie-o e migre **somente nele**:

```bash
docker run -d --name orcamento-homolog-fase50 -p 127.0.0.1:5450:5432 \
  -e POSTGRES_PASSWORD=homolog50 -e POSTGRES_DB=orcamento_homolog postgres:16-alpine
export URL_HOMOLOG="postgresql://postgres:homolog50@127.0.0.1:5450/orcamento_homolog"
case "$URL_HOMOLOG" in *127.0.0.1:5450*) echo "URL ok";; *) echo "URL ERRADA - pare"; false;; esac
DATABASE_URL="$URL_HOMOLOG" npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma
```

## Passo 1 - Subir o ambiente local

Defina as variaveis **no terminal** (variaveis do processo sobrepoem o `.env` da raiz):

```bash
cd /root/SistemaOrcamento

# Banco do Sistema = descartavel (5450)
export DATABASE_URL="postgresql://postgres:homolog50@127.0.0.1:5450/orcamento_homolog"
case "$DATABASE_URL" in *127.0.0.1:5450*) echo "DATABASE_URL ok";; *) echo "ERRADA - pare"; false;; esac

# Athos = clone local (NUNCA 192.168.33.198 / 100.102.146.44)
export ATHOS_PG_HOST=127.0.0.1
export ATHOS_PG_PORT=5440
export ATHOS_PG_DB=athos
export ATHOS_PG_USER=postgres
export ATHOS_PG_PASS="athosteste"        # senha do clone (memory/athos_postgres_9_0_5.md)
export ATHOS_BAIXA_AUTO=true
export ATHOS_BAIXA_ID_FORMA_PAGAMENTO=10
export ATHOS_BAIXA_ID_LIVRO_REGISTRO=2
export ATHOS_BAIXA_ID_FUNCIONARIO=1

# EFI (producao da EFI, conta real; informe voce mesmo)
export EFI_COBRANCA_BASE_URL="https://cobrancas.api.efipay.com.br"
export EFI_CLIENT_ID="<informe aqui>"
export EFI_CLIENT_SECRET="<informe aqui>"

# URLs locais (sem webhook publico: a confirmacao do pagamento e pelo botao "Verificar")
export APP_BASE_URL="http://localhost:3050"
export BACKEND_URL="http://localhost:4000/api"

# Desligar o que nao faz parte da homologacao (evita herdar hosts/rotinas de producao do .env da raiz)
export COBRANCA_AVISO_ATIVO=false          # aviso de vencimento (Fase 45): nao enviar e-mail a ninguem
export EFI_RECONCILIACAO_ATIVA=false       # job de reconciliacao EFI
export ATHOS_ORCAMENTO_ESCRITA=false       # criacao de orcamento pela IA (Fase 44)
```

Observacoes:

- As chaves internas (`INTERNAL_API_KEY`, `ADMIN_API_KEY`) e o SMTP vem do `.env` da raiz, que o backend ja carrega. **Nao
  copie nem imprima esses valores.** O e-mail desta homologacao vai pelo SMTP real: so envie para o **seu proprio e-mail**.
- O frontend precisa das mesmas chaves como variaveis do processo: exporte `INTERNAL_API_KEY` e `ADMIN_API_KEY` no terminal do
  frontend com o mesmo valor do backend. Se `CONFIG_PANEL_PASSWORD` estiver definida, a tela `/configuracoes/cobranca` pede
  essa senha.

Suba em dois terminais:

```bash
# Terminal A - backend (porta 4000)
npm --prefix apps/backend run start:dev

# Terminal B - frontend (porta 3050) - mesmas chaves exportadas
npm --prefix apps/frontend run dev -- -p 3050
```

Confira que o backend subiu apontando para o clone: no log deve aparecer conexao com `127.0.0.1:5440`; se aparecer
`192.168.33.198` ou `100.102.146.44`, **pare tudo imediatamente** e revise as variaveis.

Ao terminar de subir, abra `http://localhost:3050/configuracoes/cobranca` e confira as taxas padrao (juros 0,99% ao mes,
multa 2%).

## Passo 2 - Massa de teste no clone (somente 127.0.0.1:5440)

Escolha um titulo em aberto de um **cliente interno** (seu CPF/CNPJ e seu e-mail no cadastro do clone). Consultas (somente
leitura) no **clone**:

```bash
docker exec athos-teste psql -U postgres -d athos -c "
SELECT cr.idcontareceber, cr.idcliente, cr.numerotitulo, cr.valor, cr.datavencimento, TRIM(cr.statusconta) AS status
  FROM conta_receber cr
 WHERE TRIM(cr.statusconta) IN ('AVC','VEN')
 ORDER BY cr.datavencimento DESC
 LIMIT 20;"
```

Para achar um cliente interno pelo nome, no clone:

```bash
docker exec athos-teste psql -U postgres -d athos -c "
SELECT c.idcliente, COALESCE(cf.nome, cj.nomefantasia, cj.razaosocial) AS nome
  FROM cliente c
  LEFT JOIN cliente_fisico cf ON cf.idcliente = c.idcliente
  LEFT JOIN cliente_juridico cj ON cj.idcliente = c.idcliente
 WHERE COALESCE(cf.nome, cj.nomefantasia, cj.razaosocial) ILIKE '%<parte do nome>%';"
```

Ajuste **no clone** o titulo escolhido (substitua `<ID>`; so o clone, nunca o Athos de producao) para valor de R$ 5,00 e
vencimento ha 10 dias:

```bash
docker exec athos-teste psql -U postgres -d athos -c "
UPDATE conta_receber
   SET valor = 5.00,
       datavencimento = CURRENT_DATE - 10,
       statusconta = 'VEN'
 WHERE idcontareceber = <ID>;"
```

> Se o cliente interno do clone nao tiver CPF/CNPJ e e-mail validos, ajuste-os **no clone** antes (tabelas `cliente_fisico` /
> `cliente_juridico` e contato). O boleto exige CPF/CNPJ valido do pagador.

Anote: titulo `<ID>`, principal **P = 5,00**, vencimento original **V = hoje - 10 dias**.

## Passo 3 - Gerar o boleto normal (fluxo atual)

1. Abra `http://localhost:3050/contas-receber/<idcliente>`, aba de boletos/titulos.
2. Gere um boleto com o titulo `<ID>` pelo fluxo normal (como em producao). Confirme que o boleto aparece como pendente na
   lista e que o valor e R$ 5,00.
3. Anote o id interno do boleto (`#N`) e o `charge_id` da EFI.

## Passo 4 - Atualizar o boleto ("Atualizar")

1. Na linha do boleto pendente, clique em **Atualizar**.
2. No modal, confira a previa do servidor: duas datas permitidas, taxas padrao (juros 0,033% ao dia / 0,99% ao mes e multa
   2%), detalhamento por titulo e a mensagem de 4 linhas.
3. Escolha **"Hoje"** como novo vencimento (confirma **A3**). Se a EFI recusar, **anote o erro exato** (mensagem e codigo) e
   repita com o proximo dia util.
4. Confirme. Anote o resultado: novo boleto `#M`, original marcado como cancelado.

## Passo 5 - Conferir no painel da EFI

No painel da EFI (producao) confira:

- O boleto **original** esta **cancelado** ("canceled").
- O boleto **novo** tem os itens: titulo(s)/NF, **"Juros de mora"** e **"Multa por atraso"** (confirma **A5b**).
- A **mensagem** do boleto tem 4 linhas (informacoes do boleto atualizado).
- Configuracoes do boleto: multa **2%** e juros **0,033% ao dia** apos o vencimento (na API: `fine` 200 e `interest` 33).
- Valor total = principal + juros + multa (ver tabela do Passo 9).

## Passo 6 - E-mail do boleto novo

1. Ao confirmar, o sistema segue para o modal de e-mail com o boleto novo. **Troque o destinatario para o seu proprio
   e-mail** (e confira que nao ha CC de cliente real).
2. Envie. No seu e-mail, confira a mensagem e o quadro **"Boleto atualizado"** (valor, juros, multa, novo vencimento).
3. Na lista, confira: marca "Atualizado - substitui #N", total com juros e multa, juros/multa por titulo e o alerta de
   pagamento em dobro no boleto original (se aplicavel).

## Passo 7 - Pagar o boleto novo

Pague o boleto novo (PIX do boleto, se disponivel, ou o meio que a EFI oferecer). Como o webhook publico nao existe nesta
homologacao, a confirmacao e pelo botao **Verificar** na lista (Passo 8). Aguarde a EFI compensar (PIX do boleto costuma ser
imediato).

## Passo 8 - Verificar e conferir a baixa (somente no clone)

1. Na lista de boletos, clique **Verificar** no boleto novo; ele deve virar pago.
2. Confira no **clone** (substitua `<ID>` pelo id do titulo):

```bash
docker exec athos-teste psql -U postgres -d athos -c "
SELECT valorpago, juros, multa, atraso, datapagamento
  FROM conta_recebida
 WHERE idcontareceber = <ID>;"

docker exec athos-teste psql -U postgres -d athos -c "
SELECT idcontareceber, TRIM(statusconta) AS statusconta
  FROM conta_receber
 WHERE idcontareceber = <ID>;"
```

3. Esperado: `valorpago` = total do boleto novo, `juros`, `multa` e `atraso` preenchidos (confirma **A5**) e
   `statusconta = 'REC'`.
4. No Sistema (banco descartavel), confira o estado da baixa:

```bash
docker exec orcamento-homolog-fase50 psql -U postgres -d orcamento_homolog -c "
SELECT id, status, \"athosBaixaStatus\", \"athosBaixaErroCodigo\", \"boletoOrigemId\", \"valorPrincipal\", \"valorJuros\", \"valorMulta\"
  FROM \"CobrancaBoleto\" ORDER BY id DESC LIMIT 5;"
```

   (se algum nome de coluna de status divergir, rode `\d "CobrancaBoleto"` e ajuste a consulta; so leitura.)

## Passo 9 - Tabela esperado x obtido

Formula do caso dourado: `d = novo vencimento - V` (dias), `juros = round(P x 0,033% x d)` arredondado meio para cima em
centavos, `multa = 2% de P`, `total = P + juros + multa`. Exemplo de referencia com P = 5,00 e d = 10: juros = 0,02, multa =
0,10, total = 5,12 (ajuste ao valor e aos dias reais escolhidos).

| Item | Esperado | Obtido |
|------|----------|--------|
| Principal P | 5,00 | |
| Vencimento original V | hoje - 10 dias | |
| Novo vencimento N | hoje (ou proximo dia util se a EFI recusou) | |
| Dias d = N - V | 10 (ou conforme N) | |
| Juros (taxa 0,033% ao dia) | round(P x 0,00033 x d) | |
| Multa (2%) | 0,10 | |
| Total do boleto novo | P + juros + multa | |
| EFI: original | canceled | |
| EFI: itens do boleto novo | NF..., "Juros de mora", "Multa por atraso" | |
| EFI: mensagem | 4 linhas | |
| EFI: multa/juros configurados | fine 200 / interest 33 | |
| E-mail recebido com quadro "Boleto atualizado" | sim | |
| Clone: `conta_recebida.valorpago` | = total | |
| Clone: `juros` / `multa` / `atraso` | juros / multa / d | |
| Clone: `conta_receber.statusconta` | REC | |

Hipoteses da pesquisa (marque):

- **A3** (EFI aceita vencimento hoje): [ ] sim  [ ] nao  - erro/observacao: ______________________
- **A5** (Athos aceita juros/multa/atraso gravados): [ ] sim  [ ] nao  - observacao: ______________________
- **A5b** (nomes dos itens "Juros de mora" e "Multa por atraso" na EFI): [ ] sim  [ ] nao  - observacao: ______________________

## Passo 10 - Limpeza

```bash
# Parar backend (Terminal A) e frontend (Terminal B) com Ctrl+C

# Remover o banco descartavel da homologacao (somente ele)
docker rm -f orcamento-homolog-fase50

# Opcional: parar o clone do Athos
docker stop athos-teste
```

- O titulo ajustado no clone (`athos-teste`) pode ficar como esta ou ser descartado junto com o clone: **nada em producao a
  desfazer**.
- O boleto real de R$ 5,12 pago e o original cancelado na EFI sao os unicos efeitos fora da maquina local; ambos sao da
  conta propria.
- Desfaca as variaveis do terminal (feche o terminal) para nao deixar `EFI_CLIENT_ID`/`EFI_CLIENT_SECRET` no ambiente.

---

## Como responder

Responda **"aprovado"** com a tabela do Passo 9 preenchida e A3/A5/A5b marcados, ou descreva o problema encontrado
(mensagem de erro, passo, o que apareceu na EFI/clone). Depois da aprovacao, ha uma segunda decisao separada: **liberar** ou
**segurar** o deploy em producao.
