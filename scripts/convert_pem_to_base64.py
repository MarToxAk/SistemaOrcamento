import os
import base64

env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
env_path = os.path.abspath(env_path)
backup_path = env_path + '.bak'

with open(env_path, 'r', encoding='utf-8') as f:
    lines = f.read().splitlines()

cert_val = None
key_val = None
for i, l in enumerate(lines):
    if l.startswith('EFI_CERT_PEM='):
        cert_val = l[len('EFI_CERT_PEM='):]
    if l.startswith('EFI_KEY_PEM='):
        key_val = l[len('EFI_KEY_PEM='):]

# Backup
with open(backup_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines) + '\n')

new_lines = [l for l in lines if not (l.startswith('EFI_CERT_PEM=') or l.startswith('EFI_KEY_PEM='))]

if cert_val:
    cert_pem = cert_val.replace('\\n', '\n')
    cert_b64 = base64.b64encode(cert_pem.encode('utf-8')).decode('ascii')
    new_lines.append('EFI_CERT_BASE64=' + cert_b64)

if key_val:
    key_pem = key_val.replace('\\n', '\n')
    key_b64 = base64.b64encode(key_pem.encode('utf-8')).decode('ascii')
    new_lines.append('EFI_KEY_BASE64=' + key_b64)

with open(env_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(new_lines) + '\n')

written = []
if cert_val:
    written.append('EFI_CERT_BASE64')
if key_val:
    written.append('EFI_KEY_BASE64')

if written:
    print('WROTE: ' + ','.join(written))
else:
    print('NO PEM FOUND')
