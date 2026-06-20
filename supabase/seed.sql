-- V0 fixtures: one hand-seeded student so the read/teach path is exercisable.
-- Rows are read-only at runtime in V0 (no write-back yet).

-- Student: jimmy
insert into documents (student_id, doc_type, topic_slug, content) values
('jimmy', 'profile', null, $$Jimmy, 16. Curious generalist, learns for fun — no exams, no syllabus. Reads widely but unevenly: loves a vivid story or a surprising connection, glazes over at dry lists of dates or definitions. Responds well to "why does this matter" framing. Prefers being asked what he thinks over being lectured. Comfortable with big abstract questions; gets bored by rote detail.$$),

('jimmy', 'signals', null, $$- Keeps steering history conversations toward the *ideas* people held, not just events (reached for "but what did they actually believe?" three times).
- Lights up at origins — how a thing started, the first person to do X.
- Asks "is that still true today?" — wants the through-line to the present.
- Goes quiet when given more than ~3 facts at once.$$),

('jimmy', 'topic', 'greek-history', $$# Ancient Greek history

Jimmy explored the rise of Athens and the idea of the polis. Solid on:
- The polis as a self-governing city-state, and why geography (mountains, islands) pushed Greece toward many small states rather than one empire.
- Athenian democracy as direct (not representative) — citizens voting in person — and that "citizen" excluded women, enslaved people, and foreigners.

He kept asking *why* Athenians thought ordinary people should govern themselves — that's a live thread into political philosophy he hasn't followed yet. Left off wondering whether direct democracy could ever work at scale.$$),

('jimmy', 'topic', 'philosophy', $$# Philosophy

Jimmy did one session on what philosophy even is — the move from "the gods did it" explanations to asking for reasons and arguments. Solid on:
- The Socratic method as asking questions to expose what you don't actually know, rather than lecturing answers.
- That Socrates was executed by Athens, which unsettled him given how proud Athens was of free speech.

He connected this himself to "those Greek city-states we talked about" — strong instinct for weaving. Confidence: developing.$$);

-- Manifest rows. Note: `well-being` has no topic-content document, to prove the
-- manifest-without-content path (model should treat it as fresh exploration).
insert into topics (student_id, topic_slug, title, status, last_session_at, resume_prompt) values
('jimmy', 'greek-history', 'Ancient Greek history', 'solid', now() - interval '6 days', 'whether direct democracy could ever work at scale'),
('jimmy', 'philosophy', 'Philosophy', 'developing', now() - interval '2 days', 'why Socrates accepted his own execution'),
('jimmy', 'well-being', 'What is a good life?', 'exploring', null, null);
