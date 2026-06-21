// Shared HTTP helpers: CORS + JSON responses + the request wrapper that owns
// boilerplate (OPTIONS/method guards) and Tier-1 start/end logging.

import { log, type RequestContext } from "./log.ts";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Wraps an edge-function handler: short-circuits OPTIONS/non-POST, mints a
// per-request id + RequestContext, and emits Tier-1 request.start / request.end /
// request.error lines. The handler sets ctx.studentId / ctx.sessionId once known.
export function withRequest(
  functionName: string,
  handler: (req: Request, ctx: RequestContext) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: CORS_HEADERS });
    }
    if (req.method !== "POST") {
      return json({ error: "method not allowed" }, 405);
    }

    const ctx: RequestContext = {
      requestId: crypto.randomUUID(),
      functionName,
    };
    const start = Date.now();
    log(ctx, "info", "request.start", {});

    try {
      const res = await handler(req, ctx);
      log(ctx, "info", "request.end", {
        status: res.status,
        duration_ms: Date.now() - start,
      });
      res.headers.set("x-request-id", ctx.requestId);
      return res;
    } catch (err) {
      log(ctx, "error", "request.error", {
        duration_ms: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      });
      const res = json({ error: "internal error", request_id: ctx.requestId }, 500);
      res.headers.set("x-request-id", ctx.requestId);
      return res;
    }
  };
}
