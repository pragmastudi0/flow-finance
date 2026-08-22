/**
 * Generates (or returns the cached) AI report for one month.
 *
 * The client sends only `{ month, force? }`. The snapshot is assembled here
 * from the caller's own rows — the browser never describes its own finances,
 * and the model key never leaves the edge runtime.
 */
// Relative rather than a `~shared/` alias: the alias only resolves when an
// import map is uploaded alongside the function, and a deploy that drops it
// fails at boot instead of at type-check. A relative path always resolves.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { extractJson, getProvider, MissingApiKeyError } from '../_shared/ai.ts';
import { buildSnapshot } from '../_shared/finance.ts';
import { parseReport, REPORT_SYSTEM_PROMPT } from '../_shared/report.ts';
import { jsonResponse, preflight } from '../_shared/cors.ts';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);

  const json = (body: unknown, status = 200) => jsonResponse(req, body, status);

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'server_misconfigured' }, 500);

  const authHeader = req.headers.get('Authorization') ?? '';
  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: auth } = await asUser.auth.getUser();
  const user = auth?.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body: { month?: unknown; force?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  const month = typeof body.month === 'string' && MONTH_RE.test(body.month) ? body.month : null;
  if (!month) return json({ error: 'invalid_month' }, 400);
  const monthDate = `${month}-01`;
  const force = body.force === true;

  const admin = createClient(url, serviceKey);

  // Cache first: opening the screen must never cost a model call.
  if (!force) {
    const { data: cached } = await admin
      .from('flowfinance_ai_reports')
      .select('response_json, created_at, provider, model')
      .eq('user_id', user.id)
      .eq('month', monthDate)
      .maybeSingle();

    if (cached?.response_json) {
      return json({
        report: cached.response_json,
        generatedAt: cached.created_at,
        cached: true,
      });
    }
  }

  let snapshot;
  try {
    snapshot = await buildSnapshot(asUser, user.id, month);
  } catch (e) {
    console.error('snapshot failed', e);
    return json({ error: 'snapshot_failed' }, 500);
  }

  // Nothing to analyse: a model call here would only invent narrative.
  if (snapshot.current.transactionCount === 0) {
    return json({ error: 'no_data' }, 422);
  }

  // The user's own key from Settings, falling back to the project secrets.
  const provider = getProvider(user.user_metadata?.apiKeys);
  let report;
  try {
    const raw = await provider.complete({
      system: REPORT_SYSTEM_PROMPT,
      prompt: JSON.stringify(snapshot),
      json: true,
    });
    report = parseReport(extractJson(raw));
  } catch (e) {
    // "No key configured" is not a transient model failure: retrying can
    // never fix it, so the screen needs to say to add one in Settings.
    if (e instanceof MissingApiKeyError) {
      console.error('no api key', e.provider);
      return json({ error: 'no_api_key', provider: e.provider }, 400);
    }
    console.error('model call failed', e);
    return json({ error: 'ai_failed' }, 502);
  }

  const { data: saved, error: saveError } = await admin
    .from('flowfinance_ai_reports')
    .upsert(
      {
        user_id: user.id,
        month: monthDate,
        response_json: report,
        provider: provider.name,
        model: provider.model,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,month' },
    )
    .select('created_at')
    .single();

  if (saveError) console.error('cache write failed', saveError);

  // A failed cache write must not lose the report the user just paid for.
  return json({
    report,
    generatedAt: saved?.created_at ?? new Date().toISOString(),
    cached: false,
  });
});
