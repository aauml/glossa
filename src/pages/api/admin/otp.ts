import type { APIRoute } from 'astro';

export const prerender = false;
const env = (k: string) => import.meta.env[k] || process.env[k];

/**
 * Pide a Supabase que mande el código al correo.
 *
 * El correo está fijado en el servidor: no se acepta el que venga del navegador.
 * Aunque el registro está cerrado en Supabase, dejar que el cliente elija a quién
 * se le manda un código sería un generador de correo gratuito para cualquiera.
 */
const CORREO = 'artcx@protonmail.com';

export const POST: APIRoute = async () => {
  const url = env('SUPABASE_URL'), anon = env('SUPABASE_ANON_KEY');
  if (!url || !anon) return new Response(JSON.stringify({ error: 'no configurado' }), { status: 503 });

  const r = await fetch(`${url}/auth/v1/otp`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    // `should_create_user: false` — el usuario ya existe y el registro está
    // cerrado; esto lo hace explícito también desde aquí.
    body: JSON.stringify({ email: CORREO, create_user: false }),
  });
  if (!r.ok) {
    const t = await r.text();
    // El correo integrado de Supabase admite 2 envíos/hora. Merece un mensaje
    // propio: si no, parece que el panel está roto.
    const limite = r.status === 429 || /rate/i.test(t);
    return new Response(JSON.stringify({
      error: limite
        ? 'Supabase solo permite 2 códigos por hora. Espera un rato o usa el último que te llegó.'
        : `no se pudo enviar: ${t.slice(0, 140)}`,
    }), { status: 400 });
  }
  return new Response(JSON.stringify({ ok: true, email: CORREO }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
