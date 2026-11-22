// Fase 52 (plano 52-02, D-37): IP real do cliente atras do proxy do Next.
// SO SERVIDOR (importa node:net) — nunca importar este modulo do Client Component.
//
// O nginx define X-Real-IP e X-Forwarded-For. A ponta ESQUERDA de x-forwarded-for e
// forjavel pelo cliente, entao usamos x-real-ip quando e um IP valido; senao, o ULTIMO
// elemento de x-forwarded-for (o que o proxy mais proximo anexou). Sem valor valido,
// devolvemos undefined e o backend usa o IP do socket.

import { isIP } from "node:net";

const MAX_TAMANHO_IP = 45;

function ipValido(valor: string): string | undefined {
  const limpo = valor.trim();
  if (limpo.length === 0 || limpo.length > MAX_TAMANHO_IP) return undefined;
  return isIP(limpo) !== 0 ? limpo : undefined;
}

export function ipDoCliente(h: { get(nome: string): string | null }): string | undefined {
  const real = h.get("x-real-ip");
  if (real) {
    const ip = ipValido(real);
    if (ip) return ip;
  }

  const encaminhados = h.get("x-forwarded-for");
  if (encaminhados) {
    const partes = encaminhados
      .split(",")
      .map((parte) => parte.trim())
      .filter((parte) => parte.length > 0);
    if (partes.length > 0) {
      const ultimo = ipValido(partes[partes.length - 1]);
      if (ultimo) return ultimo;
    }
  }

  return undefined;
}
