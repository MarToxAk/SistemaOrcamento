import re
with open('apps/backend/src/modules/quotes/quotes.service.ts', 'rb') as f:
    c = f.read()
for m in re.finditer(b'\xc3\xb0\xc5\xb8', c):
    pos = m.start()
    seq = c[pos:pos+12]
    print(pos, seq.hex())
