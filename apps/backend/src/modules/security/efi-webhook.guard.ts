import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";

import { EFI_SIGNATURE_HEADER } from "./security.constants";

type RequestLike = {
  headers: Record<string, string | string[] | undefined>;
  rawBody?: Buffer;
  body?: unknown;
};

@Injectable()
export class EfiWebhookGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestLike>();

    const headerValue = request.headers[EFI_SIGNATURE_HEADER] ?? request.headers["x-signature"];
    const signature = (Array.isArray(headerValue) ? headerValue[0] : headerValue)?.trim();
    if (!signature) {
      throw new UnauthorizedException("Missing webhook signature");
    }

    const secret = this.configService.get<string>("EFI_WEBHOOK_SECRET")?.trim();
    if (!secret) {
      throw new UnauthorizedException("Webhook secret not configured");
    }

    const raw = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}), "utf8");
    const expected = createHmac("sha256", secret).update(raw).digest("hex");

    const providedBuffer = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");

    const sameLength = providedBuffer.length === expectedBuffer.length;
    const isValid = sameLength && timingSafeEqual(providedBuffer, expectedBuffer);

    if (!isValid) {
      throw new UnauthorizedException("Invalid webhook signature");
    }

    return true;
  }
}
