/**
 * Provider-agnostic model access.
 *
 * Text and vision both go through here so adding a provider is one entry
 * rather than an edit in every function. `analyze-receipt` used to carry its
 * own inline `callGemini` / `callGroq` pair; it now shares this, which is how
 * it picked up support for the key a user sets in Settings.
 *
 * The API keys are Deno env secrets and never leave the edge runtime. They
 * must not move to the client: Vite inlines anything `VITE_*` into the public
 * bundle, so a browser-side key is a published key.
 */

export type ProviderName = 'gemini' | 'groq' | 'openai' | 'anthropic';

export interface TextRequest {
  /** Instructions that frame the task. Sent as a system role where supported. */
  system: string;
  /** The actual payload/question. */
  prompt: string;
  /** Ask the provider to emit a bare JSON object. */
  json?: boolean;
  temperature?: number;
}

export interface VisionRequest {
  prompt: string;
  imageBase64: string;
  mimeType: string;
  json?: boolean;
  temperature?: number;
}

export interface CompletionProvider {
  readonly name: ProviderName;
  readonly model: string;
  complete(req: TextRequest): Promise<string>;
  /** Throws `UnsupportedMediaError` for a media type the provider can't read. */
  describe(req: VisionRequest): Promise<string>;
}

/**
 * No key anywhere — neither the user's nor the project's.
 *
 * Distinct from a model failure because the fix is completely different:
 * the user adds a key in Settings (or an operator sets the secret), rather
 * than retrying. Collapsing it into a generic failure is what left nine of
 * ten accounts staring at "try again shortly" with nothing to try.
 */
export class MissingApiKeyError extends Error {
  constructor(readonly provider: ProviderName) {
    super(`no API key configured for ${provider}`);
    this.name = 'MissingApiKeyError';
  }
}

/** The provider can read images but not this particular media type. */
export class UnsupportedMediaError extends Error {
  constructor(readonly provider: ProviderName, readonly mimeType: string) {
    super(`${provider} cannot read ${mimeType}`);
    this.name = 'UnsupportedMediaError';
  }
}

const DEFAULT_MODELS: Record<ProviderName, string> = {
  gemini: 'gemini-2.5-flash',
  groq: 'meta-llama/llama-4-scout-17b-16e-instruct',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
};

const KEY_ENV: Record<ProviderName, string> = {
  gemini: 'GEMINI_API_KEY',
  groq: 'GROQ_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

/**
 * The user's key wins; the project secret is the fallback.
 *
 * Blank strings count as absent: the Settings screen persists an empty field
 * for every provider the user left untouched, so `''` here means "not set",
 * not "set to nothing".
 */
function resolveKey(provider: ProviderName, userKey?: string): string {
  const fromUser = userKey?.trim();
  if (fromUser) return fromUser;
  const fromEnv = Deno.env.get(KEY_ENV[provider])?.trim();
  if (fromEnv) return fromEnv;
  throw new MissingApiKeyError(provider);
}

function gemini(model: string, apiKey?: string): CompletionProvider {
  const send = async (body: Record<string, unknown>) => {
    const key = resolveKey('gemini', apiKey);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return (
      data?.candidates?.[0]?.content?.parts
        ?.map((p: { text?: string }) => p.text ?? '')
        .join('') ?? ''
    );
  };

  const generationConfig = (json: boolean, temperature: number) => ({
    temperature,
    ...(json ? { responseMimeType: 'application/json' } : {}),
  });

  return {
    name: 'gemini',
    model,
    complete: ({ system, prompt, json, temperature = 0.2 }) =>
      send({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: generationConfig(json === true, temperature),
      }),
    // Gemini reads PDFs inline alongside images, which is why it stays the
    // default for receipt scanning.
    describe: ({ prompt, imageBase64, mimeType, json = true, temperature = 0 }) =>
      send({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: imageBase64 } }],
          },
        ],
        generationConfig: generationConfig(json, temperature),
      }),
  };
}

