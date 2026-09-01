// check_reglas_es.mjs — la regla vive en los tres generadores o no vive.
//
// Los dos prompts interpolan `bloqueReglas()` de src/lib/espanol.js, así que
// ellos no pueden divergir. El tercer generador es humano —la skill— y su
// texto no se genera desde código a propósito (la prosa la escribe quien toca
// las reglas). Esto es lo que impide que se olvide: comprueba que cada calco
// de REGLAS_ES aparece en el bloque delimitado de spanish-translation.md, y
// que SKILL.md no resucita el registro derogado. Corre en CI y en `npm run
// prebuild`, sin red. Falla = alguien tocó las reglas en un sitio y no en el otro.

import { readFile } from 'node:fs/promises';
import { REGLAS_ES } from '../src/lib/espanol.js';

const fallos = [];

const ref = await readFile('skills/references/spanish-translation.md', 'utf8');
const bloque = ref.match(/<!-- REGLAS_ES:inicio[\s\S]*?REGLAS_ES:fin -->/);
if (!bloque) {
  fallos.push('spanish-translation.md perdió el bloque <!-- REGLAS_ES:inicio/fin -->');
} else {
  for (const c of REGLAS_ES.calcos) {
    const mal = c.mal.split(' (')[0].split('/')[0].trim();
    if (!bloque[0].includes(mal)) {
      fallos.push(`el calco «${mal}» (${c.en}) está en espanol.js y falta en el bloque REGLAS_ES de la skill`);
    }
  }
  for (const l of REGLAS_ES.lexicoMX) {
    const mal = l.mal.split(' (')[0].split('/')[0];
    if (!bloque[0].includes(mal)) {
      fallos.push(`el léxico «${mal}» está en espanol.js y falta en el bloque REGLAS_ES de la skill`);
    }
  }
}

const skill = await readFile('skills/SKILL.md', 'utf8');
if (/\*\*Iberian register\*\*, not/.test(skill)) {
  fallos.push('SKILL.md vuelve a decir «Iberian register» — D-020 manda es-MX');
}
if (!/REGLAS_ES/.test(skill)) {
  fallos.push('SKILL.md ya no apunta al bloque REGLAS_ES de spanish-translation.md');
}

if (fallos.length) {
  console.error('Las reglas del español divergieron entre sus tres sitios:');
  for (const f of fallos) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`Reglas del español en sincronía (${REGLAS_ES.calcos.length} calcos, ${REGLAS_ES.lexicoMX.length} de léxico).`);
