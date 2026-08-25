// glossa-boletin — alta, confirmación y baja del boletín.
//
// Es PÚBLICA y sin token, porque la usa cualquiera desde la portada. Lo que la
// protege no es una llave, es lo poco que puede hacer: escribir una fila en
// estado `pendiente` y mandar UN correo a esa misma dirección. Sin confirmar,
// esa fila no recibe nada más nunca.
//
// Tres caminos:
//   POST {email, lang}      → alta pendiente + correo de confirmación
//   GET  ?confirmar=<token> → pasa a confirmado (página de gracias)
//   GET  ?baja=<token>      → pasa a baja (página de despedida)
//
// Los dos GET existen porque un enlace de correo es un GET: no se puede pedir
// un POST desde un cliente de correo.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GLOSSA_RESEND_KEY.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const SITIO = 'https://glossa.ademas.ai';
const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

// Deliberadamente flojo: valida la FORMA, no la existencia. Un regex severo
// rechaza direcciones válidas raras (`+`, puntos, dominios largos) y el único
// juez de verdad es si el correo de confirmación llega.
const ES_CORREO = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

const T = {
  en: {
    asunto: 'Confirm your Glossa subscription',
    saludo: 'You asked for Glossa in your inbox.',
    cuerpo: 'One email a week, on Sundays: the weekly issue and any pieces written that week. Nothing else, and no ads.',
    boton: 'Confirm subscription',
    pie: 'If this was not you, ignore this email and nothing happens.',
  },
  es: {
    asunto: 'Confirma tu suscripción a Glossa',
    saludo: 'Pediste recibir Glossa en tu correo.',
    cuerpo: 'Un correo por semana, los domingos: el número semanal y las piezas escritas esos días. Nada más, y sin anuncios.',
    boton: 'Confirmar suscripción',
    pie: 'Si no fuiste tú, ignora este correo y no pasa nada.',
  },
};

/**
 * A la página del sitio, con un 302.
 *
 * Una edge function NO puede servir una página: Supabase le impone
 * `content-type: text/plain` y `content-security-policy: sandbox`, así que el
 * HTML llegaba al navegador como texto y se veía el código. La función hace lo
 * suyo —tocar la fila— y el aviso lo da el sitio, que para eso existe.
 */
function aviso(lang: 'en' | 'es', s: 'ok' | 'baja' | 'mal') {
  const ruta = lang === 'es' ? '/es/boletin/' : '/newsletter/';
  return Response.redirect(`${SITIO}${ruta}?s=${s}`, 302);
}

async function enviarConfirmacion(email: string, lang: 'en' | 'es', token: string) {
  const clave = Deno.env.get('GLOSSA_RESEND_KEY');
  if (!clave) throw new Error('falta GLOSSA_RESEND_KEY');
  const t = T[lang];
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/glossa-boletin?confirmar=${token}&lang=${lang}`;
  const html = `<div style="background:#F5EFE6;padding:32px 20px;font-family:Georgia,serif;color:#1A1A1A">
<div style="max-width:32rem;margin:0 auto">
  <div style="font-size:22px;letter-spacing:-0.01em;margin-bottom:22px">Glossa<span style="color:#7A1F1F">.</span></div>
  <p style="font-size:16px;line-height:1.6;margin:0 0 10px">${t.saludo}</p>
  <p style="font-size:15px;line-height:1.6;color:#454545;margin:0 0 24px">${t.cuerpo}</p>
  <a href="${url}" style="display:inline-block;background:#7A1F1F;color:#F5EFE6;text-decoration:none;
     padding:11px 18px;font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:0.04em">${t.boton}</a>
  <p style="font-size:12px;line-height:1.5;color:#6E6E6E;margin:26px 0 0">${t.pie}</p>
</div></div>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clave}` },
    body: JSON.stringify({
      from: 'Glossa <glossa@ademas.ai>', to: [email], subject: t.asunto, html,
    }),
  });
  if (!r.ok) throw new Error(`resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  const sb = db();

  // ── Confirmar / dar de baja: llegan como GET desde el correo ────────────
  const confirmar = url.searchParams.get('confirmar');
  const baja = url.searchParams.get('baja');
  const langUrl = (url.searchParams.get('lang') === 'es' ? 'es' : 'en') as 'en' | 'es';

  if (confirmar || baja) {
    const token = (confirmar ?? baja)!;
    if (!/^[0-9a-f-]{36}$/i.test(token)) return aviso(langUrl, 'mal');
    const { data: fila } = await sb.from('glossa_subscribers')
      .select('id,lang,state').eq('token', token).maybeSingle();
    if (!fila) return aviso(langUrl, 'mal');
    const lang = (fila.lang === 'es' ? 'es' : 'en') as 'en' | 'es';

    if (confirmar) {
      // Confirmar una baja NO la revive: quien se dio de baja tendría que
      // volver a suscribirse, que es una decisión suya y no de un enlace viejo.
      if (fila.state === 'baja') return aviso(lang, 'baja');
      await sb.from('glossa_subscribers')
        .update({ state: 'confirmado', confirmed_at: new Date().toISOString() })
        .eq('id', fila.id);
      return aviso(lang, 'ok');
    }
    await sb.from('glossa_subscribers')
      .update({ state: 'baja', unsubscribed_at: new Date().toISOString() })
      .eq('id', fila.id);
    return aviso(lang, 'baja');
  }

  // ── Alta ────────────────────────────────────────────────────────────────
  if (req.method !== 'POST') return new Response('POST only', { status: 405, headers: CORS });
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* cuerpo vacío */ }

  const email = String(b.email ?? '').trim().toLowerCase();
  const lang = (b.lang === 'es' ? 'es' : 'en') as 'en' | 'es';
  const ok = (m: string) => new Response(JSON.stringify({ ok: true, mensaje: m }),
    { headers: { ...CORS, 'Content-Type': 'application/json' } });

  if (!ES_CORREO.test(email) || email.length > 200) {
    return new Response(JSON.stringify({ error: 'That does not look like an email address.' }),
      { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  const { data: ya } = await sb.from('glossa_subscribers')
    .select('id,state,token,lang').eq('email', email).maybeSingle();

  // La respuesta es la MISMA exista o no la dirección. Decir «ya estás suscrito»
  // convertiría esta caja en un comprobador de quién lee Glossa.
  const gracias = lang === 'es'
    ? 'Revisa tu correo: te mandamos un enlace para confirmar.'
    : 'Check your inbox: we sent you a link to confirm.';

  try {
    if (!ya) {
      const { data: nueva, error } = await sb.from('glossa_subscribers')
        .insert({ email, lang, origen: `portada ${lang}` }).select('token').single();
      if (error) throw error;
      await enviarConfirmacion(email, lang, nueva!.token);
    } else if (ya.state === 'confirmado') {
      // Ya estaba dentro: no se manda nada y se contesta igual que al resto.
      return ok(gracias);
    } else {
      // Pendiente o dado de baja que vuelve: se reenvía el mismo enlace y se
      // respeta el idioma con el que se apuntó esta vez.
      await sb.from('glossa_subscribers').update({ lang, state: 'pendiente' }).eq('id', ya.id);
      await enviarConfirmacion(email, lang, ya.token);
    }
    return ok(gracias);
  } catch (e) {
    console.error(String(e));
    return new Response(JSON.stringify({ error: 'Could not send the confirmation email. Try again in a minute.' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
  }
});
