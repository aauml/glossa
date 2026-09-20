import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getViteConfig } from 'astro/config';
import { createServer } from 'vite';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { parseFragment } from 'parse5';

let server, Lede;
before(async () => {
  const config = await getViteConfig({ server: { middlewareMode: true, hmr: false, ws: false, watch: null } })({ command: 'serve', mode: 'test' });
  server = await createServer(config);
  Lede = (await server.ssrLoadModule('/src/components/Lede.astro')).default;
});
after(async () => { await server?.close(); });
const text = n => n.nodeName === '#text' ? n.value : (n.childNodes ?? []).map(text).join('');
const all = n => [n, ...(n.childNodes ?? []).flatMap(all)];

for (const [name, slot] of [
  ['inline', 'An opening with <em>emphasis</em> and <a href="https://example.org">a source</a>.'],
  ['Markdown paragraph', '<p>An opening with <em>emphasis</em> and <a href="https://example.org">a source</a>.</p>'],
  ['multiple paragraphs', '<p>First paragraph.</p><p>Second paragraph with a qualification.</p>'],
]) {
  test(`Lede preserves ${name} inside its styled container after HTML parsing`, async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Lede, { slots: { default: slot } });
    const tree = parseFragment(html);
    const leads = all(tree).filter(n => n.attrs?.some(a => a.name === 'class' && a.value.split(/\s+/).includes('lede')));
    assert.equal(leads.length, 1);
    assert.equal(text(leads[0]), text(parseFragment(slot)));
    assert.equal(text(tree), text(leads[0]), 'Lead prose must not escape its styled container');
    assert.equal(all(leads[0]).filter(n => n.tagName === 'a').length, all(parseFragment(slot)).filter(n => n.tagName === 'a').length);
  });
}
