---
phase: 47-contas-a-receber-p-ginas-separadas-e-mais-funcionais-lista-g
verified: 2026-11-13T18:15:12Z
status: human_needed
score: 15/18 must-haves verified
covered_files:
  - ".planning/phases/47-contas-a-receber-p-ginas-separadas-e-mais-funcionais-lista-g/47-01-PLAN.md"
  - ".planning/phases/47-contas-a-receber-p-ginas-separadas-e-mais-funcionais-lista-g/47-01-SUMMARY.md"
  - ".planning/phases/47-contas-a-receber-p-ginas-separadas-e-mais-funcionais-lista-g/47-02-PLAN.md"
  - ".planning/phases/47-contas-a-receber-p-ginas-separadas-e-mais-funcionais-lista-g/47-02-SUMMARY.md"
  - ".planning/phases/47-contas-a-receber-p-ginas-separadas-e-mais-funcionais-lista-g/47-03-PLAN.md"
  - ".planning/phases/47-contas-a-receber-p-ginas-separadas-e-mais-funcionais-lista-g/47-03-SUMMARY.md"
  - ".planning/phases/47-contas-a-receber-p-ginas-separadas-e-mais-funcionais-lista-g/47-04-PLAN.md"
  - ".planning/phases/47-contas-a-receber-p-ginas-separadas-e-mais-funcionais-lista-g/47-04-SUMMARY.md"
  - ".planning/phases/47-contas-a-receber-p-ginas-separadas-e-mais-funcionais-lista-g/47-05-PLAN.md"
  - ".planning/phases/47-contas-a-receber-p-ginas-separadas-e-mais-funcionais-lista-g/47-05-SUMMARY.md"
  - ".planning/phases/47-contas-a-receber-p-ginas-separadas-e-mais-funcionais-lista-g/47-06-PLAN.md"
  - ".planning/phases/47-contas-a-receber-p-ginas-separadas-e-mais-funcionais-lista-g/47-06-SUMMARY.md"
  - "apps/backend/src/modules/cobranca/cobranca-efi-detalhe.util.ts"
  - "apps/backend/src/modules/cobranca/cobranca-notas.controller.ts"
  - "apps/backend/src/modules/cobranca/cobranca-notas.lista.test.ts"
  - "apps/backend/src/modules/cobranca/cobranca-notas.service.test.ts"
  - "apps/backend/src/modules/cobranca/cobranca-notas.service.ts"
  - "apps/backend/src/modules/cobranca/cobranca-notas.zip.test.ts"
  - "apps/backend/src/modules/cobranca/cobranca.controller.ts"
  - "apps/backend/src/modules/cobranca/cobranca.module.ts"
  - "apps/backend/src/modules/cobranca/cobranca.service.boleto-detalhe.test.ts"
  - "apps/backend/src/modules/cobranca/cobranca.service.ts"
  - "apps/backend/src/modules/cobranca/dto/baixar-notas-zip.dto.ts"
  - "apps/backend/src/modules/cobranca/dto/listar-notas.query.dto.ts"
  - "apps/backend/src/modules/cobranca/zip-store.util.test.ts"
  - "apps/backend/src/modules/cobranca/zip-store.util.ts"
  - "apps/backend/src/modules/integrations/athos/athos.service.nfe-resumo.test.ts"
  - "apps/backend/src/modules/integrations/athos/athos.service.ts"
  - "apps/frontend/scripts/checar-filtros-boletos.mjs"
  - "apps/frontend/scripts/checar-filtros-url.mjs"
  - "apps/frontend/scripts/checar-notas.mjs"
  - "apps/frontend/src/app/api/cobranca/boleto/[id]/baixa-athos/route.ts"
  - "apps/frontend/src/app/api/cobranca/boleto/[id]/detalhe/route.ts"
  - "apps/frontend/src/app/api/cobranca/nfe/danfe/route.ts"
  - "apps/frontend/src/app/api/cobranca/nfse/[id]/xml/route.ts"
  - "apps/frontend/src/app/api/cobranca/notas/route.ts"
  - "apps/frontend/src/app/api/cobranca/notas/zip/route.ts"
  - "apps/frontend/src/app/contas-receber/[idcliente]/_abas/aba-boletos.tsx"
  - "apps/frontend/src/app/contas-receber/[idcliente]/_abas/aba-contas-em-aberto.tsx"
  - "apps/frontend/src/app/contas-receber/[idcliente]/_abas/aba-gerar-boleto.tsx"
  - "apps/frontend/src/app/contas-receber/[idcliente]/_abas/aba-notas.tsx"
  - "apps/frontend/src/app/contas-receber/[idcliente]/_abas/compartilhado.tsx"
  - "apps/frontend/src/app/contas-receber/[idcliente]/_abas/estilos-modal.tsx"
  - "apps/frontend/src/app/contas-receber/[idcliente]/_abas/use-dados-cliente.ts"
  - "apps/frontend/src/app/contas-receber/[idcliente]/page.tsx"
  - "apps/frontend/src/app/contas-receber/_componentes/boleto-detalhe.tsx"
  - "apps/frontend/src/app/contas-receber/_componentes/boletos-consolidados.tsx"
  - "apps/frontend/src/app/contas-receber/_componentes/notas-fiscais.tsx"
  - "apps/frontend/src/app/contas-receber/_shared/filtros-boletos.ts"
  - "apps/frontend/src/app/contas-receber/_shared/filtros-url.ts"
  - "apps/frontend/src/app/contas-receber/_shared/formatadores.ts"
  - "apps/frontend/src/app/contas-receber/_shared/notas-util.ts"
  - "apps/frontend/src/app/contas-receber/_shared/recursos-bootstrap.tsx"
  - "apps/frontend/src/app/contas-receber/_shared/use-filtros-url.ts"
  - "apps/frontend/src/app/contas-receber/admin-shell.tsx"
  - "apps/frontend/src/app/contas-receber/boletos/page.tsx"
  - "apps/frontend/src/app/contas-receber/notas/page.tsx"
  - "apps/frontend/src/app/contas-receber/page.tsx"
