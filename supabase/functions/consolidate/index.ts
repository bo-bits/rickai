// `consolidate` — the write path.
//
// Reads one session's full transcript and writes durable memory back: rewrites
// the student's profile doc and updates/creates topic notes + their manifest
// rows. A dedicated pass, separate from teaching, so writes happen once the
// thread has resolved rather than inline mid-conversation. Manually invoked
// (curl); no automation in this iteration.

import type Anthropic from "npm:@anthropic-ai/sdk@0.71.0";
import { MODEL, supabase } from "../_shared/clients.ts";
import { json, withRequest } from "../_shared/http.ts";
import { callModel } from "../_shared/telemetry.ts";
import { renderTranscript } from "../_shared/transcript.ts";
import {
  CONSOLIDATE_SYSTEM_PROMPT,
  renderCurrentState,
} from "./system_prompt.ts";

const MAX_TOKENS = 4096;
const MAX_TOOL_ITERATIONS = 8;

const VALID_STATUS = ["exploring", "developing", "solid", "mastered"];

const UPDATE_PROFILE_TOOL: Anthropic.Tool = {
  name: "update_profile",
  description:
    "Rewrite the student's profile — who they are as a learner (cross-topic, " +
    "slow-changing). Provide the COMPLETE new profile text; it replaces the old " +
    "one. Only call this when the conversation genuinely revealed something new " +
    "or sharper about the student.",
  input_schema: {
    type: "object",
    properties: {
      content: { type: "string", description: "The complete new profile text." },
    },
    required: ["content"],
  },
};

const UPDATE_TOPIC_TOOL: Anthropic.Tool = {
  name: "update_topic",
  description:
    "Create or update one topic's durable note + manifest row. Use the existing " +
    "slug to update a known topic, or a new slug to create one the conversation " +
    "uncovered. `content` is a full rewrite of that topic's note. Omit fields you " +
    "don't want to change (but always set `title` when creating a new topic).",
  input_schema: {
    type: "object",
    properties: {
      slug: {
        type: "string",
        description: "Topic slug, e.g. \"greek-history\". Stable identifier.",
      },
      title: { type: "string", description: "Human-readable title." },
      content: {
        type: "string",
        description: "Full rewrite of the topic's notes-to-self.",
      },
      status: {
        type: "string",
        enum: VALID_STATUS,
        description: "exploring | developing | solid | mastered.",
      },
      resume_prompt: {
        type: "string",
        description: "The single most natural place to pick up next time.",
      },
    },
    required: ["slug"],
  },
};

interface ConsolidateRequest {
  session_id?: string;
}

type Change =
  | { kind: "profile" }
  | { kind: "topic"; slug: string; created: boolean };

const nowIso = () => new Date().toISOString();

// Rewrite the single profile document for this student.
async function updateProfile(
  studentId: string,
  content: string,
): Promise<Change> {
  const { error } = await supabase
    .from("documents")
    .upsert(
      {
        student_id: studentId,
        doc_type: "profile",
        topic_slug: null,
        content,
        updated_at: nowIso(),
      },
      { onConflict: "student_id,doc_type,topic_slug" },
    );
  if (error) throw new Error(`update_profile failed: ${error.message}`);
  return { kind: "profile" };
}

