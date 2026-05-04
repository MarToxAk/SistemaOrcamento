import re
with open('apps/backend/src/modules/quotes/quotes.service.ts', 'rb') as f:
    c = f.read()
# 💰 U+1F4B0 correct UTF-8: F0 9F 92 B0
old = bytes([0xC3, 0xB0, 0xC5, 0xB8, 0xE2, 0x80, 0x99, 0xC2, 0xB0])
new = bytes([0xF0, 0x9F, 0x92, 0xB0])
count = c.count(old)
print(f'Found {count} occurrences')
fixed = c.replace(old, new)
with open('apps/backend/src/modules/quotes/quotes.service.ts', 'wb') as f:
    f.write(fixed)
print("Done")