covered_digest: "v4:sha256:873e85808f815b9714e39cea4fa9ab48d0d1fc72362f78e6cbbfab4938b07fee"
behavior_unverified: 3
overrides_applied: 0
behavior_unverified_items:
  - truth: "D-04: aba do cliente (?aba=) e filtros (?status=, ?situacao=, ?de=, ?ate=, ?busca=, ?boleto=, ?tipo=, ?pagina=) ficam na URL e sao restaurados ao abrir/recarregar o link"
    test: "Abrir /contas-receber/123?aba=boletos, recarregar (F5), clicar Verificar/Cancelar (que recarregam a pagina), colar link /contas-receber/boletos?situacao=atrasado&boleto=<id> em outra aba, usar Voltar do navegador"
    expected: "A aba e os filtros permanecem; valor invalido (?aba=xyz) cai em Contas em Aberto; ?boleto=<id> abre a linha certa"
    why_human: "Somente as funcoes puras de leitura da URL tem checagem (checar-filtros-url/boletos/notas); o hook useFiltrosUrl com router.replace e a renderizacao nao tem teste de componente"
  - truth: "D-05/D-06: /contas-receber/boletos mostra tabela compacta com linha expansivel e o detalhe (linha digitavel e PIX com Copiar, titulos, ultimo aviso, historico de baixa); aba Boletos do cliente tem botao Detalhes com o mesmo painel"
    test: "Clicar numa linha de boleto e no botao Detalhes da aba Boletos do cliente; usar Copiar (inclusive acessando por HTTP na rede local)"
    expected: "Painel abre logo abaixo da linha, mostra os dados e o Copiar coloca o texto na area de transferencia ('Copiado!')"
    why_human: "Interacao de UI (expandir, copiar com fallback execCommand) sem teste de componente; build e tsc so provam que compila"
  - truth: "D-06/D-13: o detalhe devolve a linha digitavel e o PIX copia e cola reais lidos na EFI (GET /v1/charge)"
    test: "Abrir o detalhe de um boleto real emitido na EFI e comparar a linha digitavel com a do PDF do boleto; conferir o PIX copia e cola"
    expected: "Linha digitavel igual a do PDF; PIX preenchido quando o boleto tem PIX. Se vier null com consultaEfi 'ok', o log 'chaves de banking_billet: [...]' mostra o caminho real"
    why_human: "O caminho payment.banking_billet.barcode / pix.qrcode e suposicao da documentacao (D-13); os testes usam respostas fabricadas"
