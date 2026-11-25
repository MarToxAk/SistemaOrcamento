import { BadRequestException, ValidationPipe } from "@nestjs/common";

import { EmitirNfseNacionalDto } from "./emitir-nfse-nacional.dto";

// Mesmas opcoes do ValidationPipe global de main.ts.
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });

const base = {
  codigoServico: "130501",
  cpfTomador: "12345678909",
  nomeTomador: "Cliente de Teste",
  valorServico: 164.35,
};

function validar(corpo: Record<string, unknown>) {
  return pipe.transform(corpo, { type: "body", metatype: EmitirNfseNacionalDto });
}

describe("EmitirNfseNacionalDto (senhaLiberacao e liberadoPor)", () => {
  it("aceita o corpo base sem os campos novos (compatibilidade)", async () => {
    const out = (await validar({ ...base })) as EmitirNfseNacionalDto;
    expect(out.valorServico).toBe(164.35);
    expect(out.senhaLiberacao).toBeUndefined();
    expect(out.liberadoPor).toBeUndefined();
  });

  it("aceita senhaLiberacao e liberadoPor e os repassa ao objeto", async () => {
    const out = (await validar({
      ...base,
      senhaLiberacao: "senha-falsa-de-teste",
      liberadoPor: "Operador de Teste",
    })) as EmitirNfseNacionalDto;
    expect(out.senhaLiberacao).toBe("senha-falsa-de-teste");
    expect(out.liberadoPor).toBe("Operador de Teste");
  });

  it("rejeita campo desconhecido (forbidNonWhitelisted)", async () => {
    await expect(validar({ ...base, pago: true })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("limita senhaLiberacao a 200 caracteres", async () => {
    await expect(validar({ ...base, senhaLiberacao: "x".repeat(200) })).resolves.toBeDefined();
    await expect(validar({ ...base, senhaLiberacao: "x".repeat(201) })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("limita liberadoPor a 80 caracteres", async () => {
    await expect(validar({ ...base, liberadoPor: "y".repeat(80) })).resolves.toBeDefined();
    await expect(validar({ ...base, liberadoPor: "y".repeat(81) })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejeita senhaLiberacao numerica", async () => {
    await expect(validar({ ...base, senhaLiberacao: 123 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejeita liberadoPor que nao e string", async () => {
    await expect(validar({ ...base, liberadoPor: 42 })).rejects.toBeInstanceOf(BadRequestException);
  });
});
