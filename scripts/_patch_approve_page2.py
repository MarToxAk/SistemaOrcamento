import pathlib, re

p = pathlib.Path("apps/frontend/src/app/orcamento/[id]/approve/page.tsx")
src = p.read_text(encoding="utf-8")

# 1. Add Script import after "use client";
src = src.replace(
    '"use client";\n\nimport { useParams, useSearchParams }',
    '"use client";\n\nimport Script from "next/script";\nimport { useParams, useSearchParams }',
)

# 2. Add Bootstrap CDN tags right after the opening <> in return
# Find the first occurrence of <>\n      <style>
old_style_open = '    <>\n      <style>{`'
new_style_open = '''    <>
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js" strategy="beforeInteractive" />
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" />

      <style>{`'''

src = src.replace(old_style_open, new_style_open, 1)

# 3. Add .page-wrapper CSS and replace inline body style with it
# Add .page-wrapper to the <style> block
old_css_end = '''        .btn-approve:disabled {
          opacity: 0.65;
        }
      `}</style>'''

new_css_end = '''        .btn-approve:disabled {
          opacity: 0.65;
        }
        .page-wrapper {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px 16px;
          background-color: #f9f7ed;
          box-sizing: border-box;
        }
      `}</style>'''

src = src.replace(old_css_end, new_css_end, 1)

# 4. Replace the outer div that uses Bootstrap utility classes with .page-wrapper
old_outer = '''      <div
        className="min-vh-100 d-flex align-items-center justify-content-center px-3"
        style={{ backgroundColor: "#f9f7ed" }}
      >'''

new_outer = '      <div className="page-wrapper">'

src = src.replace(old_outer, new_outer, 1)

# 5. Add body margin reset to style block
src = src.replace(
    "        body { background-color: #f9f7ed; }",
    "        body { margin: 0; background-color: #f9f7ed; }",
    1,
)

p.write_text(src, encoding="utf-8")
print("ok", p.stat().st_size, "bytes")

# Verify
assert 'import Script from "next/script"' in src, "FAIL: Script import missing"
assert 'bootstrap@5.3.2' in src, "FAIL: Bootstrap CDN missing"
assert '.page-wrapper' in src, "FAIL: page-wrapper class missing"
assert 'className="page-wrapper"' in src, "FAIL: page-wrapper not applied"
print("all assertions passed")
