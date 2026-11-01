import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactRefs, estimateCost, restoreIds, validateGlossa } from '../scripts/channel_weekly.mjs';
import { precioChat } from '../src/lib/presupuesto.js';

const valid = () => ({ title: 'La semana de este canal',
  lead: 'Esta semana el canal volvió sobre el mismo asunto desde varios ángulos y dejó una pregunta abierta para la siguiente entrega.',
  sections: [{ heading: 'Lo que cambió', text: 'Un video examinó los datos nuevos y otro discutió sus consecuencias. La glosa distingue ambas posiciones y deja claro qué sigue sin comprobarse.', item_ids: ['video-1', 'video-2'] }],
  closing: 'La semana deja dos posiciones distintas, con preguntas todavía abiertas.' });

test('una referencia a otro canal impide la publicación', () => {
  const b = valid(); b.sections[0].item_ids = ['video-1', 'otro-canal'];
  assert.throws(() => validateGlossa(b, new Set(['video-1', 'video-2'])), /referencia ajena/);
});

test('identificadores cortos se restauran sin omitir videos', () => {
  const items = [{ id: 'video-1' }, { id: 'video-2' }];
  const { material, idMap } = compactRefs(items);
  assert.deepEqual(material.map(x => x.id), ['v1', 'v2']);
  const b = valid(); b.sections[0].item_ids = ['v1', 'v2'];
  assert.deepEqual(restoreIds(b, idMap).sections[0].item_ids, ['video-1', 'video-2']);
  b.sections[0].item_ids = ['v1'];
  assert.throws(() => restoreIds(b, idMap), /faltan videos/);
});

test('un texto truncado o con cita directa no pasa a publicado', () => {
  const b = valid(); b.sections[0].text = 'Breve';
  assert.throws(() => validateGlossa(b, new Set(['video-1', 'video-2'])), /sección inválida/);
  b.sections[0].text = valid().sections[0].text + ' «esta es una cita literal suficientemente larga»';
  assert.throws(() => validateGlossa(b, new Set(['video-1', 'video-2'])), /citas directas/);
  b.sections[0].text = valid().sections[0].text + ' "esta es una cita textual sin verificar"';
  assert.throws(() => validateGlossa(b, new Set(['video-1', 'video-2'])), /citas directas/);
  b.sections[0].text = valid().sections[0].text + ' La «nueva economía» es el término del material.';
  assert.doesNotThrow(() => validateGlossa(b, new Set(['video-1', 'video-2'])));
  b.sections[0].text = valid().sections[0].text + ' "Lula Wins" es el título. La "nueva economía" es otro término.';
  assert.doesNotThrow(() => validateGlossa(b, new Set(['video-1', 'video-2'])));
});

test('la estimación crece con el material y usa el modelo elegido', () => {
  assert.ok(estimateCost(80000) > estimateCost(10000));
  assert.ok(estimateCost(80000, 'kimi-k3') > estimateCost(80000, 'gpt-6-luna'));
  assert.equal(precioChat('gpt-6-luna', { input_tokens: 10000, output_tokens: 4000,
    input_tokens_details: { cached_tokens: 2000 } }), 0.00282);
});
