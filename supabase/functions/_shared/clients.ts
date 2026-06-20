// Shared clients + model config for all edge functions.
// The service-role Supabase client bypasses RLS; each function filters by
// student_id itself (real auth lands later).

import Anthropic from "npm:@anthropic-ai/sdk@0.71.0";
import { createClient } from "jsr:@supabase/supabase-js@2";

export const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";

export const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
});

export const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
