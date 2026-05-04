with open('apps/backend/src/modules/quotes/quotes.service.ts', 'rb') as f:
    c = f.read()
lines = c.split(b'\r\n')
patterns = ['ðŸ', 'â€', 'Ã©', 'Ã£', 'Ã¡', 'Ã§', 'Ã³', 'Ãº', 'Ã ', 'â"', 'ï¸', 'âƒ']
for i, line in enumerate(lines, 1):
    d = line.decode('latin-1')
    if any(x in d for x in patterns):
        print(f'L{i}: {d[:140]}')
