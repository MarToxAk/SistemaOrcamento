"use client";

import { useEffect, useState } from "react";
import Script from "next/script";

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

  // Ainda verificando a sessao na entrada.
  if (authed === null) {
    return (
      <>
        {bootstrapAssets}
        <div className="container py-5 text-center text-muted" style={{ fontFamily: "Mulish, sans-serif" }}>
          <span className="spinner-border spinner-border-sm me-2" />
          Verificando acesso...
        </div>
      </>
    );
  }

  // Senha exigida e nao autenticado → tela de senha.
  if (passwordRequired && !authed) {
    return (
      <>
        {bootstrapAssets}
        <div
          className="container d-flex align-items-center justify-content-center"
          style={{ fontFamily: "Mulish, sans-serif", minHeight: "70vh" }}
        >
          <div className="card shadow-sm" style={{ maxWidth: 420, width: "100%" }}>
            <div className="card-body p-4">
              <h1 className="h5 mb-3">
                <i className="bi bi-shield-lock me-2" style={{ color: "var(--cor-primaria, #0e6d73)" }} />
                {title}
              </h1>
              <p className="text-muted">{description}</p>
              {passwordErro && (
                <div className="alert alert-danger" role="alert">
                  {passwordErro}
                </div>
              )}
              <form onSubmit={handleLogin}>
                <div className="mb-3">
                  <label className="form-label" htmlFor="config-password">
                    Senha
                  </label>
                  <input
                    id="config-password"
                    type="password"
                    className="form-control"
                    autoComplete="current-password"
                    value={passwordInput}
                    onChange={(event) => setPasswordInput(event.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary w-100" disabled={loginLoading}>
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
