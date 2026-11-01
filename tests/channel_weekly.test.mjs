import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactRefs, estimateCost, generate, restoreIds, validateGlossa } from '../scripts/channel_weekly.mjs';
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

test('un corte usa solo los videos fijados al pulsar, aunque haya otro digest', async () => {
  const original = globalThis.fetch;
  const calls = [];
  const videos = ['video-1', 'video-2', 'video-3'].map(id => ({ id, title: id,
    url: `https://youtube.com/watch?v=${id}`, published_at: '2026-10-30T12:00:00Z',
    lang: 'es', digest: { thesis: `Análisis de ${id}` } }));
  const output = valid();
  output.sections[0].item_ids = ['v1', 'v2'];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    let data = null;
    if (String(url).includes('glossa_radar_items')) data = videos;
    else if (String(url).includes('glossa_channel_weeklies') && init.method === 'PATCH')
      data = init.headers?.Prefer === 'return=representation' ? [{ id: 'cut-1' }] : null;
    else if (String(url).includes('api.openai.com')) data = { status: 'completed',
      usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 },
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] }] };
    return { ok: true, text: async () => data == null ? '' : JSON.stringify(data) };
  };
  try {
    await generate({ id: 'cut-1', source_key: 'source-1', source_name: 'Canal',
      cut_start: '2026-10-25T07:00:00+00:00', cut_end: '2026-11-01T07:00:00+00:00',
      mode: 'manual', item_ids: ['video-1', 'video-2'] }, {});
    const read = calls.find(c => c.url.includes('glossa_radar_items'));
    assert.match(read.url, /digested_at=gte\./);
    assert.match(read.url, /%2B00%3A00/);
    const published = calls.map(c => c.init.body && JSON.parse(c.init.body))
      .find(b => b?.state === 'publicado');
    assert.deepEqual(published.items.map(x => x.id), ['video-1', 'video-2']);
    assert.deepEqual(published.body.sections[0].item_ids, ['video-1', 'video-2']);
  } finally { globalThis.fetch = original; }
});
