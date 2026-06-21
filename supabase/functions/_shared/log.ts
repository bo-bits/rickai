// Tier-1 structured logging. One JSON line per event to stdout (→ Supabase
// function logs), correlated across an invocation by request_id. Metadata only —
// never log message content or secrets.

export interface RequestContext {
  requestId: string;
  functionName: string;
  studentId?: string;
  sessionId?: string;
}

type Level = "info" | "error";

export function log(
  ctx: RequestContext,
  level: Level,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    request_id: ctx.requestId,
    function_name: ctx.functionName,
    student_id: ctx.studentId ?? null,
    session_id: ctx.sessionId ?? null,
    ...fields,
  });
  if (level === "error") console.error(line);
  else console.log(line);
}
