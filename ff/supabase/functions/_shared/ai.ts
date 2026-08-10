/**
 * Provider-agnostic model access.
 *
 * `analyze-receipt` grew its own inline `callGemini` / `callGroq` pair for
 * vision. This is the same idea generalised to text-only calls and shared, so
 * adding a provider is one entry in `PROVIDERS` rather than an edit in every
 * function.
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

export interface CompletionProvider {
  readonly name: ProviderName;
  readonly model: string;
  complete(req: TextRequest): Promise<string>;
}

const DEFAULT_MODELS: Record<ProviderName, string> = {
  gemini: 'gemini-2.5-flash',
  groq: 'meta-llama/llama-4-scout-17b-16e-instruct',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
};

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function gemini(model: string, apiKey?: string): CompletionProvider {
  return {
    name: 'gemini',
    model,
    async complete({ system, prompt, json, temperature = 0.2 }) {
      const key = apiKey || env('GEMINI_API_KEY');
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature,
              ...(json ? { responseMimeType: 'application/json' } : {}),
            },
          }),
        },
      );
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      return (
        data?.candidates?.[0]?.content?.parts
          ?.map((p: { text?: string }) => p.text ?? '')
          .join('') ?? ''
      );
    },
  };
}

function anthropic(model: string, apiKey?: string): CompletionProvider {
  return {
    name: 'anthropic',
    model,
    async complete({ system, prompt, temperature = 0.2 }) {
      const key = apiKey || env('ANTHROPIC_API_KEY');
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          temperature,
          system,
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      return (
        data?.content
          ?.filter((b: { type?: string }) => b.type === 'text')
          .map((b: { text?: string }) => b.text ?? '')
          .join('') ?? ''
      );
    },
  };
}

/** Groq and OpenAI share the chat-completions shape. */
function openaiCompatible(
  name: 'groq' | 'openai',
  model: string,
  url: string,
  keyName: string,
  apiKey?: string,
): CompletionProvider {
  return {
    name,
    model,
    async complete({ system, prompt, json, temperature = 0.2 }) {
      const key = apiKey || env(keyName);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          temperature,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt },
          ],
        }),
      });
      if (!res.ok) throw new Error(`${name} ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      return data?.choices?.[0]?.message?.content ?? '';
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

/**
 * Picks the provider the user selected in Settings, falling back to the
 * `AI_PROVIDER` / `AI_MODEL` secrets, and finally to Gemini 2.5 Flash.
 */
export function getProvider(apiKeys?: UserApiKeys): CompletionProvider {
  const userChoice = apiKeys?.provider?.toLowerCase();
  const envChoice = Deno.env.get('AI_PROVIDER')?.toLowerCase();
  const raw = userChoice || envChoice || 'gemini';
  const name: ProviderName = PROVIDER_NAMES.includes(raw as ProviderName) ? (raw as ProviderName) : 'gemini';
  const model = Deno.env.get('AI_MODEL') ?? DEFAULT_MODELS[name];

  switch (name) {
    case 'groq':
      return openaiCompatible('groq', model, 'https://api.groq.com/openai/v1/chat/completions', 'GROQ_API_KEY', apiKeys?.groq);
    case 'openai':
      return openaiCompatible('openai', model, 'https://api.openai.com/v1/chat/completions', 'OPENAI_API_KEY', apiKeys?.openai);
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
