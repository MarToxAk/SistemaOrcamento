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
      service: "bomcusto-backend",
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

  private async checkNfse(): Promise<{ ok: boolean; error?: string }> {
    const token = this.config.get<string>("NFSE_TOKEN");
    if (!token) return { ok: false, error: "nao configurado" };
    try {
      const url = "https://ilhabela2.iibr.com.br/rps/3520400/1/soap/producao/rps?wsdl";
      await axios.get(url, { timeout: 4000, validateStatus: () => true });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}