with open('.planning/STATE.md', 'r', encoding='utf-8') as f:
    content = f.read()

old = "Last activity: 2026-05-03 — Phase 7 complete (MSG-01, MSG-02, MSG-03, MSG-04, MSG-05)"
new = "Last activity: 2026-05-03 — Phase 7 UAT PASSED (10/10 tests) — ready for Phase 8"

if old in content:
    content = content.replace(old, new)
    with open('.planning/STATE.md', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Updated STATE.md")
else:
    print("Old text not found")
