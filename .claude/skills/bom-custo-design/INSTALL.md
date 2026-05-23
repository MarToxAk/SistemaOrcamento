# Instruções de uso — Bom Custo Design System (Claude Code)

Este zip contém o design system completo da Bom Custo, pronto pra usar
como **skill do Claude Code** no seu repositório `SistemaOrcamento/`.

## Como instalar (uma vez só)

1. **Descompacte este zip** num lugar temporário.
2. No seu repositório `SistemaOrcamento/`, crie a pasta de skills:
   ```bash
   mkdir -p .claude/skills/bom-custo-design
   ```
3. **Copie o conteúdo do zip** pra dentro dessa pasta:
   ```bash
   cp -R bom-custo-design-system/* .claude/skills/bom-custo-design/
   ```
4. Garanta que o arquivo `SKILL.md` está na raiz da pasta:
   ```
   .claude/skills/bom-custo-design/SKILL.md
   ```

Pronto — a skill agora está visível pro Claude Code.

## Como usar no Claude Code

Abre o Claude Code no seu repo (`npx @anthropic-ai/claude-code` ou pelo
app desktop) e pede coisas como:

```
Use a skill bom-custo-design e repagine a página /orcamento
seguindo o Layout v2 (sidebar dashboard com Painel theme).
Mantém os useEffect de Chatwoot e os fetchs intactos.
```

```
Use a skill bom-custo-design e substitui o arquivo
apps/backend/src/quotes/quotes-pdf.template.ts pelo novo template
PDF colorido. Mantém os mesmos placeholders Handlebars.
```

```
Use a skill bom-custo-design pra atualizar o logo do app:
substitui apps/frontend/public/media/logo_new.svg pelo logo-primary.png.
```

## Antes de mexer no backend (PDF)

Pra o template do PDF funcionar 100%, você precisa hospedar 3 imagens
em URL pública (ou ajustar os defaults no `.ts`):

| Arquivo local                          | URL sugerida                                |
|----------------------------------------|---------------------------------------------|
| `assets/logo-primary.png`              | `https://autopyweb.com.br/logo-primary.png` |
| `assets/pencils-top.png`               | `https://autopyweb.com.br/pencils-top.png`  |
| `assets/pencils-bottom.png`            | `https://autopyweb.com.br/pencils-bottom.png` |

Já tem o domínio `autopyweb.com.br` servindo o `logo_new.svg` atual —
sobe os 3 arquivos novos ali. Se preferir outra URL, abre
`backend/quotes-pdf.template.ts` e troca os defaults.

## Estrutura da skill

```
.claude/skills/bom-custo-design/
├── SKILL.md                       ← manifesto da skill (Claude Code lê isso primeiro)
├── README.md                      ← fundamentos visuais + conteúdo + iconografia
├── colors_and_type.css            ← tokens (CSS vars)
├── Layout v2.html                 ← protótipo do dashboard repaginado
├── Orcamento PDF.html             ← preview do PDF colorido
├── backend/
│   └── quotes-pdf.template.ts     ← template Handlebars pronto pra colar
├── assets/                        ← logos + faixas de lápis
├── preview/                       ← 16 cards do design system
├── ui_kits/                       ← UI kit antigo (referência)
└── layout-v2/                     ← JSX/CSS do Layout v2
```

## Próximos passos sugeridos

1. **PDF primeiro** (10 min): pede pro Claude Code substituir o
   `quotes-pdf.template.ts`. Sobe os 3 PNGs no CDN. Testa gerando 1
   orçamento.
2. **Logo no app** (5 min): pede pro Claude Code trocar
   `logo_new.svg` por `logo-primary.png`.
3. **Frontend repaginado** (1–2 horas com Claude Code): pede pra
   repaginar `/orcamento` primeiro. Depois `/orcamento/novo`,
   `/orcamento/[id]`, e `/status`.

Boa sorte! Qualquer dúvida volta aqui e a gente refina.
