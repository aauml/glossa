import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateCost, validateGlossa } from '../scripts/channel_weekly.mjs';

const valid = () => ({ title: 'La semana de este canal',
  lead: 'Esta semana el canal volvió sobre el mismo asunto desde varios ángulos y dejó una pregunta abierta para la siguiente entrega.',
  sections: [{ heading: 'Lo que cambió', text: 'Un video examinó los datos nuevos y otro discutió sus consecuencias. La glosa distingue ambas posiciones y deja claro qué sigue sin comprobarse.', item_ids: ['video-1', 'video-2'] }],
  closing: 'La semana deja dos posiciones distintas, con preguntas todavía abiertas.' });

test('una referencia a otro canal impide la publicación', () => {
  const b = valid(); b.sections[0].item_ids = ['video-1', 'otro-canal'];
  assert.throws(() => validateGlossa(b, new Set(['video-1', 'video-2'])), /referencia ajena/);
});

test('un texto truncado o con cita directa no pasa a publicado', () => {
  const b = valid(); b.sections[0].text = 'Breve';
  assert.throws(() => validateGlossa(b, new Set(['video-1', 'video-2'])), /sección inválida/);
  b.sections[0].text = valid().sections[0].text + ' «cita»';
  assert.throws(() => validateGlossa(b, new Set(['video-1', 'video-2'])), /citas directas/);
  b.sections[0].text = valid().sections[0].text + ' "cita textual sin verificar"';
  assert.throws(() => validateGlossa(b, new Set(['video-1', 'video-2'])), /citas directas/);
});

test('la estimación crece con el material y usa el modelo elegido', () => {
  assert.ok(estimateCost(80000) > estimateCost(10000));
  assert.ok(estimateCost(80000, 'kimi-k3') > estimateCost(80000, 'deepseek-v4-pro'));
});
