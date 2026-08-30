/**
 * Resolves the reconciliation pairs the deterministic engine could not settle.
 *
 * Deliberately narrow. The client has already normalized, generated
 * candidates, scored them and locked in everything the rules answer on their
 * own; what arrives here is at most a dozen ambiguous descriptor pairs and
 * the only question asked is "same merchant?". No statement is uploaded, no
 * table is read on the caller's behalf, and nothing is written.
 *
 * Everything else is the infrastructure the AI features here already use:
 * `getProvider` for the user's key and provider choice, `claim_ai_call` for
 * the daily quota, and the shared CORS helpers.
 */
// Relative rather than a `~shared/` alias: the alias only resolves when an
// import map is uploaded alongside the function, and a deploy that drops it
// fails at boot instead of at type-check. A relative path always resolves.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { extractJson, getProvider, MissingApiKeyError } from '../_shared/ai.ts';
import { jsonResponse, preflight } from '../_shared/cors.ts';
import { buildPrompt, parseQuestions, parseVerdicts, RECONCILE_SYSTEM_PROMPT } from '../_shared/reconcile.ts';

const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? 25);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);

  const json = (body: unknown, status = 200) => jsonResponse(req, body, status);

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'server_misconfigured' }, 500);

  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

  const { data: auth } = await asUser.auth.getUser();
  const user = auth?.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  const pairs = parseQuestions(body);
  if (!pairs) return json({ error: 'invalid_body' }, 400);

  // Resolved before the quota is claimed, so a missing key never burns a call.
  let provider;
  try {
    provider = getProvider(user.user_metadata?.apiKeys);
  } catch (e) {
    if (e instanceof MissingApiKeyError) return json({ error: 'no_api_key', provider: e.provider }, 400);
    throw e;
  }

  const admin = createClient(url, serviceKey);
  const { data: allowed } = await admin.rpc('claim_ai_call', {
    p_user_id: user.id,
    p_daily_limit: DAILY_LIMIT,
  });
  if (allowed === false) return json({ error: 'rate_limited', limit: DAILY_LIMIT }, 429);

  try {
    const raw = await provider.complete({
      system: RECONCILE_SYSTEM_PROMPT,
      prompt: buildPrompt(pairs),
      json: true,
      temperature: 0,
    });
    const verdicts = parseVerdicts(extractJson(raw), pairs.map((p) => p.id));
    return json({ verdicts, provider: provider.name, model: provider.model });
  } catch (e) {
    if (e instanceof MissingApiKeyError) return json({ error: 'no_api_key', provider: e.provider }, 400);
    console.error('reconcile model call failed', e);
    return json({ error: 'ai_failed' }, 502);
  }
});
