import { BadRequestException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import path from "node:path";

const ATHOS_ANEXO_ROOT = "\\\\192.168.3.203\\html\\Anexo\\contapagar";
const ALLOWED_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg"]);

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

  const token = randomBytes(16).toString("hex");
  return `${token}${extension}`;
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