// Autenticación compartida de las colas de Glossa.
//
// Las funciones `glossa-*-enqueue` se despliegan con `verify_jwt=false` porque el
// cliente es el chat (móvil), que no lleva un JWT de Supabase. Eso las dejaba
// abiertas a internet: un POST cualquiera encolaba un MDX que un GitHub Action
// commiteaba a `main` y Vercel desplegaba. La compuerta es ahora un token propio
// en la cabecera `x-glossa-token`, guardado en 1Password (bóveda `ademas.ai`) y
// cargado como secreto de la edge function.
//
// Falla cerrado: si el secreto no está configurado, la función rechaza todo.

/** Comparación en tiempo constante — no filtra el prefijo correcto por timing. */
function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  // Longitudes distintas: seguimos comparando sobre el máximo para no convertir
  // la longitud en un canal lateral, y arrastramos el fallo en el mismo acumulador.
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export type AuthResult = { ok: true } | { ok: false; response: Response };

/**
 * El token puede llegar por cabecera `x-glossa-token` (preferido) o como campo
 * `token` del cuerpo JSON.
 *
 * Se aceptan los dos porque no todas las superficies pueden fijar una cabecera:
 * el conector del chat en móvil puede no exponer ese control, y quedarse solo
 * con la cabecera dejaría la publicación desde el móvil dependiendo de un
 * detalle del cliente. El cuerpo viaja igualmente por TLS; la diferencia real es
 * que los cuerpos acaban en más registros, así que prefiere la cabecera si tu
 * cliente la permite.
 */
export function requireToken(req: Request, cors: Record<string, string>, bodyToken?: unknown): AuthResult {
  const expected = Deno.env.get('GLOSSA_PUBLISH_TOKEN') ?? '';
  if (!expected) {
    console.error('GLOSSA_PUBLISH_TOKEN no configurado — rechazando');
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: 'not configured' }), { status: 503, headers: cors }),
    };
  }
  const got = req.headers.get('x-glossa-token') ?? (typeof bodyToken === 'string' ? bodyToken : '');
  if (!got || !timingSafeEqual(got, expected)) {
    return {
      ok: false,
      response: new Response(JSON.stringify({
        error: 'unauthorized',
        hint: 'manda el token en la cabecera x-glossa-token o en el campo "token" del cuerpo',
      }), { status: 401, headers: cors }),
    };
  }
  return { ok: true };
}

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-glossa-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

/** El slug es un nombre de carpeta bajo src/content/articles/ — nada de rutas. */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,79}$/;
/** `N° 33`, `N° 33b`. El worker lo mete en un mensaje de commit. */
export const ISSUE_NO_RE = /^N° \d{1,3}[a-z]?$/;
