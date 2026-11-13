/**
 * Escritor minimo de ZIP, so com Buffer do Node (Fase 47, D-12).
 *
 * Usa o metodo STORE (sem compressao): PDF e XML pequenos nao justificam compressao e assim nao
 * entra dependencia npm nova nem uso de zlib (decisao de formato do ZIP, discricionaria no CONTEXT 47).
 * Nomes de entrada em UTF-8 (bit 11 das flags). Nao ha ZIP64: ate 65535 entradas e 4 GiB.
 */

const TABELA_CRC32: Uint32Array = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

/** CRC-32 (polinomio refletido 0xEDB88320), sem sinal. */
export function crc32(dados: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) {
    c = TABELA_CRC32[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export interface EntradaZip {
  nome: string;
  conteudo: Buffer;
  data?: Date;
}

const FLAG_NOME_UTF8 = 0x0800;
const VERSAO = 20;
const MAX_ENTRADAS = 0xffff;
const MAX_TAMANHO = 0xffffffff;
const MAX_BYTES_NOME = 255;

function validarNome(nome: string): Buffer {
  if (typeof nome !== "string" || nome.trim() === "") {
    throw new Error("Nome de arquivo do ZIP não pode ser vazio.");
  }
  if (nome.includes("\\")) throw new Error(`Nome de arquivo do ZIP inválido (barra invertida): ${nome}`);
  if (nome.startsWith("/")) throw new Error(`Nome de arquivo do ZIP inválido (caminho absoluto): ${nome}`);
  for (const segmento of nome.split("/")) {
    if (segmento === "" || segmento === "." || segmento === "..") {
      throw new Error(`Nome de arquivo do ZIP inválido (segmento de caminho proibido): ${nome}`);
    }
  }
  const bytes = Buffer.from(nome, "utf8");
  if (bytes.length > MAX_BYTES_NOME) {
    throw new Error(`Nome de arquivo do ZIP muito longo (máximo ${MAX_BYTES_NOME} bytes em UTF-8).`);
  }
  return bytes;
}

/** Hora e data no formato MS-DOS. Anos anteriores a 1980 viram 1980-01-01 00:00:00. */
function dataDos(data: Date): { hora: number; data: number } {
  let ano = data.getUTCFullYear();
  let mes = data.getUTCMonth() + 1;
  let dia = data.getUTCDate();
  let h = data.getUTCHours();
  let m = data.getUTCMinutes();
  let s = data.getUTCSeconds();
  if (ano < 1980 || Number.isNaN(ano)) {
    ano = 1980;
    mes = 1;
    dia = 1;
    h = 0;
    m = 0;
    s = 0;
  }
  return {
    hora: (h << 11) | (m << 5) | Math.floor(s / 2),
    data: ((ano - 1980) << 9) | (mes << 5) | dia,
  };
}

/** Monta o ZIP (STORE) com as entradas na ordem recebida. Lanca Error em nome invalido ou duplicado. */
export function criarZipStore(entradas: EntradaZip[]): Buffer {
  if (entradas.length > MAX_ENTRADAS) {
    throw new RangeError(`ZIP com entradas demais (máximo ${MAX_ENTRADAS}).`);
  }

  const vistos = new Set<string>();
  const partesLocais: Buffer[] = [];
  const partesCentrais: Buffer[] = [];
  let deslocamento = 0;
  const agora = new Date();

  for (const entrada of entradas) {
    const nomeBytes = validarNome(entrada.nome);
    if (vistos.has(entrada.nome)) {
      throw new Error(`Nome de arquivo duplicado no ZIP: ${entrada.nome}`);
    }
    vistos.add(entrada.nome);

    const conteudo = entrada.conteudo;
    if (conteudo.length > MAX_TAMANHO) {
      throw new RangeError(`Arquivo grande demais para o ZIP: ${entrada.nome}`);
    }
    const crc = crc32(conteudo);
    const { hora, data } = dataDos(entrada.data ?? agora);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(VERSAO, 4);
    local.writeUInt16LE(FLAG_NOME_UTF8, 6);
    local.writeUInt16LE(0, 8); // metodo 0 = STORE
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(data, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(conteudo.length, 18); // tamanho comprimido
    local.writeUInt32LE(conteudo.length, 22); // tamanho original
    local.writeUInt16LE(nomeBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(VERSAO, 4); // versao que criou
    central.writeUInt16LE(VERSAO, 6); // versao necessaria
    central.writeUInt16LE(FLAG_NOME_UTF8, 8);
    central.writeUInt16LE(0, 10); // metodo STORE
    central.writeUInt16LE(hora, 12);
    central.writeUInt16LE(data, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(conteudo.length, 20);
    central.writeUInt32LE(conteudo.length, 24);
    central.writeUInt16LE(nomeBytes.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comentario
    central.writeUInt16LE(0, 34); // disco inicial
    central.writeUInt16LE(0, 36); // atributos internos
    central.writeUInt32LE(0, 38); // atributos externos
    central.writeUInt32LE(deslocamento, 42);

    partesLocais.push(local, nomeBytes, conteudo);
    partesCentrais.push(central, nomeBytes);
    deslocamento += local.length + nomeBytes.length + conteudo.length;
    if (deslocamento > MAX_TAMANHO) {
      throw new RangeError("ZIP maior que 4 GiB não é suportado.");
    }
  }

  const diretorioCentral = Buffer.concat(partesCentrais);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disco atual
  eocd.writeUInt16LE(0, 6); // disco do diretorio central
  eocd.writeUInt16LE(entradas.length, 8);
  eocd.writeUInt16LE(entradas.length, 10);
  eocd.writeUInt32LE(diretorioCentral.length, 12);
  eocd.writeUInt32LE(deslocamento, 16);
  eocd.writeUInt16LE(0, 20); // comentario

  return Buffer.concat([...partesLocais, diretorioCentral, eocd]);
}