human_verification:
  - test: "Em /contas-receber/notas, baixar o XML de uma NFS-e do padrao Nacional (situacao 'salvo' ou 'link')"
    expected: "Arquivo NFSe-<numero>.xml com o XML real da nota (abre como XML valido, mesmo conteudo do ADN/Sefin)"
    why_human: "Depende de dado real em NfseEmitida.xmlNacional/linkNfse; testes usam mocks"
  - test: "Tentar baixar o XML de uma NFS-e antiga (iiBrasil, link que devolve PDF) ou sem xmlNacional/linkNfse"
    expected: "Nenhum arquivo baixado; a linha mostra o selo 'XML Indisponível' com a mensagem do backend ('XML indisponível para a NFS-e N ...')"
    why_human: "Fluxo 404 -> marcacao da linha so roda no navegador com dado real"
  - test: "Selecionar 2 notas (ex.: 1 NFS-e + 1 NF-e de boleto) e clicar no ZIP em lote; abrir o ZIP no Windows/Explorer"
    expected: "ZIP abre sem erro no leitor nativo, com PDF e XML de cada nota (nomes com acento corretos) e LEIA-ME.txt somente se algo faltou; selecionar 51 notas bloqueia o botao com aviso"
    why_human: "ZIP STORE escrito a mao; testado com zipfile do Python, nao com o leitor do Windows nem com notas reais"
  - test: "Clicar PDF de uma NF-e de boleto (DANFE) na pagina Notas Fiscais e na aba Notas do cliente"
    expected: "DANFE correto da nota (numero, valor, cliente), via proxy novo /api/cobranca/nfe/danfe"
    why_human: "Depende do XML real da NF-e no Athos e do renderizador de DANFE"
  - test: "Abrir o detalhe de um boleto real na EFI e conferir linha digitavel e PIX (campo banking_billet.barcode / pix.qrcode ainda suposto)"
    expected: "Linha digitavel identica a do PDF do boleto; PIX copia e cola presente quando o boleto tem PIX; nada logado alem dos nomes de chaves"
    why_human: "Suposicao D-13 sobre o formato da resposta da EFI; so verificavel com boleto real"
  - test: "Navegar no navegador: barra lateral (Resumo e Clientes, Boletos, Notas Fiscais com destaque do item atual), abas do cliente (Contas em Aberto, Gerar Boleto, Boletos, Notas Fiscais) e filtros na URL, incluindo F5 e Voltar"
    expected: "Subitem atual destacado; aba e filtros preservados no link e apos recarregar; Gerar Boleto, E-mail com CC, Verificar, Cancelar, Remover Anexo e Baixar/Estornar no Athos funcionam como antes (mesmos textos de confirmacao)"
    why_human: "Comportamento visual e de navegacao; sem testes de componente/E2E"
  - test: "Revisar as proibicoes (judgment-tier) dos 6 planos listadas na secao 'Proibicoes' deste relatorio"
    expected: "Concordar com o veredito nao-autoritativo do verificador (todas respeitadas pela leitura do codigo)"
    why_human: "unverified-prohibition: veredito de LLM, sem teste de enforcement dedicado"
achados_fora_de_escopo:
  - finding: "AthosService.buscarNotasFiscaisCliente usa a coluna inexistente n.valornota (a real e nota.totalvalornota)"
    where: "apps/backend/src/modules/integrations/athos/athos.service.ts:2924"
    impact: "A query falha, o catch devolve [] e a secao 'Notas Fiscais Athos' da aba Notas do cliente fica sempre vazia ('Nenhuma nota fiscal encontrada no Athos'), inclusive a busca por numero"
    status: "Pre-existente (anterior a Fase 47); registrado em deferred-items.md; decisao do usuario"
---

# Fase 47: Contas a receber: páginas separadas, boletos e notas fiscais PDF/XML — Relatório de Verificação

**Goal da fase:** Tornar a área de contas a receber mais funcional: separar em páginas/abas (lista geral e visão por cliente, com geração de boletos e consulta das contas), melhorar a visualização dos boletos (status, vencimento, linha digitável, PDF) e permitir baixar as notas fiscais em PDF e XML.
**Verificado em:** 2026-11-13T18:15:12Z
**Status:** human_needed
**Re-verificação:** Não (verificação inicial)

A verificação foi feita no código real da branch `feat/fase-42-43-cc-email-baixa-athos` (HEAD `15238f1`), sem confiar nos SUMMARY.

## Atingimento do goal

### Verdades observáveis (must-haves consolidados dos 6 planos + D-01..D-13)