function anthropic(model: string, apiKey?: string): CompletionProvider {
  const send = async (body: Record<string, unknown>) => {
    const key = resolveKey('anthropic', apiKey);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: 4096, ...body }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return (
      data?.content
        ?.filter((b: { type?: string }) => b.type === 'text')
        .map((b: { text?: string }) => b.text ?? '')
        .join('') ?? ''
    );
  };

  return {
    name: 'anthropic',
    model,
    complete: ({ system, prompt, temperature = 0.2 }) =>
      send({ temperature, system, messages: [{ role: 'user', content: prompt }] }),
    describe: ({ prompt, imageBase64, mimeType, temperature = 0 }) => {
      // PDFs go in a `document` block; images in an `image` block.
      const block =
        mimeType === 'application/pdf'
          ? { type: 'document', source: { type: 'base64', media_type: mimeType, data: imageBase64 } }
          : { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } };
      return send({
        temperature,
        messages: [{ role: 'user', content: [block, { type: 'text', text: prompt }] }],
      });
    },
  };
}

/** Groq and OpenAI share the chat-completions shape. */
function openaiCompatible(
  name: 'groq' | 'openai',
  model: string,
  url: string,
  apiKey?: string,
): CompletionProvider {
  const send = async (messages: unknown[], json: boolean, temperature: number) => {
    const key = resolveKey(name, apiKey);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
        messages,
      }),
    });
    if (!res.ok) throw new Error(`${name} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? '';
  };

  return {
    name,
    model,
    complete: ({ system, prompt, json, temperature = 0.2 }) =>
      send(
        [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        json === true,
        temperature,
      ),
    describe: ({ prompt, imageBase64, mimeType, json = true, temperature = 0 }) => {
      // Neither chat-completions endpoint accepts a PDF as an image part.
      if (mimeType === 'application/pdf') throw new UnsupportedMediaError(name, mimeType);
      return send(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
        json,
        temperature,
      );
    },
  };
}

const PROVIDER_NAMES: ProviderName[] = ['gemini', 'groq', 'openai', 'anthropic'];

export interface UserApiKeys {
  gemini?: string;
  groq?: string;
  openai?: string;
  anthropic?: string;
  /** The provider the user picked in Settings; overrides the `AI_PROVIDER` secret. */
  provider?: string;
}

const asProvider = (raw?: string): ProviderName | null => {
  const name = raw?.trim().toLowerCase();
  return name && PROVIDER_NAMES.includes(name as ProviderName) ? (name as ProviderName) : null;
};

/**
 * Picks the provider the user selected in Settings, falling back to the
 * `AI_PROVIDER` / `AI_MODEL` secrets, and finally to Gemini 2.5 Flash.
 */
export function getProvider(apiKeys?: UserApiKeys): CompletionProvider {
  const envProvider = asProvider(Deno.env.get('AI_PROVIDER'));
  const name = asProvider(apiKeys?.provider) ?? envProvider ?? 'gemini';

  // `AI_MODEL` names a model for the provider `AI_PROVIDER` selects. Applying
  // it to a different provider sends, say, a Gemini model id to Anthropic and
  // earns a 404 — so it only counts when the resolved provider is that one.
  const envModel = Deno.env.get('AI_MODEL')?.trim();
  const model = envModel && name === (envProvider ?? 'gemini') ? envModel : DEFAULT_MODELS[name];

  switch (name) {
    case 'groq':
      return openaiCompatible('groq', model, 'https://api.groq.com/openai/v1/chat/completions', apiKeys?.groq);
    case 'openai':
      return openaiCompatible('openai', model, 'https://api.openai.com/v1/chat/completions', apiKeys?.openai);
    case 'anthropic':
      return anthropic(model, apiKeys?.anthropic);
    default:
      return gemini(model, apiKeys?.gemini);
  }
}

/**
 * Pulls the first balanced JSON object out of a response.
 *
 * Even with a JSON response format, models still occasionally wrap the object
 * in prose or a ``` fence.
 */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to brace matching
  }

  const start = trimmed.indexOf('{');
  if (start === -1) throw new Error('No JSON object in model response');

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      return JSON.parse(trimmed.slice(start, i + 1));
    }
  }
  throw new Error('Unterminated JSON object in model response');
}
