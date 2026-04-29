import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class PdvService {
  constructor(private readonly config: ConfigService) {}

  async getConnectionInfo() {
    return {
      mode: "read-only",
      pdvDbUrl: this.config.get<string>("PDV_DB_URL") ?? "nao configurado",
      schema: this.config.get<string>("PDV_DB_SCHEMA") ?? "public",
      readOnlyUser: this.config.get<string>("PDV_DB_READONLY_USER") ?? "nao configurado",
      writeOperationsAllowed: false,
    };
  }

  async searchCustomer(term: string) {
    // Endpoint de contrato para implementar acesso real ao banco legado na proxima iteracao.
    return {
      source: "pdv",
      readOnly: true,
      term,
      matches: [],
      message: "Conector PDV inicializado. Implementar consulta SQL conforme schema legado.",
    };
  }
}
