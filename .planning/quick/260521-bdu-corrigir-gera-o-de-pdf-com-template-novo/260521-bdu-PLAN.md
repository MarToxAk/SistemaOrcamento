---
phase: quick
plan: 260521-bdu
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/backend/dist/src/modules/quotes/quotes-pdf-storage.service.js
  - apps/backend/dist/src/modules/quotes/quotes-pdf.template.js
autonomous: true
requirements:
  - BDU-PDF-TEMPLATE
must_haves:
  truths:
    - "PDF gerado usa fonte Mulish, header vermelho e layout moderno do template v2"
    - "dist/ contém quotes-pdf.template.js compilado a partir de quotes-pdf.template.ts"
    - "dist/quotes-pdf-storage.service.js importa QUOTES_PDF_HTML_TEMPLATE do módulo compilado (sem HTML inline)"
  artifacts:
    - path: "apps/backend/dist/src/modules/quotes/quotes-pdf.template.js"
      provides: "Template v2 compilado pronto para uso em produção"
    - path: "apps/backend/dist/src/modules/quotes/quotes-pdf-storage.service.js"
      provides: "Serviço compilado sem HTML inline; importa do template compilado"
  key_links:
    - from: "apps/backend/dist/src/modules/quotes/quotes-pdf-storage.service.js"
      to: "apps/backend/dist/src/modules/quotes/quotes-pdf.template.js"
      via: "require('./quotes-pdf.template')"
      pattern: "quotes-pdf\\.template"
---

<objective>
Corrigir a geração de PDF para usar o template v2 (Mulish, header vermelho, layout moderno)
em vez do template antigo inline que está no dist/ compilado.

**Causa raiz:** O arquivo `dist/src/modules/quotes/quotes-pdf-storage.service.js` foi compilado
ANTES da extração do template para `quotes-pdf.template.ts`. Portanto o JS compilado ainda
carrega o HTML antigo inline e o arquivo `quotes-pdf.template.js` sequer existe no dist/.
Em produção/Docker o backend roda `node dist/src/main.js` (nunca ts-node), então o TypeScript
fonte é completamente ignorado.

Purpose: Fazer o template v2 chegar ao container Docker na próxima build.
Output: dist/ compilado contendo quotes-pdf.template.js + quotes-pdf-storage.service.js atualizado.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

<!-- Arquivos fonte já existem e estão corretos — só o dist/ está stale -->
@apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts
@apps/backend/src/modules/quotes/quotes-pdf.template.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Recompilar o backend para gerar dist/ com template v2</name>
  <files>
    apps/backend/dist/src/modules/quotes/quotes-pdf.template.js
    apps/backend/dist/src/modules/quotes/quotes-pdf-storage.service.js
  </files>
  <action>
    Execute o build do workspace backend a partir da raiz do monorepo para recompilar
    todos os arquivos TypeScript e gerar um dist/ atualizado:

      npm --workspace @bomcusto/backend run build

    O comando invoca `tsc -p apps/backend/tsconfig.build.json` que compila todos os .ts
    incluindo o novo `quotes-pdf.template.ts`. Após a compilação:

    1. Confirme que `apps/backend/dist/src/modules/quotes/quotes-pdf.template.js` foi criado.
    2. Confirme que `apps/backend/dist/src/modules/quotes/quotes-pdf-storage.service.js`
       NÃO contém mais o HTML inline antigo (checar ausência de "bootstrap@5.3.2" e presença
       de "quotes-pdf.template" no require).

    Não altere nenhum arquivo TypeScript — os fontes já estão corretos. A única ação é
    executar o build e verificar os artefatos gerados.

    Se o build falhar por erro de TypeScript (ex: import não resolvido), leia a saída do
    compilador, corrija apenas o erro apontado no arquivo fonte correspondente e recompile.
  </action>
  <verify>
    <automated>
      node -e "const t = require('./apps/backend/dist/src/modules/quotes/quotes-pdf.template.js'); const ok = t.QUOTES_PDF_HTML_TEMPLATE && t.QUOTES_PDF_HTML_TEMPLATE.includes('Mulish'); console.log(ok ? 'PASS: template v2 OK' : 'FAIL: template ausente ou antigo'); process.exit(ok ? 0 : 1);"
    </automated>
  </verify>
  <done>
    - `apps/backend/dist/src/modules/quotes/quotes-pdf.template.js` existe e exporta QUOTES_PDF_HTML_TEMPLATE contendo "Mulish".
    - `apps/backend/dist/src/modules/quotes/quotes-pdf-storage.service.js` referencia "quotes-pdf.template" via require e NÃO contém "bootstrap@5.3.2".
  </done>
