import SMB2 from "@marsaud/smb2";

const SMB_SHARE = "\\\\192.168.3.203\\html";
const SMB_BASE_PATH = "Anexo\\contapagar";

export function isSmbEnabled(): boolean {
  return !!(process.env.SMB_USER?.trim() && process.env.SMB_PASS?.trim());
}

function createClient(): SMB2 {
  return new SMB2({
    share: SMB_SHARE,
    domain: process.env.SMB_DOMAIN ?? "WORKGROUP",
    username: process.env.SMB_USER!,
    password: process.env.SMB_PASS!,
  });
}

function callAsync(fn: (cb: (err: Error | null) => void) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    fn((err) => (err ? reject(err) : resolve()));
  });
}

function callAsyncData<T>(fn: (cb: (err: Error | null, data?: T) => void) => void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    fn((err, data) => (err ? reject(err) : resolve(data)));
  });
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
      const msg = String(err);
      if (!msg.includes("STATUS_OBJECT_NAME_COLLISION") && !msg.includes("STATUS_OBJECT_PATH_COLLISION")) {
        throw err;
      }
    });
    await callAsync((cb) => client.writeFile(filePath, buffer, cb));
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
