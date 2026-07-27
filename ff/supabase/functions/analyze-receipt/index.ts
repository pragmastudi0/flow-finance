import { createClient } from 'jsr:@supabase/supabase-js@2';

import { parseDocumentResponse, DOCUMENT_PROMPT } from '../_shared/receipt.ts';

const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? 25);
const PROVIDER = (Deno.env.get('AI_PROVIDER') ?? 'gemini').toLowerCase();

const DEFAULT_MODELS: Record<string, string> = {
  gemini: 'gemini-2.5-flash',
  groq: 'meta-llama/llama-4-scout-17b-16e-instruct',
};

const MODEL = Deno.env.get('AI_MODEL') ?? DEFAULT_MODELS[PROVIDER] ?? DEFAULT_MODELS.gemini;

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

interface VisionRequest {
  prompt: string;
  imageBase64: string;
  mimeType: string;
}

async function callGemini({ prompt, imageBase64, mimeType }: VisionRequest): Promise<string> {
  const key = Deno.env.get('GEMINI_API_KEY');
  if (!key) throw new Error('GEMINI_API_KEY is not set');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }],
          },
        ],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    },
  );

  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
}

async function callGroq({ prompt, imageBase64, mimeType }: VisionRequest): Promise<string> {
  const key = Deno.env.get('GROQ_API_KEY');
  if (!key) throw new Error('GROQ_API_KEY is not set');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

const analyze = PROVIDER === 'groq' ? callGroq : callGemini;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const asUser = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth } = await asUser.auth.getUser();
  const user = auth?.user;
  if (!user) return json({ error: 'unauthorized' }, 401);

  let receiptId: string;
  try {
    ({ receiptId } = await req.json());
    if (typeof receiptId !== 'string' || !receiptId) throw new Error();
  } catch {
    return json({ error: 'receiptId is required' }, 400);
  }

  const admin = createClient(url, serviceKey);

  const { data: receipt, error: loadError } = await asUser
    .from('flowfinance_receipts')
    .select('id, storage_path, status')
    .eq('id', receiptId)
    .single();

  if (loadError || !receipt) return json({ error: 'receipt_not_found' }, 404);
  if (receipt.status === 'done') return json({ error: 'already_analyzed' }, 409);

  const { data: allowed } = await admin.rpc('claim_ai_call', {
    p_user_id: user.id,
    p_daily_limit: DAILY_LIMIT,
  });
  if (allowed === false) {
    return json({ error: 'daily_limit_reached', limit: DAILY_LIMIT }, 429);
  }

  await admin.from('flowfinance_receipts').update({ status: 'analyzing' }).eq('id', receipt.id);

  const fail = async (message: string, status = 502) => {
    await admin
      .from('flowfinance_receipts')
      .update({ status: 'failed', error: message.slice(0, 500), analyzed_at: new Date().toISOString() })
      .eq('id', receipt.id);
    return json({ error: 'analysis_failed', detail: message }, status);
  };

  try {
    const { data: file, error: downloadError } = await admin.storage
      .from('receipts')
      .download(receipt.storage_path);

    if (downloadError || !file) return await fail('could not read the uploaded image', 404);

    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }

    const raw = await analyze({
      prompt: DOCUMENT_PROMPT,
      imageBase64: btoa(binary),
      mimeType: file.type || 'image/jpeg',
    });

    const extraction = parseDocumentResponse(raw);
    if (!extraction) return await fail('the image does not look like a receipt', 422);

    const { error: saveError } = await admin
      .from('flowfinance_receipts')
      .update({
        status: 'done',
        merchant: extraction.merchant,
        total: extraction.total,
        currency: extraction.currency,
        receipt_date: extraction.date,
        items: extraction.items,
        confidence: extraction.confidence,
        provider: PROVIDER,
        model: MODEL,
        error: null,
        analyzed_at: new Date().toISOString(),
      })
      .eq('id', receipt.id);

    if (saveError) return await fail(saveError.message, 500);

    return json({ receiptId: receipt.id, ...extraction });
  } catch (err) {
    return await fail(err instanceof Error ? err.message : String(err));
  }
});
