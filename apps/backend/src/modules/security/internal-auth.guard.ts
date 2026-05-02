import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { timingSafeEqual } from "crypto";

import { INTERNAL_API_KEY_HEADER, IS_PUBLIC_KEY } from "./security.constants";

@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const headerValue = request.headers[INTERNAL_API_KEY_HEADER] ?? request.headers[INTERNAL_API_KEY_HEADER.toLowerCase()];

    const provided = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    const expected = this.configService.get<string>("INTERNAL_API_KEY") ?? "";

    if (!provided || !expected) {
      throw new UnauthorizedException("Missing authentication key");
    }

    const providedBuffer = Buffer.from(String(provided), "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");

    const sameLength = providedBuffer.length === expectedBuffer.length;
    const matches = sameLength && timingSafeEqual(providedBuffer, expectedBuffer);

    if (!matches) {
      throw new UnauthorizedException("Invalid authentication key");
    }

    return true;
  }
}
