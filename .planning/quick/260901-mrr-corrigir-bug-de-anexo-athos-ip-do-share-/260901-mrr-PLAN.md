---
id: 260901-mrr
type: quick
phase: quick-260901-mrr
plan: 01
wave: 1
depends_on: [260820-smb-ip-dinamico]
autonomous: false
requirements: [SMBCFG-01, SMBCFG-02, SMBCFG-03]
files_modified:
  - deploy/docker-compose.vps.yml
  - apps/backend/src/modules/integrations/athos/athos-smb.util.test.ts
  - .env.example
  - .env

estimate:
  tokens: 45000
  raw_tokens: 30000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Definir SMB_HOST no ambiente muda o share usado pela conexao SMB2 real (getSmbDebugInfo().share), nao apenas o path UNC gravado no banco."
    - "Definir SMB_HOST em deploy/stack.env chega efetivamente ao container do backend em producao."
    - "Um operador que abre o .env.example da raiz descobre SMB_HOST sem precisar ler deploy/stack.env.example nem o codigo-fonte."
    - "O .env real da raiz declara SMB_HOST explicitamente, em vez de depender do default hardcoded do codigo."
  artifacts:
    - apps/backend/src/modules/integrations/athos/athos-smb.util.test.ts
    - .env.example
    - deploy/docker-compose.vps.yml
  key_links:
    - "deploy/stack.env (SMB_HOST) -> deploy/docker-compose.vps.yml (environment) -> process.env.SMB_HOST no container -> getSmbShare() em athos-smb.util.ts"
    - "getSmbHost() em athos-smb.util.ts e getSmbUncRoot() em athos-anexo.util.ts leem a MESMA variavel e precisam apontar para o mesmo servidor"
---

<objective>
Fechar as lacunas de configuracao que fazem o IP do share SMB de anexos do Athos continuar
efetivamente hardcoded em `192.168.3.203`, mesmo depois da quick task `260820-smb-ip-dinamico`
ter tornado `SMB_HOST` legivel via env.

Purpose: o erro real de producao (`ETIMEDOUT 192.168.3.203:445` ao anexar conta a pagar
519) mostra `smbShare=\\192.168.3.203\html` — ou seja, o backend caiu no default do codigo.
Existem tres motivos possiveis, e dois deles sao corrigiveis por codigo/config neste plano:
  1. **BUG (novo, descoberto nesta investigacao):** `deploy/docker-compose.vps.yml` repassa
     `SMB_USER`, `SMB_PASS` e `SMB_DOMAIN` ao container do backend, mas **nao repassa
     `SMB_HOST`**. Logo, `SMB_HOST` definido em `deploy/stack.env` nunca chega ao processo
     Node em producao — o trabalho da task 260820 esta inerte no caminho de deploy.
  2. **DOC:** o `.env.example` da RAIZ (usado no ambiente local) nao documenta `SMB_HOST`,
     entao ninguem sabe que o knob existe sem ler o codigo.
  3. **INFRA (fora de escopo):** o servidor `192.168.3.203` estar de fato inacessivel na
     porta 445 a partir deste ambiente. Isso NAO e corrigivel por codigo — vira checkpoint
     de acao humana no fim do plano.

Output: `SMB_HOST` funcional de ponta a ponta (env -> compose -> runtime), documentado nas
duas superficies de configuracao, com teste de regressao cobrindo o lado que faltava.
</objective>

<context>
@.planning/STATE.md
@.planning/quick/260820-smb-ip-dinamico/SUMMARY.md
@apps/backend/src/modules/integrations/athos/athos-smb.util.ts
@apps/backend/src/modules/integrations/athos/athos-anexo.util.test.ts
</context>

<constraints_herdadas>
- NAO reimplementar `getSmbHost()` / `getSmbShare()` / `getSmbUncRoot()` — ja existem e
  funcionam (task 260820). Este plano so conserta a *entrega* da variavel e a documentacao.
- NAO alterar o default `"192.168.3.203"` no codigo — ele mantem compatibilidade com
  ambientes que ainda nao setaram a env var (decisao explicita da task 260820).
