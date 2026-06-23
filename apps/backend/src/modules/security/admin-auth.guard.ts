import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "crypto";

import { ADMIN_API_KEY_HEADER } from "./security.constants";

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const headerValue = request.headers[ADMIN_API_KEY_HEADER] ?? request.headers[ADMIN_API_KEY_HEADER.toLowerCase()];

    const provided = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const expected = this.configService.get<string>("ADMIN_API_KEY") ?? "";

    if (!provided || !expected) {
      throw new UnauthorizedException("Missing admin authentication key");
    }

    const providedBuffer = Buffer.from(String(provided), "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");

    const sameLength = providedBuffer.length === expectedBuffer.length;
    const matches = sameLength && timingSafeEqual(providedBuffer, expectedBuffer);

    if (!matches) {
      throw new UnauthorizedException("Invalid admin authentication key");
    }

    return true;
  }
}
