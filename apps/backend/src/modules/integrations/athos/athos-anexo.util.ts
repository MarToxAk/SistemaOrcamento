import { BadRequestException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import nodePath from "node:path";

// UNC path armazenado no banco — necessário para o Athos ERP (Windows) abrir o arquivo
const SMB_UNC_ROOT = "\\\\192.168.3.203\\html\\Anexo\\contapagar";

// Path de escrita dentro do container Linux (montado via CIFS).
// Lido em tempo de execução para permitir override em testes via process.env.
// Quando ausente, o backend está rodando em Windows e usa o UNC diretamente.
function getSmbMountRoot(): string | null {
  return process.env.ATHOS_SMB_MOUNT_PATH?.trim() || null;
}

export function hasSmbMountPath(): boolean {
  return getSmbMountRoot() !== null;
}

const ALLOWED_EXTENSIONS = new Set([".pdf", ".png", ".jpg", ".jpeg"]);

export function sanitizeAthosAttachmentName(originalName: string): string {
  const normalizedName = String(originalName ?? "").trim();
  if (!normalizedName) {
    throw new BadRequestException("Arquivo invalido: nome ausente");
  }

  const baseName = nodePath.win32.basename(normalizedName.replace(/\//g, "\\"));
  const extension = nodePath.win32.extname(baseName).toLowerCase();

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

  // Path UNC para gravar no banco (Athos ERP Windows precisa deste formato)
  const dbDirectoryPath = nodePath.win32.join(SMB_UNC_ROOT, String(idcontapagar));
  const dbFullPath = nodePath.win32.join(dbDirectoryPath, fileName);

  // Path de escrita: mount Linux em Docker, ou UNC em Windows
  let writeDirectoryPath: string;
  let writeFullPath: string;

  const smb = getSmbMountRoot();
  if (smb) {
    // Docker/Linux: usa o ponto de montagem CIFS
    writeDirectoryPath = nodePath.posix.join(smb, String(idcontapagar));
    writeFullPath = nodePath.posix.join(writeDirectoryPath, fileName);
  } else {
    // Windows nativo: usa UNC diretamente
    writeDirectoryPath = dbDirectoryPath;
    writeFullPath = dbFullPath;
  }

  return {
    writeDirectoryPath, // usado em mkdir + writeFile
    writeFullPath,      // usado em writeFile e cleanup (unlink)
    dbFullPath,         // gravado em anexo.caminhoanexo
    fileName,
  };
}