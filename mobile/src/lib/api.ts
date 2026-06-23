import { supabase } from '@/lib/supabase';

export type TopicStatus = 'exploring' | 'developing' | 'solid' | 'mastered';

export type Topic = {
  topic_slug: string;
  title: string;
  status: TopicStatus | null;
  last_session_at: string | null;
  resume_prompt: string | null;
};

export async function fetchTopics(): Promise<Topic[]> {
  const { data, error } = await supabase
    .from('topics')
    .select('topic_slug, title, status, last_session_at, resume_prompt')
    .order('last_session_at', { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as Topic[];
}

const BASE = process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export type TurnResponse = {
  session_id: string;
  assistant_message: string;
  request_id: string;
};

export async function callTurn(
  userMessage: string,
  topicSlug: string | null = null,
): Promise<TurnResponse> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');

  const res = await fetch(`${BASE}/functions/v1/turn`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON ?? '',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ user_message: userMessage, topic_slug: topicSlug }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error ?? `turn failed (${res.status})`);
  }
  return payload as TurnResponse;
}