</task>

<task type="auto">
  <name>Task 2: Fazer commit e registrar a correção no STATE.md</name>
  <files>
    apps/backend/dist/src/modules/quotes/quotes-pdf.template.js
    apps/backend/dist/src/modules/quotes/quotes-pdf-storage.service.js
    apps/backend/src/modules/quotes/quotes-pdf.template.ts
    apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts
    .planning/STATE.md
  </files>
  <action>
    Faça commit dos arquivos alterados (fontes TS + dist/ recompilado + STATE.md):

      git add apps/backend/src/modules/quotes/quotes-pdf.template.ts
      git add apps/backend/src/modules/quotes/quotes-pdf-storage.service.ts
      git add apps/backend/dist/src/modules/quotes/quotes-pdf.template.js
      git add apps/backend/dist/src/modules/quotes/quotes-pdf-storage.service.js
      git commit -m "fix(pdf): recompilar dist com template v2 (Mulish, header vermelho)"

    Em seguida adicione a entrada da quick task concluída na tabela "Quick Tasks Completed"
    em `.planning/STATE.md`:

      | 260521-bdu | Corrigir geração de PDF: dist/ stale usava template inline antigo; recompilado com template v2 | 2026-05-21 | <hash do commit> | [260521-bdu-corrigir-gera-o-de-pdf-com-template-novo](./quick/260521-bdu-corrigir-gera-o-de-pdf-com-template-novo/) |

    Substitua `<hash do commit>` pelo hash curto real do commit acima (7 chars).

    NOTA: O dist/ é rastreado por git neste projeto (não está em .gitignore). Confirme
    antes com `git check-ignore apps/backend/dist/` — se retornar output vazio, está
    rastreado e deve ser incluído no commit.
  </action>
  <verify>
    <automated>git log --oneline -1</automated>
  </verify>
  <done>
    - Commit criado com mensagem "fix(pdf): recompilar dist com template v2".
    - STATE.md atualizado com a entrada da quick task 260521-bdu.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Build artifacts → Runtime | dist/ compilado determina o comportamento real em produção |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-bdu-01 | Tampering | dist/ compilado | accept | Build local rastreado por git; sem CI/CD automatizado neste projeto |
</threat_model>

<verification>
Após executar os dois tasks:

1. `node -e "require('./apps/backend/dist/src/modules/quotes/quotes-pdf.template.js')"` — sem erro.
2. `grep -c "bootstrap@5.3.2" apps/backend/dist/src/modules/quotes/quotes-pdf-storage.service.js` retorna 0.
3. `grep -c "quotes-pdf.template" apps/backend/dist/src/modules/quotes/quotes-pdf-storage.service.js` retorna >= 1.
4. `git log --oneline -1` mostra o commit de fix.
</verification>

<success_criteria>
- dist/ contém quotes-pdf.template.js com o template v2 (Mulish, header vermelho, layout moderno).
- quotes-pdf-storage.service.js compilado importa o template via require em vez de tê-lo inline.
- O próximo `docker compose build` usará automaticamente o dist/ correto e os PDFs gerados terão o novo visual.
</success_criteria>

<output>
Criar `.planning/quick/260521-bdu-corrigir-gera-o-de-pdf-com-template-novo/260521-bdu-SUMMARY.md` quando concluído.
</output>
