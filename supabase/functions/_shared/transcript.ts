// Helpers for turning a persisted `sessions.messages` array (which includes
// tool_use / tool_result / thinking blocks) into clean material for the write
// path: a readable transcript for the model to read, and a text-only dialogue
// tail to seed a compacted session with.

import type Anthropic from "npm:@anthropic-ai/sdk@0.71.0";

// Pull just the spoken text out of one message's content (string or blocks),
// dropping tool_use / tool_result / thinking plumbing.
function messageText(content: Anthropic.MessageParam["content"]): string {
  if (typeof content === "string") return content.trim();
  return content
    .filter((b): b is Anthropic.TextBlockParam => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// Reduce the raw message array to clean alternating text turns (user / assistant),
// dropping any turn that carried no spoken text (e.g. a pure tool_use step).
export function cleanDialogue(
  messages: Anthropic.MessageParam[],
): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    const text = messageText(m.content);
    if (text) out.push({ role: m.role, content: text });
  }
  return out;
}

// Render the conversation as a plain-text transcript the model can read.
export function renderTranscript(messages: Anthropic.MessageParam[]): string {
  const dialogue = cleanDialogue(messages);
  if (dialogue.length === 0) return "(empty conversation)";
  return dialogue
    .map((m) => `${m.role === "user" ? "Student" : "Tutor"}: ${m.content}`)
    .join("\n\n");
}

// The last few clean exchanges, trimmed to start on a user turn so the result is
// a valid prefix for the next Messages API call. Used to seed a compacted session.
export function dialogueTail(
  messages: Anthropic.MessageParam[],
  maxMessages = 4,
): Anthropic.MessageParam[] {
  const dialogue = cleanDialogue(messages);
  let tail = dialogue.slice(-maxMessages);
  while (tail.length > 0 && tail[0].role !== "user") tail = tail.slice(1);
  return tail;
}
