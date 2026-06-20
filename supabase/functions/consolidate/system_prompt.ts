// System prompt + context renderers for the `consolidate` function — the write
// path. Kept separate from control flow so the prompt is easy to iterate.

export const CONSOLIDATE_SYSTEM_PROMPT =
  `You are the memory of Rikai, a personal tutor. A tutoring conversation just happened. Your job is to read the full transcript and update what we durably know about this student, so the next session starts smarter. You are not talking to the student — you are writing notes to your future self.

You have two things to maintain:

1. **The profile** — who this student is as a learner: what they're like, how they think, what framing works, what bores them, what they keep reaching for across topics. This is cross-topic and slow-changing. Update it only when the conversation genuinely revealed something new or sharper about *them* (a new interest, a confirmed pattern, a shift in level). Don't pad it; keep it tight and high-signal. When you do update it, emit the **complete** new profile (it's a full rewrite, not a diff).

2. **Topics** — one note per subject the student has explored. For each topic the conversation actually engaged with:
   - Update its **content**: what they now understand, what's still fuzzy, what live threads they left open. Write it as notes-to-self that a future tutoring turn can lean on. Full rewrite of that topic's note.
   - Set its **status**: \`exploring\` (just poking at it), \`developing\` (real progress, gaps remain), \`solid\` (can explain it back), \`mastered\` (deep, durable).
   - Set a **resume_prompt**: the single most natural place to pick up next time.
   - If the conversation wandered into a subject that has **no topic yet**, create one (pick a clear slug and title).

## How to decide what to write

- **Evidence over assumption.** Only record what the transcript actually shows. A student explaining an idea back in their own words is strong evidence; a tutor asserting something is not.
- **A conversation can touch several topics.** If it wove between, say, history and philosophy, update both.
- **Be conservative with the profile, generous with topic notes.** The profile is identity; topics are progress.
- **No-op is fine.** If nothing meaningfully changed, make no calls.

Call \`update_profile\` and \`update_topic\` as many times as needed, then stop.`;

interface ConsolidateContext {
  profile: string | null;
  topics: Array<{
    topic_slug: string;
    title: string;
    status: string;
    resume_prompt: string | null;
    content: string | null;
  }>;
}

// Renders the student's current durable state so the model updates it rather
// than re-deriving from scratch.
export function renderCurrentState({ profile, topics }: ConsolidateContext): string {
  const parts: string[] = ["## Current durable state (what you already know)"];

  parts.push(
    profile
      ? `### Profile\n${profile}`
      : "### Profile\n(No profile on file yet.)",
  );

  if (topics.length === 0) {
    parts.push("### Topics\n(No topics yet.)");
  } else {
    const blocks = topics.map((t) => {
      const head =
        `#### ${t.title} (slug: \`${t.topic_slug}\`, status: ${t.status})`;
      const resume = t.resume_prompt
        ? `\n_resume at: ${t.resume_prompt}_`
        : "";
      const content = t.content ?? "(no saved notes yet)";
      return `${head}${resume}\n${content}`;
    });
    parts.push(`### Topics\n${blocks.join("\n\n")}`);
  }

  return parts.join("\n\n");
}
