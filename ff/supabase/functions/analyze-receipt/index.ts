import { createClient } from 'jsr:@supabase/supabase-js@2';

type Currency = 'ARS' | 'USD';

interface LineItem {
  description: string;
  quantity: number | null;
  totalPrice: number | null;
}

interface DocumentExtraction {
  merchant: string | null;
  total: number;
  currency: Currency;
  date: string | null;
  items: LineItem[];
  confidence: number;
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function normalizeNumber(raw: string): number {
  let s = raw;
  if (s.includes('.') && s.includes(',')) {
    s = s.lastIndexOf('.') < s.lastIndexOf(',')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    const parts = s.split(',');
    s = parts.length === 2 && parts[1].length === 2
      ? s.replace(',', '.')
      : s.replace(/,/g, '');
  } else if (s.includes('.')) {
    const parts = s.split('.');
    s = parts.length === 2 && parts[1].length === 2
      ? s
      : s.replace(/\./g, '');
  }
  return parseFloat(s) || 0;
}

const MAX_AGE_DAYS = 400;

const DOCUMENT_PROMPT = `Analizás fotos de tickets y facturas de compra argentinos.

Devolvé UN objeto JSON y nada más. Sin explicaciones, sin markdown, sin \`\`\`.

Esquema:
{
  "merchant": string|null,
  "total": number,
  "currency": "ARS"|"USD",
  "date": string|null,
  "items": [{ "description": string, "quantity": number|null, "totalPrice": number|null }],
  "confidence": number
}

Reglas:
- El total es el importe final pagado. Si el documento muestra subtotal e IVA, devolvé el TOTAL.
- Los tickets argentinos usan punto como separador de miles y coma decimal ("1.234,56"). Convertí a número: 1234.56
- Si no podés leer el total con confianza, igual devolví tu mejor estimación y bajá "confidence".
- Si la imagen no es un ticket ni factura válido, devolvé "total": 0 y "confidence": 0.
- "items" puede ir vacío. No inventes renglones.
- No inventes el comercio ni la fecha: si no se leen, devolvé null.`;

function extractJsonObject(raw: string): unknown {
  const withoutFences = raw
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(withoutFences.slice(start, end + 1));
  } catch {
    return null;
  }
}

function coerceAmount(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string' && value.trim()) {
    const n = normalizeNumber(value.replace(/[^\d.,-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function coerceDate(value: unknown, today: Date): string | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, y, m, d] = match;
  const parsed = new Date(Number(y), Number(m) - 1, Number(d));
  if (
    parsed.getFullYear() !== Number(y) ||
    parsed.getMonth() !== Number(m) - 1 ||
    parsed.getDate() !== Number(d)
  ) return null;
  const ageDays = (today.getTime() - parsed.getTime()) / 86_400_000;
  if (ageDays < -1 || ageDays > MAX_AGE_DAYS) return null;
  return `${y}-${m}-${d}`;
}

function coerceItems(value: unknown): LineItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 100)
    .map((raw) => {
      if (typeof raw !== 'object' || raw === null) return null;
      const item = raw as Record<string, unknown>;
      const description = typeof item.description === 'string' ? item.description.trim() : '';
      if (!description) return null;
      return {
        description: description.slice(0, 200),
        quantity: coerceAmount(item.quantity),
        totalPrice: coerceAmount(item.totalPrice),
      };
    })
    .filter((i): i is LineItem => i !== null);
}

function parseDocumentResponse(
  raw: string,
  { today = new Date() }: { today?: Date } = {},
): DocumentExtraction | null {
  const parsed = extractJsonObject(raw);
  if (typeof parsed !== 'object' || parsed === null) return null;

  const data = parsed as Record<string, unknown>;

  const total = coerceAmount(data.total);
  if (total === null || total <= 0) return null;

  const merchantRaw = typeof data.merchant === 'string' ? data.merchant.trim() : '';
  const merchant = merchantRaw ? merchantRaw.slice(0, 120) : null;

  const confidence =
    typeof data.confidence === 'number' && Number.isFinite(data.confidence)
      ? Math.min(Math.max(data.confidence, 0), 1)
      : 0.5;
  if (confidence === 0) return null;

  return {
    merchant,
    total,
    currency: fold(String(data.currency ?? '')) === 'usd' ? 'USD' : 'ARS',
    date: coerceDate(data.date, today),
    items: coerceItems(data.items),
    confidence,
  } as DocumentExtraction;
}

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
