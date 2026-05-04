import re
with open('apps/backend/src/modules/quotes/quotes.service.ts', 'rb') as f:
    c = f.read()

matches = list(re.finditer(b'\xc3\x83\xc2[\x80-\xbf]', c))
print(f'Latin high (C3 83 C2 xx) matches: {len(matches)}')
for m in matches[:3]:
    print(f'  pos {m.start()}: {c[m.start():m.start()+8].hex()}')

bullet = c.count(b'\xc3\xa2\xe2\x82\xac\xc2\xa2')
print(f'Bullet mojibake: {bullet}')

emdash = c.count(b'\xc3\xa2\xe2\x82\xac\xe2\x80\x9d')
print(f'Em-dash mojibake: {emdash}')

test = 'Ã§'.encode('utf-8')
print(f'Encoding of Ã§ as UTF-8: {test.hex()}')
count_test = c.count(test)
print(f'Occurrences: {count_test}')

# Sample around known mojibake line 1327 (0-indexed 1326)
lines = c.split(b'\r\n')
print(f'Line 1327 hex: {lines[1326].hex()}')
