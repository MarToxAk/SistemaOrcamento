# Fix sep variable: replace mojibake bytes with ────────────  (12 × U+2500)
with open('apps/backend/src/modules/quotes/quotes.service.ts', 'rb') as f:
    c = f.read()

# old sep bytes: C3 A2 E2 80 9D C2 81 repeated 12 times
old_sep = bytes([0xC3, 0xA2, 0xE2, 0x80, 0x9D, 0xC2, 0x81]) * 12

# new sep: 12 × ─ (U+2500) = E2 94 80
new_sep = bytes([0xE2, 0x94, 0x80]) * 12

count = c.count(old_sep)
print(f'old sep found: {count} times')
fixed = c.replace(old_sep, new_sep)
with open('apps/backend/src/modules/quotes/quotes.service.ts', 'wb') as f:
    f.write(fixed)
print('Done')
