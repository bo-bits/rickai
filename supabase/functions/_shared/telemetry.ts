// Tier-2 LLM telemetry. `callModel` is the single instrumented entry point the
// three functions use instead of `anthropic.messages.create` directly: it times
// the call, records one `llm_calls` row (success or error), logs a line, and
// returns/rethrows transparently so handler control flow is unchanged.

import type Anthropic from "npm:@anthropic-ai/sdk@0.71.0";
import { anthropic, supabase } from "./clients.ts";
import { log, type RequestContext } from "./log.ts";

interface LlmCallRecord {
  request_id: string;
  function_name: string;
  student_id: string | null;
  session_id: string | null;
  model: string;
  iteration: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_creation_tokens: number | null;
  latency_ms: number;
  stop_reason: string | null;
  tools_called: string[] | null;
  error: string | null;
}

// Best-effort insert: a telemetry failure logs to stdout but never breaks the
// user path.
async function recordLlmCall(
  ctx: RequestContext,
  row: LlmCallRecord,
): Promise<void> {
  const { error } = await supabase.from("llm_calls").insert(row);
  if (error) {
    log(ctx, "error", "telemetry.insert_failed", { error: error.message });
  }
}

// Run one Anthropic call with full instrumentation.
export async function callModel(
  ctx: RequestContext,
  iteration: number,
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  const base = {
    request_id: ctx.requestId,
    function_name: ctx.functionName,
    student_id: ctx.studentId ?? null,
    session_id: ctx.sessionId ?? null,
    model: params.model,
    iteration,
  };
  const start = Date.now();

  try {
    const response = await anthropic.messages.create(params);
    const latency = Date.now() - start;
    const tools = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => b.name);

    await recordLlmCall(ctx, {
      ...base,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_tokens: response.usage.cache_read_input_tokens ?? null,
      cache_creation_tokens: response.usage.cache_creation_input_tokens ?? null,
      latency_ms: latency,
      stop_reason: response.stop_reason,
      tools_called: tools.length > 0 ? tools : null,
      error: null,
    });
    log(ctx, "info", "llm.call", {
      iteration,
      model: params.model,
      stop_reason: response.stop_reason,
      latency_ms: latency,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      tools_called: tools,
    });
    return response;
  } catch (err) {
    const latency = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    await recordLlmCall(ctx, {
      ...base,
      input_tokens: null,
      output_tokens: null,
      cache_read_tokens: null,
      cache_creation_tokens: null,
      latency_ms: latency,
      stop_reason: null,
      tools_called: null,
      error: message,
    });
    log(ctx, "error", "llm.error", {
      iteration,
      model: params.model,
      latency_ms: latency,
      error: message,
    });
    throw err;
  }
}