- NAO adicionar `SMB_HOST` a `REQUIRED_ENV_VARS` em `apps/backend/src/modules/app.module.ts`
  — a variavel tem default e tornar obrigatoria quebraria o boot de ambientes existentes.
- NAO tentar consertar o `ETIMEDOUT` em si (rota/firewall/Tailscale/servidor desligado).
- Ferramentas Read/Grep estao NEGADAS para `.env*` neste ambiente (guardrail de segredos).
  Usar `node -e` via Bash para inspecionar/editar esses arquivos, **sem nunca imprimir o
  conteudo integral do `.env` real** — apenas testar a presenca da chave especifica.
</constraints_herdadas>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Provar SMB_HOST de ponta a ponta — repasse no compose + teste do share real</name>
  <files>
    apps/backend/src/modules/integrations/athos/athos-smb.util.test.ts (novo),
    deploy/docker-compose.vps.yml
  </files>
  <read_first>
    - apps/backend/src/modules/integrations/athos/athos-smb.util.ts (getSmbHost / getSmbShare / getSmbDebugInfo)
    - apps/backend/src/modules/integrations/athos/athos-anexo.util.test.ts (linhas 45-54 — padrao de teste com SMB_HOST customizado, replicar o mesmo estilo)
    - deploy/docker-compose.vps.yml (bloco `environment:` do servico backend, linhas ~55-127; as vars SMB_* estao nas linhas 113-115)
  </read_first>
  <behavior>
    - Teste 1: sem `SMB_HOST` no ambiente, `getSmbDebugInfo().share` retorna o share default `\\192.168.3.203\html` (garante que o fallback da task 260820 nao regrediu).
    - Teste 2: com `process.env.SMB_HOST = "10.0.0.50"`, `getSmbDebugInfo().share` retorna `\\10.0.0.50\html` — prova que o host configurado alcanca a conexao SMB2 real, nao so o path UNC do banco.
    - Teste 3: com `SMB_HOST` definido como string com espacos em volta (ex: `"  10.0.0.50  "`), o share sai sem os espacos (o `.trim()` de `getSmbHost()` esta coberto).
  </behavior>
  <action>
    Esta e a fatia vertical do plano: cobre a camada de runtime (util que monta o share) e a
    camada de deploy (entrega da variavel ao container), que sao as duas pontas do elo
    quebrado.

    (a) RUNTIME — criar `athos-smb.util.test.ts` no mesmo diretorio do util, importando
    apenas `getSmbDebugInfo` (funcao ja exportada; NAO importar `smbWriteContaPagarFile`
    nem `smbUnlinkContaPagarFile`, que fariam o `require("@marsaud/smb2")` lazy disparar e
    tentar rede). Estruturar com `describe`/`beforeEach`/`afterEach` fazendo
    `delete process.env.SMB_HOST` no setup e no teardown, exatamente como
    `athos-anexo.util.test.ts` faz nas linhas 45-47 — sem esse isolamento os testes vazam
    estado entre si. Escrever os tres casos do bloco `<behavior>` acima. Preservar tambem o
    valor original de `process.env.SMB_HOST` se ja existir no ambiente do runner, restaurando
    no `afterEach`, para nao quebrar a suite quando rodada numa maquina com a var setada.

    Este teste fecha uma lacuna Nyquist real: a task 260820 testou `getSmbUncRoot()` (o path
    gravado em `anexo.caminhoanexo`) mas deixou `getSmbShare()` — o valor que de fato abre o
    socket TCP 445 e que aparece como `smbShare=` no log do erro — sem cobertura nenhuma.

    (b) DEPLOY — em `deploy/docker-compose.vps.yml`, no bloco `environment:` do servico
    `backend`, adicionar a linha de repasse de `SMB_HOST` imediatamente antes de `SMB_USER`,
    seguindo o mesmo formato `CHAVE: ${CHAVE}` usado por todas as outras variaveis do bloco.
    Sem isso, `SMB_HOST=<ip>` em `deploy/stack.env` e lido pelo Compose para interpolacao mas
    nunca injetado no processo Node — que entao cai no default do codigo. E exatamente por
    isso que o log de producao mostra `smbShare=\\192.168.3.203\html` mesmo com
    `stack.env.example` documentando a variavel desde a task 260820.

    Acrescentar, junto do repasse, um comentario curto de uma linha explicando que este valor
    precisa casar com o host do share montado/alcancado pelo backend.

    NAO alterar `athos-smb.util.ts` nem `athos-anexo.util.ts` nesta task — a logica de leitura
    ja esta correta; o que faltava era teste e entrega.
  </action>
  <verify>
    <automated>cd apps/backend && npx jest athos-smb.util.test.ts athos-anexo.util.test.ts</automated>
    <automated>cd apps/backend && npx tsc --noEmit -p tsconfig.build.json</automated>
    <automated>node -e "const l=require('fs').readFileSync('deploy/docker-compose.vps.yml','utf8').split(/\r?\n/).filter(x=>!x.trim().startsWith('#'));const ok=l.some(x=>/^\s*SMB_HOST:\s*\$\{SMB_HOST\}\s*$/.test(x));if(!ok){console.error('FALHA: SMB_HOST nao repassado ao container');process.exit(1)}console.log('OK: SMB_HOST repassado ao backend')"</automated>
  </verify>
  <done>
    `athos-smb.util.test.ts` existe com 3 casos verdes provando que SMB_HOST controla
    `getSmbDebugInfo().share`; `docker-compose.vps.yml` repassa `SMB_HOST` ao container do
    backend na mesma lista das demais vars SMB_*; `tsc` limpo; suites athos-smb e athos-anexo
    100% verdes.
  </done>
  <reversibility rating="reversible">
    Uma linha de env no compose e um arquivo de teste novo — revert trivial por `git revert`.
  </reversibility>
