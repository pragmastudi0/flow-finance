/**
 * CORS for the browser-facing functions.
 *
 * The header allow-list is the part that actually matters. supabase-js does
 * not send a bare `Authorization` + `Content-Type` pair: every request also
 * carries `apikey`, and `x-client-info` / `x-retry-count` / `x-region` ride
 * along depending on the call. A preflight that omits any header the browser
 * announced in `Access-Control-Request-Headers` is rejected by the browser —
 * the OPTIONS still returns 200, the POST is simply never sent, and the SDK
 * surfaces it as a generic network error with nothing in the function logs.
 *
 * That is exactly how this broke: the logs showed OPTIONS 200 and no POST.
 * The list below mirrors `@supabase/supabase-js/cors`, plus `x-region`, which
 * `functions.invoke` adds when a region is pinned.
 */

const ALLOWED_HEADERS = [
  'authorization',
  'x-client-info',
  'apikey',
  'content-type',
  'x-retry-count',
  'x-region',
].join(', ');

const ALLOWED_METHODS = 'POST, OPTIONS';

/**
 * `ALLOWED_ORIGIN` accepts a comma-separated list. The matching origin is
 * echoed back (a list is not valid in `Access-Control-Allow-Origin`), and
 * `Vary: Origin` keeps caches from serving one origin's response to another.
 * Unset means `*`, which is what a public PWA wants.
 */
function allowedOrigin(requestOrigin: string | null): { origin: string; vary: boolean } {
  const configured = Deno.env.get('ALLOWED_ORIGIN')?.trim();
  if (!configured || configured === '*') return { origin: '*', vary: false };

  const list = configured.split(',').map((o) => o.trim()).filter(Boolean);
  if (requestOrigin && list.includes(requestOrigin)) return { origin: requestOrigin, vary: true };
  // No match: answer with the first configured origin so the browser blocks
  // the call rather than the function silently accepting an unknown site.
  return { origin: list[0] ?? '*', vary: true };
}

export function corsHeaders(req: Request): Record<string, string> {
  const { origin, vary } = allowedOrigin(req.headers.get('Origin'));
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    // Skip the preflight round-trip on repeat calls within the window.
    'Access-Control-Max-Age': '86400',
    ...(vary ? { Vary: 'Origin' } : {}),
  };
}

/** The standard preflight answer. `204` carries no body by definition. */
export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

/** JSON response helper that never forgets the CORS headers. */
export function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}
