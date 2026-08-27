type Smb2Client = {
  mkdir(path: string, cb: (err: Error | null) => void): void;
  writeFile(path: string, data: Buffer, cb: (err: Error | null) => void): void;
  unlink(path: string, cb: (err: Error | null) => void): void;
  close(): void;
};

const SMB_SHARE = "\\\\192.168.3.203\\html";
const SMB_BASE_PATH = "Anexo\\contapagar";

function getSmbDomain(): string {
  return process.env.SMB_DOMAIN?.trim() || "WORKGROUP";
}

function maskUsername(value: string | undefined): string {
  const user = value?.trim() || "";
  if (!user) {
    return "<vazio>";
  }
  if (user.length <= 2) {
    return `${user[0]}*`;
  }
  return `${user.slice(0, 2)}***`;
}

export function getSmbDebugInfo() {
  return {
    share: SMB_SHARE,
    basePath: SMB_BASE_PATH,
    domain: getSmbDomain(),
    userMasked: maskUsername(process.env.SMB_USER),
  };
}

function toSmbError(operation: string, targetPath: string, error: unknown): Error {
  const details = getSmbDebugInfo();
  const msg = String(error);
  return new Error(
    `[SMB2] operation=${operation} target=${targetPath} share=${details.share} basePath=${details.basePath} domain=${details.domain} user=${details.userMasked} cause=${msg}`,
  );
}

export function isSmbEnabled(): boolean {
  // Permite SMB2 mesmo com usuário/senha vazios (guest/public)
  // Só retorna false se explicitamente desabilitado por env
  if (process.env.SMB_ENABLED?.trim() === "false") return false;
  return true;
}

function createClient(): Smb2Client {
  // Lazy require — não carrega o módulo em tempo de importação (evita quebrar testes)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const SMB2 = require("@marsaud/smb2");
  const smbDomain = getSmbDomain();
  return new SMB2({
    share: SMB_SHARE,
    domain: smbDomain,
    username: process.env.SMB_USER,
    password: process.env.SMB_PASS,
  }) as Smb2Client;
}

function callAsync(fn: (cb: (err: Error | null) => void) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    fn((err) => (err ? reject(err) : resolve()));
  });
}

function isIgnorableMkdirError(error: unknown): boolean {
  const msg = String(error).toLowerCase();
  return (
    msg.includes("status_object_name_collision") ||
    msg.includes("status_object_path_collision") ||
    msg.includes("already exists") ||
    msg.includes("file/folder already exists") ||
    msg.includes("eexist")
  );
}

export async function smbWriteContaPagarFile(
  idcontapagar: number,
  fileName: string,
  buffer: Buffer,
): Promise<void> {
  const client = createClient();
  const dirPath = `${SMB_BASE_PATH}\\${idcontapagar}`;
  const filePath = `${dirPath}\\${fileName}`;

  try {
    await callAsync((cb) => client.mkdir(dirPath, cb)).catch((err: unknown) => {
      if (!isIgnorableMkdirError(err)) {
        throw toSmbError("mkdir", dirPath, err);
      }
    });
    await callAsync((cb) => client.writeFile(filePath, buffer, cb));
  } catch (error) {
    throw toSmbError("writeFile", filePath, error);
  } finally {
    client.close();
  }
}

export async function smbUnlinkContaPagarFile(
  idcontapagar: number,
  fileName: string,
): Promise<void> {
  const client = createClient();
  const filePath = `${SMB_BASE_PATH}\\${idcontapagar}\\${fileName}`;

  try {
    await callAsync((cb) => client.unlink(filePath, cb));
  } catch {
    // silencioso — arquivo pode não existir
  } finally {
    client.close();
  }
}
