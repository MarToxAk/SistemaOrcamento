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

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    setErro("");
    try {
      const response = await fetch("/api/admin/templates", { cache: "no-store" });
      const data = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
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

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

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

  return (
    <>
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js" strategy="beforeInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.js" strategy="beforeInteractive" />
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet" />
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" />

      <div className="container py-4" style={{ fontFamily: "Mulish, sans-serif" }}>
        <h1 className="h3 mb-1">
          <i className="bi bi-file-earmark-pdf me-2" style={{ color: "var(--cor-primaria, #0e6d73)" }} />
          Gerenciar Templates de PDF
        </h1>
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
