c = open('.planning/ROADMAP.md', encoding='utf-8').read()

old = '## Phase 3 \u00e2\u20ac\u201c Corre\u00c3\u00a7\u00c3\u00b5es de Fluxo e Qualidade de Dados\n**Status:** not-started'
new = '## Phase 3 \u00e2\u20ac\u201c Corre\u00c3\u00a7\u00c3\u00b5es de Fluxo e Qualidade de Dados\n**Status:** in-review'

if old in c:
    c = c.replace(old, new, 1)
    print('status updated')
else:
    print('WARNING: pattern not found, showing phase 3 section:')
    idx = c.find('Phase 3')
    print(repr(c[idx:idx+200]))

old_uat = '''**UAT:**
- [ ] `GET /api/quotes` sem `take` retorna m\u00c3\u00a1ximo 50 registros + campo `total`
- [ ] Aprovar or\u00c3\u00a7amento com token expirado \u00e2\u2020\u2019 400 com mensagem clara
- [ ] Usar token de aprova\u00c3\u00a7\u00c3\u00a3o duas vezes \u00e2\u2020\u2019 segunda tentativa retorna 400
- [ ] `isAssociated` aparece como campo booleano no response (n\u00c3\u00a3o mais em `notes`)'''

new_uat = '''**UAT:**
- [x] `GET /api/quotes` sem `take` retorna m\u00c3\u00a1ximo 50 registros + campo `total`
- [x] Aprovar or\u00c3\u00a7amento com token expirado \u00e2\u2020\u2019 400 com mensagem clara
- [x] Usar token de aprova\u00c3\u00a7\u00c3\u00a3o duas vezes \u00e2\u2020\u2019 segunda tentativa retorna 400
- [x] `isAssociated` aparece como campo booleano no response (n\u00c3\u00a3o mais em `notes`)'''

if old_uat in c:
    c = c.replace(old_uat, new_uat, 1)
    print('UAT items updated')
else:
    print('WARNING: UAT pattern not found')

open('.planning/ROADMAP.md', 'w', encoding='utf-8', newline='\n').write(c)
print('done')
