import { defineMiddleware } from 'astro:middleware';

/**
 * Guardia del panel.
 *
 * El sitio público es estático: este middleware corre en build para esas páginas
 * y no las toca. Solo intercepta `/admin` y `/api/admin`, las únicas rutas con
 * `prerender = false`.
 *
 * Cómo se entra: Supabase manda un código de seis dígitos al correo y lo
 * verifica. Hecho eso, la sesión es una cookie HttpOnly firmada con HMAC —
 * propia, no la de Supabase. Así no hay que gestionar refrescos de token ni
 * guardar el JWT de Supabase en el navegador; Supabase solo hace de verificador
 * de identidad, que es para lo que hace falta.
 */

const COOKIE = 'glossa_admin';
const DURACION_H = 12;

const bytes = (s: string) => new TextEncoder().encode(s);
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
const clave = (secreto: string) =>
  crypto.subtle.importKey('raw', bytes(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

/** La cookie es `caducidad.firma`. No lleva datos: solo dice hasta cuándo vale. */
export async function firmarSesion(secreto: string) {
  const exp = Date.now() + DURACION_H * 3600_000;
  return `${exp}.${hex(await crypto.subtle.sign('HMAC', await clave(secreto), bytes(String(exp))))}`;
}

export async function sesionValida(valor: string | undefined, secreto: string) {
  if (!valor) return false;
  const [exp, firma] = valor.split('.');
  if (!exp || !firma || Number(exp) < Date.now()) return false;
  const esperada = hex(await crypto.subtle.sign('HMAC', await clave(secreto), bytes(exp)));
  // Comparación en tiempo constante: la firma es un secreto derivado.
  if (firma.length !== esperada.length) return false;
  let diff = 0;
  for (let i = 0; i < firma.length; i++) diff |= firma.charCodeAt(i) ^ esperada.charCodeAt(i);
  return diff === 0;
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  const ruta = ctx.url.pathname;
  const esPanel = ruta.startsWith('/admin') && !ruta.startsWith('/admin/login');
  const esApi = ruta.startsWith('/api/admin') &&
    !/^\/api\/admin\/(otp|verify)\/?$/.test(ruta);
  if (!esPanel && !esApi) return next();

  const secreto = import.meta.env.GLOSSA_ADMIN_SECRET || process.env.GLOSSA_ADMIN_SECRET;
  // Falla cerrado: sin secreto configurado no se entra, en vez de quedar abierto.
  if (!secreto) return new Response('panel no configurado', { status: 503 });

  if (await sesionValida(ctx.cookies.get(COOKIE)?.value, secreto)) return next();
  if (esApi) return new Response(JSON.stringify({ error: 'sin sesión' }), { status: 401 });
  return ctx.redirect('/admin/login/');
});

export const COOKIE_NAME = COOKIE;
export const COOKIE_MAX_AGE = DURACION_H * 3600;
