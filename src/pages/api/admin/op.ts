import type { APIRoute } from 'astro';

export const prerender = false;

/**
 * Único punto por el que el panel habla con la base.
 *
 * El token vive solo aquí, en el servidor: el navegador nunca lo ve. Y al otro
 * lado está `glossa-admin`, que expone un puñado de operaciones concretas, no la
 * base entera. Si esta ruta tuviera un fallo, lo expuesto son esas operaciones,
 * no la service key.
 */
export const POST: APIRoute = async ({ request }) => {
  const url = import.meta.env.SUPABASE_URL || process.env.SUPABASE_URL;
  const token = import.meta.env.GLOSSA_PUBLISH_TOKEN || process.env.GLOSSA_PUBLISH_TOKEN;
  if (!url || !token) return new Response(JSON.stringify({ error: 'no configurado' }), { status: 503 });

  const body = await request.json().catch(() => null);
  if (!body?.op) return new Response(JSON.stringify({ error: 'falta op' }), { status: 400 });

  const r = await fetch(`${url}/functions/v1/glossa-admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-glossa-token': token },
    body: JSON.stringify(body),
  });
  return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json' } });
};
