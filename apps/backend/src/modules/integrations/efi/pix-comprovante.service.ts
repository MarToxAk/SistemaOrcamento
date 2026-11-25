import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Handlebars from "handlebars";
import puppeteer from "puppeteer";

import { PIX_COMPROVANTE_HTML_TEMPLATE } from "./pix-comprovante.template";
import {
  DadosComprovantePix,
  formatarBRL,
  formatarDataHoraSaoPaulo,
  sanitizarTextoLivre,
} from "./pix-comprovante.util";

// ---------------------------------------------------------------------------
// Fase 54 (plano 54-03): comprovante interno do PIX em PNG (layout proprio, D-04/D-05).
// Mesmo padrao hardened do DanfsePdfService: rede bloqueada (so about:blank e data:),
// sem sandbox pois o container roda como root, browser sempre fechado (T-54-08).
// Falhas propagam como excecao: o chamador (plano 54-04) isola e trata.
// ---------------------------------------------------------------------------
@Injectable()
export class PixComprovanteService {
  private readonly logger = new Logger(PixComprovanteService.name);

  constructor(private readonly configService: ConfigService) {}

  renderizarHtml(dados: DadosComprovantePix): string {
    const hbs = Handlebars.create();
    const template = hbs.compile(PIX_COMPROVANTE_HTML_TEMPLATE, {
      knownHelpersOnly: true,
      strict: false,
      noEscape: false,
    });

    const horario = dados.horario ? new Date(dados.horario) : null;
    const data = horario && !Number.isNaN(horario.getTime()) ? horario : new Date();

    const nome = sanitizarTextoLivre(dados.pagadorNome, 80);
    // Documento mascarado traz asteriscos: trocar por bolinha antes de sanitizar.
    const doc = sanitizarTextoLivre(String(dados.pagadorDocumento ?? "").replace(/\*/g, "•"), 30);

    return template({
      empresaNome: this.configService.get<string>("EMPRESA_NOME")?.trim() || "Bom Custo Papelaria",
      empresaCnpj: this.configService.get<string>("EMPRESA_CNPJ")?.trim() || "",
      numeroOrcamento: sanitizarTextoLivre(dados.numeroOrcamento, 20),
      valorPago: formatarBRL(dados.valorPago),
      desconto: dados.desconto > 0 ? formatarBRL(dados.desconto) : "",
      totalOrcamento: formatarBRL(dados.totalOrcamento),
      situacao: dados.quitado
        ? "Pagamento integral"
        : `Pagamento parcial (entrada) - pendente ${formatarBRL(dados.pendente)}`,
      dataHora: formatarDataHoraSaoPaulo(data),
      pagador: [nome, doc].filter(Boolean).join(" - "),
      infoPagador: sanitizarTextoLivre(dados.infoPagador),
      e2eId: sanitizarTextoLivre(dados.e2eId, 60),
      txid: sanitizarTextoLivre(dados.txid, 60),
    });
  }

  async gerarPng(dados: DadosComprovantePix): Promise<Buffer> {
    const html = this.renderizarHtml(dados);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 480, height: 800, deviceScaleFactor: 2 });

      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const url = req.url();
        if (url === "about:blank" || url.startsWith("data:")) req.continue();
        else req.abort();
      });

      await page.setContent(html, { waitUntil: "load", timeout: 30000 });

      return Buffer.from(await page.screenshot({ type: "png", fullPage: true }));
    } finally {
      await browser.close();
    }
  }
}
