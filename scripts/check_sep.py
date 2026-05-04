with open('apps/backend/src/modules/quotes/quotes.service.ts', 'rb') as f:
    c = f.read()
lines = c.split(b'\r\n')
# find sep line
for i, line in enumerate(lines, 1):
    if b'const sep =' in line:
        print(f'L{i}: {line.decode("utf-8", errors="replace")}')
        print(f'  hex: {line.hex()}')
