import io
p=' .planning/STATE.md'
# Fix path spacing potential issue
import os
fp = os.path.join(os.getcwd(), '.planning', 'STATE.md')
with open(fp, 'r', encoding='utf-8') as f:
    s = f.read()
old = '- **Branch atual:** main'
new = '- **Branch atual:** ship/phase-07\n- **Shipping:** branch pushed (ship/phase-07) — PR pending'
if old in s:
    s = s.replace(old, new)
    with open(fp, 'w', encoding='utf-8') as f:
        f.write(s)
    print('STATE.md updated')
else:
    print('Old string not found; no change')
