import type { APIRoute } from 'astro';
import { firmarSesion, COOKIE_NAME, COOKIE_MAX_AGE } from '../../../middleware';

export const prerender = false;
const env = (k: string) => import.meta.env[k] || process.env[k];
const CORREO = 'artcx@protonmail.com';

/** Verifica el código con Supabase y, si vale, emite la sesión propia. */
export const POST: APIRoute = async ({ request, cookies }) => {
  const url = env('SUPABASE_URL'), anon = env('SUPABASE_ANON_KEY');
  const secreto = env('GLOSSA_ADMIN_SECRET');
  if (!url || !anon || !secreto) return new Response(JSON.stringify({ error: 'no configurado' }), { status: 503 });

  const { code } = await request.json().catch(() => ({ code: '' }));
  if (!/^\d{6}$/.test(String(code || ''))) {
    return new Response(JSON.stringify({ error: 'el código son seis dígitos' }), { status: 400 });
  }

  const r = await fetch(`${url}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'email', email: CORREO, token: String(code) }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    return new Response(JSON.stringify({ error: 'código incorrecto o caducado' }), { status: 401 });
  }
  // Cinturón y tirantes: aunque el correo se fija en el servidor, se comprueba
  // que la identidad que devuelve Supabase sea la esperada.
  if (d?.user?.email !== CORREO) {
    return new Response(JSON.stringify({ error: 'identidad inesperada' }), { status: 403 });
  }

  cookies.set(COOKIE_NAME, await firmarSesion(secreto), {
    path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: COOKIE_MAX_AGE,
  });
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
