// `turn` — one stateless tutoring turn.
//
// The edge function owns conversation state (channel-agnostic: Telegram, Slack,
// or our own app all just forward the latest user message). It loads floor
// context (the profile doc) + a topic manifest, exposes a `read_topic` tool so
// the model can pull topic content on demand, resolves the inner tool loop within
// this single invocation, persists the full messages array, and returns the reply.

import Anthropic from "npm:@anthropic-ai/sdk@0.71.0";
import { MODEL, supabase } from "../_shared/clients.ts";
import { json, withRequest } from "../_shared/http.ts";
import { callModel } from "../_shared/telemetry.ts";
import {
  type ManifestRow,
  renderFloor,
  renderManifest,
  TUTOR_SYSTEM_PROMPT,
} from "./system_prompt.ts";

const MAX_TOKENS = 4096;
const MAX_TOOL_ITERATIONS = 5;

const READ_TOPIC_TOOL: Anthropic.Tool = {
  name: "read_topic",
  description:
    "Load the saved content for one of this student's topics (from the manifest). " +
    "Call this when the conversation connects to a topic so you can reference what " +
    "the student already explored instead of re-teaching it. Returns the topic's " +
    "notes, or a note that the topic has no saved content yet.",
  input_schema: {
    type: "object",
    properties: {
      slug: {
        type: "string",
        description: "The topic_slug from the manifest, e.g. \"greek-history\".",
      },
    },
    required: ["slug"],
  },
};

// Fetch a single topic-content document for this student.
async function readTopic(
  studentId: string,
  slug: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("documents")
    .select("content")
    .eq("student_id", studentId)
    .eq("doc_type", "topic")
    .eq("topic_slug", slug)
    .maybeSingle();

  if (error) {
    return `(Error loading topic "${slug}": ${error.message})`;
  }
  if (!data) {
    return `(No saved content for "${slug}" yet — this topic exists in the manifest but hasn't been explored in depth. Treat it as fresh.)`;
  }
  return data.content;
}

interface TurnRequest {
  student_id?: string;
  topic_slug?: string | null;
  user_message?: string;
}

Deno.serve(withRequest("turn", async (req, ctx) => {
  let body: TurnRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }

  const studentId = body.student_id?.trim();
  const userMessage = body.user_message?.trim();
  const topicSlug = body.topic_slug?.trim() || null;

  if (!studentId) return json({ error: "student_id is required" }, 400);
  if (!userMessage) return json({ error: "user_message is required" }, 400);
  ctx.studentId = studentId;

  // --- Load state -----------------------------------------------------------

  // Latest open session for (student_id, topic_slug), else create one.
  let sessionId: string;
  let messages: Anthropic.MessageParam[];
  let summary: string | null = null;

  const sessionQuery = supabase
    .from("sessions")
    .select("id, messages, summary")
    .eq("student_id", studentId)
    .is("ended_at", null)
    .order("started_at", { ascending: false })
    .limit(1);

  // topic_slug is part of the session key; match null vs a value explicitly.
  const { data: existing, error: sessionErr } = topicSlug === null
    ? await sessionQuery.is("topic_slug", null).maybeSingle()
    : await sessionQuery.eq("topic_slug", topicSlug).maybeSingle();

  if (sessionErr) {
    return json({ error: `session lookup failed: ${sessionErr.message}` }, 500);
  }

  if (existing) {
    sessionId = existing.id;
    messages = (existing.messages as Anthropic.MessageParam[]) ?? [];
    summary = existing.summary ?? null;
  } else {
    const { data: created, error: createErr } = await supabase
      .from("sessions")
      .insert({ student_id: studentId, topic_slug: topicSlug, messages: [] })
      .select("id")
      .single();
    if (createErr || !created) {
      return json(
        { error: `session create failed: ${createErr?.message}` },
        500,
      );
    }
    sessionId = created.id;
    messages = [];
  }
  ctx.sessionId = sessionId;

  messages.push({ role: "user", content: userMessage });

  // Floor context: the profile document.
  const { data: profileDoc, error: floorErr } = await supabase
    .from("documents")
    .select("content")
    .eq("student_id", studentId)
    .eq("doc_type", "profile")
    .maybeSingle();
  if (floorErr) {
    return json({ error: `floor load failed: ${floorErr.message}` }, 500);
  }
  const profile = profileDoc?.content ?? null;

  // Manifest: lightweight topic rows.
  const { data: topicRows, error: topicErr } = await supabase
    .from("topics")
    .select("topic_slug, title, status, last_session_at, resume_prompt")
    .eq("student_id", studentId);
  if (topicErr) {
    return json({ error: `manifest load failed: ${topicErr.message}` }, 500);
  }

  const systemParts = [
    TUTOR_SYSTEM_PROMPT,
    renderFloor({ profile }),
    renderManifest((topicRows ?? []) as ManifestRow[], topicSlug),
  ];
  // A compacted session carries a summary of the prior conversation so this
  // turn can resume coherently from where the earlier session left off.
  if (summary) {
    systemParts.push(
      `## Where this conversation is resuming from\nThis is a continuation of an earlier conversation that was summarized. Pick up naturally from here; don't re-introduce yourself or restate what's below.\n\n${summary}`,
    );
  }
  const system = systemParts.join("\n\n");

  // --- Inner tool loop (resolves within this one invocation) ----------------

  let assistantText = "";
  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await callModel(ctx, i, {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        system: [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
        ],
        tools: [READ_TOPIC_TOOL],
        messages,
      });

      // Persist the assistant turn verbatim (text + any tool_use blocks).
      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") {
        assistantText = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n");
        break;
      }

      // Resolve every read_topic call and feed results back.
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use" && block.name === "read_topic") {
          const slug = (block.input as { slug: string }).slug;
          const content = await readTopic(studentId, slug);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content,
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
    }
  } catch (err) {
    return json(
      { error: `model call failed: ${err instanceof Error ? err.message : err}` },
      502,
    );
  }

  // --- Persist full messages array ------------------------------------------

  const { error: saveErr } = await supabase
    .from("sessions")
    .update({ messages })
    .eq("id", sessionId);
  if (saveErr) {
    return json({ error: `session save failed: ${saveErr.message}` }, 500);
  }

  return json({
    session_id: sessionId,
    assistant_message: assistantText,
    request_id: ctx.requestId,
  });
}));
