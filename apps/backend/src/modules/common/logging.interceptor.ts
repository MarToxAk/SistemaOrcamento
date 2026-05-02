import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      ip: string;
      headers: Record<string, string | string[] | undefined>;
    }>();

    if (!MUTATING_METHODS.has(req.method)) {
      return next.handle();
    }

    const { method, url, ip } = req;
    const userAgent = req.headers["user-agent"] ?? "-";
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<{ statusCode: number }>();
          const ms = Date.now() - start;
          this.logger.log(`${method} ${url} ${res.statusCode} ${ms}ms — ip=${ip} ua=${userAgent}`);
        },
        error: (err: unknown) => {
          const status = (err as { status?: number })?.status ?? 500;
          const ms = Date.now() - start;
          this.logger.warn(`${method} ${url} ${status} ${ms}ms — ip=${ip} ua=${userAgent}`);
        },
      }),
    );
  }
}