| # | Verdade | Status | Evidência |
|---|---------|--------|-----------|
| 1 | D-01: rotas `/contas-receber`, `/contas-receber/boletos` e `/contas-receber/notas` existem, atrás do `PasswordGate`, com subitens Resumo e Clientes / Boletos / Notas Fiscais no `admin-shell` | ✓ VERIFIED | `boletos/page.tsx` e `notas/page.tsx` com `PasswordGate`+`AdminShell`; `PA_NAV_ITEMS.filhos` com os 3 hrefs; `next build` lista `○ /contas-receber`, `○ /contas-receber/boletos`, `○ /contas-receber/notas`, `ƒ /contas-receber/[idcliente]` |
| 2 | D-01: `/contas-receber` fica só com resumo e clientes; cartão `ResumoBoletos` mantém os contadores da Fase 45 (vencem em até 3 dias, atrasados) com links para `/contas-receber/boletos` | ✓ VERIFIED | `page.tsx` (631 linhas, antes 1072) importa `ResumoBoletos`; o cartão busca `/api/cobranca/boleto/dashboard`, conta `situacaoVencimento === "atrasado"` e linka `/contas-receber/boletos?situacao=atrasado` |
| 3 | D-02: `/contas-receber/[idcliente]` tem dados cadastrais e 4 abas, cada uma em arquivo próprio em `_abas/`; `page.tsx` ≤ 350 linhas | ✓ VERIFIED | `page.tsx` com **172 linhas** (antes 2778); `aba-contas-em-aberto.tsx`, `aba-gerar-boleto.tsx`, `aba-boletos.tsx`, `aba-notas.tsx`, mais `use-dados-cliente.ts`, `compartilhado.tsx`, `estilos-modal.tsx` |
| 4 | D-04: aba (`?aba=`) e filtros ficam na URL e são restaurados; valor inválido cai no padrão | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `lerOpcao(obter("aba"), ABAS_PERMITIDAS, "contas")` + `definir({ aba })`; funções puras testadas (checar-filtros-url 7 OK, checar-filtros-boletos 9 OK, checar-notas 14 OK); o hook com `router.replace` e o re-render não têm teste — ver Verificação humana |
| 5 | D-03 (REC-07): sem mudança de regra de boleto, baixa/estorno no Athos e avisos | ✓ VERIFIED | `git diff 003ba3b..HEAD`: `cobranca.controller.ts` +6 (só a rota `GET boleto/:id/detalhe`), `cobranca.service.ts` +104/−0 (só `NotFoundException` no import, tipo `DetalheBoleto`, cache e `buscarDetalheBoleto`), `email-envio.service.ts`, `cobranca-baixa-athos.service.ts` e `cobranca-aviso-vencimento.*` **sem alteração**; `cobranca.module.ts` só registra o controller/serviço novos; 21 suítes / 298 testes de cobrança verdes |
| 6 | D-03 no frontend: mesmos endpoints, textos de confirm/prompt e regras de bloqueio | ✓ VERIFIED | Todos os endpoints do `[idcliente]/page.tsx` antigo continuam usados, exceto `/api/cobranca/nfse/cliente/:id`, substituído por design (47-06) por `/api/cobranca/notas?idclienteAthos=`; textos de "Dar baixa no Athos?", "Estornar ... Digite ESTORNAR", "Cancelar boleto #...", "Remover registro da NFS-e..." e "Remover anexo da NFS-e..." idênticos ao HEAD de `003ba3b`; regra `selecionadosSemNf` (`!t.tipoNf && t.valor >= 0`, "boleto bloqueado") idêntica |
| 7 | Contas em Aberto: tabela só leitura + histórico (total pago, mês de maior gasto, contas pagas, itens mais comprados, gasto por mês) | ✓ VERIFIED | `aba-contas-em-aberto.tsx` (359 linhas) com os blocos "Mês de Maior Gasto", "Contas Pagas", "Itens Mais Comprados", "Gasto por Mês" |
| 8 | D-05/D-06: tabela compacta com linha expansível e painel de detalhe; botão Detalhes na aba Boletos do cliente | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `boletos-consolidados.tsx` renderiza `<BoletoDetalhe>` na linha expandida (`definir({ boleto })`); `aba-boletos.tsx:249/286` com botão Detalhes e o mesmo componente; `boleto-detalhe.tsx` busca `/detalhe` e `/baixa-athos` em paralelo, `copiarTexto` com fallback; sem teste de UI |
| 9 | D-07: ações reunidas no detalhe e só as que já existiam (PDF, copiar, verificar, cancelar, simular/baixar, estornar, ver cliente) | ✓ VERIFIED | `boletos-consolidados.tsx:245-345`: mesmas URLs (`baixar-athos`, `estornar-baixa-athos`, `verificar-pagamento`, `cancelar`) e métodos (POST) já existentes; nenhuma rota de ação nova |
| 10 | D-08: filtros status, situação, período e busca por cliente; "Mostrando X de Y" | ✓ VERIFIED | `filtros-boletos.ts` (`lerFiltrosBoletos`, `filtrarBoletos`) usado em `boletos-consolidados.tsx:181/367`; `Mostrando {visiveis.length} de {boletos.length}`; checar-filtros-boletos 9/9 OK |
| 11 | D-09/D-13: `GET /api/cobranca/notas` devolve NFS-e (até 500, sem carregar o XML) e NF-e dos boletos não cancelados; Athos fora não derruba a lista | ✓ VERIFIED | `CobrancaNotasService.listarNotas`; 2ª consulta só `select: { id }` com `xmlNacional: { not: null }`; `buscarNfeResumoPorTitulos` usa `n.totalvalornota AS valornota`, `to_char(n.dataemissao,'YYYY-MM-DD')` e os mesmos filtros de `buscarNotasFiscaisXmlPorTitulos` (SELECT parametrizado, compatível com PG 9.0.5); testes L1–L9, A1–A4b e DTO verdes |
| 12 | D-10: PDF pelas rotas existentes (`nfse/:id/pdf`, `nfe/danfe`) na página geral e na aba do cliente | ✓ VERIFIED | `notas-fiscais.tsx:211` (`/api/cobranca/nfse/<id>/pdf`) e `:231` (`/api/cobranca/nfe/danfe?cobrancaBoletoId=&numero=`); proxy novo `api/cobranca/nfe/danfe/route.ts` repassa para o `GET cobranca/nfe/danfe` já existente; `aba-notas.tsx` usa o mesmo `NotasFiscais` |
| 13 | D-11: `GET nfse/:id/xml` entrega `xmlNacional`, senão o conteúdo de `linkNfse`; PDF/HTML/link não http → 404 "XML indisponível"; nunca gera XML | ✓ VERIFIED | `baixarNfseXml` + `baixarXmlDoLink` (inspeção `%PDF-`, `<html`, `<!doctype`, não começa por `<`; `maxContentLength` 5 MB; timeout 15 s); testes X1–X9, C1, C2 verdes |
| 14 | D-11 no frontend: botão XML; nota sem XML mostra "XML Indisponível", nunca arquivo falso | ✓ VERIFIED | `notas-fiscais.tsx:196-201` chama `/api/cobranca/nfse/<id>/xml` e marca a linha com `xmlIndisponivel(status, mensagem)` (404 + /xml indispon[ií]vel/); selo em `:390`; botão XML desabilitado com `semXml`; `xmlIndisponivel` coberto em checar-notas |
| 15 | D-12: ZIP em lote (`POST notas/zip`) com PDF+XML, LEIA-ME das pendências, limite 50 (backend, proxy e tela) | ✓ VERIFIED | `gerarZipNotas` (400 vazio/>50, 404 sem arquivos, LEIA-ME.txt, nomes saneados), `zip-store.util.ts` sem dependência npm (nenhum `package.json` alterado); proxy valida corpo e limite; tela com `acimaDoLimite` desabilitando o botão; testes Z1–Z12, U1–U7 verdes |
| 16 | D-06/D-13: detalhe do boleto devolve linha digitável e PIX reais lidos na EFI | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `extrairDadosPagamentoEfi` lê `data.payment.banking_billet.barcode` / `.pix.qrcode` (com fallback para `data[0]` e raiz); caminho é suposição documentada em D-13, testes E1–E5 usam payload fabricado |
| 17 | D-13: detalhe é somente leitura, cache de 60 s, nunca 500 por falha da EFI e não loga linha digitável/PIX | ✓ VERIFIED | `buscarDetalheBoleto` sem `update`/baixa; cache `Map` por boleto/txid só para leitura com linha digitável; `catch` devolve `consultaEfi: "falha"`; log só com nomes de chaves; testes S1–S6 (S6: nenhum log contém linha/PIX) e 5 testes de cache verdes |
| 18 | Proxies novos exigem sessão de admin; nenhum segredo, linha digitável ou PIX em log introduzido pela fase | ✓ VERIFIED | `requireAdminSession` + validação de id/params nos 6 proxies novos (`nfse/[id]/xml`, `notas`, `notas/zip`, `boleto/[id]/detalhe`, `boleto/[id]/baixa-athos`, `nfe/danfe`); grep nas linhas adicionadas: logs só com ids, contagens e `err.message`; credenciais EFI só no header Basic, nunca logadas; scripts usam valores fictícios |

