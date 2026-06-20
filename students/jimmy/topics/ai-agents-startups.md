# Topic: AI Agents & Startups

## Summary
How AI agents actually work under the hood, and how startups are building with them in practice.

## Status
- **Level:** developing
- **Confidence:** medium
- **Last visited:** 2026-06-20
- **Sessions:** 1

## What they know
- Agents run on a loop based on goals and triggers — each action informs the next
- They don't store full context; instead they use a vector database (meaning-based search) that retrieves relevant chunks on demand
- Four-layer memory stack: long-term memory (vector DB), live data (tool calls to APIs), instructions (system prompt), working memory (current context)
- Common startup use cases: sales outreach, customer support, recruiting, dev (Devin/Cursor), finance monitoring

## Misconceptions
- Slight conflation: retrieval is triggered by tool call logic, not purely the agent deciding what's relevant autonomously. Small but worth correcting next session.

## What clicked
- Vector DB as meaning-based search (vs keyword search)
- The four-layer memory stack framing
- "High-volume, repetitive, multi-step tasks where inputs/outputs are mostly text or structured data"

## Open thread
How multiple agents orchestrate and hand off tasks to each other — multi-agent systems and startup architecture.

## Related
- [[philippines-spanish-history]]

## Tags
- technology
- AI
- entrepreneurship