</task>

<task type="auto">
  <name>Task 2: Documentar SMB_HOST no .env.example da raiz e declara-lo no .env local</name>
  <files>.env.example, .env</files>
  <precondition>
    `.env` da raiz esta coberto pelo `.gitignore` (confirmado nesta investigacao:
    `git check-ignore -v .env` retorna `.gitignore:4:.env`). Reconfirmar antes de escrever;
    se o `.env` deixou de ser ignorado, PARAR e reportar em vez de editar.
  </precondition>
  <read_first>
    - deploy/stack.env.example (linhas 38-45 — bloco SMB_* ja documentado; usar como
      referencia de redacao e de nomes, adaptando o comentario para o contexto local)
  </read_first>
  <action>
    As ferramentas Read/Grep/Edit estao negadas para caminhos `.env*` neste ambiente. Fazer
    toda a inspecao e escrita destes dois arquivos via `node -e` no Bash. Regra dura: **nunca
    imprimir o conteudo integral do `.env` real** (contem certificados PEM, senhas SMTP e
    chaves EFI) — apenas testar a presenca da chave e reportar booleano.

    (a) `.env.example` (versionado, sem segredos): checar se ja existe uma linha nao-comentada
    comecando por `SMB_HOST=`. Se nao existir, inserir um bloco SMB junto das demais
    variaveis de integracao Athos, contendo:
      - um comentario de 2-3 linhas explicando que e o host (IP ou hostname) do servidor
        Windows que expoe o share `html`, onde os anexos de conta a pagar do Athos sao
        gravados; que o mesmo valor alimenta tanto a conexao SMB2 quanto o path UNC salvo em
        `anexo.caminhoanexo` para o ERP abrir o arquivo depois; e que, se a variavel ficar
        vazia, o backend usa o default do codigo (`192.168.3.203`);
      - a linha `SMB_HOST=192.168.3.203` (valor atual de producao, mesmo criterio adotado em
        `deploy/stack.env.example`);
      - as companheiras que faltarem no arquivo (`SMB_USER=`, `SMB_PASS=`, `SMB_DOMAIN=WORKGROUP`,
        `ATHOS_SMB_MOUNT_PATH=`), cada uma vazia ou com o mesmo default de `stack.env.example`,
        **apenas se ainda nao estiverem presentes** — nao duplicar chave existente.
    Preservar a codificacao e o estilo de quebra de linha do arquivo (ler como utf8 e
    reescrever com o mesmo separador `\r\n` ou `\n` predominante detectado).

    (b) `.env` (real, gitignored): checar presenca de linha nao-comentada `SMB_HOST=`. Se
    ausente, **acrescentar ao final** `SMB_HOST=192.168.3.203` precedida de um comentario de
    uma linha apontando que o valor deve ser o IP/hostname alcancavel do servidor de anexos.
    Se ja presente, nao tocar no arquivo e apenas reportar. Tornar a configuracao explicita
    aqui e o ponto: hoje o valor vem invisivelmente do default do codigo, e o operador nao
    tem onde trocar o IP sem editar fonte.

    Ficar explicito no relato da task: escrever `192.168.3.203` no `.env` NAO conserta o
    `ETIMEDOUT` — e o mesmo host que ja esta timeoutando. O ganho e tornar o knob visivel e
    editavel; a troca pelo IP correto e a Task 3.
  </action>
  <verify>
    <automated>node -e "const s=require('fs').readFileSync('.env.example','utf8');const ok=s.split(/\r?\n/).map(x=>x.trim()).filter(x=>!x.startsWith('#')).some(x=>/^SMB_HOST=\S+/.test(x));if(!ok){console.error('FALHA: SMB_HOST ausente em .env.example');process.exit(1)}console.log('OK: SMB_HOST documentado em .env.example')"</automated>
    <automated>node -e "const s=require('fs').readFileSync('.env','utf8');const ok=s.split(/\r?\n/).map(x=>x.trim()).filter(x=>!x.startsWith('#')).some(x=>/^SMB_HOST=\S+/.test(x));if(!ok){console.error('FALHA: SMB_HOST ausente no .env local');process.exit(1)}console.log('OK: SMB_HOST declarado no .env local')"</automated>
    <automated>node -e "const{execSync}=require('child_process');let ig=false;try{execSync('git check-ignore -q .env');ig=true}catch(e){}if(!ig){console.error('FALHA CRITICA: .env nao esta gitignored');process.exit(1)}console.log('OK: .env permanece fora do versionamento')"</automated>
  </verify>
  <done>
    `.env.example` documenta `SMB_HOST` (com comentario explicativo) junto do bloco SMB;
    `.env` local declara `SMB_HOST` explicitamente; `.env` continua gitignored e nenhum
    segredo foi impresso no transcript nem adicionado ao `.env.example`.
  </done>