**Score:** 15/18 verdades verificadas (3 presentes, com comportamento ainda não verificado)

### Proibições (judgment-tier, veredito não autoritativo — unverified-prohibition, revisão humana recomendada)

| Plano | Proibição | Veredito do verificador |
|-------|-----------|-------------------------|
| 47-01 | Não alterar `cobranca.service.ts`/`cobranca.controller.ts`/baixa/aviso/`email-envio.service.ts` | Respeitada no 47-01; o 47-03 acrescentou (só adição) `buscarDetalheBoleto` e a rota de detalhe, autorizado pela ampliação D-13; baixa, aviso e e-mail intocados |
| 47-01 | Nenhuma dependência npm nova | Respeitada (`git diff` sem `package.json`/lockfile) |
| 47-01/47-06 | Nunca montar/converter/completar XML | Respeitada (só bytes de `xmlNacional`, `linkNfse` e `nota.xml` do Athos) |
| 47-02/47-04/47-05 | Não mudar textos de confirm/prompt, condições e endpoints | Respeitada (textos idênticos ao `003ba3b`) |
| 47-03 | Nenhuma escrita no Athos/banco nas rotas do plano; SQL compatível com PG 9.0.5; sem teste em produção | Respeitada (só SELECT parametrizado, `pg` mockado). Observação: o ZIP de NFS-e reaproveita `baixarDanfsePdf`, que já gravava `xmlNacional` em cache no Tier 2 antes da fase (comportamento existente da rota de PDF, não é rota do 47-03) |
| 47-05/47-06 | Não tocar no backend; nenhuma ação nova | Respeitada |

