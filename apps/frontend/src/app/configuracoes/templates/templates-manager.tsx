"use client";

import { useCallback, useEffect, useState } from "react";
import Script from "next/script";

type TemplateKind = "PRESET" | "CUSTOM";

type PdfTemplateSummary = {
  id: string;
  name: string;
  slug: string;
  kind: TemplateKind;
  isActive: boolean;
  createdAt: string;
};

function kindLabel(kind: TemplateKind): string {
  return kind === "PRESET" ? "Modelo pronto" : "Personalizado";
}

export default function TemplatesManager() {
  const [templates, setTemplates] = useState<PdfTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const [uploadName, setUploadName] = useState("");
  const [uploadSource, setUploadSource] = useState("");
  const [uploadErro, setUploadErro] = useState("");
  const [uploadLoading, setUploadLoading] = useState(false);
  const [previewUploadLoading, setPreviewUploadLoading] = useState(false);

  // Gate de senha (D-03 opcao "a"): null = ainda checando; true/false definido.
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordErro, setPasswordErro] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const response = await fetch("/api/admin/templates", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        if (response.status === 401) {
          setAuthed(false);
          setPasswordRequired(true);
          return;
        }
        const message = (data as { error?: string })?.error || "Erro ao carregar templates.";
        throw new Error(message);
      }
      setTemplates(Array.isArray(data) ? (data as PdfTemplateSummary[]) : []);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Nao foi possivel carregar os templates.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Checa o status da sessao na entrada — decide entre prompt de senha e a tela.
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

  useEffect(() => {
    if (authed) void fetchTemplates();
  }, [authed, fetchTemplates]);

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

  async function handleLogout() {
    try {
      await fetch("/api/admin/login", { method: "DELETE" });
    } catch {
      /* noop */
    }
    setAuthed(false);
    setTemplates([]);
  }

  function abrirPdfBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    // libera o objeto apos um tempo razoavel para a aba abrir o PDF
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function handleAtivar(template: PdfTemplateSummary) {
    setActivatingId(template.id);
    setErro("");
    try {
      const response = await fetch(`/api/admin/templates/${encodeURIComponent(template.id)}/activate`, {
        method: "PATCH",
      });
      const data = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        const message = (data as { error?: string })?.error || "Falha ao ativar o template.";
        throw new Error(message);
      }
      await fetchTemplates();
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao ativar o template.");
    } finally {
      setActivatingId(null);
    }
  }

  async function handlePreviewExistente(template: PdfTemplateSummary) {
    setPreviewingId(template.id);
    setErro("");
    try {
      const response = await fetch("/api/admin/templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template.id }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data?.error || "Falha ao gerar preview.");
      }
      const blob = await response.blob();
      abrirPdfBlob(blob);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Falha ao gerar preview.");
    } finally {
      setPreviewingId(null);
    }
  }

  async function handlePreviewUpload() {
    setUploadErro("");
    if (!uploadSource.trim()) {
      setUploadErro("Cole ou digite o conteudo .hbs/HTML antes de pre-visualizar.");
      return;
    }
    setPreviewUploadLoading(true);
    try {
      const response = await fetch("/api/admin/templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: uploadSource }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data?.error || "Falha ao gerar preview do template enviado.");
      }
      const blob = await response.blob();
      abrirPdfBlob(blob);
    } catch (error) {
      setUploadErro(error instanceof Error ? error.message : "Falha ao gerar preview do template enviado.");
    } finally {
      setPreviewUploadLoading(false);
    }
  }

  async function handleUpload(event: React.FormEvent) {
    event.preventDefault();
    setUploadErro("");
    if (!uploadName.trim() || !uploadSource.trim()) {
      setUploadErro("Informe um nome e o conteudo do template.");
      return;
    }
    setUploadLoading(true);
    try {
      const response = await fetch("/api/admin/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: uploadName.trim(), source: uploadSource }),
      });
      const data = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        const message = (data as { error?: string; message?: string })?.error
          || (data as { message?: string })?.message
          || "Upload rejeitado pelo servidor.";
        throw new Error(message);
      }
      setUploadName("");
      setUploadSource("");
      await fetchTemplates();
    } catch (error) {
      setUploadErro(error instanceof Error ? error.message : "Falha ao enviar o template.");
    } finally {
      setUploadLoading(false);
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      setUploadSource(text);
      if (!uploadName.trim()) {
        setUploadName(file.name.replace(/\.(hbs|html)$/i, ""));
      }
    };
    reader.readAsText(file);
    // permite reenviar o mesmo arquivo depois de limpar
    event.target.value = "";
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
                Acesso restrito
              </h1>
              <p className="text-muted">
                Esta area gerencia o layout do PDF de orcamento. Digite a senha de configuracoes para continuar.
              </p>
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

  return (
    <>
      {bootstrapAssets}

      <div className="container py-4" style={{ fontFamily: "Mulish, sans-serif" }}>
        <div className="d-flex justify-content-between align-items-start mb-1">
          <h1 className="h3 mb-0">
            <i className="bi bi-file-earmark-pdf me-2" style={{ color: "var(--cor-primaria, #0e6d73)" }} />
            Gerenciar Templates de PDF
          </h1>
          {passwordRequired && (
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => void handleLogout()}>
              <i className="bi bi-box-arrow-right me-1" />
              Sair
            </button>
          )}
        </div>
        <p className="text-muted mb-4">
          Escolha um modelo pronto ou suba um template personalizado (.hbs/HTML). Sempre pre-visualize
          antes de ativar — a troca entra em vigor imediatamente, sem reiniciar o servidor.
        </p>

        {erro && (
          <div className="alert alert-danger" role="alert">
            {erro}
          </div>
        )}

        <section className="card mb-4">
          <div className="card-header bg-white">
            <strong>Galeria de templates</strong>
          </div>
          <div className="card-body">
            {loading ? (
              <p className="text-muted mb-0">Carregando templates...</p>
            ) : templates.length === 0 ? (
              <p className="text-muted mb-0">Nenhum template cadastrado.</p>
            ) : (
              <div className="row g-3">
                {templates.map((template) => (
                  <div className="col-12 col-md-6 col-lg-4" key={template.id}>
                    <div className={`card h-100 ${template.isActive ? "border-success" : ""}`}>
                      <div className="card-body d-flex flex-column">
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <h2 className="h6 mb-0">{template.name}</h2>
                          {template.isActive && (
                            <span className="badge bg-success">
                              <i className="bi bi-check-circle me-1" />
                              Ativo
                            </span>
                          )}
                        </div>
                        <span className="badge bg-light text-dark border mb-3 align-self-start">
                          {kindLabel(template.kind)}
                        </span>
                        <div className="mt-auto d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm flex-grow-1"
                            disabled={previewingId === template.id}
                            onClick={() => void handlePreviewExistente(template)}
                          >
                            {previewingId === template.id ? (
                              <span className="spinner-border spinner-border-sm me-1" />
                            ) : (
                              <i className="bi bi-eye me-1" />
                            )}
                            Pre-visualizar
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm flex-grow-1"
                            disabled={template.isActive || activatingId === template.id}
                            onClick={() => void handleAtivar(template)}
                          >
                            {activatingId === template.id ? (
                              <span className="spinner-border spinner-border-sm me-1" />
                            ) : (
                              <i className="bi bi-power me-1" />
                            )}
                            {template.isActive ? "Em uso" : "Usar este"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header bg-white">
            <strong>Enviar template personalizado</strong>
          </div>
          <div className="card-body">
            <p className="text-muted">
              Cole o conteudo do arquivo <code>.hbs</code>/HTML abaixo ou selecione um arquivo do seu
              computador. Conteudo com scripts ou tags potencialmente perigosas e rejeitado pelo servidor.
            </p>

            {uploadErro && (
              <div className="alert alert-danger" role="alert">
                {uploadErro}
              </div>
            )}

            <form onSubmit={handleUpload}>
              <div className="mb-3">
                <label className="form-label" htmlFor="template-nome">
                  Nome do template
                </label>
                <input
                  id="template-nome"
                  type="text"
                  className="form-control"
                  placeholder="Ex: Layout promocional verao"
                  value={uploadName}
                  onChange={(event) => setUploadName(event.target.value)}
                />
              </div>

              <div className="mb-3">
                <label className="form-label" htmlFor="template-arquivo">
                  Selecionar arquivo (.hbs ou .html)
                </label>
                <input
                  id="template-arquivo"
                  type="file"
                  className="form-control"
                  accept=".hbs,.html,text/html"
                  onChange={handleFileChange}
                />
              </div>

              <div className="mb-3">
                <label className="form-label" htmlFor="template-conteudo">
                  Conteudo do template
                </label>
                <textarea
                  id="template-conteudo"
                  className="form-control font-monospace"
                  rows={10}
                  placeholder="<html>...</html>"
                  value={uploadSource}
                  onChange={(event) => setUploadSource(event.target.value)}
                />
              </div>

              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={previewUploadLoading}
                  onClick={() => void handlePreviewUpload()}
                >
                  {previewUploadLoading ? (
                    <span className="spinner-border spinner-border-sm me-1" />
                  ) : (
                    <i className="bi bi-eye me-1" />
                  )}
                  Pre-visualizar antes de enviar
                </button>
                <button type="submit" className="btn btn-primary" disabled={uploadLoading}>
                  {uploadLoading ? (
                    <span className="spinner-border spinner-border-sm me-1" />
                  ) : (
                    <i className="bi bi-upload me-1" />
                  )}
                  Enviar template
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </>
  );
}
