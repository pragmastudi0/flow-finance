/**
 * Free-form questions about the caller's own finances.
 *
 * Same snapshot as the report, so the answers agree with what the Insights
 * screen shows. History is supplied by the client per request — the thread is
 * in-memory by design and nothing is persisted here.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { getProvider } from '~shared/ai.ts';
import { buildSnapshot } from '~shared/finance.ts';

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_QUESTION = 500;
/** Enough for a coherent thread without letting the prompt grow unbounded. */
const MAX_HISTORY = 8;

const SYSTEM = `Sos el asistente financiero de FlowFinance. Respondés preguntas sobre las finanzas personales del usuario usando únicamente el resumen que recibís.

Reglas:
- Respondé en texto plano, breve y directo: 2 a 4 frases salvo que pidan detalle.
- Los montos están en pesos argentinos. Escribilos con separador de miles.
- No inventes datos. Si el resumen no alcanza para responder, decilo claramente.
- Si la pregunta no es sobre finanzas, redirigí con amabilidad.
- Hablá en el mismo idioma que la pregunta.`;

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

function parseHistory(value: unknown): Turn[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const t = item as Record<string, unknown>;
      const role = t?.role === 'assistant' ? 'assistant' : 'user';
      const content = typeof t?.content === 'string' ? t.content.slice(0, MAX_QUESTION) : '';
      return { role, content } as Turn;
    })
    .filter((t) => t.content)
    .slice(-MAX_HISTORY);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) return json({ error: 'server_misconfigured' }, 500);

  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });

  const { data: auth } = await asUser.auth.getUser();
  const user = auth?.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  let body: { month?: unknown; question?: unknown; history?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_body' }, 400);
  }

  const month = typeof body.month === 'string' && MONTH_RE.test(body.month) ? body.month : null;
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION) : '';
  if (!month) return json({ error: 'invalid_month' }, 400);
  if (!question) return json({ error: 'empty_question' }, 400);

  let snapshot;
  try {
    snapshot = await buildSnapshot(asUser, user.id, month);
  } catch (e) {
    console.error('snapshot failed', e);
    return json({ error: 'snapshot_failed' }, 500);
  }

  // Use user's API keys from auth metadata if available, fallback to env secrets
  const userApiKeys = user.user_metadata?.apiKeys;

  const history = parseHistory(body.history);
  const transcript = history.map((t) => `${t.role === 'user' ? 'Usuario' : 'Asistente'}: ${t.content}`).join('\n');

  const prompt = [
    `Resumen financiero (JSON):\n${JSON.stringify(snapshot)}`,
    transcript ? `\nConversación previa:\n${transcript}` : '',
    `\nPregunta: ${question}`,
  ].join('\n');

  try {
    const answer = await getProvider(userApiKeys).complete({ system: SYSTEM, prompt, temperature: 0.3 });
    const text = answer.trim();
    if (!text) return json({ error: 'ai_failed' }, 502);
    return json({ answer: text });
  } catch (e) {
    console.error('model call failed', e);
    return json({ error: 'ai_failed' }, 502);
  }
});
