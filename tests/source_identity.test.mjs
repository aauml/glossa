import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceIdentity } from '../src/lib/source_identity.mjs';

test('distinct EUR-Lex documents keep distinct evidence identities', () => {
  const base='https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=';
  assert.notEqual(sourceIdentity(base+'CELEX:32024R1689'),sourceIdentity(base+'CELEX:52021PC0206'));
});
test('tracking links and fragments do not duplicate the same source', () => {
  assert.equal(sourceIdentity('https://www.example.org/doc/?id=7&utm_source=mail#page2'),sourceIdentity('http://example.org/doc?id=7'));
});
test('video and document IDs survive normalization', () => {
  assert.notEqual(sourceIdentity('https://youtube.com/watch?v=one'),sourceIdentity('https://youtube.com/watch?v=two'));
  assert.notEqual(sourceIdentity('https://example.org/doc?ref=one'),sourceIdentity('https://example.org/doc?ref=two'));
});
test('query order and equivalent encoding preserve identity', () => {
  assert.equal(sourceIdentity('https://example.org/doc?lang=en&uri=COM:2026:502'),sourceIdentity('https://example.org/doc?uri=COM%3A2026%3A502&lang=en'));
});