</task>

<task type="checkpoint:human-action" gate="blocking-human">
  <name>Task 3: Operador aponta SMB_HOST para um servidor alcancavel e valida a porta 445</name>
  <action>Definir SMB_HOST com o IP/hostname alcancavel do servidor de anexos do Athos e reiniciar o backend — exige acesso a rede interna/Tailnet, indisponivel ao agente.</action>
  <instructions>
    Fronteira de escopo. As Tasks 1 e 2 ja garantiram tudo que era automatizavel: o IP do
    share e 100% configuravel, a variavel chega ao processo Node em todos os ambientes
    (local e container), e o knob esta documentado. O que resta **nao** e corrigivel por
    codigo — e a causa imediata do erro relatado:

    `causa=Error: connect ETIMEDOUT 192.168.3.203:445`

    `ETIMEDOUT` na porta 445 significa que o host nao respondeu: servidor desligado, IP
    trocado, fora da Tailnet/VPN, ou firewall bloqueando SMB. E infraestrutura.

    Passos:

    1. Descobrir o IP/hostname atual do servidor que expoe o share `html`. No Windows:
       `Test-NetConnection -ComputerName <ip-ou-host> -Port 445`
       Esperado: `TcpTestSucceeded : True`.
    2. Se o backend roda via Tailscale, conferir que o no esta online (`tailscale status`) e
       preferir o hostname/IP da Tailnet ao IP de LAN.
    3. Definir o valor validado em `.env` da raiz (local) E em `deploy/stack.env` (producao)
       — este ultimo agora e efetivo, porque a Task 1 fez o compose repassar a variavel.
    4. Reiniciar o backend (local: restart do processo Nest; producao:
       `docker compose -f deploy/docker-compose.vps.yml up -d backend`).
    5. Reenviar o anexo que falhou (conta a pagar `519`).

    Se o erro persistir com o host correto e a porta 445 acessivel, a causa passa a ser
    credenciais (`SMB_USER`/`SMB_PASS`/`SMB_DOMAIN`) ou permissoes do share — abrir nova
    task de diagnostico com o log completo, nao reabrir esta.
  </instructions>
  <verification>
    No log do backend, a linha de erro/sucesso do anexo deve exibir `smbShare=` com o host
    novo (prova de que a env var chegou ao processo) e a gravacao deve concluir sem
    `ETIMEDOUT`. Se o servidor seguir inacessivel, registrar a pendencia no SUMMARY.
  </verification>
  <resume-signal>
    Digite "ok" apos validar o host e reenviar o anexo, ou "pendente" para registrar a
    pendencia de infraestrutura e encerrar a task sem a validacao ponta-a-ponta.
  </resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| repositorio -> mundo | `.env.example` e `docker-compose.vps.yml` sao versionados e publicos para quem tem o repo |
