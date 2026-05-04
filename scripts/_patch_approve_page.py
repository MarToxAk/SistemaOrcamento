import pathlib

p = pathlib.Path("apps/frontend/src/app/orcamento/[id]/approve/page.tsx")
src = p.read_text(encoding="utf-8")

# 1. Add "already-approved" to ApproveState type
src = src.replace(
    'type ApproveState = "loading-quote" | "idle" | "submitting" | "success" | "error" | "no-token";',
    'type ApproveState = "loading-quote" | "idle" | "submitting" | "success" | "already-approved" | "error" | "no-token";',
)

# 2. Change setState("success") when data?.approved to setState("already-approved")
src = src.replace(
    '        // If already approved, show success state immediately\n        if (data?.approved) {\n          setState("success");\n        }',
    '        // If already approved, show dedicated already-approved state\n        if (data?.approved) {\n          setState("already-approved");\n        }',
)

# 3. Update success paragraph text (per D-03)
src = src.replace(
    'Recebemos sua aprova\u00e7\u00e3o. Em breve nossa equipe entrar\u00e1 em contato.',
    'Nossa equipe j\u00e1 foi notificada e em breve seu pedido entra em produ\u00e7\u00e3o. Avisaremos assim que estiver pronto.',
)

# 4. Add already-approved block after the success block
already_approved_block = '''
            {/* Already approved */}
            {state === "already-approved" && (
              <div className="py-2">
                <div
                  className="rounded-circle d-flex align-items-center justify-content-center mx-auto mb-3"
                  style={{ width: 64, height: 64, background: "#c5f2e8" }}
                >
                  <i className="bi bi-check-lg" style={{ fontSize: 32, color: "#2e7d62" }} />
                </div>
                <h5 className="mb-2">Or\u00e7amento j\u00e1 aprovado</h5>
                {quoteNumber && (
                  <div className="text-muted mb-2 small">Or\u00e7amento <strong>#{quoteNumber}</strong></div>
                )}
                <p className="text-muted">
                  Voc\u00ea j\u00e1 aprovou este or\u00e7amento anteriormente. Nossa equipe est\u00e1 cuidando do seu pedido.
                </p>
                <div className="mt-3 border-top pt-3 small text-muted">
                  D\u00favidas? Fale conosco:{" "}
                  <a href="https://wa.me/5512996484918" className="text-decoration-none fw-semibold">
                    (12) 99648-4918
                  </a>
                </div>
              </div>
            )}

            {/* Error */}'''

src = src.replace('\n            {/* Error */}', already_approved_block, 1)

p.write_text(src, encoding="utf-8")
print("ok", p.stat().st_size, "bytes")

# Verify changes
assert '"already-approved"' in src, "FAIL: type not updated"
assert 'setState("already-approved")' in src, "FAIL: setState not updated"
assert 'Nossa equipe j\u00e1 foi notificada' in src, "FAIL: success text not updated"
assert 'state === "already-approved"' in src, "FAIL: already-approved block missing"
print("all assertions passed")
