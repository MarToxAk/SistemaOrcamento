import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

import { PrismaService } from "./database/prisma.service";
import { Public } from "./security/public.decorator";

@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Get()
  async getHealth() {
    const checks = await Promise.allSettled([
      this.checkDb(),
      this.checkChatwoot(),
      this.checkNfse(),
    ]);

    const [db, chatwoot, nfse] = checks.map((r) =>
      r.status === "fulfilled" ? r.value : { ok: false, error: (r.reason as Error)?.message ?? "erro" },
    );

    const allOk = [db, chatwoot, nfse].every((c) => c.ok);

    return {
      status: allOk ? "ok" : "degraded",
      service: "orcamento-backend",
      now: new Date().toISOString(),
      integrations: { db, chatwoot, nfse },
    };
  }

  private async checkDb(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async checkChatwoot(): Promise<{ ok: boolean; error?: string }> {
    const baseUrl = this.config.get<string>("CHATWOOT_BASE_URL");
    const token = this.config.get<string>("CHATWOOT_API_TOKEN");
    const accountId = this.config.get<string>("CHATWOOT_ACCOUNT_ID");
    if (!baseUrl || !token || !accountId) return { ok: false, error: "nao configurado" };
    try {
      await axios.get(`${baseUrl}/auth/sign_in`, { timeout: 4000, validateStatus: () => true });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // Configuracao da NFS-e Nacional (sem rede). A sonda do WSDL do provedor
  // iiBrasil foi removida na fase 54 (D-11).
  private async checkNfse(): Promise<{ ok: boolean; error?: string }> {
    const has = (key: string) => {
      const value = this.config.get<string>(key);
      return typeof value === "string" && value.trim().length > 0;
    };
    const certOk = has("NFSE_NACIONAL_CERT_PEM") || has("NFSE_NACIONAL_CERT_PATH");
    const keyOk = has("NFSE_NACIONAL_KEY_PEM") || has("NFSE_NACIONAL_KEY_PATH");
    const cnpjOk = has("NFSE_NACIONAL_CNPJ_PRESTADOR");
    if (!certOk || !keyOk || !cnpjOk) return { ok: false, error: "nao configurado" };
    return { ok: true };
  }
}