### Artefatos obrigatórios

| Artefato | Esperado | Status | Detalhes |
|----------|----------|--------|----------|
| `apps/backend/src/modules/cobranca/cobranca-notas.service.ts` | `baixarNfseXml`, `gerarZipNotas`, `listarNotas` | ✓ VERIFIED | 473 linhas, registrado no `CobrancaModule` |
| `apps/backend/src/modules/cobranca/cobranca-notas.controller.ts` | `GET notas`, `GET nfse/:id/xml`, `POST notas/zip` | ✓ VERIFIED | Sem `@Public` (guard global) |
| `apps/backend/src/modules/cobranca/zip-store.util.ts` | `criarZipStore`, `crc32` | ✓ VERIFIED | Sem dependência npm |
| `apps/backend/src/modules/cobranca/cobranca-efi-detalhe.util.ts` | `extrairDadosPagamentoEfi`, `chavesBoletoEfi` | ✓ VERIFIED | Usado por `buscarDetalheBoleto` |
| `apps/backend/src/modules/integrations/athos/athos.service.ts` | `buscarNfeResumoPorTitulos` com `n.totalvalornota` | ✓ VERIFIED | Linhas 2678–2726 |
| `apps/backend/src/modules/cobranca/cobranca.service.ts` | `buscarDetalheBoleto` | ✓ VERIFIED | Linhas 871–948 |
| 6 proxies Next em `apps/frontend/src/app/api/cobranca/...` | `requireAdminSession` | ✓ VERIFIED | Listados no `next build` |
| `apps/frontend/src/app/contas-receber/boletos/page.tsx`, `notas/page.tsx` | Rotas com `PasswordGate` | ✓ VERIFIED | — |
| `apps/frontend/src/app/contas-receber/[idcliente]/page.tsx` + `_abas/*` | Casca ≤ 350 linhas + 4 abas | ✓ VERIFIED | 172 linhas |
| `_componentes/boleto-detalhe.tsx`, `boletos-consolidados.tsx`, `notas-fiscais.tsx` | Detalhe, tabela, notas | ✓ VERIFIED | Importados pelas páginas/abas |
| `_shared/filtros-url.ts`, `use-filtros-url.ts`, `filtros-boletos.ts`, `notas-util.ts`, `formatadores.ts` | Funções puras e hook | ✓ VERIFIED | Cobertos pelos scripts `checar-*.mjs` |

### Verificação de ligações (key links)

| De | Para | Via | Status |
|----|------|-----|--------|
| proxy `nfse/[id]/xml` | `CobrancaNotasController` | `backendFetch /cobranca/nfse/:id/xml`, 404 JSON repassado | ✓ WIRED |
| `CobrancaNotasService.gerarZipNotas` | `CobrancaService.baixarDanfsePdf` | reutilização sem alteração | ✓ WIRED |
| `cobranca.module.ts` | `CobrancaNotasController`/`Service` | controllers/providers | ✓ WIRED |
| `boletos/page.tsx` | proxy `boleto/dashboard` | `BoletosConsolidados` | ✓ WIRED |
| `contas-receber/page.tsx` e `[idcliente]/page.tsx` | `use-filtros-url.ts` | `useFiltrosUrl` + `Suspense` | ✓ WIRED |
| `admin-shell.tsx` | `/contas-receber/boletos`, `/contas-receber/notas` | subitens | ✓ WIRED |
| `listarNotas` | `buscarNfeResumoPorTitulos` + `buscarNomesClientes` | chamadas diretas | ✓ WIRED |
| `buscarDetalheBoleto` | `extrairDadosPagamentoEfi` | `resp.data` da EFI | ✓ WIRED |
| `boleto-detalhe.tsx` | proxies `/detalhe` e `/baixa-athos` | `fetch` ao montar | ✓ WIRED |
| `boletos-consolidados.tsx` | `filtros-boletos.ts` | `lerFiltrosBoletos`/`filtrarBoletos` | ✓ WIRED |
| `notas-fiscais.tsx` | proxies `notas`, `nfse/[id]/xml`, `nfse/[id]/pdf`, `nfe/danfe`, `notas/zip` | `fetch`/`baixarArquivo` | ✓ WIRED |
| `aba-notas.tsx` | `NotasFiscais` | `idclienteAthos` + `acoesExtrasNfse` (Remover Anexo) | ✓ WIRED |
| `aba-gerar-boleto.tsx` | `use-dados-cliente.ts` | `onRecarregar` → `recarregar()` | ✓ WIRED |

