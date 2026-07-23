"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { useEmpresa } from "@/lib/empresa";

interface PasswordGateProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
}

/**
 * Gate de senha reutilizavel (D-03 opcao "a"): so renderiza `children` apos
 * checar/autenticar a sessao de admin (`/api/admin/login`, cookie
 * `orcamento_admin_session`). Portado 1:1 do fluxo inline em
 * `templates-manager.tsx` para reuso em outras paginas protegidas — mesma
 * rota, mesmo cookie, sem nova env var.
 */
export default function PasswordGate({
  children,
  title = "Acesso restrito",
  description = "Esta area exige a senha de configuracoes para continuar.",
}: PasswordGateProps) {
  const { EMPRESA_NOME, EMPRESA_LOGO_URL } = useEmpresa();
  // null = ainda checando; true/false definido.
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordErro, setPasswordErro] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Checa o status da sessao na entrada — decide entre prompt de senha e children.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/login", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as {
          authenticated?: boolean;
          configured?: boolean;
        };
        if (cancelled) return;
        const required = Boolean(data.configured);
        setPasswordRequired(required);
        // Sem senha configurada no servidor → modelo "interno", segue direto.
        setAuthed(required ? Boolean(data.authenticated) : true);
      } catch {
        if (cancelled) return;
        // Falha ao checar: assume que segue (rotas ainda protegem por 401).
        setAuthed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    setPasswordErro("");
    if (!passwordInput) {
      setPasswordErro("Digite a senha.");
      return;
    }
    setLoginLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordInput }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data?.error || "Senha incorreta.");
      }
      setPasswordInput("");
      setAuthed(true);
    } catch (error) {
      setPasswordErro(error instanceof Error ? error.message : "Falha ao autenticar.");
    } finally {
      setLoginLoading(false);
    }
  }

  const bootstrapAssets = (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js" strategy="beforeInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.js" strategy="beforeInteractive" />
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" />
    </>
  );

  const gateStyles = (
    <style>{`
      .pw-gate-bg {
        min-height: 100vh;
        background: linear-gradient(135deg, #c5f2e8 0%, #cbe1f9 25%, #e7d8f9 50%, #f9e7f5 75%, #f0cacb 100%);
      }
      .pw-gate-card {
        max-width: 420px;
        width: 100%;
        border: none;
        border-radius: 18px;
        box-shadow: 0 18px 40px rgba(12, 27, 42, 0.12);
      }
      .pw-gate-logo {
        width: 76px;
        height: 76px;
        background: #fff;
        border-radius: 14px;
        padding: 8px;
        box-shadow: 0 4px 14px rgba(0,0,0,0.08);
        display: flex;
        align-items: center;
        justify-content: center;
        margin: -54px auto 18px;
      }
      .pw-gate-logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
      .pw-gate-icon {
        width: 76px;
        height: 76px;
        border-radius: 14px;
        margin: -54px auto 18px;
        background: linear-gradient(135deg, #0e6d73, #14a958);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 14px rgba(14, 109, 115, 0.28);
      }
      .pw-gate-icon i { color: #fff; font-size: 1.9rem; }
      .pw-gate-input:focus {
        border-color: #0e6d73;
        box-shadow: 0 0 0 0.2rem rgba(14, 109, 115, 0.15);
      }
      .pw-gate-btn {
        background: #0e6d73;
        border-color: #0e6d73;
      }
      .pw-gate-btn:hover, .pw-gate-btn:focus {
        background: #0a4f54;
        border-color: #0a4f54;
      }
    `}</style>
  );

  // Ainda verificando a sessao na entrada.
  if (authed === null) {
    return (
      <>
        {bootstrapAssets}
        {gateStyles}
        <div
          className="pw-gate-bg d-flex align-items-center justify-content-center text-center text-muted"
          style={{ fontFamily: "Mulish, sans-serif" }}
        >
          <div>
            <span className="spinner-border spinner-border-sm me-2" />
            Verificando acesso...
          </div>
        </div>
      </>
    );
  }

  // Senha exigida e nao autenticado → tela de senha.
  if (passwordRequired && !authed) {
    return (
      <>
        {bootstrapAssets}
        {gateStyles}
        <div
          className="pw-gate-bg d-flex align-items-center justify-content-center px-3"
          style={{ fontFamily: "Mulish, sans-serif" }}
        >
          <div className="card pw-gate-card">
            <div className="card-body p-4 pt-0 text-center">
              {EMPRESA_LOGO_URL ? (
                <div className="pw-gate-logo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={EMPRESA_LOGO_URL} alt={EMPRESA_NOME} />
                </div>
              ) : (
                <div className="pw-gate-icon">
                  <i className="bi bi-shield-lock-fill" />
                </div>
              )}
              <h1 className="h5 mb-2">{title}</h1>
              <p className="text-muted small mb-4">{description}</p>
              {passwordErro && (
                <div className="alert alert-danger text-start" role="alert">
                  {passwordErro}
                </div>
              )}
              <form onSubmit={handleLogin} className="text-start">
                <div className="mb-3">
                  <label className="form-label" htmlFor="config-password">
                    Senha
                  </label>
                  <input
                    id="config-password"
                    type="password"
                    className="form-control form-control-lg pw-gate-input"
                    autoComplete="current-password"
                    autoFocus
                    value={passwordInput}
                    onChange={(event) => setPasswordInput(event.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-lg pw-gate-btn text-white w-100" disabled={loginLoading}>
                  {loginLoading ? (
                    <span className="spinner-border spinner-border-sm me-1" />
                  ) : (
                    <i className="bi bi-box-arrow-in-right me-1" />
                  )}
                  Entrar
                </button>
              </form>
            </div>
          </div>
        </div>
      </>
    );
  }

  return <>{children}</>;
}
