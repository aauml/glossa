/**
 * Único punto por el que el panel habla con la base.
 *
 * El token vive solo aquí, del lado del servidor: el navegador nunca lo ve. Y al
 * otro lado está `glossa-admin`, que expone un puñado de operaciones concretas,
 * no la base entera.
 *
 * Delante de todo esto está Cloudflare Access: una petición sin sesión válida no
 * llega siquiera a ejecutar esta función. Aun así se comprueba la cabecera que
 * Access inyecta, para que la función no quede abierta si algún día alguien
 * desprotege la aplicación por error.
 */
export async function onRequestPost({ request, env }) {
  const json = (d, s = 200) =>
    new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });

  // Access firma un JWT en esta cabecera. Si no está, la app no está protegida.
  if (!request.headers.get('cf-access-jwt-assertion')) {
    return json({ error: 'sin sesión de Access' }, 401);
  }
  if (!env.SUPABASE_URL || !env.GLOSSA_PUBLISH_TOKEN) {
    return json({ error: 'panel no configurado' }, 503);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'cuerpo inválido' }, 400); }
  if (!body || !body.op) return json({ error: 'falta op' }, 400);

  const r = await fetch(`${env.SUPABASE_URL}/functions/v1/glossa-admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-glossa-token': env.GLOSSA_PUBLISH_TOKEN },
    body: JSON.stringify(body),
  });
  return new Response(await r.text(), {
    status: r.status, headers: { 'Content-Type': 'application/json' },
  });
}
