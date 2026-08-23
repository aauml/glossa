// Lo que comparten las tres etapas que salen a Internet: cotejo, monitores y
// reportaje. Son piezas mecánicas —normalizar un dominio, decidir si dos textos
// cuentan la misma historia, reconocer una página que habla de QUIÉN es alguien
// en vez de qué pasó—, y todas se ganaron el sitio en una corrida real.
//
// De momento solo lo importa `reportaje_from_supabase.mjs`. Cotejo y monitores
// siguen con sus copias hasta que la etapa nueva deje de moverse: repuntar dos
// guiones que funcionan mientras se construye un tercero es cambiar tres cosas
// a la vez y no saber cuál falló.

import { createHash } from 'node:crypto';

export const huella = (s) => createHash('sha256').update(String(s)).digest('hex').slice(0, 24);

export const dominio = (u) => {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
};

// La huella normaliza la URL: el mismo documento con distintos parámetros de
// campaña no debe contarse dos veces.
export const huellaUrl = (u) => {
  try { const x = new URL(u); return huella(x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/$/, '')); }
  catch { return huella(u); }
};

const PALABRAS_VACIAS = new Set(['the','and','that','with','from','this','have','has','for','are',
  'was','were','not','but','his','her','its','their','which','while','they','than','into','over']);

export const fichas = (t) => new Set(String(t).toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
  .split(/\s+/).filter(w => w.length > 3 && !PALABRAS_VACIAS.has(w)));

export const jaccard = (a, b) => {
  const inter = [...a].filter(x => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union ? inter / union : 0;
};

// Un año, una cifra, un porcentaje, una cantidad: sin un ancla concreta no hay
// búsqueda posible, solo una frase de opinión.
export const TIENE_ANCLA = /\b(19|20)\d{2}\b|\d[\d.,]*\s*(%|percent|billion|million|trillion|kg|barrels?|\$)|\$\s?\d/i;

/**
 * La huella temática de un texto: su cifra y sus dos sustantivos más largos.
 *
 * Agrupar por parecido de palabras no bastó. En la primera corrida del cotejo,
 * OCHO de las veinte comprobaciones fueron la misma afirmación —la deuda de 40
 * billones— dicha por ocho personas con palabras distintas: «has reached», «is
 * heading to», «currently facing», «has exceeded». El parecido entre esas frases
 * queda por debajo de cualquier umbral razonable, pero la cifra es idéntica.
 */
export function ancla(texto) {
  const t = String(texto).toLowerCase();
  const num = (t.match(/\d[\d.,]*\s*(%|percent|billion|million|trillion|kg|barrels?)?/) || [''])[0]
    .replace(/[.,]/g, '').replace(/\s+/g, '');
  const palabras = [...fichas(t)].sort((a, b) => b.length - a.length).slice(0, 2).sort();
  return `${num}|${palabras.join(',')}`;
}

// Dominios que no sostienen nada. Un contador de deuda con widget, una red
// social o un agregador pueden repetir una cifra, pero llamar a eso «contradice»
// —como pasó cinco veces en la primera corrida con us-debt-clock.com— convierte
// el veredicto más valioso en ruido.
export const CHATARRA = ['facebook.com','instagram.com','twitter.com','x.com','tiktok.com','reddit.com',
  'us-debt-clock.com','usdebtclock.org','pinterest.com','quora.com','medium.com','substack.com'];

// Páginas que hablan de QUIÉN es alguien, no de qué dijo. Buscar «John
// Mearsheimer» sin esto devolvió su bibliografía de Wikipedia (120.000
// caracteres), su ficha de Britannica, su perfil de Goodreads y su página de
// facultad. Todas llevan su apellido, así que la compuerta de palabras clave las
// dejaba pasar: el filtro estaba bien, la consulta estaba mal.
export const REFERENCIA = [
  'wikipedia.org', 'britannica.com', 'goodreads.com', 'imdb.com', 'linkedin.com',
  'amazon.com', 'researchgate.net', 'academia.edu', 'scholar.google.com',
];

// Donde viven los propios episodios. Sin esta lista, «salir a buscar» devuelve
// la transcripción del programa que motivó la búsqueda. Y no basta con las
// plataformas: `singjupost.com` es un sitio de transcripciones, y dos de los
// cuatro primeros hallazgos de búsqueda del proyecto fueron transcripciones de
// las mismas entrevistas que ya publican los canales seguidos.
export const PLATAFORMAS = [
  'youtube.com', 'youtu.be', 'rumble.com', 'odysee.com', 'bitchute.com',
  'podcasts.apple.com', 'open.spotify.com', 'megaphone.fm', 'libsyn.com',
  'buzzsprout.com', 'soundcloud.com', 'singjupost.com', 'happyscribe.com',
  'rev.com', 'otter.ai', 'transcripts.cnn.com',
];

const enLista = (lista, url) => {
  const h = typeof url === 'string' && url.includes('/') ? dominio(url) : String(url ?? '');
  return !!h && lista.some(d => h === d || h.endsWith('.' + d));
};

export const esChatarra   = (u) => enLista(CHATARRA, u);
export const esReferencia = (u) => enLista(REFERENCIA, u);
export const esPlataforma = (u) => enLista(PLATAFORMAS, u);

// Créditos de agencia. Varios medios llevando un mismo despacho es UNA fuente,
// no seis, y esto es lo que permite contarlo así.
const AGENCIAS = [
  [/\breuters\b/i, 'reuters'], [/\bassociated press\b|\(ap\)|\bap\b —/i, 'ap'],
  [/agence france-presse|\bafp\b/i, 'afp'], [/\befe\b/i, 'efe'],
  [/\bbloomberg\b/i, 'bloomberg'], [/\bdpa\b/i, 'dpa'],
];

/** Qué agencia firma el arranque de un texto, si es que firma alguna. */
export function agencia(texto) {
  const cabeza = String(texto ?? '').slice(0, 400);
  for (const [re, nombre] of AGENCIAS) if (re.test(cabeza)) return nombre;
  return null;
}