### Trace de dados (Level 4)

| Artefato | Dado | Origem | Dado real | Status |
|----------|------|--------|-----------|--------|
| `notas-fiscais.tsx` | `dados.nfse` / `dados.nfe` | `GET /cobranca/notas` → Prisma `nfseEmitida.findMany` + Athos `buscarNfeResumoPorTitulos` | Sim | ✓ FLOWING |
| `boleto-detalhe.tsx` | `linhaDigitavel`, `pixCopiaECola`, `titulos` | `buscarDetalheBoleto` → Prisma + EFI `GET /v1/charge` | Sim (caminho do campo EFI suposto) | ✓ FLOWING (ver item humano) |
| `boleto-detalhe.tsx` | `historico` de baixa | `GET /cobranca/boleto/:id/baixa-athos` (rota existente) | Sim | ✓ FLOWING |
| `boletos-consolidados.tsx` | `boletos` | `GET /cobranca/boleto/dashboard` (existente) | Sim | ✓ FLOWING |
| `aba-notas.tsx` | `notasFiscaisAthos` | `AthosService.buscarNotasFiscaisCliente` | **Não** (SQL com coluna inexistente, sempre `[]`) | ⚠️ STATIC — pré-existente, fora de escopo (ver abaixo) |

### Checagens comportamentais

| Comportamento | Comando | Resultado | Status |
|---------------|---------|-----------|--------|
| Suítes de cobrança (inclui XML, ZIP, lista, detalhe, D-03) | `npm --prefix apps/backend run test -- cobranca --no-coverage` | 21 suítes, 298 testes passaram | ✓ PASS |
| Tipos do backend | `npx tsc --noEmit -p apps/backend/tsconfig.json` | exit 0 | ✓ PASS |
| Tipos do frontend | `npx tsc --noEmit -p apps/frontend/tsconfig.json` | exit 0 | ✓ PASS |
| Build do frontend | `npm --prefix apps/frontend run build` | "Compiled successfully"; rotas novas listadas; `next-env.d.ts` alterado pelo build e restaurado com `git checkout` | ✓ PASS |
| Filtros da URL | `node apps/frontend/scripts/checar-filtros-url.mjs` | exit 0, 7 OK | ✓ PASS |
| Filtros de boletos | `node apps/frontend/scripts/checar-filtros-boletos.mjs` | exit 0, 9 OK | ✓ PASS |
| Funções de notas | `node apps/frontend/scripts/checar-notas.mjs` | exit 0, 14 OK | ✓ PASS |

### Execução de probes

Step 7c: não se aplica (fase sem probes `scripts/*/tests/probe-*.sh` declarados).

### Cobertura de requisitos (IDs locais da fase)

| Requisito | Planos | Descrição (resumo) | Status | Evidência |
|-----------|--------|--------------------|--------|-----------|
| REC-01 | 02, 03, 04, 05, 06 | Páginas/abas separadas e filtros na URL | ✓ SATISFIED (navegação real: humano) | Verdades 1, 3, 4, 10 |
| REC-02 | 04 | Tela do cliente em abas | ✓ SATISFIED | Verdade 3 |
| REC-03 | 03, 05 | Visualização dos boletos com linha digitável/PIX | ? NEEDS HUMAN | Verdades 8, 16, 17 |
| REC-04 | 01, 06 | XML da NFS-e | ✓ SATISFIED (dado real: humano) | Verdades 13, 14 |
| REC-05 | 03, 06 | Lista de notas e PDF | ✓ SATISFIED | Verdades 11, 12 |
| REC-06 | 01, 06 | ZIP em lote | ✓ SATISFIED (leitor real: humano) | Verdade 15 |
| REC-07 | 01..06 | Sem mudança de regra (D-03) | ✓ SATISFIED | Verdades 5, 6 |

Nenhum requisito órfão (os IDs REC-* são locais da fase e todos foram reivindicados por planos).

### Anti-padrões encontrados

