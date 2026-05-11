import { BadRequestException } from "@nestjs/common";
import path from "node:path";

const ATHOS_ANEXO_ROOT = "\\\\192.168.3.203\\html\\Anexo\\contapagar";
const ALLOWED_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg"]);
const INVALID_FILE_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

export function sanitizeAthosAttachmentName(originalName: string): string {
  const normalizedName = String(originalName ?? "").trim();
  if (!normalizedName) {
    throw new BadRequestException("Arquivo invalido: nome ausente");
  }

  const baseName = path.win32.basename(normalizedName.replace(/\//g, "\\"));
  const extension = path.win32.extname(baseName).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new BadRequestException("Arquivo invalido: extensao permitida apenas para pdf, png, jpg e jpeg");
  }

  const stem = baseName.slice(0, baseName.length - extension.length);
  const sanitizedStem = stem
    .replace(INVALID_FILE_CHARS, "-")
    .replace(/\s+/g, "-")
    .replace(/\.+/g, ".")
    .replace(/^-+|-+$/g, "")
    .replace(/^[.\s]+|[.\s]+$/g, "");

  if (!sanitizedStem || sanitizedStem === "." || sanitizedStem === "..") {
    throw new BadRequestException("Arquivo invalido: nome final vazio apos saneamento");
  }

  return `${sanitizedStem}${extension}`;
}

export function buildContaPagarAnexoPaths(idcontapagar: number, originalName: string) {
  if (!Number.isInteger(idcontapagar) || idcontapagar <= 0) {
    throw new BadRequestException("idcontapagar invalido");
  }

  const fileName = sanitizeAthosAttachmentName(originalName);
  const directoryPath = path.win32.join(ATHOS_ANEXO_ROOT, String(idcontapagar));
  const fullPath = path.win32.join(directoryPath, fileName);

  return {
    directoryPath,
    fullPath,
    fileName,
  };
}