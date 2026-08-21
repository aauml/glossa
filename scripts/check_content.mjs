// Comprobaciones que el esquema de Astro no puede hacer, porque miran la
// colección entera y no una pieza suelta. Corre antes de cada build (prebuild),
// también dentro del worker de publicación: así una pieza encolada desde el chat
// con un número repetido falla ANTES de commitearse, no después.
//
// Motivo: en agosto de 2026 seis números N° estaban duplicados —N° 26 en cuatro
// piezas distintas— porque nada lo impedía. El número es el identificador de la
// colección; si se repite, deja de identificar.

import { readdir, readFile } from 'node:fs/promises';

const DIR = 'src/content/articles';
const errores = [];

const dirs = (await readdir(DIR, { withFileTypes: true })).filter(d => d.isDirectory());

const numeros = new Map();   // número -> [slugs]
const fechas = new Map();    // sortDate -> [slugs]

for (const d of dirs) {
  const porSlug = {};
  for (const lang of ['en', 'es']) {
    let texto;
    try { texto = await readFile(`${DIR}/${d.name}/${lang}.mdx`, 'utf8'); } catch { continue; }
    const campo = (k) => texto.match(new RegExp(`^${k}:\\s*"?(.*?)"?\\s*$`, 'm'))?.[1];
    porSlug[lang] = { issue: campo('issue'), sortDate: campo('sortDate') };
  }
  if (!porSlug.en && !porSlug.es) continue;

  // EN y ES son la misma pieza: mismo número y misma fecha de orden.
  if (porSlug.en && porSlug.es) {
    const nEn = porSlug.en.issue?.replace(/^N\.?[°º]\s*/, '');
    const nEs = porSlug.es.issue?.replace(/^N\.?[°º]\s*/, '');
    if (nEn !== nEs) errores.push(`${d.name}: el número no coincide entre idiomas (EN ${nEn} / ES ${nEs})`);
    if (porSlug.en.sortDate !== porSlug.es.sortDate) {
      errores.push(`${d.name}: sortDate no coincide entre idiomas (${porSlug.en.sortDate} / ${porSlug.es.sortDate})`);
    }
  }

  const base = porSlug.en ?? porSlug.es;
  const num = base.issue?.replace(/^N\.?[°º]\s*/, '');
  if (num) numeros.set(num, [...(numeros.get(num) ?? []), d.name]);
  if (base.sortDate) fechas.set(base.sortDate, [...(fechas.get(base.sortDate) ?? []), d.name]);
}

for (const [num, slugs] of numeros) {
  if (slugs.length > 1) {
    errores.push(`N° ${num} lo usan ${slugs.length} piezas: ${slugs.join(', ')} — desambigua con sufijo de letra (N° ${num}b)`);
  }
}
// Empatar sortDate no rompe nada, pero deja el orden de la portada al azar.
for (const [f, slugs] of fechas) {
  if (slugs.length > 1) console.warn(`  aviso: mismo sortDate (${f}) en ${slugs.join(', ')} — usa la hora para fijar el orden`);
}

if (errores.length) {
  console.error(`\n✗ ${errores.length} problema(s) de integridad en la colección:\n`);
  for (const e of errores) console.error(`  - ${e}`);
  console.error('');
  process.exit(1);
}
console.log(`✓ colección coherente: ${dirs.length} piezas, números únicos`);