| Arquivo | Linha | Padrão | Severidade | Impacto |
|---------|-------|--------|------------|---------|
| (linhas adicionadas na fase) | — | TBD/FIXME/XXX/TODO/HACK | — | Nenhum marcador encontrado |
| `apps/frontend/src/app/api/cobranca/boleto/[id]/{cancelar,verificar-pagamento,pdf}/route.ts` | — | Proxies pré-existentes sem `requireAdminSession` | ℹ️ Info | Pré-existente; agora também acionados pela página de boletos (que fica atrás do PasswordGate). Fora do escopo da fase |
| `apps/backend/src/modules/cobranca/cobranca.service.ts` | 296 | Log pré-existente de `barcode.slice(0, 20)` na criação do boleto | ℹ️ Info | Pré-existente (não introduzido pela fase); expõe parte da linha digitável no log |
| `apps/backend/src/modules/cobranca/cobranca-notas.service.ts` | gerarZipNotas | `err.message` interno vai para o LEIA-ME.txt do ZIP | ℹ️ Info | Apenas mensagens de erro do próprio sistema, para admin autenticado |
| `.planning/phases/47-*/47-0*-SUMMARY.md` | — | Hashes de commit citados (ex.: 48a3b87, 8c0d990, 453ee0c) são dos worktrees; na branch os commits têm outros hashes (ex.: d5ba022, e0424f7, 7bf8177) | ℹ️ Info | O conteúdo correspondente foi conferido no código da branch (to_char/totalvalornota, guarda "Cliente inválido.", proxy baixa-athos) |

### Achado fora de escopo (registrado, não bloqueia)

**`AthosService.buscarNotasFiscaisCliente` usa a coluna inexistente `n.valornota`** (`apps/backend/src/modules/integrations/athos/athos.service.ts:2924`). No Athos a coluna é `nota.totalvalornota` (confirmado no clone `athos-teste` durante o 47-03). O `catch` do método devolve `[]`, então a seção **"Notas Fiscais Athos" da aba Notas do cliente fica sempre vazia** ("Nenhuma nota fiscal encontrada no Athos"), inclusive a busca por número, sem erro visível. É anterior à Fase 47, está em `deferred-items.md` e não foi corrigido por causa de D-03. Correção sugerida (decisão do usuário): `n.totalvalornota AS valornota` e `to_char(n.dataemissao, 'YYYY-MM-DD')`, com teste de regressão, validado no clone (nunca no Athos de produção).

### Verificação humana necessária

1. **Baixar XML de NFS-e nacional** — em `/contas-receber/notas`, clicar XML de uma NFS-e com situação "salvo"/"link". Esperado: `NFSe-<numero>.xml` com o XML real. Por quê: depende de dado real.
2. **XML indisponível em NFS-e antiga** — clicar XML de uma NFS-e iiBrasil (link devolve PDF) ou sem XML. Esperado: nenhum arquivo, selo "XML Indisponível" com a mensagem do backend.
3. **ZIP com 2 notas** — selecionar 1 NFS-e + 1 NF-e e gerar o ZIP; abrir no Explorer do Windows. Esperado: PDF+XML de cada nota, nomes corretos, LEIA-ME só se faltou algo; com 51 selecionadas o botão fica bloqueado.
4. **DANFE de NF-e de boleto** — botão PDF de uma NF-e na página Notas e na aba do cliente. Esperado: DANFE correto.
5. **Linha digitável/PIX de boleto real na EFI** — abrir o detalhe de um boleto real e comparar com o PDF. O campo `banking_billet.barcode` / `pix.qrcode` ainda é suposição (D-13); se vier nulo com `consultaEfi: "ok"`, o log mostra os nomes das chaves reais.
6. **Navegação das abas no navegador** — barra lateral com subitem destacado; abas do cliente e filtros na URL preservados após F5/Voltar/link colado; linha expansível e Copiar; ações (gerar boleto, e-mail com CC, verificar, cancelar, remover anexo, baixar/estornar no Athos) iguais a antes.
7. **Revisar as proibições** listadas acima (veredito do verificador não é autoritativo).

### Resumo

Não foram encontrados gaps: todas as rotas, proxies, serviços e componentes existem, têm conteúdo real, estão ligados e o build/testes/tsc/scripts passam. O D-03 foi confirmado por diff (alterações em `cobranca.service.ts`/`cobranca.controller.ts` são só adições; `email-envio.service.ts`, baixa e aviso intactos; textos e regras de UI idênticos). O status é **human_needed** porque três verdades dependem de comportamento real que nenhum teste exercita (navegação/URL no navegador, linha expansível e o formato real da resposta da EFI) e porque os downloads de XML/ZIP/DANFE precisam ser conferidos com notas reais.

---

_Verificado em: 2026-11-13T18:15:12Z_
_Verificador: Claude (gsd-verifier)_
