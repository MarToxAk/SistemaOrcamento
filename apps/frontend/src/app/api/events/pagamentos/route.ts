import http from "http";
import https from "https";

export const dynamic = "force-dynamic";

export async function GET() {
  const backendUrl = process.env.BACKEND_URL ?? "http://localhost:4000/api";
  const apiKey = process.env.INTERNAL_API_KEY ?? "";
  const target = new URL(`${backendUrl}/events/pagamentos`);
  const transport = target.protocol === "https:" ? https : http;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const req = transport.request(
        {
          hostname: target.hostname,
          port: target.port || (target.protocol === "https:" ? 443 : 80),
          path: target.pathname + target.search,
          method: "GET",
          headers: {
            Accept: "text/event-stream",
            "Cache-Control": "no-cache",
            "x-internal-api-key": apiKey,
          },
        },
        (res) => {
          res.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
          res.on("end", () => controller.close());
          res.on("error", (err) => controller.error(err));
        },
      );
      req.on("error", (err) => controller.error(err));
      req.end();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
