import sys

with open('.planning/ROADMAP.md', encoding='utf-8') as f:
    c = f.read()

idx_start = c.find('- **4.1**')
idx_end = c.find('\n\n**UAT:**', idx_start)
print(f'idx_start={idx_start}, idx_end={idx_end}')

old_block = c[idx_start:idx_end]
new_block = '- [x] 04-01-PLAN.md -- Jest config + testes unitarios + CI GitHub Actions'
result = c.replace(old_block, new_block, 1)

with open('.planning/ROADMAP.md', 'w', encoding='utf-8', newline='\n') as f:
    f.write(result)

print('done, replaced chars:', len(old_block))