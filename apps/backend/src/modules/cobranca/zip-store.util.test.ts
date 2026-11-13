import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { crc32, criarZipStore } from "./zip-store.util";

const TEM_PYTHON = spawnSync("python3", ["--version"]).status === 0;

function sha256(b: Buffer): string {
  return createHash("sha256").update(b).digest("hex");
}

function acharEocd(zip: Buffer): number {
  for (let i = zip.length - 22; i >= 0; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

describe("zip-store.util", () => {
  const bytes0a255 = Buffer.from(Array.from({ length: 256 }, (_, i) => i));

  it("U1. crc32 bate com o vetor padrao e com buffer vazio", () => {
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
    expect(crc32(Buffer.alloc(0))).toBe(0);
  });

  it("U2. estrutura: PK\\x03\\x04, EOCD com 2 entradas e diretorio central coerente", () => {
    const zip = criarZipStore([
      { nome: "NFSe-239.pdf", conteudo: bytes0a255 },
      { nome: "Relatório.txt", conteudo: Buffer.from("olá", "utf8") },
    ]);

    expect(zip.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const eocd = acharEocd(zip);
    expect(eocd).toBeGreaterThan(0);
    expect(zip.readUInt16LE(eocd + 8)).toBe(2); // entradas neste disco
    expect(zip.readUInt16LE(eocd + 10)).toBe(2); // total de entradas
    const tamanhoCentral = zip.readUInt32LE(eocd + 12);
    const deslocamentoCentral = zip.readUInt32LE(eocd + 16);
    expect(deslocamentoCentral + tamanhoCentral).toBe(eocd);
    expect(zip.readUInt32LE(deslocamentoCentral)).toBe(0x02014b50);
  });

  const itU3 = TEM_PYTHON ? it : it.skip;
  itU3("U3. leitor independente (python zipfile): testzip ok, nomes UTF-8 e sha256 iguais", () => {
    const textoAcentuado = Buffer.from("olá", "utf8");
    const zip = criarZipStore([
      { nome: "NFSe-239.pdf", conteudo: bytes0a255 },
      { nome: "Relatório.txt", conteudo: textoAcentuado },
    ]);
    const dir = mkdtempSync(join(tmpdir(), "zip-store-"));
    try {
      const arquivo = join(dir, "teste.zip");
      writeFileSync(arquivo, zip);
      const script = [
        "import sys, zipfile, hashlib, json",
        "z = zipfile.ZipFile(sys.argv[1])",
        "out = {'testzip': z.testzip(), 'nomes': z.namelist(), 'sha': {n: hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()}}",
        "sys.stdout.buffer.write(json.dumps(out, ensure_ascii=False).encode('utf-8'))",
      ].join("\n");
      const r = spawnSync("python3", ["-I", "-c", script, arquivo], { encoding: "buffer" });
      expect(r.status).toBe(0);
      const saida = JSON.parse(r.stdout.toString("utf8"));
      expect(saida.testzip).toBeNull();
      expect(saida.nomes).toEqual(["NFSe-239.pdf", "Relatório.txt"]);
      expect(saida.sha["NFSe-239.pdf"]).toBe(sha256(bytes0a255));
      expect(saida.sha["Relatório.txt"]).toBe(sha256(textoAcentuado));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("U4. rejeita nomes vazios, perigosos e duplicados", () => {
    const um = Buffer.from("x");
    for (const nome of ["", "../x", "/abs", "a\\b", "a/../b", "..", "a/.."]) {
      expect(() => criarZipStore([{ nome, conteudo: um }])).toThrow(Error);
    }
    expect(() =>
      criarZipStore([
        { nome: "a.txt", conteudo: um },
        { nome: "a.txt", conteudo: um },
      ]),
    ).toThrow(/duplicad/i);
  });

  itU3("U5. entrada de 0 bytes e aceita e lida como arquivo vazio", () => {
    const zip = criarZipStore([{ nome: "vazio.txt", conteudo: Buffer.alloc(0) }]);
    const dir = mkdtempSync(join(tmpdir(), "zip-store-"));
    try {
      const arquivo = join(dir, "vazio.zip");
      writeFileSync(arquivo, zip);
      const script = [
        "import sys, zipfile",
        "z = zipfile.ZipFile(sys.argv[1])",
        "print(z.testzip(), z.namelist(), len(z.read('vazio.txt')))",
      ].join("\n");
      const r = spawnSync("python3", ["-I", "-c", script, arquivo], { encoding: "utf8" });
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe("None ['vazio.txt'] 0");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("U6. bit 11 (0x0800, nomes UTF-8) ligado no cabecalho local e no central", () => {
    const zip = criarZipStore([{ nome: "Relatório.txt", conteudo: Buffer.from("a") }]);
    expect(zip.readUInt16LE(6) & 0x0800).toBe(0x0800); // local: flags em +6
    const eocd = acharEocd(zip);
    const central = zip.readUInt32LE(eocd + 16);
    expect(zip.readUInt16LE(central + 8) & 0x0800).toBe(0x0800); // central: flags em +8
  });

  it("U7. nome com mais de 255 bytes em UTF-8 e rejeitado", () => {
    expect(() => criarZipStore([{ nome: "á".repeat(130), conteudo: Buffer.from("x") }])).toThrow(Error);
  });
});
