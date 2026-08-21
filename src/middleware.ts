import { defineMiddleware } from 'astro:middleware';

/**
 * Guardia del panel.
 *
 * El sitio público es estático y sigue siéndolo: este middleware corre en build
 * para esas páginas y no las toca. Solo intercepta `/admin` y `/api/admin`, que
 * son las únicas rutas con `prerender = false`.
 *
 * La sesión es una cookie HttpOnly firmada con HMAC. Sin base de datos de
 * sesiones y sin dependencias: es un único usuario, y una cookie firmada que
 * caduca cubre el caso sin inventar infraestructura.
 */

const COOKIE = 'glossa_admin';
const DURACION_H = 12;

function bytes(s: string) { return new TextEncoder().encode(s); }

async function clave(secreto: string) {
  return crypto.subtle.importKey('raw', bytes(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

const hex = (b: ArrayBuffer) =>
  Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');

/** La cookie es `caducidad.firma`. No lleva datos: solo dice hasta cuándo vale. */
export async function firmarSesion(secreto: string) {
  const exp = Date.now() + DURACION_H * 3600_000;
  const f = await crypto.subtle.sign('HMAC', await clave(secreto), bytes(String(exp)));
  return `${exp}.${hex(f)}`;
}

export async function sesionValida(valor: string | undefined, secreto: string) {
  if (!valor) return false;
  const [exp, firma] = valor.split('.');
  if (!exp || !firma) return false;
  if (Number(exp) < Date.now()) return false;
  const esperada = hex(await crypto.subtle.sign('HMAC', await clave(secreto), bytes(exp)));
  // Comparación en tiempo constante: la firma es un secreto derivado.
  if (firma.length !== esperada.length) return false;
  let diff = 0;
  for (let i = 0; i < firma.length; i++) diff |= firma.charCodeAt(i) ^ esperada.charCodeAt(i);
  return diff === 0;
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  const ruta = ctx.url.pathname;
  const protegida = ruta.startsWith('/admin') && !ruta.startsWith('/admin/login');
  const apiProtegida = ruta.startsWith('/api/admin') && !ruta.startsWith('/api/admin/login');
  if (!protegida && !apiProtegida) return next();

  const secreto = import.meta.env.GLOSSA_ADMIN_SECRET || process.env.GLOSSA_ADMIN_SECRET;
  if (!secreto) {
    // Falla cerrado: sin secreto configurado no se entra, en vez de quedar abierto.
    return new Response('panel no configurado', { status: 503 });
  }

  if (await sesionValida(ctx.cookies.get(COOKIE)?.value, secreto)) return next();

  if (apiProtegida) return new Response(JSON.stringify({ error: 'sin sesión' }), { status: 401 });
  return ctx.redirect(`/admin/login/?next=${encodeURIComponent(ruta)}`);
});

export const COOKIE_NAME = COOKIE;
export const COOKIE_MAX_AGE = DURACION_H * 3600;
