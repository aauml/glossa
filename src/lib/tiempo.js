// «hace 3 horas» en vez de «2026-08-22».
//
// La fecha obliga a restar mentalmente para responder a la única pregunta que
// se le hace a esa columna: ¿esto sigue vivo? El tiempo relativo la contesta de
// un vistazo. Pasados treinta días vuelve la fecha, porque «hace 47 días» ya no
// dice nada que la fecha no diga mejor.

const MINUTO = 60_000, HORA = 60 * MINUTO, DIA = 24 * HORA;

export function hace(iso) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const d = Date.now() - t;

  if (d < 0) return 'just now';          // relojes desalineados; no digas «en -2 min»
  if (d < MINUTO) return 'just now';
  if (d < HORA) return `${Math.floor(d / MINUTO)} min ago`;
  if (d < 2 * DIA) {
    const h = Math.floor(d / HORA);
    return `${h} ${h === 1 ? 'hr' : 'hrs'} ago`;
  }
  if (d < 30 * DIA) return `${Math.floor(d / DIA)} days ago`;
  return new Date(iso).toISOString().slice(0, 10);
}
