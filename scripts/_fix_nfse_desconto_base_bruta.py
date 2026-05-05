import pathlib

f = pathlib.Path("apps/backend/src/modules/integrations/nfse/nfse.service.ts")
c = f.read_text(encoding="utf-8")

repls = [
(
"""  /** Percentual de desconto (0-100) sobre totalPago ou valorServicos (NFSD-02) */
  descontoPorcentagem?: number;
  /** Valor fixo de desconto em reais (NFSD-03) */
  descontoValor?: number;
  /** Base de calculo para desconto percentual; se ausente usa valorServicos (NFSD-02) */
  totalPago?: number;""",
"""  /** Percentual de desconto (0-100) sobre valorServicos (NFSD-02) */
  descontoPorcentagem?: number;
  /** Valor fixo de desconto em reais (NFSD-03) */
  descontoValor?: number;
  /** @deprecated Mantido por compatibilidade; percentual agora usa sempre valorServicos */
  totalPago?: number;"""
),
(
"""    const valorLiquido  = Number((input.valorServicos - input.descontoIncondicionado).toFixed(2));
    const valorCbs      = Number((valorLiquido * CBS_RATE).toFixed(2));
    const valorIbs      = Number((valorLiquido * IBS_RATE).toFixed(2));""",
"""    const valorCbs      = Number((input.valorServicos * CBS_RATE).toFixed(2));
    const valorIbs      = Number((input.valorServicos * IBS_RATE).toFixed(2));"""
),
(
"""      const base = (input.totalPago != null && Number.isFinite(input.totalPago) && input.totalPago > 0)
        ? input.totalPago
        : valorServicos;""",
"""      const base = valorServicos;"""
)
]

changed = 0
for old, new in repls:
    if old in c:
        c = c.replace(old, new, 1)
        changed += 1
    else:
        print("Trecho nao encontrado:")
        print(old.splitlines()[0])

f.write_text(c, encoding="utf-8")
print(f"OK - substituicoes aplicadas: {changed}/{len(repls)}")
