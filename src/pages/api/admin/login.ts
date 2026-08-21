import type { APIRoute } from 'astro';
import { firmarSesion, COOKIE_NAME, COOKIE_MAX_AGE } from '../../../middleware';

export const prerender = false;
const env = (k: string) => import.meta.env[k] || process.env[k];

/** Comparación en tiempo constante: la contraseña es un secreto. */
function igual(a: string, b: string) {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  const n = Math.max(ea.length, eb.length);
  for (let i = 0; i < n; i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const pass = String(form.get('password') || '');

  const esperada = env('GLOSSA_ADMIN_PASSWORD');
  const secreto = env('GLOSSA_ADMIN_SECRET');
  // Falla cerrado: sin secretos configurados no se entra.
  if (!esperada || !secreto) return new Response('panel no configurado', { status: 503 });

  if (!igual(pass, esperada)) {
    // No es un limitador real —cada invocación es un proceso nuevo— pero encarece
    // el intento. La defensa de verdad es que la contraseña son 40 caracteres
    // aleatorios: probarlas todas no es un problema de velocidad.
    await new Promise(r => setTimeout(r, 1200));
    return redirect('/admin/login/?e=1', 303);
  }

  cookies.set(COOKIE_NAME, await firmarSesion(secreto), {
    path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: COOKIE_MAX_AGE,
  });
  return redirect('/admin/', 303);
};
