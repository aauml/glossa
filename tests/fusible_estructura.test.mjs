// El techo de piezas del fusible tiene que ser el mismo que pide el prompt.
// Cuando no lo era (7 contra 8), tres números seguidos quedaron retenidos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { revisar, MAX_PIEZAS } from '../src/lib/fusible.js';

const pieza = (n) => ({ id: `p${n}`, department: 'Geopolitics & war', subject: `Asunto ${n}`,
  title: `Pieza ${n}`, dek: 'x', body: ['Texto llano.'], sources: [] });
const numero = (n) => ({ headline: 'H', standfirst: 'S', closing: ['a', 'b', 'c'],
  pieces: Array.from({ length: n }, (_, i) => pieza(i + 1)) });
const estructura = (r) => r.fallos.filter(f => f.regla === 'estructura' && /piezas/.test(f.detalle));

test('ocho piezas caben', () => {
  assert.equal(MAX_PIEZAS, 8);
  assert.deepEqual(estructura(revisar(numero(8), { items: [], cotejos: [] })), []);
});

test('nueve piezas disparan', () => {
  const f = estructura(revisar(numero(9), { items: [], cotejos: [] }));
  assert.equal(f.length, 1);
  assert.equal(f[0].grave, true);
});