| backend -> share SMB | credenciais SMB e host de destino cruzam para um servico de arquivos na rede interna |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-260901-01 | Information Disclosure | `.env` real (PEM, SMTP, EFI) | critical | mitigate | Task 2 proibe imprimir conteudo integral do `.env`; verificacao so testa presenca da chave e retorna booleano |
| T-260901-02 | Information Disclosure | `.env.example` versionado | medium | mitigate | Task 2 grava apenas `SMB_HOST` com o IP de LAN ja publicado em `deploy/stack.env.example`; `SMB_USER`/`SMB_PASS` ficam vazios |
| T-260901-03 | Information Disclosure | `.env` acidentalmente versionado | high | mitigate | Verificacao automatizada da Task 2 falha se `git check-ignore .env` deixar de acusar o arquivo como ignorado |
| T-260901-04 | Tampering | `SMB_HOST` apontando para host hostil | medium | accept | Valor so e definido por operador com acesso ao `.env`/`stack.env`; mesmo modelo de confianca das demais vars de infra ja existentes |
| T-260901-SC | Tampering | instalacao de pacotes npm/pip/cargo | n/a | accept | Nenhuma dependencia nova e instalada neste plano — zero superficie de supply chain |
</threat_model>

<verification>
1. `cd apps/backend && npx jest athos-smb.util.test.ts athos-anexo.util.test.ts` — todos verdes.
2. `cd apps/backend && npx tsc --noEmit -p tsconfig.build.json` — sem erros.
3. `SMB_HOST: ${SMB_HOST}` presente no bloco `environment` do backend em `deploy/docker-compose.vps.yml`.
4. `SMB_HOST` presente e nao-comentado em `.env.example` e no `.env` local.
5. `git check-ignore -q .env` continua retornando sucesso (arquivo fora do versionamento).
6. `git status` nao lista `.env` entre os arquivos a commitar.
</verification>

<success_criteria>
- Trocar `SMB_HOST` no ambiente muda comprovadamente o share usado pela conexao SMB2 (teste automatizado, nao inspecao visual).
- `SMB_HOST` definido em `deploy/stack.env` chega ao processo Node dentro do container.
- Um operador encontra `SMB_HOST` no `.env.example` da raiz sem ler codigo-fonte nem `deploy/`.
- O SUMMARY final declara de forma inequivoca que o `ETIMEDOUT 192.168.3.203:445` e causa de
  infraestrutura, fora do alcance deste plano, e lista o que o operador precisa fazer.
- Nenhum segredo do `.env` real vazou para o transcript, para o `.env.example` ou para o git.
</success_criteria>

<output>
Criar `.planning/quick/260901-mrr-corrigir-bug-de-anexo-athos-ip-do-share-/SUMMARY.md` ao final.

O SUMMARY DEVE conter uma secao `## Fora de Escopo (infraestrutura)` registrando que o
`ETIMEDOUT` na porta 445 nao foi — e nao poderia ser — resolvido por codigo, e uma secao
`## Pendente (acao humana)` com os passos da Task 3.

O SUMMARY DEVE tambem destacar o bug novo encontrado (`SMB_HOST` ausente do bloco
`environment` de `deploy/docker-compose.vps.yml`), porque ele tornava inerte, em producao,
todo o trabalho da quick task `260820-smb-ip-dinamico`.
</output>