// Upsert a topic's content doc (if content given) and its manifest row.
async function updateTopic(
  studentId: string,
  input: {
    slug: string;
    title?: string;
    content?: string;
    status?: string;
    resume_prompt?: string;
  },
): Promise<Change> {
  const slug = input.slug;

  // Content doc — only touch it if new content was provided.
  if (typeof input.content === "string") {
    const { error } = await supabase
      .from("documents")
      .upsert(
        {
          student_id: studentId,
          doc_type: "topic",
          topic_slug: slug,
          content: input.content,
          updated_at: nowIso(),
        },
        { onConflict: "student_id,doc_type,topic_slug" },
      );
    if (error) throw new Error(`update_topic content failed: ${error.message}`);
  }

  // Manifest row — read-modify-write so we don't clobber existing fields with
  // nulls and can default a title/status when creating a new topic.
  const { data: existing, error: readErr } = await supabase
    .from("topics")
    .select("topic_slug")
    .eq("student_id", studentId)
    .eq("topic_slug", slug)
    .maybeSingle();
  if (readErr) throw new Error(`update_topic lookup failed: ${readErr.message}`);

  const status = input.status && VALID_STATUS.includes(input.status)
    ? input.status
    : undefined;

  if (existing) {
    const patch: Record<string, unknown> = { last_session_at: nowIso() };
    if (input.title !== undefined) patch.title = input.title;
    if (status !== undefined) patch.status = status;
    if (input.resume_prompt !== undefined) {
      patch.resume_prompt = input.resume_prompt;
    }
    const { error } = await supabase
      .from("topics")
      .update(patch)
      .eq("student_id", studentId)
      .eq("topic_slug", slug);
    if (error) throw new Error(`update_topic row failed: ${error.message}`);
    return { kind: "topic", slug, created: false };
  }

  const { error } = await supabase.from("topics").insert({
    student_id: studentId,
    topic_slug: slug,
    title: input.title ?? slug,
    status: status ?? "exploring",
    resume_prompt: input.resume_prompt ?? null,
    last_session_at: nowIso(),
  });
  if (error) throw new Error(`create topic failed: ${error.message}`);
  return { kind: "topic", slug, created: true };
}

Deno.serve(withRequest("consolidate", async (req, ctx) => {
  let body: ConsolidateRequest;
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
    .select("student_id, topic_slug, messages")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionErr) {
    return json({ error: `session lookup failed: ${sessionErr.message}` }, 500);
  }
  if (!session) return json({ error: "session not found" }, 404);

  const studentId = session.student_id as string;
  ctx.studentId = studentId;
  const messages = (session.messages as Anthropic.MessageParam[]) ?? [];
  const transcript = renderTranscript(messages);

  // --- Load current durable state -------------------------------------------
  const { data: docs, error: docsErr } = await supabase
    .from("documents")
    .select("doc_type, topic_slug, content")
    .eq("student_id", studentId);
  if (docsErr) {
    return json({ error: `state load failed: ${docsErr.message}` }, 500);
  }
  const { data: topicRows, error: topicErr } = await supabase
    .from("topics")
    .select("topic_slug, title, status, resume_prompt")
    .eq("student_id", studentId);
  if (topicErr) {
    return json({ error: `manifest load failed: ${topicErr.message}` }, 500);
  }

  const profile =
    docs?.find((d) => d.doc_type === "profile")?.content ?? null;
  const topicContent = new Map(
    (docs ?? [])
      .filter((d) => d.doc_type === "topic" && d.topic_slug)
      .map((d) => [d.topic_slug as string, d.content as string]),
  );
  const topics = (topicRows ?? []).map((t) => ({
    topic_slug: t.topic_slug as string,
    title: t.title as string,
    status: t.status as string,
    resume_prompt: (t.resume_prompt as string | null) ?? null,
    content: topicContent.get(t.topic_slug as string) ?? null,
  }));

  const system = [
    CONSOLIDATE_SYSTEM_PROMPT,
    renderCurrentState({ profile, topics }),
  ].join("\n\n");

  // --- Tool loop: model proposes writes, we apply them ----------------------
  const llmMessages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        `Here is the full transcript of the session to consolidate. Update the ` +
        `student's durable memory based on what it shows.\n\n<transcript>\n${transcript}\n</transcript>`,
    },
  ];
  const changes: Change[] = [];

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await callModel(ctx, i, {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: "adaptive" },
        system: [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
        ],
        tools: [UPDATE_PROFILE_TOOL, UPDATE_TOPIC_TOOL],
        messages: llmMessages,
      });

      llmMessages.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") break;

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        try {
          const change = block.name === "update_profile"
            ? await updateProfile(
              studentId,
              (block.input as { content: string }).content,
            )
            : await updateTopic(
              studentId,
              block.input as { slug: string },
            );
          changes.push(change);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "ok",
          });
        } catch (err) {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: err instanceof Error ? err.message : String(err),
            is_error: true,
          });
        }
      }
      llmMessages.push({ role: "user", content: toolResults });
    }
  } catch (err) {
    return json(
      { error: `model call failed: ${err instanceof Error ? err.message : err}` },
      502,
    );
  }

  return json({ session_id: sessionId, changes, request_id: ctx.requestId });
}));
