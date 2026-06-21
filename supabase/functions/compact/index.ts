// `compact` — context-pressure path.
//
// Summarizes a long session, closes it, and opens a fresh session for the same
// (student_id, topic_slug) seeded with the summary + the last few exchanges.
// `turn` already selects the latest OPEN session, so the next turn lands on the
// new session automatically — compaction is transparent to the caller. Manually
// invoked (curl); no automation in this iteration.

import type Anthropic from "npm:@anthropic-ai/sdk@0.71.0";
import { MODEL, supabase } from "../_shared/clients.ts";
import { json, withRequest } from "../_shared/http.ts";
import { callModel } from "../_shared/telemetry.ts";
import { dialogueTail, renderTranscript } from "../_shared/transcript.ts";
import { COMPACT_SYSTEM_PROMPT } from "./system_prompt.ts";

const MAX_TOKENS = 2048;

interface CompactRequest {
  session_id?: string;
}

Deno.serve(withRequest("compact", async (req, ctx) => {
  let body: CompactRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const sessionId = body.session_id?.trim();
  if (!sessionId) return json({ error: "session_id is required" }, 400);
  ctx.sessionId = sessionId;

  // --- Load the session -----------------------------------------------------
  const { data: session, error: sessionErr } = await supabase
    .from("sessions")
    .select("student_id, topic_slug, messages, ended_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionErr) {
    return json({ error: `session lookup failed: ${sessionErr.message}` }, 500);
  }
  if (!session) return json({ error: "session not found" }, 404);
  if (session.ended_at) {
    return json({ error: "session is already closed" }, 409);
  }

  const studentId = session.student_id as string;
  ctx.studentId = studentId;
  const topicSlug = (session.topic_slug as string | null) ?? null;
  const messages = (session.messages as Anthropic.MessageParam[]) ?? [];

  // --- Summarize ------------------------------------------------------------
  let summary: string;
  try {
    const response = await callModel(ctx, 0, {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      system: [{
        type: "text",
        text: COMPACT_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      }],
      messages: [{
        role: "user",
        content:
          `Summarize this conversation so it can continue in a fresh session.\n\n` +
          `<transcript>\n${renderTranscript(messages)}\n</transcript>`,
      }],
    });
    summary = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  } catch (err) {
    return json(
      { error: `model call failed: ${err instanceof Error ? err.message : err}` },
      502,
    );
  }

  // --- Close the old session, open a seeded one -----------------------------
  const { error: closeErr } = await supabase
    .from("sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (closeErr) {
    return json({ error: `session close failed: ${closeErr.message}` }, 500);
  }

  const seed = dialogueTail(messages);
  const { data: created, error: createErr } = await supabase
    .from("sessions")
    .insert({
      student_id: studentId,
      topic_slug: topicSlug,
      summary,
      messages: seed,
    })
    .select("id")
    .single();
  if (createErr || !created) {
    return json(
      { error: `new session create failed: ${createErr?.message}` },
      500,
    );
  }

  return json({ new_session_id: created.id, request_id: ctx.requestId });
}));
